/**
 * 상품 → 어울리는 살림 꿀팁 주제 고르기 (2026-10-22 사장님: "모든 영상을 처음엔 상품 관련 생활 꿀팁, 마지막에 짧게 상품 사진이랑 번호").
 *
 * 꿀팁 글은 **검수본(tipScripts.ts) 37개 안에서만** 고른다 - AI 가 상품마다 새 정보를 쓰면 사실 오류가 난다(10/21 점검).
 * 1) 상품명 낱말 규칙으로 고른다 (확실한 것만).
 * 2) 규칙에 없으면 무료 Gemini 가 목록 번호만 고른다 (새 글을 쓰지 않음). "그 요령에 이 물건을 실제로 쓰는가"가 아니면 -1.
 * 3) 둘 다 없으면 null → 호출부는 예전 상품 소개 영상으로 만든다 (어울리지 않는 꿀팁을 억지로 붙이지 않는다).
 */
import { geminiGenerateJson } from "./ai";
import { TIP_TOPICS, type TipTopic } from "./tips";

/** [상품명에 이 낱말이 있으면, 이 주제] - 위에서부터 먼저 맞는 것 */
const RULES: [RegExp, string][] = [
  [/타프|해먹/, "타프 바람에 덜 흔들리게 치는 요령"],
  [/침낭|캠핑\s*매트|발포\s*매트|에어\s*매트/, "캠핑 밤에 덜 춥게 자는 요령"],
  [/차박|차량용\s*매트|트렁크\s*매트|차량용\s*가리개|햇빛\s*가리개/, "차박 처음 할 때 챙길 것"],
  [/텐트|캠핑|아이스\s*박스|쿨러|랜턴|폴딩\s*(의자|체어|테이블)|캠핑\s*의자|버너/, "캠핑 첫날 짐 싸는 순서"],
  // "이불 수납"·"수건 걸이"가 이불·수건 빨래 주제로 새지 않게 먼저 본다
  [/압축\s*팩|의류\s*(보관|수납)|이불\s*(보관|수납)/, "계절 옷 바꿀 때 보관 순서"],
  [/욕실\s*(선반|수납|정리)|샤워\s*(선반|수납)|수건\s*걸이/, "작은 욕실 수납 늘리는 요령"],
  [/수건|타월/, "수건 냄새 안 나게 빠는 순서"],
  [/니트|스웨터|울\s*세제/, "니트 줄어들지 않게 세탁하는 법"],
  [/운동화|신발\s*건조/, "운동화 모양 안 망가지게 말리는 법"],
  [/신발장|신발\s*정리|슈\s*랙|신발\s*선반/, "현관 신발장 좁을 때 정리 요령"],
  [/매트리스|토퍼/, "매트리스 관리하는 습관"],
  [/이불|차렵|침구|베개\s*커버/, "환절기 이불 바꾸는 순서"],
  [/빨래\s*건조대|건조대|빨래\s*집게|서큘레이터|선풍기/, "빨래 빨리 마르게 너는 요령"],
  [/제습|습기\s*제거/, "장마철 옷장 습기 잡는 요령"],
  [/문풍지|뽁뽁이|단열\s*(시트|필름|에어캡)|방풍/, "겨울 난방비 아끼는 집안 습관"],
  [/결로/, "겨울 결로 덜 생기게 하는 습관"],
  [/도마/, "도마 냄새 줄이는 관리 순서"],
  [/프라이팬|후라이팬|궁중팬|웍|뒤집개/, "프라이팬 코팅 오래 쓰는 습관"],
  [/배수구|거름망|싱크대/, "싱크대 배수구 냄새 줄이는 습관"],
  [/음식물\s*(쓰레기|처리)|쓰레기통/, "여름 음식물 쓰레기 냄새 줄이는 요령"],
  [/냉동\s*(용기|보관)|지퍼백|소분\s*용기|밥\s*용기/, "남은 밥 맛있게 얼리고 데우는 법"],
  [/채소\s*(보관|용기)|야채\s*(보관|용기)/, "채소 오래 싱싱하게 보관하는 법"],
  [/냉장고\s*(정리|수납)|반찬통|밀폐\s*용기/, "냉장고 칸별로 넣으면 좋은 음식"],
  [/옷걸이|옷장|행거|바지\s*걸이/, "옷장 정리할 때 접는 순서"],
  [/서랍\s*(정리|칸막이)|정리함|칸막이|소품\s*정리/, "서랍 속 자잘한 물건 정리법"],
  [/물기\s*제거|스퀴지|수전|욕실\s*청소/, "욕실 물때 덜 생기게 하는 습관"],
  [/창틀|방충망|창문\s*청소/, "창틀 먼지 쉽게 닦는 순서"],
  [/먼지떨이|극세사|물걸레|밀대|청소포/, "먼지 덜 쌓이게 하는 집안 습관"],
  [/멀티탭|콘센트|타이머/, "자취방 전기요금 아끼는 습관"],
];

function byTopic(topic: string): TipTopic | null {
  return TIP_TOPICS.find((t) => t.topic === topic) ?? null;
}

/** 규칙만으로 고르기 (네트워크 없음 - 자가 점검용) */
export function matchTipTopicByRule(productName: string): TipTopic | null {
  for (const [re, topic] of RULES) if (re.test(productName)) return byTopic(topic);
  return null;
}

/** 상품 → 꿀팁 주제. 어울리는 게 없으면 null (그 상품은 예전 상품 영상으로) */
export async function matchTipTopic(productName: string, category?: string | null): Promise<{ topic: TipTopic; how: string } | null> {
  const rule = matchTipTopicByRule(productName);
  if (rule) return { topic: rule, how: "낱말 규칙" };
  const list = TIP_TOPICS.map((t, i) => `${i}. ${t.topic}`).join("\n");
  const r = await geminiGenerateJson<{ index: number; reason: string }>({
    system:
      "너는 살림 쇼츠 편집자다. 상품 하나와 생활 요령 목록을 받으면, 그 요령을 따라 할 때 이 상품을 실제로 쓰는 경우에만 그 번호를 고른다. " +
      "억지로 연결되면(예: 줄눈 제거기와 먼지 습관) -1. 확실할 때만 고른다.",
    prompt: `상품: ${productName}${category ? ` (분류: ${category})` : ""}\n\n요령 목록:\n${list}\n\n번호 하나 또는 -1 과 짧은 이유.`,
    schema: {
      type: "object",
      properties: { index: { type: "integer" }, reason: { type: "string" } },
      required: ["index", "reason"],
    },
    temperature: 0,
  });
  if (!r || !Number.isInteger(r.index) || r.index < 0 || r.index >= TIP_TOPICS.length) {
    console.log(`꿀팁 주제: 어울리는 주제 없음 (${r?.reason?.slice(0, 60) ?? "Gemini 응답 없음"})`);
    return null;
  }
  return { topic: TIP_TOPICS[r.index], how: `Gemini 선택 - ${r.reason.slice(0, 60)}` };
}
