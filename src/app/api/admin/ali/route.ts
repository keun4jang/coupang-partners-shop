import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  addAliItem,
  deleteAliItem,
  refreshAffiliateLinks,
  setAliItemVisible,
} from "@/lib/aliItems";
import { loadAffiliateCredsFromSettings } from "@/lib/aliexpressAffiliate";

export const dynamic = "force-dynamic";

function formValue(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? "").trim();
  return v.length > 0 ? v : null;
}

/**
 * 알리 상품 등록·노출토글·삭제 + 제휴링크 일괄 갱신.
 * action 필드로 분기한다 (관리자 폼이 전부 POST 라).
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await loadAffiliateCredsFromSettings();

  const form = await request.formData();
  const action = formValue(form, "action") ?? "add";

  try {
    if (action === "refresh") {
      const r = await refreshAffiliateLinks();
      const msg = r.reason
        ? `건너뜀: ${r.reason}`
        : `제휴링크 ${r.updated}건 생성, ${r.skipped}건 실패`;
      return NextResponse.redirect(
        new URL(`/admin/ali?msg=${encodeURIComponent(msg)}`, request.url),
        303
      );
    }

    const id = formValue(form, "id");
    if (action === "toggle" && id) {
      await setAliItemVisible(id, formValue(form, "visible") === "1");
      return NextResponse.redirect(new URL("/admin/ali", request.url), 303);
    }
    if (action === "delete" && id) {
      await deleteAliItem(id);
      return NextResponse.redirect(new URL("/admin/ali", request.url), 303);
    }

    const title = formValue(form, "title");
    const productUrl = formValue(form, "product_url");
    if (!title || !productUrl) {
      return NextResponse.json(
        { error: "상품명과 알리 상품 URL 은 필수입니다." },
        { status: 400 }
      );
    }
    const item = await addAliItem({
      title,
      product_url: productUrl,
      image_url: formValue(form, "image_url"),
      price_text: formValue(form, "price_text"),
      landing_visible: formValue(form, "landing_visible") === "1",
    });
    const msg = item.affiliate_url
      ? "등록 완료 (제휴링크 생성됨)"
      : "등록 완료 (제휴링크는 어필리에이트 승인 후 생성됩니다)";
    return NextResponse.redirect(
      new URL(`/admin/ali?msg=${encodeURIComponent(msg)}`, request.url),
      303
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
