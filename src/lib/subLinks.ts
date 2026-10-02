/**
 * 영상별 쿠팡 짧은 링크 발급·저장.
 *
 * 왜 (2026-09-30): 커미션 리포트의 채널 ID 가 계속 비어 있었다. 쿠팡 링크 뒤에
 * subid=v번호 를 덧붙이는 방식(withSubId)은 쿠팡이 subId 를 받아 직접 만든
 * 링크와 다르다 - 쿠팡이 만든 쪽에는 암호화된 clickBeacon 이 따로 붙는다.
 * 딥링크 API 에 subId 를 줘서 받은 짧은 링크는 쿠팡 서버가 채널 아이디를 직접
 * 묶어 두므로, 영상마다 한 번 발급받아 video_items.coupang_sub_url 에 둔다.
 * /go·/api/click 은 이 링크가 있으면 쓰고, 없으면 예전 방식으로 보낸다.
 *
 * 딥링크 API 는 요청 하나에 subId 하나라서 영상 하나 = 호출 1번이다. 쿠팡은
 * 시간당 호출 한도(약 75회, scout.ts 머리말)가 있고 3회 넘기면 이용이 제한되므로:
 *  - 새 영상은 발행할 때 1번만 부른다.
 *  - 예전 영상 채우기는 시간당 BACKFILL_PER_HOUR 개까지만, 스카우트·리포트 시각
 *    근처와 직전 스카우트 60분 안에는 쉰다.
 *  - 한도 응답이 한 번이라도 오면 2시간 동안 이 기능 전체를 멈춘다.
 */
import { supabaseAdmin } from "./supabase";
import { getSetting, setSetting } from "./settings";
import { createDeeplinkUrls, hasCoupangEnv, loadCoupangCredsFromSettings } from "./coupang";
import { productPageUrlFromPartnerUrl } from "./coupangVideo";

const PAUSE_KEY = "coupang_sublink_paused_until";
export const BACKFILL_PER_HOUR = 10;
/** 스카우트(23:00 UTC 전후)·리포트(11:00 UTC) 시각 근처는 쉰다 */
const QUIET_UTC_HOURS = new Set([22, 23, 0, 10, 11]);

export function subIdFor(displayNumber: number): string {
  return `v${displayNumber}`;
}

