import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { suggestStudioIdeas } from "@/lib/studio";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 스튜디오 소재 추천: 쿠팡 후보 검색 + 중국어(도우인) 검색 키워드 생성 */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const ideas = await suggestStudioIdeas(5);
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "쿠팡 검색 결과가 없어요. 잠시 후 다시 시도해주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ideas });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}
