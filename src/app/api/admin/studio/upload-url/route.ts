import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 업로드 가능한 확장자 (도우인 다운로드 영상 기준) */
const ALLOWED_EXT = new Set(["mp4", "mov", "webm", "m4v"]);

/**
 * 스토리지 서명 업로드 URL 발급.
 * 브라우저가 Vercel(4.5MB 제한)을 거치지 않고 Supabase Storage 로 영상을 직접 PUT 한다.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { fileName } = (await request.json().catch(() => ({}))) as {
    fileName?: string;
  };
  if (!fileName) {
    return NextResponse.json({ error: "fileName 이 필요해요." }, { status: 400 });
  }
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: `영상 파일만 올릴 수 있어요 (mp4/mov/webm). 받은 파일: .${ext}` },
      { status: 400 }
    );
  }

  // 경로: YYYYMMDD/타임스탬프-난수.확장자 (한글 파일명 문제 방지 - 원본명은 버린다)
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const day = kst.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${day}/${Date.now()}-${rand}.${ext}`;

  const { data, error } = await supabaseAdmin()
    .storage.from("footage")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: `업로드 URL 발급 실패: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ path: data.path, signedUrl: data.signedUrl });
}
