import Link from "next/link";
import type { Product, VideoItemWithProduct } from "@/types/db";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDisplayNumber, shortenProductName } from "@/lib/format";
import { APP_VERSION } from "@/lib/appVersion";

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
  /** 히어로가 번호검색 결과인지(search) 최신 추천인지(hero) - 성과 비교용 */
  slot: "hero" | "search";
}) {
  const product: Product = item.products;
  return (
    <a
      href={`/api/click?videoItemId=${item.id}&slot=${slot}`}
      rel="nofollow sponsored"
      className="block bg-card rounded-3xl overflow-hidden shadow-md border-2 border-primary/60 active:scale-[0.99] transition-transform"
    >
      <div className="bg-primary/10 px-5 py-2.5 flex items-center justify-between">
        <span className="font-bold text-primary-dark text-sm">{label}</span>
        <span className="bg-primary text-white text-xs font-bold rounded-full px-2.5 py-1">
          {formatDisplayNumber(item.display_number)}
        </span>
      </div>
      {product.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt={product.product_name}
          className="w-full aspect-square object-cover bg-white"
        />
      )}
      <div className="px-5 pt-4 pb-5">
        <h2 className="font-extrabold text-lg leading-snug">
          {shortenProductName(product.product_name, 34)}
        </h2>
        <p className="text-ink/70 text-sm mt-1.5 leading-relaxed">
          {shortDescription(item)}
        </p>
        <div className="mt-4 bg-primary hover:bg-primary-dark transition-colors text-white font-extrabold rounded-xl py-3.5 text-center text-base">
          가격 보기 →
        </div>
      </div>
    </a>
  );
}

/** 목록 카드: 사진 왼쪽 + 정보 오른쪽, 카드 전체가 쿠팡 링크 */
function ItemCard({ item }: { item: VideoItemWithProduct }) {
  const product: Product = item.products;
  return (
    <a
      href={`/api/click?videoItemId=${item.id}&slot=list`}
      rel="nofollow sponsored"
      className="flex gap-3 items-center bg-card rounded-2xl p-3 shadow-sm border border-accent-soft active:scale-[0.99] transition-transform"
    >
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt=""
          className="w-20 h-20 rounded-xl object-cover bg-white shrink-0 border border-accent-soft"
        />
      ) : (
        <div className="w-20 h-20 rounded-xl bg-accent-soft shrink-0 flex items-center justify-center text-2xl">
          🧺
        </div>
      )}
      <div className="min-w-0 flex-1">
        <span className="inline-block bg-accent-soft text-primary-dark font-semibold rounded-full px-2 py-0.5 text-[11px]">
          {formatDisplayNumber(item.display_number)}
        </span>
        <h3 className="font-bold text-[15px] mt-1 leading-snug line-clamp-2">
          {shortenProductName(product.product_name, 30)}
        </h3>
      </div>
      <span className="shrink-0 text-primary-dark font-extrabold text-sm">
        보기 →
      </span>
    </a>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q } = await searchParams;

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
  const heroLabel = searched
    ? `🔎 ${result!.display_number}번, 이 제품이에요!`
    : "🔥 오늘의 추천 살림템";
  const listItems = items.filter((item) => item.id !== hero?.id);

  return (
    <main className="max-w-lg mx-auto px-5 pb-16">
      {/* 헤더 - 짧게 (히어로가 주인공) */}
      <header className="pt-8 pb-5 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">
          살림템 메모장{" "}
          {/* 숨은 관리자 진입 버튼 — 겉보기엔 그냥 이모지 (나만 아는 버튼) */}
          <Link
            href="/admin"
            aria-hidden
            tabIndex={-1}
            className="cursor-default no-underline"
          >
            📝
          </Link>
        </h1>
        <p className="text-sub mt-1.5 text-sm">
          영상 속 제품, 여기서 바로 확인하세요.
        </p>
      </header>

      {!dbReady && (
        <p className="text-center text-sub text-sm mt-6">
          아직 준비 중이에요. 잠시 후 다시 들러주세요 🙂
        </p>
      )}

      {/* 번호 검색 - 최상단. 예전 영상 보고 온 분이 자기 번호로 바로 점프 */}
      {dbReady && (
        <section className="bg-card rounded-2xl p-3.5 shadow-sm border border-accent-soft mb-4">
          <form method="GET" action="/" className="flex gap-2 items-center">
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

      {/* 번호 검색했는데 없는 경우 */}
      {q && dbReady && !result && (
        <div className="bg-card rounded-2xl p-5 text-center border border-accent-soft mb-4">
          <p className="font-semibold">{q.trim()}번은 아직 정리해두지 않았어요.</p>
          <p className="text-sub text-sm mt-1">아래에서 다른 제품을 둘러보세요.</p>
        </div>
      )}

      {/* 원탭 히어로 - 검색했으면 그 번호, 아니면 최신 추천 */}
      {dbReady && hero && (
        <HeroCard
          item={hero}
          label={heroLabel}
          slot={searched ? "search" : "hero"}
        />
      )}

      {/* 최근 제품 목록 (이전 영상에서 온 방문자용) */}
      {dbReady && listItems.length > 0 && (
        <section className="mt-7">
          <h2 className="font-bold text-base mb-2.5 px-1">
            다른 영상 속 제품들
          </h2>
          <div className="flex flex-col gap-2">
            {listItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 대가성 문구 + 버전 (수정할 때마다 자동으로 올라감) */}
      <footer className="mt-12 text-center text-sub text-xs leading-relaxed">
        쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.
        <span className="block mt-2 text-sub/50">{APP_VERSION}</span>
      </footer>
    </main>
  );
}
