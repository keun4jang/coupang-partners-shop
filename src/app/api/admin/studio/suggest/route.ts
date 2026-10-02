import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  knownProductIds,
  listActiveIdeas,
  saveIdeas,
  suggestStudioIdeas,
} from "@/lib/studio";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 스튜디오 소재 추천: 새 소재를 뽑아 목록에 저장하고 전체 active 목록을 돌려준다.
 * 이미 목록에 있(었)던 상품(숨김/사용 포함)은 다시 추천하지 않는다.
 */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // 2026-10-03 중단: 이 추천은 도우인에서 남의 리뷰 영상을 받아 재사용하는 흐름의
  // 입구였다(저작권·플랫폼 정책 위험). 직접 촬영 영상은 다른 경로로 받는다.
  if (process.env.STUDIO_DOUYIN_SOURCING !== "on") {
    return NextResponse.json({ error: "도우인 영상 소싱은 중단했어요(남의 영상 재사용은 저작권·플랫폼 정책 위험, 2026-10-03). 직접 찍은 영상만 써 주세요." }, { status: 410 });
  }
  try {
    const exclude = await knownProductIds();
    const fresh = await suggestStudioIdeas(5, exclude);
    await saveIdeas(fresh);
    const ideas = await listActiveIdeas();
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "쿠팡 검색 결과가 없어요. 잠시 후 다시 시도해주세요." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ideas, added: fresh.length });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}
