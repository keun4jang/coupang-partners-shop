import type {
  Product,
  PublishMode,
  ShortsTemplateVariant,
  TemplateType,
  VideoItem,
} from "@/types/db";
import { supabaseAdmin } from "./supabase";
import { composeScriptText, generateVideoCopy } from "./ai";
import { selectProductsForVideos } from "./productSelector";
import { shortsVariantOf } from "./tracking";
import { pickShortsVariant } from "./usecaseScore";
import { getSetting } from "./settings";
import {
  isOwnProduct,
  OWN_DAILY_DEFAULT,
  OWN_MARKER,
  OWN_PRODUCTS,
  ownProductRow,
} from "./ownProducts";

// 자동 로테이션은 A/B/C. D(실사용 스톡영상 배경)는 텔레그램 "영상D" 로 명시 선택.
const TEMPLATE_ROTATION: TemplateType[] = ["A", "B", "C"];

/**
 * 새 video_item 생성.
 * display_number = 현재 최대값 + 1 (unique 충돌 시 재시도).
 * 번호는 영상을 만들 때마다 계속 증가한다 - 의도된 동작.
 */
export async function createVideoItem(
  product: Product,
  templateType?: TemplateType,
  opts?: {
    /** 수동 요청(텔레그램 "업로드" 등) - 업로드 슬롯 게이트를 우회해 즉시 처리된다 */
    manual?: boolean;
    /** 스튜디오 직접 업로드 소재 - Storage 'footage' 버킷 경로 목록.
     *  insert 시점에 함께 넣어야 워커가 footage 없이 집어가는 경합이 없다. */
    footagePaths?: string[];
    /** 발행 방식. scheduled = 즉시 렌더하되 SNS 발행은 업로드 슬롯 시간에 */
    publishMode?: PublishMode;
    /** 숏폼 변형 강제 지정 (테스트·수동 요청용). 없으면 점수로 자동 배정 */
    variant?: ShortsTemplateVariant;
  }
): Promise<VideoItem> {
  const db = supabaseAdmin();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: maxRow, error: maxError } = await db
      .from("video_items")
      .select("display_number")
      .order("display_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw new Error(`번호 조회 실패: ${maxError.message}`);

    const nextNumber = (maxRow?.display_number ?? 0) + 1;
    const template =
      templateType ?? TEMPLATE_ROTATION[nextNumber % TEMPLATE_ROTATION.length];
    // 사용상황형 변형 배정 (클릭률 A/B). display_number 는 건드리지 않는다 -
    // 이미 정해진 번호를 읽어 변형만 고른다.
    const variant = opts?.variant ?? pickShortsVariant(product, nextNumber);

    const row = {
      display_number: nextNumber,
      product_id: product.id,
      template_type: template,
      video_status: "pending",
      landing_visible: false,
      manual: opts?.manual ?? false,
      footage_paths: opts?.footagePaths ?? null,
      publish_mode: opts?.publishMode ?? "auto",
    };

    let { data, error } = await db
      .from("video_items")
      .insert({ ...row, template_variant: variant })
      .select("*")
      .single();

    // PGRST204 = 스키마 캐시에 컬럼 없음. template_variant 마이그레이션을 아직
    // 안 돌렸으면 여기서 걸린다. 변형 기록을 포기하고(=classic 취급) 영상 생성은
    // 계속한다 - 통계 컬럼 하나 때문에 하루치 발행이 통째로 멈추면 안 된다.
    // (/api/click 이 slot 컬럼에 쓰는 것과 같은 패턴)
    if (error?.code === "PGRST204") {
      console.warn(
        "template_variant 컬럼이 아직 없어 변형 기록 없이 생성합니다 " +
          "(supabase/migrations/20260906_product_event_daily.sql 적용 필요)"
      );
      ({ data, error } = await db
        .from("video_items")
        .insert(row)
        .select("*")
        .single());
    }

    if (!error && data) return data as VideoItem;

    // 23505 = unique_violation (동시 생성 경합) → 번호 다시 계산해서 재시도
    if (error && error.code === "23505") continue;
    throw new Error(`video_item 생성 실패: ${error?.message}`);
  }

  throw new Error("video_item 생성 실패: 번호 할당 재시도 초과");
}

