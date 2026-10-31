/**
 * 대화형 드라마 쇼츠 대본 - 검수본만 쓴다 (2026-10-31 사장님 "스토리가 들어간 드라마 타이즈 릴스" → "추천대로 해봐").
 *
 * 규칙
 * - 정보는 검수 꿀팁(tipScripts.ts)의 같은 주제 단계 내용만 대사로 옮긴다. 새 정보를 지어내지 않는다.
 * - 대사는 실제로 입으로 하는 완결된 말로 쓴다. 메모처럼 줄인 말("남는 선은?", "덜 엉켜", "위칸엔 반찬")은 금지
 *   (2026-10-31 사장님 "말을 생략하는 것들이 너무 어색해" - 음성으로 읽으면 더 어색하다). 조사를 빼지 않는다.
 * - 지어낸 이야기다: 등장인물이 상품을 써 봤다·좋았다고 말하지 않는다(기만광고 방지). 화면 "연출된 이야기" 표시는 2026-10-31 사장님 요청으로 뺌.
 *   상품은 대화가 끝난 뒤 "오늘의 추천 상품"으로 사진·번호만.
 * - 효능·과장·클릭 재촉 표현 금지(policy.ts 검사를 렌더 전에 한 번 더 거친다).
 * - 목소리 (2026-10-31 사장님 "엄마랑 아들인데 전혀 목소리가 그렇지 않아" → 견본 10개 음높이 실측 후 연출 판단):
 *   엄마 = F3(여자 중 가장 낮고 차분, 조금 느리게), 아들 = M1(남자 중 가장 높고 가벼움, 조금 빠르게).
 *   예전 M2 는 남자 중 가장 낮은 목소리(중년 느낌)라 아들에 안 맞았다. 팔로우·상품 안내도 아들이 시청자에게 말한다(세 번째 목소리 없음).
 */
import { findPolicyIssues } from "./policy";

export type DramaLine = { who: "a" | "b"; text: string };

export type DramaScript = {
  /** tipScripts.ts 의 검수 꿀팁 주제 - 상품과 어울리는지 판정에 쓴다 */
  topic: string;
  title: string;
  names: { a: string; b: string };
  lines: DramaLine[];
};

export const DRAMA_VOICES = {
  a: { voice: "F3", speed: 1.15 },
  b: { voice: "M1", speed: 1.3 },
} as const;

export const DRAMA_SCRIPTS: DramaScript[] = [
  {
    topic: "책상 밑 전선 정리하는 법",
    title: "엄마가 내 책상 밑을 보더니",
    names: { a: "엄마", b: "나" },
    lines: [
      { who: "a", text: "너 책상 밑에 이게 다 뭐니?" },
      { who: "b", text: "전선이지 뭐. 자꾸 발에 걸려서 짜증 나" },
      { who: "a", text: "멀티탭을 왜 바닥에 그냥 뒀어?" },
      { who: "b", text: "그럼 어디에 둬야 되는데?" },
      { who: "a", text: "책상 밑에 붙여서 바닥에서 띄워 봐. 발에도 덜 걸리고 먼지도 덜 쌓여" },
      { who: "b", text: "오, 그럼 길게 남는 선은 어떡해?" },
      { who: "a", text: "늘어진 선은 한데 묶어 두면 덜 엉켜" },
      { who: "a", text: "플러그에는 이름표를 붙여 놔. 뽑을 때 뭔지 바로 알 수 있어" },
      { who: "b", text: "바닥이 비니까 청소하기도 편하겠다" },
    ],
  },
  {
    topic: "냉장고 칸별로 넣으면 좋은 음식",
    title: "엄마가 냉장고 열자마자 한 말",
    names: { a: "엄마", b: "나" },
    lines: [
      { who: "a", text: "고기를 왜 냉장고 맨 위에 넣어 놨어?" },
      { who: "b", text: "거기 자리가 비어 있길래 넣었지" },
      { who: "a", text: "핏물이 떨어지면 아래 있는 음식에 다 묻잖아" },
      { who: "b", text: "헐, 그럼 어디에 넣어야 돼?" },
      { who: "a", text: "생고기는 맨 아래 칸에 넣어. 그래야 흘러도 다른 데 안 떨어져" },
      { who: "a", text: "위 칸에는 바로 먹을 반찬을 둬. 눈높이라서 안 잊어버려" },
      { who: "b", text: "달걀은 문 쪽에 두는 거 아니야?" },
      { who: "a", text: "문 쪽은 자주 열려서 온도가 바뀌어. 소스랑 음료만 둬" },
    ],
  },
];

export function dramaForTopic(topic: string): DramaScript | null {
  return DRAMA_SCRIPTS.find((d) => d.topic === topic) ?? null;
}

/** 대본 안전 검사 - 효능·과장(policy), 상품 권유, 건강 원리, 통계, 대사 길이. 빈 배열이면 통과 */
export function checkDramaSafety(d: DramaScript): string[] {
  const all = [d.title, ...d.lines.map((l) => l.text)].join("\n");
  const issues = [...findPolicyIssues(all)];
  if (/구매|사세요|추천템|쿠팡|링크|할인|최저가|제품|상품|써 ?봤|샀/.test(all)) issues.push("상품 권유·사용 후기");
  if (/혈류|혈관|호르몬|면역|독소|해독/.test(all)) issues.push("건강 원리 설명");
  if (/\d+\s*[%％]|\d+\s*배|퍼센트|연구\s*결과/.test(all)) issues.push("통계·퍼센트");
  if (d.lines.length < 5 || d.lines.length > 12) issues.push("대사 수(5~12)");
  if (d.lines.some((l) => l.text.length > 40)) issues.push("대사 길이(40자)");
  if (d.title.length > 18) issues.push("제목 길이(18자)");
  return issues;
}
