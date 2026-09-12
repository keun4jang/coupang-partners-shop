import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDisplayNumber, shortenProductName } from "@/lib/format";
import { APP_VERSION } from "@/lib/appVersion";
import { HUB_TRACKING, trackingQuery, type HubPlatform } from "@/lib/tracking";
import type { Product, VideoItemWithProduct } from "@/types/db";
import { HubViewBeacon } from "./HubViewBeacon";

export const dynamic = "force-dynamic";

/**
 * 프로필 링크 허브 (링크 클릭률 개선 2차).
 *   /from/instagram, /from/youtube-shorts, /from/facebook
 *
 * 인스타/유튜브/페이스북 프로필의 "웹사이트" 링크를 이 주소로 바꿔 달면,
 * 프로필로 넘어온 사람이 사이트 루트(검색창부터 시작)를 거치지 않고
 * 바로 최근 상품 중에서 방금 본 걸 골라 /n/[번호] 로 갈 수 있다.
 *
 * 화면은 홈(/)과 비슷하지만 다른 점 셋:
 *  · "오늘의 추천" 히어로 한 장 대신 최근 N개를 처음부터 그리드로 보여준다
 *    (프로필 방문자는 어떤 영상을 보고 왔는지 특정할 수 없어, 방금 본 상품이
 *    최근 것 중 하나일 가능성에 기대는 편이 낫다).
 *  · 카드는 /n/[번호] 로 가되 이 페이지에서 왔다는 유입경로(source/channel)를
 *    함께 실어, 어느 플랫폼의 허브가 실제로 상품 선택까지 이어지는지 나중에
 *    비교할 수 있다.
 *  · 방문 자체를 profile_hub_view_daily 에 남긴다(번호와 무관한 상위 퍼널 지표).
 */

const PLATFORM_LABEL: Record<HubPlatform, string> = {
  instagram: "인스타그램",
  youtube_shorts: "유튜브",
  facebook: "페이스북",
};

/**
 * URL 경로 조각(하이픈, 사람이 읽기 좋은 형태) → 내부 추적 enum(언더스코어).
 * 프로필에는 /from/youtube-shorts 처럼 걸어 두지만, product_event_daily 등
 * 기존 source/channel 값은 이미 "youtube_shorts"(언더스코어)로 굳어 있어서
 * 여기서만 변환한다.
 */
const SLUG_TO_PLATFORM: Record<string, HubPlatform> = {
  instagram: "instagram",
  "youtube-shorts": "youtube_shorts",
  facebook: "facebook",
};

const RECENT_LIMIT = 24;

async function recentItems(): Promise<VideoItemWithProduct[]> {
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .eq("landing_visible", true)
    .order("display_number", { ascending: false })
    .limit(RECENT_LIMIT);
  return (data as VideoItemWithProduct[] | null) ?? [];
}

