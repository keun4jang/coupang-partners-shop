import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { createVideoItem } from "@/lib/videoItems";
import { triggerRenderWorkflow } from "@/lib/renderTrigger";
import { isValidHttpUrl } from "@/lib/format";
import { markIdeaUsed } from "@/lib/studio";
import type { Product } from "@/types/db";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface CreateBody {
  /** studio_ideas 행 id - 제작 시작 시 used 로 표시해 목록에서 뺀다 */
  ideaId?: string;
  productName?: string;
  category?: string;
  price?: string;
  imageUrl?: string | null;
  coupangUrl?: string;
  douyinKeywords?: string[];
  footagePaths?: string[];
}

/**
 * 스튜디오 영상 제작 시작:
 * 상품 등록 → video_item 생성(manual, footage_paths) → 클라우드 렌더 즉시 트리거.
 * 이후는 기존 파이프라인 그대로: 대본(Gemini) → 렌더 → 유튜브/인스타 업로드 → 텔레그램 알림.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const { productName, coupangUrl } = body;
  const footagePaths = (body.footagePaths ?? []).filter(Boolean);

  if (!productName || !coupangUrl || !isValidHttpUrl(coupangUrl)) {
    return NextResponse.json(
      { error: "상품명과 쿠팡 링크가 필요해요." },
      { status: 400 }
    );
  }
  if (footagePaths.length === 0) {
    return NextResponse.json(
      { error: "업로드된 영상이 없어요. 영상을 먼저 올려주세요." },
      { status: 400 }
    );
  }

  const db = supabaseAdmin();
  const { data: product, error: productError } = await db
    .from("products")
    .insert({
      product_name: productName,
      category: body.category ?? "생활템",
      price_text: body.price ?? null,
      coupang_partner_url: coupangUrl,
      image_url: body.imageUrl ?? null,
      source_memo: [
        "스튜디오(도우인 소재)",
        ...(body.douyinKeywords?.length
          ? [`검색 키워드: ${body.douyinKeywords.join(", ")}`]
          : []),
      ].join(" · "),
      status: "candidate",
    })
    .select("*")
    .single();
  if (productError || !product) {
    return NextResponse.json(
      { error: `상품 등록 실패: ${productError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  try {
    // 직접 소재 영상은 실사용 영상형(D)이 정확히 맞는 포맷이다.
    const item = await createVideoItem(product as Product, "D", {
      manual: true,
      footagePaths,
    });
    if (body.ideaId) await markIdeaUsed(body.ideaId);
    await triggerRenderWorkflow();
    return NextResponse.json({
      displayNumber: item.display_number,
      message:
        "제작을 시작했어요. 렌더 → 유튜브/인스타 업로드까지 끝나면 텔레그램으로 알려드려요 (보통 5~15분).",
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}
