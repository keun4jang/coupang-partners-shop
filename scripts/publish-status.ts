/**
 * 최근 발행 현황 (2026-10-05, 새 전략 3일차 점검).
 *
 * 왜: 렌더 로그는 170분 상주 동안 "슬롯 대기" 줄이 대부분이라 영상별 결과를 읽기 어렵다.
 * DB 기준으로 최근 N일 영상의 유튜브·인스타 성공/실패, 정책 차단, 드라이브 임시 업로드
 * 실패(→ 인스타 누락)와 상품 paused 수를 한 번에 본다.
 *
 * 읽기 전용: Supabase select 만 한다. 쿠팡·유튜브·인스타 API 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";

type Row = {
  display_number: number | null;
  video_status: string | null;
  created_at: string;
  published_at: string | null;
  youtube_url: string | null;
  youtube_error: string | null;
  instagram_url: string | null;
  instagram_error: string | null;
  error_message: string | null;
};

const short = (s: string | null, n = 70) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 3);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("video_items")
    .select(
      "display_number, video_status, created_at, published_at, youtube_url, youtube_error, instagram_url, instagram_error, error_message"
    )
    // 큐는 며칠 앞서 만들어진다(created_at) - 발행 기준(published_at)으로 보고, 대기열은 따로 센다
    .or(`published_at.gte.${since},and(published_at.is.null,video_status.neq.pending)`)
    .gte("created_at", new Date(Date.now() - (days + 14) * 86_400_000).toISOString())
    .order("display_number");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];

  const { count: pending } = await db
    .from("video_items")
    .select("id", { count: "exact", head: true })
    .eq("video_status", "pending");
  console.log(`① 최근 ${days}일 발행·처리 영상 ${rows.length}편 (대기열 pending ${pending ?? "?"}편)`);
  const byStatus = new Map<string, number>();
  for (const r of rows) byStatus.set(r.video_status ?? "?", (byStatus.get(r.video_status ?? "?") ?? 0) + 1);
  console.log("   상태별: " + [...byStatus].map(([k, v]) => `${k} ${v}`).join(" · "));

  const done = rows.filter((r) => r.video_status === "completed");
  const yt = done.filter((r) => r.youtube_url).length;
  const ig = done.filter((r) => r.instagram_url).length;
  console.log(`② 완료 ${done.length}편 중 유튜브 ${yt} · 인스타 ${ig}`);

  console.log("③ 영상별");
  for (const r of rows) {
    const marks = [
      r.youtube_url ? "YT○" : "YT×",
      r.instagram_url ? "IG○" : "IG×",
    ].join(" ");
    const notes = [
      r.youtube_error && `YT오류: ${short(r.youtube_error)}`,
      r.instagram_error && `IG오류: ${short(r.instagram_error)}`,
      r.error_message && `메모: ${short(r.error_message)}`,
    ]
      .filter(Boolean)
      .join(" | ");
    console.log(
      `   ${r.display_number ?? "?"}번 ${r.video_status} ${marks} ${(r.published_at ?? r.created_at).slice(5, 16)}${notes ? " - " + notes : ""}`
    );
  }

  const policyFailed = rows.filter((r) => r.video_status === "failed" && /정책/.test(r.error_message ?? ""));
  console.log(`④ 정책 차단(failed + '정책'): ${policyFailed.length}편`);
  for (const r of policyFailed) console.log(`   ${r.display_number}번 - ${short(r.error_message, 120)}`);

  const { count: paused, error: pErr } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "paused");
  const { count: cand, error: cErr } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("status", "candidate");
  if (pErr || cErr) console.log(`⑤ 상품 수 조회 실패: ${(pErr ?? cErr)!.message}`);
  else console.log(`⑤ 상품: candidate ${cand} · paused ${paused}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
