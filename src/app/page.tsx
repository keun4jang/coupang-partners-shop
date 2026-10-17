import Link from "next/link";
import type { Product, VideoItemWithProduct } from "@/types/db";
import { supabaseAdmin } from "@/lib/supabase";
import { shortenProductName } from "@/lib/format";
import { APP_VERSION } from "@/lib/appVersion";
import { FRIENDLY_DISCLOSURE_LINE } from "@/lib/policy";
import { BUTTON, bodyFont, tapeFont, TAPE } from "./brand";

export const dynamic = "force-dynamic";

async function findByNumber(q: string): Promise<VideoItemWithProduct | null> {
  const n = parseInt(q.trim().replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .eq("display_number", n)
    .eq("landing_visible", true)
    .maybeSingle();
  return (data as VideoItemWithProduct | null) ?? null;
}

async function visibleItems(): Promise<VideoItemWithProduct[]> {
  // 노출 설정된 번호는 전부 (최신순) - 영상에서 넘어온 방문자가 스크롤로 찾을 수 있게
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .eq("landing_visible", true)
    .order("display_number", { ascending: false })
    .limit(1000);
  return (data as VideoItemWithProduct[] | null) ?? [];
}

function shortDescription(item: VideoItemWithProduct): string {
  // 스크립트의 장점 줄(3번째 줄)을 짧은 설명으로 사용
  const lines = item.script_text?.split("\n").filter(Boolean) ?? [];
  return (
    lines[2] ??
    item.products.main_benefit ??
    "집에 두면 생각보다 자주 쓸 것 같은 생활템이에요."
  );
}

/**
 * 히어로 카드: 영상에서 막 넘어온 방문자를 위한 "원탭" 카드.
 * 카드 전체가 쿠팡 링크 - 사진 크게, 버튼 크게, 다른 행동 필요 없음.
 */
function HeroCard({
  item,
  label,
  slot,
}: {
  item: VideoItemWithProduct;
  label: string;
  /**
   * 히어로가 어디서 왔는지 - 성과 비교용.
   * direct=영상 설명란 /n/{번호} 직행 / search=번호검색 / hero=최신 추천
   */
  slot: "hero" | "search" | "direct";
}) {
  const product: Product = item.products;
  // 2026-10-17 디자인 개편: 안내 페이지(/n)와 같은 모양 - 회색 사진 칸 + 남색 번호 라벨 테이프
  return (
    <a
      href={`/api/click?videoItemId=${item.id}&slot=${slot}`}
      rel="nofollow sponsored"
      className="block"
    >
      <p className="px-5 mb-2 text-[13px] font-medium text-[#676b66]">{label}</p>
      <div className="relative bg-[#eef1f0] aspect-square flex items-center justify-center">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-[86%] h-[86%] object-contain mix-blend-multiply"
          />
        )}
        <div
          className={`absolute left-[18px] top-[22px] -rotate-[4deg] text-white rounded-[3px] px-4 pt-1.5 pb-1 text-[34px] tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_0_rgba(0,0,0,0.18)] ${tapeFont.className}`}
          style={{ background: TAPE }}
        >
          {item.display_number}
          <span className="text-[15px] tracking-normal ml-0.5 opacity-85">번</span>
        </div>
        {/* 해외직구는 배송이 1~2주라 미리 알린다 - 모르고 사면 그게 더 나쁜 경험 */}
        {product.source === "aliexpress" && (
          <span className="absolute right-4 bottom-4 bg-white text-[#1e1f1c] text-xs font-medium rounded px-2 py-1">
            해외직구 · 배송 1~2주
          </span>
        )}
      </div>
      <div className="px-5 pt-5">
        <h2 className="text-[21px] leading-[1.4] font-bold tracking-[-0.01em] break-keep">
          {shortenProductName(product.product_name, 34)}
        </h2>
        <p className="mt-2 text-[15px] leading-[1.65] text-[#45494a] break-keep">{shortDescription(item)}</p>
        {/* 버튼 문구는 "정보를 보러 간다"는 사실만 말한다.
            구매 재촉·최저가 단정 같은 표현은 쿠팡파트너스 운영정책 위반이다. */}
        <div className={`mt-5 py-[17px] text-[16.5px] ${BUTTON}`} style={{ background: TAPE }}>
          {product.source === "aliexpress" ? "알리익스프레스" : "쿠팡"}에서 상품 정보 보기
        </div>
      </div>
    </a>
  );
}

