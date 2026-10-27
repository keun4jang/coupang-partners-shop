/**
 * 살림 정보 쇼츠 글 만들기 (2026-10-20 사장님 "추천대로 진행" - 하루 6편을 정보 4 + 상품 2 로,
 * "영상이 길지는 않아도 되는데 내용이 유익해야 함").
 *
 * - 주제는 아래 TIP_TOPICS 안에서만 고른다 (AI 가 마음대로 주제를 정하지 않게 - 위험하거나 엉뚱한 정보 차단).
 * - 글은 검수본(src/lib/tipScripts.ts)만 쓴다 (2026-10-21~ - AI 초안은 사실 오류가 많아 영상에 쓰지 않는다).
 *   형식: 훅(질문) 1줄 + 단계 3~4개(제목·설명) + 마무리 1줄 + 배경 스톡 검색어.
 * - 안전 검사(checkTipSafety): 세제·약품 섞기, 효능·건강 주장, 통계·퍼센트, 정책 금지어, 상품·구매 권유가 있으면 버리고 다시 쓴다.
 *   세 번 다 걸리면 null - 그날 정보 영상은 건너뛴다 (잘못된 정보 한 편이 채널 신뢰를 무너뜨린다).
 * 상품·링크가 없으므로 광고 고지가 필요 없다.
 */
import { geminiGenerateJson } from "./ai";
import { findPolicyIssues } from "./policy";
import { reviewedTip } from "./tipScripts";

export type TipTopic = {
  topic: string;
  /** 계절 (없으면 사계절) */
  season?: "spring" | "summer" | "fall" | "winter";
  /** 어떤 영상 묶음인지 (화면 꼬리표·통계용) */
  group: "세탁" | "주방" | "정리" | "청소" | "자취" | "캠핑" | "계절";
};

