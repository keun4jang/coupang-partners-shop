/**
 * 자동 수정 안전장치 (2026-09-30).
 *
 * 마케터 루틴이 매주 스스로 코드를 고쳐 운영 브랜치에 올린다(사람 검토 없음).
 * 그래서 "어떤 수정이 와도 절대 깨지면 안 되는 것"을 여기서 기계적으로 막는다.
 * npm run marketer:gate 가 이 파일과 기존 자가 점검을 모두 돌리고, 하나라도
 * 실패하면 마케터는 푸시하지 않는다.
 *
 * 지키는 것:
 *  - 대가성 고지: 문구 원문, 쇼츠 템플릿의 화면 고지(영상 내내), 캡션·설명 포함
 *    (공정위 지침 + 쿠팡파트너스 정책 - 위반 시 계정 정지 = 수익 0)
 *  - 하루 발행 편수 상한(12) - 유튜브 "대량 생산" 판정 위험
 *  - 설정 워크플로 허용 키에 자격증명류가 섞이지 않았는지
 *  - 쿠팡 스카우트 호출 예산이 시간당 한도(약 75) 아래인지
 */
import fs from "fs";
import { DISCLOSURE_LINE } from "../src/lib/policy";

let failures = 0;
function check(label: string, ok: boolean): void {
  if (ok) return;
  failures++;
  console.error(`✗ ${label}`);
}
const read = (p: string) => fs.readFileSync(p, "utf8");

// 1. 대가성 고지 문구 원문
check(
  "DISCLOSURE_LINE 문구가 바뀌었다",
  DISCLOSURE_LINE === "이 게시물은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
);

// 2. 쇼츠 템플릿 화면 고지
check("TemplateD 에 <Disclosure /> 가 없다", /<Disclosure\s*\/>/.test(read("remotion/templates/TemplateD.tsx")));
check("TemplateE 에 <DisclosureTag /> 가 없다", /<DisclosureTag\s*\/>/.test(read("remotion/templates/TemplateE.tsx")));
check(
  "TemplateEUseCase 에 <DisclosureTag /> 가 없다",
  /<DisclosureTag\s*\/>/.test(read("remotion/templates/TemplateEUseCase.tsx"))
);
check(
  "화면 고지 문구에 [광고] 가 없다",
  /DISCLOSURE_TEXT\s*=\s*\n?\s*"\[광고\]/.test(read("remotion/config/videoConfig.ts"))
);

// 3. 발행 편수 상한
const setSetting = read("scripts/set-setting.ts");
check("daily_video_target 상한이 12 를 넘는다", /Number\(v\)\s*<=\s*12/.test(setSetting));

// 4. 설정 허용 키에 자격증명류 금지
const allowedBlock = setSetting.slice(setSetting.indexOf("const ALLOWED"), setSetting.indexOf("async function main"));
check(
  "설정 허용 키에 자격증명류(KEY·TOKEN·SECRET·PASSWORD)가 있다",
  !/^\s*[A-Za-z_]*(KEY|TOKEN|SECRET|PASSWORD|key|token|secret|password)[A-Za-z_]*\s*:/m.test(allowedBlock)
);

// 5. 쿠팡 스카우트 호출 예산 (scout.ts 머리말: 시간당 약 75회)
const scout = read("src/lib/scout.ts");
const budget = scout.match(/KEYWORDS_PER_RUN\s*=\s*(\d+)/)?.[1];
check("scout.ts 에서 KEYWORDS_PER_RUN 을 못 찾았다", !!budget);
if (budget) check(`스카우트 실행당 키워드 ${budget} 이 50 을 넘는다`, Number(budget) <= 50);

if (failures > 0) {
  console.error(`안전장치 점검 실패 ${failures}건 - 푸시하지 않는다`);
  process.exit(1);
}
console.log("안전장치 점검 통과");
