import type { VideoItemWithProduct } from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { getSetting } from "./settings";
import { cleanProductTitle, productTargetUrl, formatDisplayNumber } from "./format";
import { DISCLOSURE_LINE } from "./ai";
import { fetchCommissionReport } from "./coupang";
import type { Top10Item } from "../../remotion/templates/TemplateTop10";

/**
 * 롱폼 TOP10 상품 선정.
 *
 * N번 체계 충돌 방지: 이미 발행된 숏폼 상품(video_status='completed' AND
 * youtube_url 있음 = 이미 N번을 받아 검증까지 끝난 상품)만 재사용한다.
 * products/video_items 에 새 행을 쓰지 않으므로 숏폼 렌더 워커(processPending,
 * video_status IN ('pending','rendered') 만 집어감)와 절대 부딪히지 않는다.
 *
 * 순위 근거: 쿠팡 공식 판매 순위를 우리가 "이게 진짜 순위다"라고 단정할 근거가
 * 없다(수시로 바뀌고 API 응답을 그대로 재가공하는 것도 오인성 소지). 대신
 * 실측 가능한 신호(subId 기반 실제 구매 커미션 → 없으면 click_logs 클릭수 →
 * 그것도 없으면 최신 발행순)로 우리가 고른 "추천 TOP10"으로 정직하게
 * 포지셔닝한다 - 영상 인트로 문구도 그렇게 쓴다.
 */

const REUSE_COOLDOWN_LONGFORMS = 6; // 최근 이 편수에 쓰인 상품은 우선순위에서 밀려남(완전 제외는 아님)
const DEFAULT_INTERVAL_DAYS = 1; // 사장님 방침(2026-08-23): 매일, 주제를 돌려가며
const MIN_CATEGORY_POOL = 10;

/**
 * 날짜별 주제 로테이션 - 매일 다른 주제, 한 달 안에 같은 주제가 다시 돌아오면
 * 그 사이 판매·클릭·발행 데이터가 바뀌어 순위도 자연스럽게 갱신된다
 * (사장님 아이디어 2026-08-23: "매월 1일엔 자동차용품, 2일엔 보조배터리...
 * 이러면 매일 다른 컨텐츠 + 한 달에 한 번씩 순위도 바뀌잖아").
 *
 * 세부 키워드는 products.source_memo 에 이미 있다 - 스카우트가 상품을 등록할
 * 때 "스카우트 · '보조배터리' 검색 · [cpid:...]" 형식으로 검색 키워드를 남긴다
 * (scout.ts). 새 태그 체계를 만들 필요 없이 이걸 그대로 "세부 키워드"로 쓴다.
 * 후보가 MIN_CATEGORY_POOL(10) 이상인 키워드만 그날의 주제 후보가 되고,
 * 재고가 쌓여 더 많은 키워드가 10개를 넘기면 로테이션이 자동으로 넓어진다
 * (코드를 다시 안 건드려도 됨). 키워드가 하나도 안 쌓인 극초반 상태를 대비해
 * products.category(6종, 이 중 차량용품은 후보 1개뿐이라 제외) 로테이션을
 * 안전망으로 남겨둔다.
 */
const CATEGORY_FALLBACK_ROTATION = ["생활템", "주방템", "육아생활템", "청소템", "수납템"];

/** source_memo 에서 스카우트 검색 키워드를 뽑는다. 못 찾으면 null(베스트/골드박스 소싱 등) */
function extractScoutKeyword(sourceMemo: string | null | undefined): string | null {
  const m = (sourceMemo ?? "").match(/스카우트 · '([^']+)' 검색/);
  return m ? m[1] : null;
}

const KST_OFFSET_MS = 9 * 3600_000;
/**
 * 오늘의 업로드 목표 시각을 이 구간(KST) 안에서 매일 다르게 고른다.
 * 숏폼 첫 업로드 슬롯(07:30 KST)보다 앞서야 유튜브 일일 할당량 양보 로직이
 * 제대로 작동한다(worker/longform-worker.ts 주석 참고).
 */
