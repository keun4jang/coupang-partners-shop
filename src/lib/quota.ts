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

/** 오늘(KST) 유튜브에 올라간 편 수 (숏폼+롱폼 합산 - video_items 만 집계하므로
 *  롱폼 업로드는 longform-worker.ts 가 별도로 자기 몫을 보수적으로 아껴 쓴다) */
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
  return count ?? 0;
}
