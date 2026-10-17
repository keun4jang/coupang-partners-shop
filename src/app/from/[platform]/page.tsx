import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { shortenProductName } from "@/lib/format";
import { APP_VERSION } from "@/lib/appVersion";
import { FRIENDLY_DISCLOSURE_LINE } from "@/lib/policy";
import { HUB_TRACKING, trackingQuery, type HubPlatform } from "@/lib/tracking";
import type { Product, VideoItemWithProduct } from "@/types/db";
import { HubViewBeacon } from "./HubViewBeacon";
import { BUTTON, bodyFont, tapeFont, TAPE } from "../../brand";

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

/**
 * 그리드 카드: 회색 사진 칸 + 남색 번호 라벨, 아래 제품명/가격. 카드 전체가 /n/[번호] 링크.
 * 2026-10-17 디자인 개편: 홈(/)·안내 페이지(/n)와 같은 모양 (그림자·둥근 카드 없음).
 */
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
    <Link href={href} className="block">
      <div className="relative aspect-square bg-[#eef1f0] flex items-center justify-center">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-[84%] h-[84%] object-contain mix-blend-multiply"
          />
        )}
        <span
          className={`absolute left-2 top-2.5 -rotate-[4deg] text-white rounded-[2px] px-2 pt-[3px] pb-[1px] text-[17px] tracking-[0.05em] shadow-[0_1px_0_rgba(0,0,0,0.18)] ${tapeFont.className}`}
          style={{ background: TAPE }}
        >
          {item.display_number}
          <span className="text-[10px] tracking-normal ml-0.5 opacity-85">번</span>
        </span>
      </div>
      <div className="pt-2.5">
        <h3 className="font-medium text-[14px] leading-snug line-clamp-2 break-keep">
          {shortenProductName(product.product_name, 28)}
        </h3>
        {product.price_text && (
          <p className="font-bold text-[14px] mt-1">{product.price_text}</p>
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
    <div className={`bg-white min-h-screen text-[#1e1f1c] ${bodyFont.className}`}>
    <main className="max-w-[480px] mx-auto pb-16">
      <HubViewBeacon platform={platform} />

      <header className="px-5 pt-7 pb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">살림템 메모장</h1>
        <p className="text-[#676b66] mt-1 text-[14px] break-keep">
          {PLATFORM_LABEL[platform]}에서 보신 제품, 최근 목록에서 찾아보세요.
        </p>
      </header>

      {/* 대가성 고지 - 카드(제휴 링크로 이어짐)보다 위. 홈(/)과 같은 규칙. */}
      <p className="px-5 py-3 text-[12.5px] leading-relaxed text-[#676b66] border-y border-[#d8dcda]">
        {hasAli
          ? "이 사이트는 쿠팡파트너스 및 알리익스프레스 어필리에이트 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
          : "이 사이트는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."}
        <span className="block text-[#1e1f1c]">{FRIENDLY_DISCLOSURE_LINE}</span>
      </p>

      {!dbReady && (
        <p className="px-5 text-[#676b66] text-[15px] mt-8">
          목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.
        </p>
      )}

      {/* 번호를 이미 기억하는 방문자를 위한 보조 검색 (주된 동선은 아래 그리드) */}
      {dbReady && (
        <form method="GET" action={`/from/${rawPlatform}`} className="px-5 pt-5 pb-6">
          <label htmlFor="q" className="block text-[13px] font-medium text-[#676b66] mb-2">
            번호로 찾기
          </label>
          <div className="flex gap-2 items-stretch">
            <input
              id="q"
              type="text"
              name="q"
              inputMode="numeric"
              defaultValue={q ?? ""}
              placeholder="영상 속 번호 (예: 17)"
              className="flex-1 min-w-0 rounded-md border-2 border-dashed bg-white px-3.5 py-2.5 text-[17px] focus:outline-none focus:border-solid"
              style={{ borderColor: TAPE }}
            />
            <button type="submit" className={`px-5 text-[15px] ${BUTTON}`} style={{ background: TAPE }}>
              찾기
            </button>
          </div>
        </form>
      )}

      {q && dbReady && !searched && (
        <div className="px-5 pb-6">
          <p className="font-bold text-[17px] break-keep">{q.trim()}번은 아직 정리하지 않았어요.</p>
          <p className="text-[#676b66] text-[14px] mt-1">아래 최근 상품에서 찾아보세요.</p>
        </div>
      )}

      {q && dbReady && searched && (
        <section className="px-5 pb-8">
          <h2 className="text-[13px] font-medium text-[#676b66] pb-2 mb-3 border-b-[3px]" style={{ borderColor: TAPE }}>
            검색 결과
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            <HubCard item={searched} platform={platform} />
          </div>
        </section>
      )}

      {dbReady && items.length > 0 && (
        <section className="px-5">
          <h2 className="text-[13px] font-medium text-[#676b66] pb-2 mb-3 border-b-[3px]" style={{ borderColor: TAPE }}>
            최근 영상 상품
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6">
            {items.map((item) => (
              <HubCard key={item.id} item={item} platform={platform} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 px-5 text-center text-[#676b66] text-xs leading-relaxed">
        {hasAli
          ? "쿠팡파트너스 및 알리익스프레스 어필리에이트 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."
          : "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."}
        <span className="block mt-2 opacity-50">{APP_VERSION}</span>
      </footer>
    </main>
    </div>
  );
}
