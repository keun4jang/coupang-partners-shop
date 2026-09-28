/**
 * withSubId 자가 점검.
 *
 * 2026-09-28: 링크에 "subId"(대문자 I)로 붙였더니 쿠팡이 읽지 않아 9월 26클릭이
 * 전부 subId 빈 값으로 기록됐다. 쿠팡이 읽는 이름은 소문자 "subid" 다
 * (scripts/subid-probe.ts 로 쿠팡 딥링크 응답을 확인). 누가 다시 이름을 바꾸거나
 * 이미 있는 값을 덮어쓰지 않게 규칙을 박아 둔다.
 *
 * 실행: npx tsx scripts/subid-selftest.ts (또는 npm run subid:check)
 */
import { withSubId } from "../src/lib/coupang";

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${label}${detail ? `\n   ${detail}` : ""}`);
  }
}

const BASE =
  "https://link.coupang.com/re/AFFSDP?lptag=AF0000000&pageKey=123&itemId=4&vendorItemId=5&traceid=V0&pt=PT&slot=1";

{
  const out = new URL(withSubId(BASE, "v106"));
  check("소문자 subid 로 붙는다", out.searchParams.get("subid") === "v106", out.toString());
  check("대문자 subId 는 안 붙는다", !out.searchParams.has("subId"), out.toString());
  check("기존 파라미터는 그대로", out.searchParams.get("pageKey") === "123" && out.searchParams.get("lptag") === "AF0000000");
}
{
  // 쿠팡이 이미 subid 를 박아 준 링크(딥링크·검색 API 에 subId 를 준 경우)는 건드리지 않는다
  const pre = `${BASE}&subid=keepme`;
  check("이미 있는 subid 는 덮지 않는다", new URL(withSubId(pre, "v1")).searchParams.get("subid") === "keepme");
}
{
  // 빈 subid= 는 값이 없는 것으로 보고 채운다
  const empty = `${BASE}&subid=`;
  check("빈 subid 는 채운다", new URL(withSubId(empty, "v7")).searchParams.get("subid") === "v7");
}
{
  // 예전 방식(대문자)으로 붙은 값은 걷어내고 소문자로 다시 붙인다
  const old = `${BASE}&subId=v9`;
  const out = new URL(withSubId(old, "v9"));
  check("예전 대문자 subId 는 걷어낸다", !out.searchParams.has("subId") && out.searchParams.get("subid") === "v9", out.toString());
}
{
  // URL 이 아니면 원본 그대로 (리다이렉트를 막지 않는다)
  check("URL 이 아니면 그대로", withSubId("not a url", "v1") === "not a url");
}

if (failures > 0) {
  console.error(`\n서브ID 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("서브ID 자가 점검 통과 (소문자 subid · 기존 값 보존)");