/** 정보 주제 목록 - 집에서 바로 따라 할 수 있고, 약품 없이도 되는 것 위주로 골랐다 */
export const TIP_TOPICS: TipTopic[] = [
  { topic: "수건 냄새 안 나게 빠는 순서", group: "세탁" },
  { topic: "니트 줄어들지 않게 세탁하는 법", group: "세탁" },
  { topic: "흰 옷 누렇게 변하지 않게 보관하는 법", group: "세탁" },
  { topic: "빨래 빨리 마르게 너는 요령", group: "세탁" },
  { topic: "운동화 모양 안 망가지게 말리는 법", group: "세탁" },
  { topic: "이불 빨래 주기와 말리는 요령", group: "세탁" },
  { topic: "냉장고 칸별로 넣으면 좋은 음식", group: "주방" },
  { topic: "채소 오래 싱싱하게 보관하는 법", group: "주방" },
  { topic: "남은 밥 맛있게 얼리고 데우는 법", group: "주방" },
  { topic: "도마 냄새 줄이는 관리 순서", group: "주방" },
  { topic: "프라이팬 코팅 오래 쓰는 습관", group: "주방" },
  { topic: "싱크대 배수구 냄새 줄이는 습관", group: "주방" },
  { topic: "옷장 정리할 때 접는 순서", group: "정리" },
  { topic: "현관 신발장 좁을 때 정리 요령", group: "정리" },
  { topic: "서랍 속 자잘한 물건 정리법", group: "정리" },
  { topic: "작은 욕실 수납 늘리는 요령", group: "정리" },
  { topic: "계절 옷 바꿀 때 보관 순서", group: "정리" },
  { topic: "냉동실 꽉 찼을 때 정리법", group: "정리" },
  { topic: "청소 순서 위에서 아래로 하는 이유", group: "청소" },
  { topic: "창틀 먼지 쉽게 닦는 순서", group: "청소" },
  { topic: "욕실 물때 덜 생기게 하는 습관", group: "청소" },
  { topic: "매트리스 관리하는 습관", group: "청소" },
  { topic: "먼지 덜 쌓이게 하는 집안 습관", group: "청소" },
  { topic: "자취방 이사 전 체크리스트", group: "자취" },
  { topic: "원룸 좁아 보이지 않게 배치하는 요령", group: "자취" },
  { topic: "혼자 살 때 장보기 줄이는 요령", group: "자취" },
  { topic: "자취방 전기요금 아끼는 습관", group: "자취" },
  { topic: "캠핑 첫날 짐 싸는 순서", group: "캠핑" },
  { topic: "타프 바람에 덜 흔들리게 치는 요령", group: "캠핑" },
  { topic: "캠핑 밤에 덜 춥게 자는 요령", group: "캠핑" },
  { topic: "차박 처음 할 때 챙길 것", group: "캠핑" },
  { topic: "장마철 옷장 습기 잡는 요령", season: "summer", group: "계절" },
  { topic: "여름 음식물 쓰레기 냄새 줄이는 요령", season: "summer", group: "계절" },
  { topic: "겨울 결로 덜 생기게 하는 습관", season: "winter", group: "계절" },
  { topic: "겨울 난방비 아끼는 집안 습관", season: "winter", group: "계절" },
  { topic: "환절기 이불 바꾸는 순서", season: "fall", group: "계절" },
  { topic: "봄맞이 대청소 순서", season: "spring", group: "계절" },
  // 2026-10-24 사장님 "상품은 또 나와도 내용을 바꾸면 돼" - 근사장 상품(캠핑·가죽·오토바이·승마)이 다시 나올 때 꿀팁을 돌려쓰려고 추가
  { topic: "해먹 편하게 치는 요령", group: "캠핑" },
  { topic: "타프 치기 좋은 자리 고르는 법", group: "캠핑" },
  { topic: "비 올 때 타프 치는 요령", group: "캠핑" },
  { topic: "캠핑장 벌레 덜 꼬이게 하는 법", group: "캠핑" },
  { topic: "텐트 안 습기 덜 차게 하는 법", group: "캠핑" },
  { topic: "백패킹 배낭 가볍게 싸는 요령", group: "캠핑" },
  { topic: "캠핑 담요 오래 쓰는 보관법", group: "캠핑" },
  { topic: "차박 트렁크 공간 넓게 쓰는 법", group: "캠핑" },
  { topic: "가죽 가방 오래 쓰는 관리법", group: "정리" },
  { topic: "새 가죽 노트 커버 길들이는 법", group: "정리" },
  { topic: "오토바이 가방 달기 전 확인할 것", group: "정리" },
  { topic: "승마 안장 패드 관리하는 법", group: "세탁" },
  // 2026-10-26 사장님 "주제 추가해 여러 가지로" - 생활 상식·겨울 대비·안전·주방
  { topic: "세탁 라벨 기호 읽는 법", group: "세탁" },
  { topic: "옷 보풀 덜 생기게 하는 법", group: "세탁" },
  { topic: "소비기한과 유통기한 차이", group: "주방" },
  { topic: "녹인 고기 다시 얼리지 않는 이유", group: "주방" },
  { topic: "전자레인지에 넣으면 안 되는 그릇", group: "주방" },
  { topic: "냄비 눌어붙었을 때 닦는 순서", group: "주방" },
  { topic: "주방 칼 오래 쓰는 법", group: "주방" },
  { topic: "텀블러 냄새 안 배게 쓰는 법", group: "주방" },
  { topic: "헷갈리는 분리배출 정리", group: "자취" },
  { topic: "멀티탭 안전하게 쓰는 법", group: "자취" },
  { topic: "보조배터리 오래 쓰는 법", group: "자취" },
  { topic: "우산 오래 쓰는 법", group: "자취" },
  { topic: "자동차 실내 정리 요령", group: "정리" },
  { topic: "하수구 덜 막히게 하는 습관", group: "청소" },
  { topic: "가습기 깨끗하게 쓰는 습관", season: "fall", group: "계절" },
  { topic: "겨울 수도 동파 막는 법", season: "winter", group: "계절" },
  { topic: "전기장판 안전하게 쓰는 법", season: "winter", group: "계절" },
  { topic: "책상 밑 전선 정리하는 법", group: "정리" },
];

