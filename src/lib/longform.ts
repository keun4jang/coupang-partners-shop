import type { VideoItemWithProduct } from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { getSetting } from "./settings";
import { cleanProductTitle, productTargetUrl, formatDisplayNumber } from "./format";
import { DISCLOSURE_LINE } from "./ai";
import type { Top10Item } from "../../remotion/templates/TemplateTop10";

/**
 * 롱폼 TOP10 상품 선정 (1차 방침).
 *
 * N번 체계 충돌 방지: 이미 발행된 숏폼 상품(video_status='completed' AND
 * youtube_url 있음 = 이미 N번을 받아 검증까지 끝난 상품)만 재사용한다.
 * products/video_items 에 새 행을 쓰지 않으므로 숏폼 렌더 워커(processPending,
 * video_status IN ('pending','rendered') 만 집어감)와 절대 부딪히지 않는다.
 *
 * 순위 근거: 쿠팡 공식 판매 순위를 우리가 "이게 진짜 순위다"라고 단정할 근거가
 * 없다(수시로 바뀌고 API 응답을 그대로 재가공하는 것도 오인성 소지). 대신
 * 실측 가능한 신호(click_logs 실제 클릭 수) + 최신 발행 순으로 우리가 고른
 * "추천 TOP10"으로 정직하게 포지셔닝한다 - 영상 인트로 문구도 그렇게 쓴다.
 */

const REUSE_COOLDOWN_LONGFORMS = 6; // 최근 이 편수에 쓰인 상품은 다음 회차에서 제외
const DEFAULT_INTERVAL_DAYS = 7;

/**
 * 오늘 롱폼을 만들 차례인지. 매일 도는 크론에서 이 함수로 "이번엔 쉬어감"을
 * 판정한다(숏폼 재고를 열흘 만에 소진하지 않도록 - 회차당 상품 10개 소모).
 * app_settings.longform_interval_days 로 조정 가능 (기본 7일 = 주 1회).
 */
export async function shouldRunLongformToday(): Promise<boolean> {
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
  const daysSince = (Date.now() - new Date(data.created_at).getTime()) / 86_400_000;
  return daysSince >= intervalDays;
}

interface ScoredCandidate {
  item: VideoItemWithProduct;
  clicks: number;
}

interface RecentLongformHistory {
  usedProductIds: Set<string>;
  recentCategoryLabels: string[]; // 최신순
}

async function recentLongformHistory(): Promise<RecentLongformHistory> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("longform_items")
    .select("items, category_label")
    .eq("video_status", "completed") // 실패한 회차는 상품을 "썼다"고 치지 않는다
    .order("created_at", { ascending: false })
    .limit(REUSE_COOLDOWN_LONGFORMS);
  if (error) {
    console.warn("최근 롱폼 이력 조회 실패(제한 없이 진행):", error.message);
    return { usedProductIds: new Set(), recentCategoryLabels: [] };
  }
  const usedProductIds = new Set<string>();
  const recentCategoryLabels: string[] = [];
  for (const row of data ?? []) {
    const items = (row.items as Array<{ productId?: string }>) ?? [];
    for (const it of items) if (it.productId) usedProductIds.add(it.productId);
    if (row.category_label) recentCategoryLabels.push(row.category_label as string);
  }
  return { usedProductIds, recentCategoryLabels };
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
}

const MIN_CATEGORY_POOL = 10;

/**
 * TOP10 후보 선정 - 한 카테고리 안에서만 뽑는다.
 *
 * 처음엔 클릭수 상위 10개를 카테고리 안 가리고 뽑았는데, 실제로 돌려보니
 * "수납템 TOP10"이라는 제목에 에어팟·갤럭시버즈가 섞여 나왔다(전체 후보 중
 * 클릭수 상위를 뽑고 사후에 최빈 카테고리로 제목만 붙였기 때문 - 내용과 제목이
 * 안 맞는 것 자체가 오인성 문제다). 그래서 카테고리를 먼저 고르고 그 안에서만
 * 10개를 채우는 방식으로 바꿨다.
 *
 * 카테고리 선택: 그 카테고리 후보가 10개 이상 있어야 하고(모자라면 그 주는 후보에서
 * 제외), 최근에 다룬 카테고리는 되도록 피한다(다양성), 동률이면 후보가 가장
 * 많이 남은 카테고리(재고 여유)를 우선한다.
 *
 * 부족하면(어느 카테고리도 10개를 못 채우면) selected.length < 10 로 돌아온다 -
 * 호출부가 최소 개수를 확인해서 건너뛸지 판단한다.
 */
export async function selectTop10(): Promise<Top10Selection> {
  const [pool, history, clicks] = await Promise.all([
    eligiblePool(),
    recentLongformHistory(),
    clickCountByProduct(),
  ]);

  const candidates: ScoredCandidate[] = pool
    .filter((it) => it.products && it.products.status !== "paused")
    .filter((it) => !history.usedProductIds.has(it.product_id))
    .filter((it) => Boolean(productTargetUrl(it.products)))
    .map((item) => ({ item, clicks: clicks.get(item.product_id) ?? 0 }));

  const byCategory = new Map<string, ScoredCandidate[]>();
  for (const c of candidates) {
    const cat = c.item.products.category || "생활템";
    const list = byCategory.get(cat) ?? [];
    list.push(c);
    byCategory.set(cat, list);
  }

  const viable = [...byCategory.entries()].filter(
    ([, list]) => list.length >= MIN_CATEGORY_POOL
  );
  if (viable.length === 0) {
    return { categoryLabel: "생활꿀템", selected: [] };
  }

  viable.sort((a, b) => {
    const aRecent = history.recentCategoryLabels.indexOf(a[0]);
    const bRecent = history.recentCategoryLabels.indexOf(b[0]);
    // 최근에 다룬 적 없으면(-1) 가장 먼저. 둘 다 다뤘으면 더 오래전에 다룬 쪽 먼저.
    if (aRecent !== bRecent) return (aRecent === -1 ? -1 : aRecent) - (bRecent === -1 ? -1 : bRecent);
    return b[1].length - a[1].length; // 동률이면 후보 많은 쪽
  });

  const [categoryLabel, categoryCandidates] = viable[0];
  categoryCandidates.sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return (
      new Date(b.item.published_at ?? b.item.created_at).getTime() -
      new Date(a.item.published_at ?? a.item.created_at).getTime()
    );
  });

  return {
    categoryLabel,
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
