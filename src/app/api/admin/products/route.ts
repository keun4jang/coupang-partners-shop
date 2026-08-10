import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidHttpUrl } from "@/lib/format";
import {
  generateAffiliateLink,
  loadAffiliateCredsFromSettings,
} from "@/lib/aliexpressAffiliate";

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

  const source = formValue(form, "source") === "aliexpress" ? "aliexpress" : "coupang";
  // 알리 상품이고 어필리에이트가 준비돼 있으면 제휴 링크를 바로 만들어 둔다.
  // 승인 전이면 null 로 남고, 나중에 backfillAffiliateLinks() 가 채운다.
  let affiliateUrl: string | null = null;
  if (source === "aliexpress") {
    await loadAffiliateCredsFromSettings();
    affiliateUrl = await generateAffiliateLink(coupangUrl);
  }
  const { error } = await supabaseAdmin().from("products").insert({
    product_name: productName,
    source,
    affiliate_url: affiliateUrl,
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
