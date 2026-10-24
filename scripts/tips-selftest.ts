/**
 * 살림 정보 쇼츠 안전 검사 자가 점검 (2026-10-20). 네트워크 없음.
 * 약품 섞기·효능 표현·통계·상품 권유가 든 대본은 반드시 반려돼야 하고, 평범한 실용 대본은 통과해야 한다.
 */
import { TIP_TOPICS, checkTipSafety, pickTopic, topicsFor } from "../src/lib/tips";
import { findPolicyIssues } from "../src/lib/policy";
import { TIP_SCRIPTS } from "../src/lib/tipScripts";
import { matchTipTopicByRule, matchTipTopicsByRule } from "../src/lib/tipMatch";
import { OWN_PRODUCTS } from "../src/lib/ownProducts";

let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "OK " : "NG "} ${label}`);
  if (!ok) fail++;
};
const ok = {
  hook: "수건에서 꿉꿉한 냄새, 빨래 순서로 달라져요",
  steps: [
    { title: "젖은 채 두지 않기", detail: "쓴 수건은 바로 펼쳐 말린 뒤 빨래통에 넣어요" },
    { title: "수건만 따로 빨기", detail: "옷과 섞으면 보풀이 엉켜 냄새가 잘 안 빠져요" },
    { title: "유연제는 빼기", detail: "유연제가 남으면 물기를 덜 먹고 냄새가 배요" },
  ],
  outro: "다음 빨래 때 한 번 해 보세요",
};
check("평범한 실용 대본은 통과", checkTipSafety(ok).length === 0);
const bad = (patch: Partial<typeof ok>, label: string) =>
  check(`${label} → 반려`, checkTipSafety({ ...ok, ...patch }).length > 0);
bad({ steps: [...ok.steps.slice(0, 2), { title: "락스 희석", detail: "락스와 식초를 섞어 뿌리면 냄새가 사라져요" }] }, "약품 섞기");
bad({ steps: [...ok.steps.slice(0, 2), { title: "구연산 섞기", detail: "구연산과 베이킹소다를 섞어서 문질러 주세요" }] }, "구연산+베이킹소다 섞기");
bad({ hook: "세균 99% 없애는 빨래법" }, "효능·통계");
bad({ outro: "쿠팡에서 이 제품을 구매해 보세요" }, "상품 권유");
bad({ hook: "수건 냄새, 연구 결과로 밝혀진 방법" }, "근거 없는 연구 결과");
bad({ steps: ok.steps.slice(0, 2) }, "단계 2개");
bad({ steps: [...ok.steps.slice(0, 2), { title: "발목 감싸기", detail: "혈류가 지나가는 발목을 감싸면 따뜻해요" }] }, "건강 원리 설명");
bad({ steps: [...ok.steps.slice(0, 2), { title: "과탄산 쓰기", detail: "유연제 대신 과탄산소다를 넣어 빨아요" }] }, "과탄산소다 권유");
check("주제 이름에 정책 금지어 없음", TIP_TOPICS.every((t) => findPolicyIssues(t.topic).length === 0));
check("계절 주제 고르기 - 10월은 가을·사계절만", topicsFor(new Date("2026-10-20")).every((t) => !t.season || t.season === "fall"));
check("날마다 다른 주제", pickTopic(1).topic !== pickTopic(2).topic);
// 검수본 (2026-10-21): 모든 주제에 검수본이 있고, 하나하나 안전 검사·길이 기준을 통과해야 한다
for (const t of TIP_TOPICS) {
  const r = TIP_SCRIPTS.find((x) => x.topic === t.topic);
  if (!r) {
    check(`검수본 있음 - ${t.topic}`, false);
    continue;
  }
  const issues = checkTipSafety(r);
  if (r.outro.length > 30) issues.push(`마무리 길이 ${r.outro.length}`);
  if (r.stockQueries.length < 2) issues.push("배경 검색어 부족");
  if (issues.length) check(`검수본 ${t.topic}: ${issues.join(", ")}`, false);
}
check(`검수본 ${TIP_SCRIPTS.length}개 · 주제 ${TIP_TOPICS.length}개 짝 맞음`, TIP_SCRIPTS.length === TIP_TOPICS.length);
// 상품 → 꿀팁 주제 규칙 (2026-10-22)
const expect: [string, string | null][] = [
  ["텐트형 해먹 타프 일체형", "해먹 편하게 치는 요령"],
  ["20D 나일론 스퀘어 타프 3x3", "타프 바람에 덜 흔들리게 치는 요령"],
  ["승마 안장 패드 퀼팅 종합마장 안장깔개", "승마 안장 패드 관리하는 법"],
  ["소가죽 A5 노트 커버 세트 빈티지 가죽 다이어리", "새 가죽 노트 커버 길들이는 법"],
  ["왁스 캔버스 오토바이 가방 빈티지 가죽 벨트 메신저백", "오토바이 가방 달기 전 확인할 것"],
  ["아오란 각도조절 경량 접이식 캠핑 의자 세트", "캠핑 첫날 짐 싸는 순서"],
  ["자석선풍기", "빨래 빨리 마르게 너는 요령"],
  ["욕실 수건 걸이 2단", "작은 욕실 수납 늘리는 요령"],
  ["이불 압축팩 대형 5매", "계절 옷 바꿀 때 보관 순서"],
  ["호텔 수건 40수 10장", "수건 냄새 안 나게 빠는 순서"],
  ["전동 타일 줄눈제거기", null],
];
for (const [name, want] of expect) {
  const got = matchTipTopicByRule(name)?.topic ?? null;
  check(`주제 규칙: ${name} → ${got ?? "없음"}`, got === want);
}
// 근사장 상품은 전부 꿀팁 후보가 있어야 하고, 타프류는 다시 나올 때 바꿔 쓸 후보가 2개 이상 (2026-10-24)
for (const o of OWN_PRODUCTS) {
  const n = matchTipTopicsByRule(o.name).length;
  check(`근사장 상품 꿀팁 후보 ${n}개 - ${o.name.slice(0, 24)}`, n >= 1);
}
check("타프류는 후보 2개 이상", matchTipTopicsByRule("해먹 모기장 타프 세트").length >= 2);
console.log(fail ? `❌ ${fail}건 실패` : "✅ 전부 통과");
process.exit(fail ? 1 : 0);