const UPLOAD_WINDOW = "05:20-06:50";

/**
 * 매일 똑같은 06:00 정각에 올라가면 "봇이 올린다"는 티가 난다(사장님 2026-08-24:
 * "업로드 시간은 매일 다르게 해야해"). 숏폼 UPLOAD_SCHEDULE 의 "범위" 표기와 같은
 * 방식 - 날짜로 결정되는 의사난수라 크론이 여러 번 깨어나도 그날은 항상 같은
 * 목표 시각을 얻는다(render-worker.ts todaysUploadSlots 참고, 별도 상태 저장 불필요).
 */
function todaysUploadTarget(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const dayNum = y * 10000 + (m + 1) * 100 + d;
  const seed = (dayNum * 7919 + 104729) >>> 0;

  const parseHm = (s: string) => {
    const [h, mi] = s.trim().split(":").map(Number);
    return h * 60 + mi;
  };
  const [a, b] = UPLOAD_WINDOW.split("-");
  const startMin = parseHm(a);
  const span = Math.max(0, parseHm(b) - startMin);
  const rand01 = (seed % 10007) / 10007;
  const totalMin = startMin + Math.round(rand01 * span);

  return new Date(Date.UTC(y, m, d, Math.floor(totalMin / 60), totalMin % 60) - KST_OFFSET_MS);
}

/**
 * 오늘 롱폼을 만들 차례인지. 매일 도는 크론에서 이 함수로 "이번엔 쉬어감"을
 * 판정한다 - (1) 마지막 완료 이후 간격이 안 찼거나, (2) 오늘의 무작위 목표
 * 시각에 아직 안 왔으면 건너뛴다. app_settings.longform_interval_days 로
 * 간격을 조정할 수 있다(기본 1일 = 매일).
 */
export async function shouldRunLongformToday(now = new Date()): Promise<boolean> {
  const target = todaysUploadTarget(now);
  if (now < target) {
    console.log(
      `오늘 목표 업로드 시각(KST) ${new Date(target.getTime() + KST_OFFSET_MS).toISOString().slice(11, 16)} 아직 안 됨 - 건너뜀`
    );
    return false;
  }

  const raw = (await getSetting("longform_interval_days"))?.trim();
  const n = Number(raw);
  const intervalDays = Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_DAYS;

  // completed 만 본다 - 할당량/일시 오류로 실패한 회차는 그 주의 "이미 했음"으로
  // 치지 않는다(다음날 크론이 바로 재시도할 수 있어야 한다).
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("longform_items")
    .select("created_at")
    .eq("video_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("롱폼 이력 조회 실패(이번엔 건너뜀):", error.message);
    return false;
  }
  if (!data) return true; // 완료 이력 없음 - 첫 실행 또는 이전 시도 전부 실패

  // 간격은 "24시간 경과"가 아니라 "KST 날짜가 며칠 바뀌었나"로 센다.
  //
  // 24시간 롤링으로 재면 하루 실행 창(KST 05:20~06:50, 110분)보다 간격이 길어져
  // 회차가 통째로 누락된다: 어제 06:40 에 끝났으면 오늘 창(~06:50)에서 24시간을
  // 넘기는 틱이 거의 없다. 실측 시뮬레이션(렌더 5분 반영) 결과 1년 365일 중
  // 79일이 이렇게 조용히 빠졌다 - 실제로 2026-08-25 도 이 이유로 미발행이었다.
  // 날짜 기준이면 "어제 했으면 오늘 한다"가 시각과 무관하게 성립한다.
  const kstDayIndex = (d: Date) => Math.floor((d.getTime() + KST_OFFSET_MS) / 86_400_000);
  const daysApart = kstDayIndex(now) - kstDayIndex(new Date(data.created_at));
  if (daysApart < intervalDays) {
    console.log(
      `간격 미도달(마지막 발행 이후 ${daysApart}일 / 목표 ${intervalDays}일) - 건너뜀`
    );
    return false;
  }
  return true;
}