export type TipScript = {
  topic: string;
  group: TipTopic["group"];
  hook: string;
  steps: { title: string; detail: string }[];
  outro: string;
  stockQueries: string[];
};

function seasonOf(d: Date): TipTopic["season"] {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

/** 오늘 고를 수 있는 주제 (계절이 맞거나 사계절) */
export function topicsFor(d: Date = new Date()): TipTopic[] {
  const s = seasonOf(d);
  return TIP_TOPICS.filter((t) => !t.season || t.season === s);
}

/** 날짜·순번으로 주제를 고른다 (같은 날 같은 주제가 겹치지 않게, 날마다 돌아가며) */
export function pickTopic(seed: number, d: Date = new Date()): TipTopic {
  const list = topicsFor(d);
  return list[((seed % list.length) + list.length) % list.length];
}

/** 섞으면 위험한 약품 조합 - 언급만 돼도 버린다 (섞지 말라는 경고라도 정보 영상에서 다루지 않는다) */
const CHEM = /락스|염소|표백제|차아염소산|암모니아|식초|구연산|과탄산|베이킹소다|산성\s*세제|알칼리/;
const MIX = /섞|혼합|같이\s*(써|사용|넣)|함께\s*(써|사용|넣)/;
/** 통계·퍼센트·과장 숫자 (확인할 수 없는 수치) */
const STATS = /\d+\s*[%％]|\d+\s*배|퍼센트|연구\s*결과|전문가에\s*따르면|과학적으로/;
/** 구매·상품 권유 - 정보 영상에는 상품을 넣지 않는다 */
const SELL = /구매|사세요|추천템|쿠팡|링크|할인|최저가|제품을|상품을/;

/** 안전 검사: 문제 목록 (비어 있으면 통과) */
export function checkTipSafety(t: Pick<TipScript, "hook" | "steps" | "outro">): string[] {
  const all = [t.hook, ...t.steps.flatMap((s) => [s.title, s.detail]), t.outro].join("\n");
  const issues = [...findPolicyIssues(all)];
  if (CHEM.test(all) && MIX.test(all)) issues.push("약품 섞기 언급");
  if (/락스|염소|표백제|암모니아|차아염소산|과탄산/.test(all)) issues.push("강한 약품 언급");
  // 몸·건강 원리로 설명하면 확인 못 한 건강 주장이 된다 (10/20 샘플: "혈류가 지나가는 발목")
  if (/혈류|혈관|혈액|호르몬|신진대사|면역|체내|독소|해독/.test(all)) issues.push("건강 원리 설명");
  if (STATS.test(all)) issues.push("통계·퍼센트");
  if (SELL.test(all)) issues.push("구매·상품 권유");
  if (t.steps.length < 3 || t.steps.length > 4) issues.push("단계 수(3~4)");
  for (const s of t.steps) {
    if (!s.title || s.title.length > 16) issues.push("단계 제목 길이");
    // 짧고 빠르게 (10/20 사장님 "길지 않아도 유익하게" - 첫 샘플이 42초로 길었다)
    if (!s.detail || s.detail.length < 10 || s.detail.length > 38) issues.push("단계 설명 길이");
  }
  if (t.hook.length > 34) issues.push("훅 길이");
  return [...new Set(issues)];
}

const SYSTEM = `너는 한국 살림 정보 쇼츠의 대본 작가다. 30~40대가 "저장해 둘 만하다"고 느끼는 실용 정보만 쓴다.
규칙:
- 주어진 주제 하나만 다룬다. 집에서 오늘 바로 따라 할 수 있는 구체적인 행동으로 쓴다 (막연한 말 금지: "깨끗이 관리해요" 같은 말 X).
- 각 단계에는 "왜 그런지" 이유가 짧게 들어가야 한다. 근거 없는 수치·퍼센트·"연구 결과" 금지.
- 락스·표백제·과탄산소다·암모니아 같은 강한 약품, 약품 섞기는 아예 다루지 않는다. 식초·베이킹소다·구연산도 다른 것과 섞는 방법은 쓰지 않는다.
- 몸·건강 원리(혈류, 혈액, 면역, 호르몬 등)로 이유를 대지 않는다. 이유는 물건·공기·물기·온도처럼 눈에 보이는 것으로 댄다.
- 효능·건강 표현 금지: 살균, 항균, 세균, 바이러스, 예방, 치료, 면역, 숙면 같은 말을 쓰지 않는다 ("막는다", "줄인다"로 쓴다).
- 상품·브랜드·구매 권유·링크 언급 금지. 정보만 준다.
- 말투는 친근한 존댓말 "~해요". "~잖아요" 같은 상투어를 반복하지 않는다.
- hook: 34자 이하, 시청자가 겪는 문제를 콕 집는 한 문장.
- steps: 3개(꼭 필요할 때만 4개). title 16자 이하(행동), detail 12~38자(구체적인 방법 + 짧은 이유). 영상 전체가 30초 안팎이 되게 짧게.
- outro: 30자 이하, 정리 한 줄 (클릭·구독 재촉 금지).
- stockQueries: 영어 2~5단어 검색어 3개. 이 주제의 실제 행동 장면 (예: "folding towels laundry", "hanging clothes to dry").`;

const SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title", "detail"],
      },
    },
    outro: { type: "string" },
    stockQueries: { type: "array", items: { type: "string" } },
  },
  required: ["hook", "steps", "outro", "stockQueries"],
};

