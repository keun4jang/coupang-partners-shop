import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { searchProducts, priceText } from "@/lib/coupang";
import { addManualIdea, chineseKeywordsFor, type StudioIdea } from "@/lib/studio";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 소재 직접 찾기.
 * - {keyword}: 쿠팡 검색 결과(최대 10) 반환
 * - {add: {...상품}}: 선택한 상품에 중국어 키워드를 만들어 소재 목록에 추가
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    keyword?: string;
    add?: {
      productId: number;
      productName: string;
      price: string;
      imageUrl: string | null;
      coupangUrl: string;
    };
  };

  try {
    if (body.keyword?.trim()) {
      const items = await searchProducts(body.keyword.trim(), 10);
      return NextResponse.json({
        results: items.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          price: priceText(p.productPrice),
          imageUrl: p.productImage || null,
          coupangUrl: p.productUrl,
        })),
      });
    }

    if (body.add) {
      // 2026-10-03: 도우인 검색 키워드(남의 영상 소싱용)는 더 만들지 않는다.
      if (process.env.STUDIO_DOUYIN_SOURCING !== "on") {
        return NextResponse.json({ error: "도우인 영상 소싱은 중단했어요(남의 영상 재사용은 저작권·플랫폼 정책 위험, 2026-10-03). 직접 찍은 영상만 써 주세요." }, { status: 410 });
      }
      const { douyinKeywords, reason } = await chineseKeywordsFor(
        body.add.productName
      );
      const idea: StudioIdea = {
        productId: body.add.productId,
        productName: body.add.productName,
        category: "생활템",
        price: body.add.price,
        imageUrl: body.add.imageUrl,
        coupangUrl: body.add.coupangUrl,
        douyinKeywords,
        reason,
      };
      const saved = await addManualIdea(idea);
      return NextResponse.json({ idea: saved });
    }

    return NextResponse.json({ error: "keyword 또는 add 가 필요해요." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}