/**
 * 하루치 영상(기본 3개)을 자동으로 큐에 넣는다 — 완전 자동 파이프라인용.
 *
 * - 오늘(UTC 자정 기준) 이미 target 개 이상 만들어졌으면 아무것도 하지 않는다(멱등).
 *   → cron 이 두 번 울리거나, 수동으로 몇 개 만든 날에도 하루 총량이 target 을 넘지 않음.
 * - 카테고리가 겹치지 않는 후보 상품을 골라 pending video_item 을 만든다.
 * - 실제 렌더는 렌더 워커(GitHub Actions)가 포맷 D 로 처리한다
 *   (WORKER_ENV 에 FORCE_TEMPLATE=D 설정 시).
 *
 * @returns 이번에 새로 만든 video_item 목록 (없으면 빈 배열)
 */
export async function queueDailyVideos(
  target = 3,
  opts?: { imageCheckBudgetMs?: number }
): Promise<VideoItem[]> {
  const db = supabaseAdmin();

  // 오늘(KST) 이미 만든 "자동" 영상 수 → 남은 만큼만 채운다(중복 생성 방지)
  // 수동(텔레그램 업로드) 항목은 세지 않는다 - 수동으로 올려도 자동 편수는 그대로 나가야 함
  //
  // KST 기준인 이유: 운영일이 KST 이고 크론이 23:00 UTC(=08:00 KST)에 돈다.
  // UTC 자정 기준으로 세면 이 크론이 UTC 로는 "전날 밤"이라, 하루 2회 이상 돌리는
  // 순간(Actions 스카우트 07:20/15:20 KST = 22:20/06:20 UTC) 서로 다른 UTC 날짜로
  // 잡혀 목표치를 두 번 채운다 - 하루 12편이 큐잉된다.
  const KST_OFFSET_MS = 9 * 3600_000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const startOfDay = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
      KST_OFFSET_MS
  );
  const { count: createdToday, error: countError } = await db
    .from("video_items")
    .select("id", { count: "exact", head: true })
    .eq("manual", false)
    .gte("created_at", startOfDay.toISOString());
  if (countError) throw new Error(`오늘 생성 수 조회 실패: ${countError.message}`);

  const remaining = target - (createdToday ?? 0);
  if (remaining <= 0) return [];

  // 사장님 본인 상품을 하루 몇 편 끼워 넣는다(lib/ownProducts.ts). 실패해도 일반 편성은 계속.
  let ownPicks: Product[] = [];
  try {
    ownPicks = await pickOwnProductsForToday(startOfDay, remaining);
  } catch (e) {
    console.warn("본인 상품 편성 실패(일반 편성만 진행):", (e as Error).message.slice(0, 150));
  }

  const products = await selectProductsForVideos(remaining - ownPicks.length, opts);
  const created: VideoItem[] = [];
  // 본인 상품은 그날 묶음의 가운데쯤에 넣는다("중간중간") - 발행은 번호 순이다
  const order = [...products];
  order.splice(Math.ceil(order.length / 2), 0, ...ownPicks);
  for (const product of order) {
    // template_type 은 A/B/C 로 저장되지만, 렌더 시 FORCE_TEMPLATE=D 로 포맷 D 로 뽑힌다.
    const item = await createVideoItem(product);
    created.push(item);
  }
  return created;
}

/**
 * 본인 상품 목록(ownProducts.ts OWN_PRODUCTS)을 DB 에 맞춘다. 멱등.
 * [own:등록상품ID] 로 찾아 없으면 추가, 있으면 이름·가격·링크·사진을 갱신한다.
 * 큐잉 때마다 불려서, 목록을 고쳐 push 하면 다음 큐잉에 자동 반영된다(SQL 수동 실행 불필요).
 */