/**
 * 주제 하나의 대본 - **검수본(src/lib/tipScripts.ts)만** 쓴다 (2026-10-21 사장님 "유용한 정보들은 이상 없는지 확인" →
 * AI 초안 29개 중 10개 넘게 사실이 틀려서). 검수본이 없거나 안전 검사에 걸리면 null - 그 주제는 건너뛴다.
 */
export async function generateTip(t: TipTopic): Promise<TipScript | null> {
  const r = reviewedTip(t.topic);
  if (!r) {
    console.warn(`정보 대본: 검수본 없음 - ${t.topic} 건너뜀`);
    return null;
  }
  const tip: TipScript = { ...r, group: t.group };
  const issues = checkTipSafety(tip);
  if (issues.length) {
    console.warn(`정보 대본: 검수본이 안전 검사에 걸림(${issues.join(", ")}) - ${t.topic} 건너뜀`);
    return null;
  }
  return tip;
}

/**
 * AI(무료 Gemini) 초안 - **영상에는 쓰지 않는다.** 새 주제를 넣을 때 초안을 뽑아(render-demo tipcheck)
 * Claude 가 사실 확인 후 tipScripts.ts 에 옮겨 적는 용도. 안전 검사에 세 번 걸리면 null.
 */
export async function generateTipDraft(t: TipTopic): Promise<TipScript | null> {
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await geminiGenerateJson<Omit<TipScript, "topic" | "group">>({
      system: SYSTEM,
      prompt: `주제: ${t.topic}${feedback ? `\n지난 초안의 문제: ${feedback}. 이 문제 없이 다시 써라.` : ""}`,
      schema: SCHEMA,
      temperature: 0.6,
    });
    if (!r) return null;
    const tip: TipScript = {
      topic: t.topic,
      group: t.group,
      hook: r.hook.trim(),
      steps: (r.steps ?? []).map((s) => ({ title: s.title.trim(), detail: s.detail.trim() })),
      outro: r.outro.trim(),
      stockQueries: (r.stockQueries ?? [])
        .map((q) => q.trim().toLowerCase())
        .filter((q) => /^[a-z ]{3,60}$/.test(q))
        .slice(0, 3),
    };
    const issues = checkTipSafety(tip);
    if (issues.length === 0) return tip;
    console.warn(`정보 대본 ${attempt}차 반려: ${issues.join(", ")}`);
    feedback = issues.join(", ");
  }
  return null;
}

/** 화면 꼬리표에 쓸 짧은 주제 이름 (예: "수건 냄새 안 나게 빠는 순서" → "수건 냄새") */
export function shortTopic(topic: string): string {
  const words = topic.split(" ");
  return words.slice(0, Math.min(2, words.length)).join(" ");
}
