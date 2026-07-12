import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import type { Product } from "@/types/db";
import ProductForm from "../ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // layout과 page는 독립적으로 렌더링되므로 이 페이지에서도 인증을 확인한다.
  if (!(await isAdminAuthenticated())) return null;

  const { id } = await params;
  const { data } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const product = data as Product | null;
  if (!product) notFound();

  return (
    <main className="pt-6 max-w-xl">
      <h1 className="font-bold text-2xl">상품 수정</h1>
      <ProductForm action={`/api/admin/products/${product.id}`} product={product} />
    </main>
  );
}
