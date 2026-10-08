/**
 * 썸네일 "누구에게" 줄 저장 규칙 자가 점검 (src/lib/coverText.ts).
 *
 * hook_text 한 칸에 "누구에게\n훅" 을 같이 담기 때문에, 읽는 쪽이 하나라도 어긋나면
 * 나레이션·롱폼에 "누구에게" 줄이 섞여 읽히거나 옛 영상의 훅이 사라진다. 그 경계를 박아 둔다.
 *
 * 실행: npx tsx scripts/cover-text-selftest.ts
 */
import { cleanForWho, packHookText, unpackHookText, FOR_WHO_MAX } from "../src/lib/coverText";

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${label}${detail ? `\n   ${detail}` : ""}`);
  }
}

// 1. 옛 한 줄 hook_text 는 그대로 훅
{
  const r = unpackHookText("컵홀더에 쏙 들어가는 공기청정기");
  check("옛 한 줄은 훅으로 읽힌다", r.hook === "컵홀더에 쏙 들어가는 공기청정기" && r.forWho === null);
}
// 2. 저장 → 읽기 왕복
{
  const packed = packHookText("출근길에 커피 들고 다니는 분께", "뚜껑 두 개 텀블러");
  const r = unpackHookText(packed);
  check("왕복: 누구에게", r.forWho === "출근길에 커피 들고 다니는 분께", String(r.forWho));
  check("왕복: 훅", r.hook === "뚜껑 두 개 텀블러", String(r.hook));
}
// 3. 누구에게 줄이 없거나 망가졌으면 훅 한 줄만 저장
{
  check("없으면 훅만", packHookText(null, "훅") === "훅");
  check("'-' 는 없음", packHookText("-", "훅") === "훅");
  check("너무 길면 버림", packHookText("가".repeat(FOR_WHO_MAX + 1), "훅") === "훅");
  check("개행은 접는다", cleanForWho("아이 태우고\n차 타는 집") === "아이 태우고 차 타는 집");
  check("끝 문장부호 제거", cleanForWho("원룸 사는 분께!") === "원룸 사는 분께");
}
// 4. 빈 값
{
  const r = unpackHookText(null);
  check("null 은 둘 다 null", r.hook === null && r.forWho === null);
}

if (failures > 0) {
  console.error(`\n썸네일 문구 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("썸네일 문구 자가 점검 통과");