interface ScoredCandidate {
  item: VideoItemWithProduct;
  clicks: number;
  commissionScore: number;
  recentlyUsed: boolean;
}

interface RecentLongformHistory {
  usedProductIds: Set<string>;
}

/**
 * 최근 이력 조회. usedProductIds 는 "완전 제외"가 아니라 "우선순위에서
 * 밀어내는" 용도로만 쓴다(selectTop10 참고) - 주제를 매일 로테이션으로
 * 돌리면 작은 주제(예: 청소용품 10개)는 몇 바퀴만 돌아도 안 쓴 상품이
 * 10개 밑으로 떨어진다. 완전 제외했다간 그 주제는 금방 "재고 부족"으로
 * 스킵되는데, 실제로는 재고가 없는 게 아니라 예전에 한 번 다룬 것뿐이라
 * TOP10에 다시 넣어도 문제없다(최근 판매·클릭·발행 데이터가 바뀌었으면 순위도
 * 자연히 달라진다) - 완전히 새 상품만 우선하되, 모자라면 예전 것으로 채운다.
 */
async function recentLongformHistory(): Promise<RecentLongformHistory> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("longform_items")
    .select("items")
    .eq("video_status", "completed") // 실패한 회차는 상품을 "썼다"고 치지 않는다
    .order("created_at", { ascending: false })
    .limit(REUSE_COOLDOWN_LONGFORMS);
  if (error) {
    console.warn("최근 롱폼 이력 조회 실패(제한 없이 진행):", error.message);
    return { usedProductIds: new Set() };
  }
  const usedProductIds = new Set<string>();
  for (const row of data ?? []) {
    const items = (row.items as Array<{ productId?: string }>) ?? [];
    for (const it of items) if (it.productId) usedProductIds.add(it.productId);
  }
  return { usedProductIds };
}

async function clickCountByProduct(): Promise<Map<string, number>> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("click_logs").select("product_id");
  const counts = new Map<string, number>();
  if (error) {
    console.warn("클릭 로그 조회 실패(클릭 가중치 없이 진행):", error.message);
    return counts;
  }
  for (const row of data ?? []) {
    const id = row.product_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * 실제 구매(커미션 발생) 금액 - display_number(N번) 별 합계.
 *
 * 쿠팡 링크에 subId=v{번호} 를 심어 두면(2026-08 도입) 커미션 리포트의 subId 로
 * "어느 영상이 실제 구매를 만들었는지"를 되짚을 수 있다(src/lib/earnings.ts 와
 * 같은 방식). click_logs 는 "우리 사이트 클릭"일 뿐이라 실제 구매 여부는
 * 모르는데, 이건 진짜 매출 신호다 - "판매량이 높은 걸로"(사장님 2026-08-24)
 * 요청에 맞춰 1순위 정렬 기준으로 쓴다.
 *
 * 쿠팡 API 자격증명이 없거나(로컬 테스트 등) 실패하면 빈 Map - 호출부가
 * 자동으로 클릭수 기준으로 내려간다(판매 신호는 "있으면 우선"이지 필수가
 * 아니다 - subId 도입이 최근이라 대부분 상품은 아직 0건이 정상이다).
 */
async function commissionScoreByDisplayNumber(): Promise<Map<number, number>> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86_400_000);
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const rows = await fetchCommissionReport(fmt(start), fmt(end));
    const scores = new Map<number, number>();
    for (const r of rows) {
      const m = r.subId?.match(/^v(\d+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      scores.set(n, (scores.get(n) ?? 0) + r.commission);
    }
    return scores;
  } catch (e) {
    console.warn("커미션 리포트 조회 실패(판매 신호 없이 클릭수로 진행):", (e as Error).message.slice(0, 150));
    return new Map();
  }
}

