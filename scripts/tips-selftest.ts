/**
 * 살림 정보 쇼츠 안전 검사 자가 점검 (2026-10-20). 네트워크 없음.
 * 약품 섞기·효능 표현·통계·상품 권유가 든 대본은 반드시 반려돼야 하고, 평범한 실용 대본은 통과해야 한다.
 */
import { TIP_TOPICS, checkTipSafety, pickTopic, topicsFor } from "../src/lib/tips";
import { findPolicyIssues } from "../src/lib/policy";

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
console.log(fail ? `❌ ${fail}건 실패` : "✅ 전부 통과");
process.exit(fail ? 1 : 0);
