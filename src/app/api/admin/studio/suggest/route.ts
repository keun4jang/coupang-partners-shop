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
