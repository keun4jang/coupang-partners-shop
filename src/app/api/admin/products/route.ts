import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidHttpUrl } from "@/lib/format";

function formValue(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? "").trim();
  return v.length > 0 ? v : null;
}

/** 상품 등록 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const productName = formValue(form, "product_name");
  const coupangUrl = formValue(form, "coupang_partner_url");
  if (!productName || !coupangUrl) {
    return NextResponse.json(
      { error: "상품명과 쿠팡파트너스 링크는 필수입니다." },
      { status: 400 }
    );
  }
  if (!isValidHttpUrl(coupangUrl)) {
    return NextResponse.json(
      { error: "쿠팡파트너스 링크는 http(s) 주소여야 합니다." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin().from("products").insert({
    product_name: productName,
    category: formValue(form, "category") ?? "생활템",
    target_user: formValue(form, "target_user"),
    pain_point: formValue(form, "pain_point"),
    main_benefit: formValue(form, "main_benefit"),
    price_text: formValue(form, "price_text"),
    coupang_partner_url: coupangUrl,
    image_url: formValue(form, "image_url"),
    source_memo: formValue(form, "source_memo"),
    status: "candidate",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.redirect(new URL("/admin/products", request.url), 303);
}
