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
 *  - 쿠팡 스카우트 호출 예산, 모든 쿠팡 호출이 장부(최근 60분 35회)를 지나는지
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
// 2026-10-07: "[광고]" 접두는 사장님 결정으로 뺐다. 고지 문장 자체는 반드시 남아 있어야 한다.
const SCREEN_DISCLOSURE = "쿠팡파트너스 활동의 일환으로 수수료를 제공받습니다";
check(
  "화면 고지 문구(DISCLOSURE_TEXT)에 쿠팡파트너스 고지 문장이 없다",
  read("remotion/config/videoConfig.ts").includes(`"${SCREEN_DISCLOSURE}"`)
);
for (const t of ["TemplateE", "TemplateEUseCase"]) {
  check(`${t} 화면 고지 문장이 없다`, read(`remotion/templates/${t}.tsx`).includes(SCREEN_DISCLOSURE));
}

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
if (budget) check(`스카우트 실행당 키워드 ${budget} 이 20 을 넘는다(장부 상한 35)`, Number(budget) <= 20);

// 6. 쿠팡 API 장부: 모든 호출이 request() 한 곳을 지나고, 거기서 장부 자리를 받는다
const coupangSrc = read("src/lib/coupang.ts");
const reqBody = coupangSrc.slice(coupangSrc.indexOf("async function request"), coupangSrc.indexOf("await fetch(url"));
check("coupang.ts request() 가 fetch 전에 acquireCoupangCall 을 부르지 않는다", reqBody.includes("await acquireCoupangCall("));
check("coupangLedger 상한이 35 를 넘는다", /COUPANG_ROLLING_CAP\s*=\s*(\d+)/.test(read("src/lib/coupangLedger.ts")) &&
  Number(read("src/lib/coupangLedger.ts").match(/COUPANG_ROLLING_CAP\s*=\s*(\d+)/)![1]) <= 35);
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|mjs|js)$/.test(d.name) ? [p] : [];
  });
}
for (const f of [...walk("src"), ...walk("worker"), ...walk("scripts")]) {
  if (f === "src/lib/coupang.ts" || f === "scripts/guardrails-selftest.ts") continue;
  check(`${f} 가 쿠팡 API 주소를 직접 부른다(장부 우회)`, !read(f).includes("api-gateway.coupang.com"));
}

if (failures > 0) {
  console.error(`안전장치 점검 실패 ${failures}건 - 푸시하지 않는다`);
  process.exit(1);
}
console.log("안전장치 점검 통과");
