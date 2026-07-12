import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import type { Product } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  // layout과 page는 독립적으로 렌더링되므로 이 페이지에서도 인증을 확인한다.
  if (!(await isAdminAuthenticated())) return null;

  const { data } = await supabaseAdmin()
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  const products = (data as Product[] | null) ?? [];

  return (
    <main className="pt-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl">상품 관리</h1>
        <Link
          href="/admin/products/new"
          className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl px-4 py-2 text-sm"
        >
          + 상품 등록
        </Link>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="bg-card rounded-2xl p-4 border border-accent-soft"
          >
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-bold rounded-full px-2.5 py-0.5 ${
                  p.status === "candidate"
                    ? "bg-accent-soft text-primary-dark"
                    : "bg-gray-100 text-sub"
                }`}
              >
                {p.status === "candidate" ? "후보" : "일시중지"}
              </span>
              <span className="text-xs text-sub">{p.category}</span>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="text-sm font-semibold text-primary-dark"
                >
                  수정
                </Link>
                <form method="POST" action={`/api/admin/products/${p.id}`}>
                  <input type="hidden" name="_action" value="toggle_status" />
                  <button
                    type="submit"
                    className="text-sm text-sub hover:text-ink"
                  >
                    {p.status === "candidate" ? "중지" : "재개"}
                  </button>
                </form>
              </div>
            </div>
            <h3 className="font-bold mt-2">{p.product_name}</h3>
            {p.pain_point && (
              <p className="text-sm text-sub mt-1">불편: {p.pain_point}</p>
            )}
            {p.main_benefit && (
              <p className="text-sm text-sub">장점: {p.main_benefit}</p>
            )}
            <form method="POST" action="/api/admin/videos" className="mt-3">
              <input type="hidden" name="productId" value={p.id} />
              <button
                type="submit"
                className="text-sm bg-accent-soft text-primary-dark font-bold rounded-lg px-3 py-1.5"
              >
                이 상품으로 영상 만들기
              </button>
            </form>
          </div>
        ))}
        {products.length === 0 && (
          <p className="text-sub text-sm mt-4">
            등록된 상품이 없어요. 먼저 상품을 등록해주세요.
          </p>
        )}
      </div>
    </main>
  );
}
