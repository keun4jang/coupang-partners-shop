import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { hideIdea, listActiveIdeas } from "@/lib/studio";

export const dynamic = "force-dynamic";

/** 노출 중인 소재 목록 (페이지 진입 시 로드) */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ideas: await listActiveIdeas() });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}

/** 소재 숨김 ("그만 보기") */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { action, id } = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
  };
  if (action !== "hide" || !id) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  try {
    await hideIdea(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message.slice(0, 300) },
      { status: 500 }
    );
  }
}
