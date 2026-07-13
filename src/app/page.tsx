import type { Product, VideoItemWithProduct } from "@/types/db";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDisplayNumber } from "@/lib/format";

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
  // 노출 설정된 번호는 전부 보여준다(개수 제한 없음).
  // 방문자가 검색한 번호 외에 다른 생활템도 눌러볼 수 있도록.
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

function ItemCard({
  item,
  highlight,
}: {
  item: VideoItemWithProduct;
  highlight?: boolean;
}) {
  const product: Product = item.products;
  return (
    <div
      className={`bg-card rounded-2xl p-5 shadow-sm border ${
        highlight ? "border-primary ring-2 ring-primary/30" : "border-accent-soft"
      }`}
    >
      {/* 사진 없이 글자만: 번호 · 제품명 · 한 줄 설명 · 가격보기 버튼 */}
      <div className="inline-block bg-accent-soft text-primary-dark font-bold rounded-full px-3 py-0.5 text-sm">
        {formatDisplayNumber(item.display_number)}
      </div>
      <h3 className="font-bold text-lg mt-2 leading-snug">
        {product.product_name}
      </h3>
      <p className="text-ink/80 text-sm mt-2 leading-relaxed">
        {shortDescription(item)}
      </p>
      {/* 실시간 가격은 쿠팡에서 - 이 클릭이 파트너스 수수료로 연결된다 */}
      <a
        href={`/api/click?videoItemId=${item.id}`}
        rel="nofollow sponsored"
        className="block mt-4 text-center bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl py-3.5 text-lg"
      >
        가격 보기 →
      </a>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
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

  return (
    <main className="max-w-lg mx-auto px-5 pb-16">
      {/* 헤더 */}
      <header className="pt-10 pb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          살림템 메모장 <span aria-hidden>📝</span>
        </h1>
        <p className="text-sub mt-2 text-[15px] leading-relaxed">
          아이 둘 키우며 눈에 띈 생활템을
          <br />
          번호로 정리해두는 곳이에요.
        </p>
      </header>

      {/* 번호 검색 */}
      <section className="bg-card rounded-2xl p-5 shadow-sm border border-accent-soft">
        <p className="font-semibold text-[15px]">
          영상에서 본 생활템 번호를 입력해보세요.
        </p>
        <form method="GET" action="/" className="flex gap-2 mt-3">
          <input
            type="text"
            name="q"
            inputMode="numeric"
            defaultValue={q ?? ""}
            placeholder="예: 17"
            className="flex-1 min-w-0 rounded-xl border border-accent px-4 py-3 text-lg bg-cream focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl px-5"
          >
            찾아보기
          </button>
        </form>
      </section>

      {!dbReady && (
        <p className="text-center text-sub text-sm mt-6">
          아직 준비 중이에요. 잠시 후 다시 들러주세요 🙂
        </p>
      )}

      {/* 검색 결과 */}
      {q && dbReady && (
        <section className="mt-6">
          {result ? (
            <>
              <p className="text-center text-primary-dark font-bold mb-3">
                🔎 {result.display_number}번, 이 제품이에요!
              </p>
              <ItemCard item={result} highlight />
            </>
          ) : (
            <div className="bg-card rounded-2xl p-6 text-center border border-accent-soft">
              <p className="font-semibold">
                {q.trim()}번은 아직 정리해두지 않았어요.
              </p>
              <p className="text-sub text-sm mt-1">
                번호를 다시 확인해보시겠어요?
              </p>
            </div>
          )}
        </section>
      )}

      {/* 전체 목록 (노출된 번호 전부) */}
      {dbReady && items.length > 0 && (
        <section className="mt-10">
          <h2 className="font-bold text-xl mb-4">정리해둔 생활템 전체</h2>
          <div className="flex flex-col gap-4">
            {items
              .filter((item) => item.id !== result?.id)
              .map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
          </div>
        </section>
      )}

      {/* 대가성 문구 */}
      <footer className="mt-12 text-center text-sub text-xs leading-relaxed">
        쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.
      </footer>
    </main>
  );
}
