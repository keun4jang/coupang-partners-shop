import { isAdminAuthenticated } from "@/lib/adminAuth";
import ProductForm from "../ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  // layout과 page는 독립적으로 렌더링되므로 이 페이지에서도 인증을 확인한다.
  if (!(await isAdminAuthenticated())) return null;

  return (
    <main className="pt-6 max-w-xl">
      <h1 className="font-bold text-2xl">상품 등록</h1>
      <ProductForm action="/api/admin/products" />
    </main>
  );
}
