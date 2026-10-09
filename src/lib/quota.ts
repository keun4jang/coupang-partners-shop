import { supabaseAdmin } from "./supabase";
import { getSetting } from "./settings";
import { optionalEnv } from "./env";

const KST_OFFSET_MS = 9 * 3600_000;

/**
 * 유튜브 하루 업로드 상한. app_settings.youtube_daily_cap 으로 조정 가능
 * ("off"/"0" 이면 상한 없음). 기본 4편 - API 무료 할당량 10,000 units 기준
 * (편당 약 2,150 units, 5편이면 초과).
 *
 * render-worker.ts(숏폼)와 worker/longform-worker.ts(롱폼)가 같은 유튜브 채널의
 * 같은 일일 할당량을 나눠 쓰므로 이 판정 로직을 공유 모듈로 뺐다(중복 방지 -
 * render-worker.ts 는 이 파일에서 재수출해 쓴다).
 */
export async function youtubeDailyCap(): Promise<number | null> {
  const raw = (
    optionalEnv("YOUTUBE_DAILY_CAP") ??
    (await getSetting("youtube_daily_cap")) ??
    "4"
  )
    .trim()
    .toLowerCase();
  if (raw === "off" || raw === "none" || raw === "0") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}

/** 오늘(KST) 유튜브에 올라간 편 수 (숏폼 video_items + 롱폼 longform_items 합산).
 *  2026-10-09 롱폼도 세게 했다: 선반 영상이 숏폼 뒤에 올라가는 날(새벽 크론 지연)에도
 *  하루 합계가 상한(기본 4편) 안에 들게 - 롱폼이 올라간 날은 숏폼이 1편 줄고 그 편은 인스타 전용. */
export async function youtubeUploadedTodayCount(now = new Date()): Promise<number | null> {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
      KST_OFFSET_MS
  );
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("video_items")
    .select("id", { count: "exact", head: true })
    .not("youtube_url", "is", null)
    .gte("published_at", kstMidnightUtc.toISOString());
  if (error) {
    // 조회 실패를 "상한 도달"로 취급하면 안 된다 (render-worker.ts 의 같은 판단 참고:
    // 모르면 상한을 적용하지 않는다 - 초과 손해보다 "영구 누락 + 거짓 기록"이 크다).
    console.warn("유튜브 일일 업로드 수 조회 실패 - 상한 미적용으로 진행:", error.message.slice(0, 100));
    return null;
  }
  const { count: longCount, error: longErr } = await db
    .from("longform_items")
    .select("id", { count: "exact", head: true })
    .not("youtube_url", "is", null)
    .gte("published_at", kstMidnightUtc.toISOString());
  if (longErr) {
    console.warn("롱폼 업로드 수 조회 실패 - 숏폼만 집계:", longErr.message.slice(0, 100));
  }
  return (count ?? 0) + (longErr ? 0 : longCount ?? 0);
}
