import { isAdminAuthenticated } from "@/lib/adminAuth";
import { allAliItems } from "@/lib/aliItems";
import {
  affiliateStatus,
  loadAffiliateCredsFromSettings,
} from "@/lib/aliexpressAffiliate";

export const dynamic = "force-dynamic";

/**
 * 알리익스프레스 제휴 상품 관리.
 * 어필리에이트 승인 전에도 상품을 미리 등록해 둘 수 있고, 승인 후
 * "제휴링크 일괄 생성"을 누르면 쌓아둔 상품에 링크가 한 번에 붙는다.
 */
export default async function AdminAliPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  if (!(await isAdminAuthenticated())) return null;
  const { msg } = await searchParams;
  await loadAffiliateCredsFromSettings();
  const status = await affiliateStatus();
  const items = await allAliItems();
  const linked = items.filter((i) => i.affiliate_url).length;

  return (
    <main className="pt-6 max-w-2xl">
      <h1 className="font-bold text-2xl">알리익스프레스 상품</h1>

      {msg && (
        <p className="mt-3 bg-accent-soft text-primary-dark rounded-xl px-4 py-2.5 text-sm font-semibold">
          {msg}
        </p>
      )}

      <section className="mt-4 bg-card rounded-2xl p-4 border border-accent-soft">
        <h2 className="font-bold">어필리에이트 연동 상태</h2>
        <p className="text-sm mt-1">{status}</p>
        <p className="text-sub text-xs mt-1">
          등록 {items.length}개 · 제휴링크 있음 {linked}개 · 없음{" "}
          {items.length - linked}개
        </p>
        <form action="/api/admin/ali" method="POST" className="mt-3">
          <input type="hidden" name="action" value="refresh" />
          <button
            type="submit"
            className="bg-card border border-accent text-primary-dark font-bold rounded-xl px-4 py-2 text-sm"
          >
            제휴링크 일괄 생성
          </button>
        </form>
        <p className="text-sub text-xs mt-2 leading-relaxed">
          승인 전에는 원본 알리 주소로 나갑니다(클릭은 기록되지만 수수료 없음).
          승인 후 이 버튼을 누르면 쌓아둔 상품에 제휴링크가 한 번에 붙습니다.
        </p>
      </section>

      <section className="mt-6 bg-card rounded-2xl p-4 border border-accent-soft">
        <h2 className="font-bold mb-3">상품 추가</h2>
        <form action="/api/admin/ali" method="POST" className="flex flex-col gap-2.5">
          <input type="hidden" name="action" value="add" />
          <input
            name="title"
            required
            placeholder="상품명 (한국어로 짧게)"
            className="rounded-lg border border-accent px-3 py-2 bg-cream"
          />
          <input
            name="product_url"
            required
            placeholder="알리 상품 URL (https://www.aliexpress.com/item/....html)"
            className="rounded-lg border border-accent px-3 py-2 bg-cream"
          />
          <input
            name="image_url"
            placeholder="상품 이미지 URL (선택)"
            className="rounded-lg border border-accent px-3 py-2 bg-cream"
          />
          <input
            name="price_text"
            placeholder="가격 표기 (선택, 예: 12,900원)"
            className="rounded-lg border border-accent px-3 py-2 bg-cream"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="landing_visible" value="1" defaultChecked />
            랜딩에 바로 노출
          </label>
          <button
            type="submit"
            className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl px-5 py-2.5 mt-1"
          >
            추가
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="font-bold mb-2">등록된 상품 ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sub text-sm">아직 등록된 알리 상품이 없어요.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="bg-card rounded-2xl p-3 border border-accent-soft flex gap-3 items-center"
              >
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.image_url}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover bg-white shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-accent-soft shrink-0 flex items-center justify-center">
                    📦
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm leading-snug line-clamp-2">{it.title}</p>
                  <p className="text-sub text-xs mt-0.5">
                    {it.price_text ?? "가격 미입력"} ·{" "}
                    {it.affiliate_url ? "제휴링크 O" : "제휴링크 X"} ·{" "}
                    {it.landing_visible ? "노출 중" : "숨김"}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <form action="/api/admin/ali" method="POST">
                    <input type="hidden" name="action" value="toggle" />
                    <input type="hidden" name="id" value={it.id} />
                    <input
                      type="hidden"
                      name="visible"
                      value={it.landing_visible ? "0" : "1"}
                    />
                    <button className="text-xs border border-accent rounded-lg px-2.5 py-1 w-full">
                      {it.landing_visible ? "숨기기" : "노출"}
                    </button>
                  </form>
                  <form action="/api/admin/ali" method="POST">
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="id" value={it.id} />
                    <button className="text-xs text-red-600 border border-red-200 rounded-lg px-2.5 py-1 w-full">
                      삭제
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
