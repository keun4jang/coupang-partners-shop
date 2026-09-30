/**
 * 쿠팡 서브ID(채널 아이디) 귀속 진단.
 *
 * 왜 필요한가 (2026-09-28): 쿠팡파트너스 "채널 ID" 리포트가 9월 내내 "데이터
 * 없음"이었다. /go 와 /api/click 은 withSubId 로 최종 링크에 subId=v{번호} 를
 * 덧붙이는데, 쿠팡이 그 값을 인식하지 못하고 있다는 뜻이다. 영상별 판매를 못
 * 되짚으면 "어떤 상품·영상이 팔리는지"를 배울 수 없어, 월 1,000만원 계획의
 * 3단계(팔리는 상품 찾기)가 통째로 막힌다.
 *
 * 추측으로 고치지 않으려고 쿠팡이 실제로 돌려주는 링크를 비교한다:
 *   1) DB 에 저장된 파트너스 링크의 파라미터 이름 (값은 안 찍는다)
 *   2) 같은 키워드 검색을 subId 없이 / 있이 한 번씩 → 링크에서 무엇이 달라지나
 *   3) 딥링크 API 에 subId 를 줬을 때 나오는 링크
 *   4) 커미션 리포트에 subId 가 한 번이라도 찍힌 적 있나
 *
 * 쿠팡 API 호출은 딱 4번이다(시간당 한도 보호 - 스카우트 시각을 피해서 돌린다).
 * 추적 코드(lptag)·토큰 같은 값은 로그에 남기지 않고 이름과 "비었나/우리 값인가"만 찍는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { supabaseAdmin } from "../src/lib/supabase";
import {
  createDeeplinkUrls,
  fetchCommissionReport,
  loadCoupangCredsFromSettings,
  searchProducts,
} from "../src/lib/coupang";
import { productPageUrlFromPartnerUrl } from "../src/lib/coupangVideo";

const PROBE_SUB = "probe0928";

/** URL 의 파라미터를 이름만 나열하고, subid 류는 값 상태까지 보여준다 */
function describe(label: string, raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw) {
    console.log(`  ${label}: (없음)`);
    return out;
  }
  try {
    const u = new URL(raw);
    console.log(`  ${label}: ${u.host}${u.pathname}`);
    for (const [k, v] of u.searchParams) {
      out.set(k, v);
      const isSub = k.toLowerCase() === "subid";
      const state = isSub
        ? v === ""
          ? "(빈 값)"
          : v === PROBE_SUB
            ? `= ${PROBE_SUB} (우리가 준 값)`
            : /^v\d+$/.test(v)
              ? `= ${v}`
              : "(다른 값)"
        : v === ""
          ? "(빈 값)"
          : "(값 있음)";
      console.log(`      ${k} ${state}`);
    }
  } catch {
    console.log(`  ${label}: URL 파싱 실패`);
  }
  return out;
}

/** 원문·URL 디코딩·base64(url) 디코딩 결과 - 인코딩된 파라미터 안을 들여다보기 위함 */
function decodings(v: string): string[] {
  const out = [v];
  try {
    out.push(decodeURIComponent(v));
  } catch {}
  for (const x of [...out]) {
    try {
      out.push(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    } catch {}
  }
  return out;
}

async function main(): Promise<void> {
  await loadCoupangCredsFromSettings();

  console.log("① DB 에 저장된 파트너스 링크 (최근 3개)");
  const { data } = await supabaseAdmin()
    .from("products")
    .select("coupang_partner_url")
    .eq("source", "coupang")
    .not("coupang_partner_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(3);
  const stored = ((data ?? []) as { coupang_partner_url: string }[]).map((r) => r.coupang_partner_url);
  stored.forEach((u, i) => describe(`저장 링크 ${i + 1}`, u));

  console.log("\n② 같은 검색을 subId 없이 / 있이");
  const keyword = "실리콘 주걱";
  const plain = (await searchProducts(keyword, 1))[0];
  const withSub = (await searchProducts(keyword, 1, PROBE_SUB))[0];
  const a = describe("subId 없이", plain?.productUrl);
  const b = describe(`subId=${PROBE_SUB}`, withSub?.productUrl);
  const changed = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
  console.log(`  → 달라진 파라미터: ${changed.length ? changed.join(", ") : "(없음)"}`);
  console.log(`  → 같은 상품인가: ${plain && withSub && plain.productId === withSub.productId ? "예" : "아니오/확인불가"}`);
  // subid 말고 다른 파라미터 안에도 우리가 준 값이 숨어 있나 (2026-09-30 추가).
  // clickBeacon 처럼 인코딩된 값에 채널 아이디가 들어 있다면, 쿠팡은 그쪽으로 귀속하고
  // 우리가 쿼리로 덧붙이는 subid 는 무시될 수 있다. 값 자체는 찍지 않고 "들어 있나"만 본다.
  const hidden = [...b.entries()]
    .filter(([k]) => k.toLowerCase() !== "subid")
    .filter(([, v]) => decodings(v).some((d) => d.includes(PROBE_SUB)))
    .map(([k]) => k);
  console.log(`  → subid 외에 우리 값이 들어 있는 파라미터: ${hidden.length ? hidden.join(", ") : "(없음)"}`);

  console.log("\n③ 딥링크 API 에 subId 를 줬을 때");
  const pageUrl = stored.map(productPageUrlFromPartnerUrl).find(Boolean) ?? null;
  if (!pageUrl) {
    console.log("  상품 페이지 URL 을 조립하지 못해 건너뜀");
  } else {
    const rows = await createDeeplinkUrls([pageUrl], PROBE_SUB);
    describe("landingUrl", rows[0]?.landingUrl);
    console.log(`  shortenUrl: ${rows[0]?.shortenUrl ? new URL(rows[0].shortenUrl).host + " (짧은 링크)" : "(없음)"}`);
  }

  console.log("\n④ 커미션 리포트에 찍힌 subId (최근 30일)");
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const rows = await fetchCommissionReport(ymd(new Date(Date.now() - 29 * 86_400_000)), ymd(new Date()));
  const subs = new Map<string, number>();
  for (const r of rows) subs.set(r.subId || "(빈 값)", (subs.get(r.subId || "(빈 값)") ?? 0) + r.click);
  if (subs.size === 0) console.log("  리포트 행 없음");
  for (const [k, v] of subs) console.log(`  ${k}: 클릭 ${v}`);
}

main().catch((e) => {
  console.error("진단 실패:", (e as Error).message);
  process.exit(1);
});