/** 목록 한 줄: 사진 왼쪽 + 번호·이름 오른쪽, 줄 전체가 쿠팡 링크 (카드 대신 구분선) */
function ItemCard({ item }: { item: VideoItemWithProduct }) {
  const product: Product = item.products;
  return (
    <a
      href={`/api/click?videoItemId=${item.id}&slot=list`}
      rel="nofollow sponsored"
      className="flex gap-3.5 items-center py-3 border-b border-[#e3e6e4]"
    >
      <div className="w-[72px] h-[72px] bg-[#eef1f0] shrink-0 flex items-center justify-center">
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt="" className="w-[88%] h-[88%] object-contain mix-blend-multiply" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className={`text-[15px] tracking-[0.04em] ${tapeFont.className}`} style={{ color: TAPE }}>
          {item.display_number}번
        </span>
        {product.source === "aliexpress" && (
          <span className="ml-1.5 text-[11px] font-medium text-[#676b66]">해외직구</span>
        )}
        <h3 className="text-[15px] font-medium mt-0.5 leading-snug line-clamp-2 break-keep">
          {shortenProductName(product.product_name, 30)}
        </h3>
      </div>
      <span className="shrink-0 whitespace-nowrap text-[13px] text-[#676b66]">정보 보기</span>
    </a>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; s?: string }>;
}) {
  const { q, s } = await searchParams;

  let result: VideoItemWithProduct | null = null;
  let items: VideoItemWithProduct[] = [];
  let dbReady = true;
  try {
    if (q) result = await findByNumber(q);
    items = await visibleItems();
  } catch {
    dbReady = false;
  }

  // 히어로: 번호 검색 결과가 있으면 그 상품, 없으면 가장 최근 영상 상품.
  // (프로필 링크는 하나로 고정이라 어느 영상에서 왔는지 알 수 없으므로,
  //  검색 안 했으면 최신 제품을 보여주고 라벨은 오해 없게 "오늘의 추천"으로 둔다)
  const hero = result ?? items[0] ?? null;
  const searched = Boolean(result);
  // /n/{번호} 직행으로 들어온 방문 (영상 설명란 링크). 번호 검색과 화면은 같지만
  // 유입 경로가 달라 클릭 로그에서 구분해야 효과를 잴 수 있다.
  const direct = searched && s === "direct";
  const heroLabel = searched
    ? `${result!.display_number}번, 이 제품이에요`
    : "가장 최근에 정리한 살림템";
  const listItems = items.filter((item) => item.id !== hero?.id);
  // 지금 랜딩에 떠 있는 상품 중 알리가 하나라도 있으면 고지에 알리도 적는다
  // (없는 제휴를 표시하지도, 있는 제휴를 빠뜨리지도 않게)
  const hasAli = items.some((it) => it.products.source === "aliexpress");

  return (
    <div className={`bg-white min-h-screen text-[#1e1f1c] ${bodyFont.className}`}>
    <main className="max-w-[480px] mx-auto pb-16">
      {/* 헤더 - 짧게 (히어로가 주인공) */}
      <header className="px-5 pt-7 pb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">
          살림템 메모장{" "}
          {/* 숨은 관리자 진입 버튼 — 겉보기엔 그냥 이모지 (나만 아는 버튼) */}
          <Link href="/admin" aria-hidden tabIndex={-1} className="cursor-default no-underline">
            📝
          </Link>
        </h1>
        <p className="text-[#676b66] mt-1 text-[14px]">영상 속 번호로 제품을 찾아보세요.</p>
      </header>

      {/*
        대가성 고지 - 링크(히어로)보다 위. 히어로 전체가 제휴 링크라
        아래 푸터에만 두면 바로 누른 사람은 고지를 못 본 채 넘어간다.
        공정위 지침도 "더보기/스크롤 없이 보이는 곳"을 요구한다.
      */}
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

      {/* 번호 검색 - 최상단. 예전 영상 보고 온 분이 자기 번호로 바로 점프 */}
      {dbReady && (
        <form method="GET" action="/" className="px-5 pt-5 pb-6">
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

      {/* 번호 검색했는데 없는 경우 */}
      {q && dbReady && !result && (
        <div className="px-5 pb-6">
          <p className="font-bold text-[17px] break-keep">{q.trim()}번은 아직 정리하지 않았어요.</p>
          <p className="text-[#676b66] text-[14px] mt-1">영상이 막 올라온 번호라면 조금 뒤에 채워져요. 아래 목록도 둘러보세요.</p>
        </div>
      )}

      {/* 원탭 히어로 - 검색했으면 그 번호, 아니면 최신 추천 */}
      {dbReady && hero && (
        <HeroCard
          item={hero}
          label={heroLabel}
          slot={direct ? "direct" : searched ? "search" : "hero"}
        />
      )}

      {/* 최근 제품 목록 (이전 영상에서 온 방문자용) */}
      {dbReady && listItems.length > 0 && (
        <section className="mt-10 px-5">
          <h2 className="text-[13px] font-medium text-[#676b66] pb-2 border-b-[3px]" style={{ borderColor: TAPE }}>
            다른 영상 속 제품들
          </h2>
          <div>
            {listItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 대가성 문구 + 버전 (수정할 때마다 자동으로 올라감) */}
      <footer className="mt-12 px-5 text-center text-[#676b66] text-xs leading-relaxed">
        {/* 제휴처가 늘면 고지도 같이 늘어야 한다. 알리 상품이 실제로 노출될 때만
            알리를 함께 적어, 없는 제휴를 표시하지 않는다. */}
        {hasAli
          ? "쿠팡파트너스 및 알리익스프레스 어필리에이트 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."
          : "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."}
        <span className="block mt-2 opacity-50">{APP_VERSION}</span>
      </footer>
    </main>
    </div>
  );
}