export async function ensureOwnProducts(): Promise<{ added: number; updated: number }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("products")
    .select("id, source_memo")
    .ilike("source_memo", `%${OWN_MARKER}%`);
  if (error) throw new Error(`본인 상품 조회 실패: ${error.message}`);
  const byInv = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; source_memo: string | null }[]) {
    const inv = r.source_memo?.match(/\[own:(\d+)\]/)?.[1];
    if (inv) byInv.set(inv, r.id);
  }
  let added = 0;
  let updated = 0;
  for (const o of OWN_PRODUCTS) {
    const row = ownProductRow(o);
    const id = byInv.get(o.inv);
    const { error: wErr } = id
      ? await db.from("products").update(row).eq("id", id)
      : await db.from("products").insert(row);
    if (wErr) throw new Error(`본인 상품 ${o.inv} 저장 실패: ${wErr.message}`);
    if (id) updated++;
    else added++;
  }
  if (added > 0) console.log(`본인 상품 ${added}개 새로 등록`);
  return { added, updated };
}

/**
 * 오늘 끼워 넣을 본인 상품. 하루 own_product_daily(기본 1, 0~3)편까지,
 * 영상이 적게 만들어진 상품부터 돌아가며 고른다(12개뿐이라 반복된다).
 * 본인 상품은 status=paused 라 일반 선정에는 섞이지 않는다.
 */
async function pickOwnProductsForToday(startOfDay: Date, room: number): Promise<Product[]> {
  const raw = Number((await getSetting("own_product_daily"))?.trim());
  const daily = Number.isFinite(raw) && raw >= 0 && raw <= 3 ? Math.floor(raw) : OWN_DAILY_DEFAULT;
  if (daily <= 0 || room <= 0) return [];

  await ensureOwnProducts();
  const db = supabaseAdmin();
  const { data: own, error } = await db
    .from("products")
    .select("*")
    .ilike("source_memo", `%${OWN_MARKER}%`);
  if (error) throw new Error(`본인 상품 조회 실패: ${error.message}`);
  const ownProducts = ((own ?? []) as Product[]).filter((p) => isOwnProduct(p) && p.image_url);
  if (ownProducts.length === 0) return [];
  const ids = ownProducts.map((p) => p.id);

  const { data: vids, error: vErr } = await db
    .from("video_items")
    .select("product_id, created_at, manual")
    .in("product_id", ids)
    .neq("video_status", "failed");
  if (vErr) throw new Error(`본인 상품 영상 조회 실패: ${vErr.message}`);
  const rows = (vids ?? []) as { product_id: string; created_at: string; manual: boolean }[];

  const today = rows.filter((r) => !r.manual && r.created_at >= startOfDay.toISOString()).length;
  const want = Math.min(daily - today, room);
  if (want <= 0) return [];

  const count = new Map<string, number>();
  for (const r of rows) count.set(r.product_id, (count.get(r.product_id) ?? 0) + 1);
  return ownProducts
    .sort(
      (a, b) =>
        (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0) ||
        a.created_at.localeCompare(b.created_at)
    )
    .slice(0, want);
}

/**
 * AI 문구 생성 후 video_item 에 저장하고 링크페이지에 노출한다.
 * (AI 실패 시 ai.ts 내부에서 안전한 기본 문구로 폴백됨)
 */
export async function fillVideoCopy(
  item: VideoItem,
  product: Product
): Promise<VideoItem> {
  const copy = await generateVideoCopy(
    product,
    item.display_number,
    item.template_type,
    shortsVariantOf(item)
  );

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("video_items")
    // landing_visible 은 여기서 켜지 않는다.
    //
    // 이 함수는 렌더 "전"에 불린다. 여기서 켜면 아직 아무 채널에도 안 올라간
    // 번호가 랜딩에 노출되고, 렌더가 실패하면(failed) 영상 없는 번호가 그대로
    // 남는다. 시청자가 영상에서 번호를 보고 랜딩에 오는 흐름이라 순서가 뒤집히면
    // "없는 번호"를 보게 된다. 발행 완료 시점(render-worker 의 completed 갱신)에서만 켠다.
    .update({
      hook_text: copy.hookText,
      script_text: composeScriptText(copy, item.display_number),
      caption_text: copy.captionText,
    })
    .eq("id", item.id)
    .select("*")
    .single();

  if (error) throw new Error(`문구 저장 실패: ${error.message}`);
  return data as VideoItem;
}