async function findByNumber(q: string): Promise<VideoItemWithProduct | null> {
  const n = Number.parseInt(q.trim().replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .eq("display_number", n)
    .eq("landing_visible", true)
    .maybeSingle();
  return (data as VideoItemWithProduct | null) ?? null;
}

/** 그리드 카드: 사진 위 + 번호/제품명/가격 아래, 카드 전체가 /n/[번호] 링크 */
function HubCard({
  item,
  platform,
}: {
  item: VideoItemWithProduct;
  platform: HubPlatform;
}) {
  const product: Product = item.products;
  const href = `/n/${item.display_number}?${trackingQuery(HUB_TRACKING[platform])}`;
  return (
    <Link
      href={href}
      className="block bg-card rounded-2xl overflow-hidden shadow-sm border border-accent-soft active:scale-[0.98] transition-transform"
    >
      <div className="relative aspect-square bg-white">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            🧺
          </div>
        )}
        <span className="absolute top-2 left-2 bg-primary text-white text-xs font-extrabold rounded-full px-2.5 py-1">
          {formatDisplayNumber(item.display_number)}
        </span>
      </div>
      <div className="px-3 py-2.5">
        <h3 className="font-bold text-[13px] leading-snug line-clamp-2 break-keep">
          {shortenProductName(product.product_name, 28)}
        </h3>
        {product.price_text && (
          <p className="text-primary-dark font-extrabold text-sm mt-1">
            {product.price_text}
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function HubPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { platform: rawPlatform } = await params;
  const { q } = await searchParams;

  const platform = SLUG_TO_PLATFORM[rawPlatform];
  if (!platform) redirect("/");

  let items: VideoItemWithProduct[] = [];
  let searched: VideoItemWithProduct | null = null;
  let dbReady = true;
  try {
    items = await recentItems();
    if (q) searched = await findByNumber(q);
  } catch {
    dbReady = false;
  }

  const hasAli = items.some((it) => it.products.source === "aliexpress");

  return (
    <main className="max-w-lg mx-auto px-5 pb-16">
      <HubViewBeacon platform={platform} />

      <header className="pt-8 pb-5 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">살림템 메모장</h1>
        <p className="text-sub mt-1.5 text-sm">
          {PLATFORM_LABEL[platform]}에서 보신 제품, 최근 목록에서 찾아보세요.
        </p>
      </header>

      {/* 대가성 고지 - 카드(제휴 링크로 이어짐)보다 위. 홈(/)과 같은 규칙. */}
      <p className="mb-4 bg-accent-soft text-ink/80 text-[13px] leading-relaxed rounded-xl px-4 py-3">
        {hasAli
          ? "이 사이트는 쿠팡파트너스 및 알리익스프레스 어필리에이트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
          : "이 사이트는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."}
      </p>

      {!dbReady && (
        <p className="text-center text-sub text-sm mt-6">
          아직 준비 중이에요. 잠시 후 다시 들러주세요 🙂
        </p>
      )}

      {/* 번호를 이미 기억하는 방문자를 위한 보조 검색 (주된 동선은 아래 그리드) */}
      {dbReady && (
        <section className="bg-card rounded-2xl p-3.5 shadow-sm border border-accent-soft mb-5">
          <form method="GET" action={`/from/${rawPlatform}`} className="flex gap-2 items-center">
            <span className="text-sm font-semibold shrink-0 pl-1">번호로 찾기</span>
            <input
              type="text"
              name="q"
              inputMode="numeric"
              defaultValue={q ?? ""}
              placeholder="영상 속 번호 (예: 17)"
              className="flex-1 min-w-0 rounded-lg border border-accent px-3 py-2 text-base bg-cream focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              className="bg-primary hover:bg-primary-dark transition-colors text-white font-semibold rounded-lg px-3.5 py-2 text-sm shrink-0"
            >
              찾기
            </button>
          </form>
        </section>
      )}

      {q && dbReady && !searched && (
        <div className="bg-card rounded-2xl p-5 text-center border border-accent-soft mb-5">
          <p className="font-semibold">{q.trim()}번은 아직 정리해두지 않았어요.</p>
          <p className="text-sub text-sm mt-1">아래 최근 상품에서 찾아보세요.</p>
        </div>
      )}

      {q && dbReady && searched && (
        <div className="mb-5">
          <h2 className="font-bold text-base mb-2.5 px-1">검색 결과</h2>
          <div className="grid grid-cols-2 gap-3">
            <HubCard item={searched} platform={platform} />
          </div>
        </div>
      )}

      {dbReady && items.length > 0 && (
        <section>
          <h2 className="font-bold text-base mb-2.5 px-1">최근 영상 상품</h2>
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <HubCard key={item.id} item={item} platform={platform} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 text-center text-sub text-xs leading-relaxed">
        {hasAli
          ? "쿠팡파트너스 및 알리익스프레스 어필리에이트 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."
          : "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."}
        <span className="block mt-2 text-sub/50">{APP_VERSION}</span>
      </footer>
    </main>
  );
}