/** 후보 풀 전량 (페이지네이션 - PostgREST 1000행 상한 대비) */
async function eligiblePool(): Promise<VideoItemWithProduct[]> {
  const db = supabaseAdmin();
  const out: VideoItemWithProduct[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("video_items")
      .select("*, products(*)")
      .eq("video_status", "completed")
      .not("youtube_url", "is", null)
      // range() 페이지네이션은 명시적 order 없이는 호출마다 행 순서가 안정적이라는
      // 보장이 없다(내부 실행계획에 따라 바뀔 수 있음) - 실측: 상품 수·후보가
      // 전혀 안 변했는데 같은 조건으로 두 번 돌렸더니 카테고리 동률 우선순위가
      // 달라졌다. id 로 정렬해 페이지 간 순서를 고정한다.
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`후보 조회 실패: ${error.message}`);
    const rows = (data ?? []) as unknown as VideoItemWithProduct[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export interface Top10Selection {
  categoryLabel: string;
  selected: VideoItemWithProduct[]; // rank 1 -> rank 10 순서
  /** 이 라벨이 세부 키워드(source_memo)에서 왔는지, 안전망 카테고리에서 왔는지 */
  topicKind: "keyword" | "category";
}

function sortByPreference(list: ScoredCandidate[]): void {
  list.sort((a, b) => {
    // 안 쓴 상품 우선(재사용은 최후 수단) → 실제 구매(커미션) 많은 순 →
    // 클릭 많은 순 → 최신 발행순. 커미션·클릭이 둘 다 0인 상품이 대다수라
    // (subId 도입이 최근이라) 사실상 마지막 두 기준이 자주 갈림을 가른다.
    if (a.recentlyUsed !== b.recentlyUsed) return a.recentlyUsed ? 1 : -1;
    if (b.commissionScore !== a.commissionScore) return b.commissionScore - a.commissionScore;
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return (
      new Date(b.item.published_at ?? b.item.created_at).getTime() -
      new Date(a.item.published_at ?? a.item.created_at).getTime()
    );
  });
}

/**
 * TOP10 후보 선정 - 한 주제(세부 키워드 또는 안전망 카테고리) 안에서만 뽑는다.
 *
 * 처음엔 클릭수 상위 10개를 카테고리 안 가리고 뽑았는데, 실제로 돌려보니
 * "수납템 TOP10"이라는 제목에 에어팟·갤럭시버즈가 섞여 나왔다(전체 후보 중
 * 클릭수 상위를 뽑고 사후에 최빈 카테고리로 제목만 붙였기 때문 - 내용과 제목이
 * 안 맞는 것 자체가 오인성 문제다). 그래서 주제를 먼저 고르고 그 안에서만
 * 10개를 채우는 방식으로 바꿨다.
 *
 * 주제 선택 순서:
 *   1) products.source_memo 의 스카우트 검색 키워드("보조배터리" 등)별로 묶어
 *      후보가 MIN_CATEGORY_POOL(10) 이상인 키워드들을 키워드명 알파벳/가나다순으로
 *      정렬 - 그날의 날짜(1~31)로 그 목록을 인덱싱해 오늘의 세부 키워드를 고른다.
 *      재고가 쌓여 새 키워드가 10개를 넘기면 로테이션이 자동으로 넓어진다.
 *   2) 키워드가 하나도 안 쌓인 극초반 상태에서만 products.category(6종) 로
 *      대체한다(안전망) - 이때도 후보가 가장 많은 카테고리를 고른다.
 *
 * 부족하면(어느 주제도 10개를 못 채우면) selected.length < 10 로 돌아온다 -
 * 호출부가 최소 개수를 확인해서 건너뛸지 판단한다.
 */
export async function selectTop10(): Promise<Top10Selection> {
  const [pool, history, clicks, commission] = await Promise.all([
    eligiblePool(),
    recentLongformHistory(),
    clickCountByProduct(),
    commissionScoreByDisplayNumber(),
  ]);

  const candidates: ScoredCandidate[] = pool
    .filter((it) => it.products && it.products.status !== "paused")
    .filter((it) => Boolean(productTargetUrl(it.products)))
    .map((item) => ({
      item,
      clicks: clicks.get(item.product_id) ?? 0,
      commissionScore: commission.get(item.display_number) ?? 0,
      recentlyUsed: history.usedProductIds.has(item.product_id),
    }));

  const byKeyword = new Map<string, ScoredCandidate[]>();
  for (const c of candidates) {
    const kw = extractScoutKeyword(c.item.products.source_memo);
    if (!kw) continue;
    const list = byKeyword.get(kw) ?? [];
    list.push(c);
    byKeyword.set(kw, list);
  }
  const viableKeywords = [...byKeyword.entries()]
    .filter(([, list]) => list.length >= MIN_CATEGORY_POOL)
    .sort((a, b) => a[0].localeCompare(b[0], "ko")); // 가나다순 - 로테이션 순서를 날짜마다 안정적으로

  let categoryLabel: string;
  let categoryCandidates: ScoredCandidate[];
  let topicKind: "keyword" | "category";

  if (viableKeywords.length > 0) {
    // 로테이션 인덱스는 "월중 며칠"이 아니라 "에포크 기준 통산 일수"로 센다.
    //
    // 월중 날짜(1~31)를 쓰면 달이 바뀔 때 주기가 끊긴다: 키워드가 6개일 때
    // 8/31 은 (31-1)%6=0, 9/1 은 (1-1)%6=0 이라 이틀 연속 같은 주제가 걸리고,
    // 후보가 딱 10개인 키워드(예: 청소용품)는 상품·순서·제목이 100% 같은
    // 영상이 이틀 연속 올라간다. 통산 일수를 쓰면 달 경계와 무관하게 항상
    // 균등하게 돈다(productSelector.kstDayIndex 와 같은 방식).
    const kstDayIndex = Math.floor((Date.now() + KST_OFFSET_MS) / 86_400_000);
    const idx = ((kstDayIndex % viableKeywords.length) + viableKeywords.length) % viableKeywords.length;
    [categoryLabel, categoryCandidates] = viableKeywords[idx];
    topicKind = "keyword";
  } else {
    const byCategory = new Map<string, ScoredCandidate[]>();
    for (const c of candidates) {
      const cat = c.item.products.category || "생활템";
      const list = byCategory.get(cat) ?? [];
      list.push(c);
      byCategory.set(cat, list);
    }
    const viableCategories = [...byCategory.entries()]
      .filter(
        ([cat, list]) => CATEGORY_FALLBACK_ROTATION.includes(cat) && list.length >= MIN_CATEGORY_POOL
      )
      .sort((a, b) => b[1].length - a[1].length);
    if (viableCategories.length === 0) {
      return { categoryLabel: "생활꿀템", topicKind: "category", selected: [] };
    }
    [categoryLabel, categoryCandidates] = viableCategories[0];
    topicKind = "category";
  }

  sortByPreference(categoryCandidates);

  return {
    categoryLabel,
    topicKind,
    selected: categoryCandidates.slice(0, 10).map((c) => c.item),
  };
}

/** 렌더용 Top10Item[] (10위 -> 1위 순) + DB 스냅샷·설명란용 부가 필드 */
export type Top10ItemSnapshot = Top10Item & {
  productId: string;
  videoItemId: string;
  /** 실제로 내보낼 제휴/상품 링크 (설명란용) */
  linkUrl: string;
};

export function buildTop10Items(selected: VideoItemWithProduct[]): Top10ItemSnapshot[] {
  // selected 는 1위 -> 10위(점수 내림차순). 화면은 10위부터 공개하므로 뒤집는다.
  const countdown = selected.slice().reverse();
  return countdown.map((item, i) => {
    const rank = countdown.length - i;
    const p = item.products;
    const { benefit1, benefit2 } = itemBenefitLines(item);
    return {
      rank,
      displayNumber: item.display_number,
      productName: cleanProductTitle(p.product_name),
      imageUrl: p.image_url,
      priceText: p.price_text ?? "가격 확인",
      category: p.category || "생활템",
      benefit1,
      benefit2,
      productId: item.product_id,
      videoItemId: item.id,
      linkUrl: productTargetUrl(p) ?? "",
    };
  });
}

/** 숏폼 대본에서 장점 두 줄만 뽑는다 (화면 표시용 - 정책 검증을 이미 거친 문구) */
export function itemBenefitLines(item: VideoItemWithProduct): { benefit1: string; benefit2: string } {
  const lines = (item.script_text ?? "").split("\n");
  return {
    benefit1: (lines[2] || "").trim(),
    benefit2: (lines[3] || "").trim(),
  };
}

/**
 * 상품별 나레이션 대본 - 숏폼용으로 이미 검증된 문구를 재사용한다(신규 AI 호출 없음).
 * 장점 두 줄(benefit1·benefit2)을 포함시킨다 - 화면에도 같은 문구를 자막처럼
 * 띄운다(TemplateTop10.tsx ProductCard) - 카드 하나가 오래 떠 있어도 화면이 계속
 * 바뀌게(사장님 피드백: "컷이 안 바뀌어서 지루하다").
 */
export function itemNarrationLine(item: VideoItemWithProduct, rank: number, name: string): string {
  const lines = (item.script_text ?? "").split("\n");
  const hook = (item.hook_text || lines[0] || "").trim();
  const { benefit1, benefit2 } = itemBenefitLines(item);
  const parts = [`${rank}위, ${name}.`, hook, benefit1, benefit2].filter(Boolean);
  return parts.join(" ");
}

export function introNarrationLine(categoryLabel: string): string {
  return `오늘은 저희가 소개했던 ${categoryLabel} 중에서 반응이 좋았던 열 가지를 모아봤어요. 10위부터 순서대로 보여드릴게요.`;
}

export const OUTRO_NARRATION_LINE =
  "오늘 소개한 상품 정보는 전부 설명란에 순서대로 정리해 뒀어요. 다음에도 새로운 TOP10으로 찾아올게요.";

/** 유튜브 롱폼 제목 (100자 제한) */
export function longformTitle(categoryLabel: string): string {
  return `${categoryLabel} 추천 TOP10 | 실제로 반응 좋았던 아이템 모음`;
}

/**
 * 유튜브 롱폼 설명.
 * 링크가 실제로 클릭되는 표면이라 대가성 고지를 맨 위에 넣는다(랜딩 전용이던
 * 숏폼과 다른 지점 - 공정위 지침: 표시문구는 "더보기"를 누르지 않아도 보이는
 * 곳에 있어야 한다는 취지에 맞춰 설명 최상단에 둔다).
 * 타임스탬프(챕터)는 0:00 포함 + 10초 이상 간격 + 오름차순이면 유튜브가 자동 인식한다.
 */
export function longformDescription(
  categoryLabel: string,
  items: Top10ItemSnapshot[], // 10위 -> 1위 순
  chapterSeconds: number[] // items 와 같은 순서(10위 -> 1위), 각 항목 시작 초
): string {
  const ranked1to10 = items.slice().reverse(); // 1위 -> 10위로 나열(설명은 1위부터 읽기 좋음)
  const linkLines = ranked1to10.map((it) => {
    const url = it.linkUrl ?? "";
    return `${it.rank}위. ${it.productName} - ${it.priceText} (${formatDisplayNumber(it.displayNumber)})\n${url}`;
  });

  const chapterLines = items.map((it, i) => {
    const sec = Math.round(chapterSeconds[i] ?? 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")} ${it.rank}위 ${it.productName}`;
  });

  return [
    DISCLOSURE_LINE,
    "",
    `${categoryLabel} 중 반응이 좋았던 상품 10가지를 모아 순위로 정리했어요.`,
    "",
    "[상품 링크]",
    ...linkLines,
    "",
    "[타임스탬프]",
    "0:00 인트로",
    ...chapterLines,
    "",
    "#추천템 #생활꿀템 #쿠팡추천템 #TOP10",
  ].join("\n");
}