function isRateLimit(msg: string): boolean {
  return /rCode=403|\(403|\(429|시간당 사용 횟수|파싱 실패/.test(msg);
}

async function pausedNow(): Promise<boolean> {
  const until = await getSetting(PAUSE_KEY);
  return !!until && new Date(until).getTime() > Date.now();
}

/**
 * 파트너스 링크 하나로 v번호 짧은 링크를 발급받는다 (쿠팡 호출 1번).
 * 상품 페이지 주소를 못 만들면(이미 짧은 링크로 저장된 수동 상품 등) 호출 없이 null.
 */
export async function issueSubLink(
  partnerUrl: string,
  displayNumber: number
): Promise<string | null> {
  const pageUrl = productPageUrlFromPartnerUrl(partnerUrl);
  if (!pageUrl) return null;
  // 렌더 워커는 원래 쿠팡 키를 안 쓰므로 여기서 불러온다(이미 있으면 바로 끝남).
  // 키가 없으면 빈 값으로 표시하면 안 된다 - 오류로 올려 다음에 다시 시도하게 한다.
  await loadCoupangCredsFromSettings();
  if (!hasCoupangEnv()) throw new Error("쿠팡 API 키 없음");
  const rows = await createDeeplinkUrls([pageUrl], subIdFor(displayNumber));
  const short = rows[0]?.shortenUrl ?? null;
  return short && short.startsWith("https://link.coupang.com/") ? short : null;
}

type Row = {
  id: string;
  display_number: number;
  coupang_sub_url?: string | null;
  products: { source: string | null; coupang_partner_url: string | null } | null;
};

/**
 * 1건 발급·저장. 한도 응답이면 멈춤을 걸고 throw.
 *  - "filled": 쿠팡 호출 1번, 링크 저장
 *  - "nocall": 상품 페이지 주소를 못 만들어(짧은 링크로 저장된 수동 상품 등) 호출 안 함
 *  - "empty":  호출했지만 짧은 링크가 안 옴
 * 발급할 수 없는 행은 빈 문자열로 표시해 채우기 대상에서 뺀다(매시간 같은 행을 다시
 * 집어 예산을 먹지 않게). 빈 문자열이면 /go 는 예전 방식으로 보낸다.
 */
async function fillOne(row: Row): Promise<"filled" | "nocall" | "empty"> {
  const p = row.products;
  const db = supabaseAdmin();
  const mark = async (value: string) => {
    const { error } = await db.from("video_items").update({ coupang_sub_url: value }).eq("id", row.id);
    if (error) throw new Error(`저장 실패: ${error.message.slice(0, 120)}`);
  };
  if (!p || p.source === "aliexpress" || !p.coupang_partner_url) {
    await mark("");
    return "nocall";
  }
  if (!productPageUrlFromPartnerUrl(p.coupang_partner_url)) {
    await mark("");
    return "nocall";
  }
  try {
    const link = await issueSubLink(p.coupang_partner_url, row.display_number);
    await mark(link ?? "");
    return link ? "filled" : "empty";
  } catch (e) {
    const msg = (e as Error).message;
    if (isRateLimit(msg)) {
      await setSetting(PAUSE_KEY, new Date(Date.now() + 2 * 3600_000).toISOString());
      console.warn(`쿠팡 짧은 링크: 호출 한도 응답 - 2시간 멈춤 (${msg.slice(0, 120)})`);
    }
    throw e;
  }
}

/**
 * 발행하는 영상 하나의 짧은 링크를 채운다. 실패해도 발행은 막지 않는다
 * (링크 이동은 예전 방식으로 폴백된다).
 */
export async function ensureSubLink(videoItemId: string): Promise<void> {
  try {
    if (await pausedNow()) return;
    const { data, error } = await supabaseAdmin()
      .from("video_items")
      .select("id, display_number, coupang_sub_url, products(source, coupang_partner_url)")
      .eq("id", videoItemId)
      .maybeSingle();
    if (error) {
      // 마이그레이션 전이면 컬럼이 없어 여기서 걸린다 - 조용히 넘어간다
      console.warn(`쿠팡 짧은 링크 건너뜀: ${error.message.slice(0, 120)}`);
      return;
    }
    const row = data as unknown as Row | null;
    if (!row || row.coupang_sub_url != null) return;
    const r = await fillOne(row);
    if (r === "filled") console.log(`쿠팡 짧은 링크 발급: ${subIdFor(row.display_number)}`);
  } catch (e) {
    console.warn(`쿠팡 짧은 링크 실패(발행은 계속): ${(e as Error).message.slice(0, 150)}`);
  }
}

let hourKey = "";
let usedThisHour = 0;

/**
 * 예전 영상 채우기 - 워커 감시 루프에서 부른다. 시간당 BACKFILL_PER_HOUR 개까지만.
 * 최근 번호부터 채운다.
 */
export async function backfillSubLinks(): Promise<void> {
  // 2026-10-02 정지(기본 꺼짐): 쿠팡 API 한도 위반이 이미 3회 중 2회다(커밋 e1a165e·a9f0856).
  // 스카우트는 GH 21:40·06:20 UTC + Vercel 23:00 에 돌고, 한도는 "최근 60분"일 수 있어
  // 스카우트 직전 시간대의 채우기 호출(시간당 10)이 같은 60분에 겹칠 수 있다. 3번째
  // 위반은 되돌릴 수 없으므로, 전체 호출 장부가 생기기 전까지는 켜지 않는다.
  // 다시 켜려면 app_settings.coupang_sublink_backfill = "on".
  if ((await getSetting("coupang_sublink_backfill").catch(() => null)) !== "on") return;
  const now = new Date();
  if (QUIET_UTC_HOURS.has(now.getUTCHours())) return;
  const key = now.toISOString().slice(0, 13);
  if (key !== hourKey) {
    hourKey = key;
    usedThisHour = 0;
  }
  const budget = BACKFILL_PER_HOUR - usedThisHour;
  if (budget <= 0) return;
  try {
    if (await pausedNow()) return;
    const lastSweep = await getSetting("last_scout_sweep_at");
    if (lastSweep && Date.now() - new Date(lastSweep).getTime() < 60 * 60_000) return;

    const { data, error } = await supabaseAdmin()
      .from("video_items")
      .select("id, display_number, coupang_sub_url, products!inner(source, coupang_partner_url)")
      .is("coupang_sub_url", null)
      .eq("products.source", "coupang")
      .not("products.coupang_partner_url", "is", null)
      .order("display_number", { ascending: false })
      .limit(budget);
    if (error) return; // 마이그레이션 전
    const rows = (data ?? []) as unknown as Row[];
    let filled = 0;
    for (const row of rows) {
      try {
        const r = await fillOne(row);
        if (r !== "nocall") usedThisHour++;
        if (r === "filled") filled++;
      } catch {
        usedThisHour++;
        break; // 한도면 fillOne 이 멈춤을 걸었다. 다른 오류도 이번 시간은 그만.
      }
    }
    if (filled) console.log(`쿠팡 짧은 링크 채우기: ${filled}개 (이번 시간 ${usedThisHour}/${BACKFILL_PER_HOUR})`);
  } catch (e) {
    console.warn(`쿠팡 짧은 링크 채우기 실패: ${(e as Error).message.slice(0, 150)}`);
  }
}
