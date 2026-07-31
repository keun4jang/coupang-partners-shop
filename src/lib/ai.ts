import Anthropic from "@anthropic-ai/sdk";
import type { Product, VideoCopy, TemplateType } from "@/types/db";
import { optionalEnv } from "./env";
import { shortenProductName } from "./format";
import {
  CATEGORY_VARIANTS,
  extractFeatureLines,
  specLine,
  nameHash,
  pick,
} from "./copyPresets";
import { getSetting } from "./settings";

const DEFAULT_MODEL = "claude-opus-4-8";

/** 허위 후기/과장으로 보일 수 있어 금지하는 표현 */
const BANNED_PHRASES = [
  "직접 써봤",
  "제가 써봤",
  "써보니",
  "우리 아이가 써",
  "매일 쓰고 있",
  "효과 확실",
  "무조건 사세요",
  "무조건 사야",
  "인생템",
  "대박템",
  "안 사면 손해",
  "완전 강추",
  "강추",
];

/**
 * hookText/empathyLine/benefit1/benefit2 는 script_text 에 줄 단위로 합쳐져
 * 렌더 워커가 그대로 자막 한 줄씩으로 사용한다. AI가 필드 안에 개행을 넣으면
 * 줄 수가 어긋나 CTA 등 뒤 줄이 밀리므로, 개행을 공백으로 접어 항상 1줄을 보장한다.
 */
function singleLine(text: string): string {
  return text.replace(/\s*\n+\s*/g, " ").trim();
}

function sanitizeCopy(copy: VideoCopy): VideoCopy {
  return {
    hookText: singleLine(copy.hookText),
    empathyLine: singleLine(copy.empathyLine),
    benefit1: singleLine(copy.benefit1),
    benefit2: singleLine(copy.benefit2),
    usageTip: singleLine(copy.usageTip),
    reviewLine: singleLine(copy.reviewLine),
    captionText: copy.captionText,
  };
}

/**
 * 약한 훅 판정 (프롬프트로 금지해도 AI가 반복해서 흘러가는 패턴을 코드로 막는다).
 *
 * 실제 발행분 #1~59 를 세어보니 절반이 "~라면 / ~분들 / ~시죠?" 류의 순한 호명·동의구걸
 * 형태였다. 이런 훅은 궁금증을 만들지 않아 스크롤을 못 멈춘다.
 * 여기서 걸리면 교정 지시를 붙여 1회 재생성한다(generateVideoCopy).
 *
 * 주의: 패턴 ④ 손해 지목("아직도 맨손으로 건지세요?")은 강한 훅이라 통과시켜야 한다.
 * "아직도"가 있으면 ④로 보고 약함 판정에서 제외한다.
 */
const WEAK_HOOK_PATTERNS: RegExp[] = [
  // 순한 호명: "~하는 집이라면", "~담고 싶다면"
  /(이?라면|다면)\s*[?!.]?$/,
  // 대상 호명이 문장 중간에 있어도 호명형: "아기 키우는 집이라면 공감할 거예요"
  /(집|분|분들|엄마|아빠|주부|가정)(이?라면|이면)/,
  // 대상 호명으로 끝남: "~분?", "~분들 계시죠?", "~주부님들", "~엄마들", "~집 손?"
  /(분|분들|주부님들?|엄마들?|아빠들?|집)\s*(손)?\s*[?!.]?$/,
  // 동의 구걸형 물음: "~시죠?", "~셨죠?", "~시나요?", "~계시죠?"
  /(시죠|셨죠|시나요|셨나요|계시죠|계세요|계신가요|이시죠)\s*[?!.]?$/,
  // 동의 구걸 종결: "~아쉽죠", "~일이죠?" / 순한 확인형: "~엉망인가요?"
  /죠\s*[?!.]?$/,
  /(인가요|은가요|나요)\s*[?!.]?$/,
  // 호명 상투어
  /주목\s*(요)?\s*[?!.]?$/,
  // 상황 서술로 끝나 질문이 없음: "새벽에 애 우유 탈 때", "~지칠 때"
  /\s때\s*[?!.]?$/,
  // 밋밋한 평서 종결: "~자주 떨어진다" (궁금증 없이 상황만 진술)
  /(는다|한다|진다|린다|았다|었다|이다)\s*[.]?$/,
  // 문장이 안 끝나고 이어짐: "~하고", "~시키느라", "~주걱," → 훅 한 줄로 성립 안 됨
  /(고|서|며|면서|는데|느라)\s*,?$/,
  /,$/,
];

export function isWeakHook(hook: string): boolean {
  const h = hook.trim();
  if (!h) return true;
  // 패턴 ④(손해 지목)은 "아직도"로 시작하는 강한 훅 - 예외 처리
  if (h.includes("아직도")) return false;
  return WEAK_HOOK_PATTERNS.some((re) => re.test(h));
}

function containsBannedPhrase(copy: VideoCopy): boolean {
  const all = [
    copy.hookText,
    copy.empathyLine,
    copy.benefit1,
    copy.benefit2,
    copy.usageTip,
    copy.reviewLine,
    copy.captionText,
  ].join("\n");
  return BANNED_PHRASES.some((p) => all.includes(p));
}

/**
 * 스크립트 전문(줄 단위, 워커가 그대로 장면으로 사용):
 * 후킹 → 공감 → 장점1 → 장점2 → 사용팁 → 후기 → 번호 CTA (7줄)
 */
export function composeScriptText(copy: VideoCopy, displayNumber: number): string {
  return [
    copy.hookText,
    copy.empathyLine,
    copy.benefit1,
    copy.benefit2,
    copy.usageTip,
    copy.reviewLine,
    ctaLine(displayNumber),
  ].join("\n");
}

// CTA 변형 3종 - 클릭을 부르는 심리 트리거를 하나씩 담아 번호로 회전한다.
// 번호로 결정되므로 재렌더에도 같은 문장이 나오고(자막=나레이션 보장),
// click_logs 가 번호 단위로 쌓여 어떤 CTA 가 클릭을 부르는지 비교할 수 있다.
const CTA_VARIANTS = [
  // 즉시성+간편함: 누르면 바로 맨 위 - 행동 장벽 제거
  "지금 프로필 링크 누르면 이 제품이 맨 위에 떠요",
  // 가격 궁금증(열린 고리): 답은 링크 너머에 있게
  "가격은 프로필 링크에서 확인해 보세요, 생각보다 착해요",
  // 소멸성: 쇼츠 피드는 지나가면 다시 찾기 어렵다는 사실 그대로
  "이 영상 지나가면 다시 찾기 어려워요, 프로필 링크에 있어요",
];

export function ctaLine(displayNumber: number): string {
  // CTA 화면 자막과 나레이션이 완전히 같은 문장을 쓴다.
  // 랜딩 원탭 개편: 링크만 누르면 맨 위에 뜨므로 "번호 검색" 대신 원탭 안내.
  // (번호는 CTA 화면에 크게 표시되어 예전 영상 폴백 검색용으로 남는다)
  return CTA_VARIANTS[displayNumber % CTA_VARIANTS.length];
}

// 대가성 고지는 웹사이트(랜딩)에만 두고 SNS 캡션/영상에는 넣지 않는다(사장님 결정).

/**
 * AI 미설정/실패 시 사용하는 폴백 문구.
 * 구성: 후킹 → 공감 → 장점1 → 장점2 → 사용팁 → 후기 → CTA. (7장면)
 * - 카테고리별 변형(후킹/공감/팁/후기)을 시드로 골라 매번 다르게 (copyPresets).
 * - 장점1·2 는 상품명에서 뽑은 "실제 제품 특징"을 우선 쓴다 → 제품 설명이 들어감.
 * - 시드 = displayNumber + 상품명 해시 → 같은 카테고리라도 상품마다 조합이 달라짐.
 */
export function fallbackCopy(product: Product, displayNumber: number): VideoCopy {
  const category = product.category || "생활템";
  const pain = product.pain_point?.trim();
  const benefit = product.main_benefit?.trim();
  const v = CATEGORY_VARIANTS[category] ?? CATEGORY_VARIANTS["생활템"];
  const seed = displayNumber + nameHash(product.product_name);

  // 상품명에서 실제 특징 문장 뽑기 (장점 자리에 제품 설명으로 들어간다)
  const features = extractFeatureLines(product.product_name, 2);
  const spec = specLine(product.product_name, product.price_text);

  // 후킹: pain 이 그 자체로 강한 훅이면 쓰고, 아니면 검증된 카테고리 프리셋 훅.
  // (예전엔 타겟을 "~이라면 주목"으로 호명했지만 순한 호명형은 스크롤을 못 멈춰 폐기)
  const hookText =
    pain && pain.length <= 28 && !isWeakHook(pain) ? pain : pick(v.hooks, seed);

  // 장점1: 상품명 특징 1순위 → main_benefit → 카테고리 폴백
  const benefit1 =
    features[0] ??
    (benefit && benefit.length <= 34 ? benefit : v.b1);
  // 장점2: 상품명 특징 2순위 → 구성 스펙 → 카테고리 폴백
  const benefit2 = features[1] ?? spec ?? v.b2;

  const copy: VideoCopy = {
    hookText,
    empathyLine: pick(v.empathies, seed >> 1),
    benefit1,
    benefit2,
    usageTip: pick(v.tips, seed >> 2),
    reviewLine: pick(v.reviews, seed >> 3),
    captionText: "",
  };

  copy.captionText = [
    `${copy.hookText} ${copy.empathyLine}.`,
    `${shortenProductName(product.product_name)}, ${copy.benefit1}. ${copy.benefit2}.`,
    copy.usageTip,
    "",
    "가성비 좋고 후기까지 확인한 제품만 골라서 정리하고 있어요.",
    `영상 속 제품은 프로필 링크 누르면 바로 확인할 수 있어요. (${displayNumber}번)`,
    "",
    "#살림템 #생활템 #쿠팡추천템 #아이엄마살림 #추천템",
  ].join("\n");

  return copy;
}

const COPY_SCHEMA = {
  type: "object" as const,
  properties: {
    hookText: {
      type: "string",
      description:
        "첫 화면 후킹. 이 물건이 필요할 타겟을 콕 집어 부르거나(예: '아이 태우고 다니는 집이라면') 타겟이 뜨끔할 상황 제시. 18자 내외, 1줄.",
    },
    empathyLine: {
      type: "string",
      description: "공감 문장. 15자 내외, 1줄. 예: 은근 신경 쓰이잖아요",
    },
    benefit1: {
      type: "string",
      description:
        "제품을 해결책처럼 소개하는 핵심 장점 1. 문제를 어떻게 덜어주는지 구체적으로. 25자 내외.",
    },
    benefit2: {
      type: "string",
      description:
        "핵심 장점 2. benefit1 과 다른 각도의 장점(크기·사용 편의·다용도·관리 편함 등)을 하나 더. 후기 언급이 아니라 '제품의 장점'이어야 함. 25자 내외.",
    },
    usageTip: {
      type: "string",
      description:
        "생활 속 활용팁. 이 제품을 언제/어디서/어떻게 쓰면 좋은지 구체적인 장면 하나를 제안 (예: '자기 전에 거실만 한 번 쓱 밀어두면 아침 공기가 달라요'). 30자 내외.",
    },
    reviewLine: {
      type: "string",
      description:
        "긍정적 후기 언급(사회적 증거). '후기가 많다', '평이 괜찮아 보인다'처럼 남들의 반응을 전하는 톤. 본인이 써봤다는 주장 금지. 25자 내외.",
    },
    captionText: {
      type: "string",
      description:
        "SNS 업로드용 캡션 전문. 본문 2~3문장 + 빈 줄 + '영상 속 제품은 프로필 링크 누르면 바로 확인할 수 있어요. (N번)' + 빈 줄 + 해시태그.",
    },
  },
  required: [
    "hookText",
    "empathyLine",
    "benefit1",
    "benefit2",
    "usageTip",
    "reviewLine",
    "captionText",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `너는 생활 꿀템·신박한 아이디어 상품을 솔직하게 알려주는 40대 한국인이다. "동네에 한 명씩 있는 친한 형/언니"처럼 편하게 소개하는 15~20초 숏폼 문구를 쓴다. 목표는 보는 사람이 "이거 나도 사야겠다" 싶게 구매욕을 확 올리는 것.

화자 관점(중요) - 상품 성격에 맞춰 톤을 바꾼다:
- 집안일·주방·육아·청소·수납템이면: "가족 챙기는 아줌마" 시선(신랑·아이·가족 챙기는 마음). 옆집 언니가 수다 떨듯.
- 차량·공구·캠핑·전자가젯·자취가전 등 집안일과 무관한 신박템이면: 신랑/아이 프레임을 억지로 넣지 말고, "이런 거 은근 필요했잖아" 하는 남녀 공통의 담백한 톤으로. 남자가 봐도 안 어색하게.
- 어느 쪽이든 광고 성우/AI 말투 절대 금지. 진짜 사람이 편하게 말하듯.
- 단, 실제로 사서 써봤다는 후기/경험 주장은 금지(아래 규칙).

구매욕 올리는 법(중요):
- 후킹·공감에서 "그 문제 진짜 짜증나죠"라고 콕 찔러 공감을 극대화한다.
- 장점은 "이걸 쓰면 내 삶이 이렇게 편해진다"를 구체적·생생하게(시간 절약, 힘 덜 듦, 집이 깔끔해짐 등).
- 가성비/부담 없는 가격도 슬쩍 언급해 "사도 되겠다" 마음을 만든다.

링크 클릭 부르는 법(중요) - 영상 끝의 "프로필 링크" CTA 를 누르게 만드는 게 최종 목표:
- usageTip 은 소유 상상 장치다: 보는 사람이 "우리 집 어디에 두고 언제 쓸지"까지
  머릿속에 그려지게 쓴다. 상상이 구체적일수록 링크를 누른다.
- 정보 공백 하나는 링크 몫으로 남긴다: 정확한 가격·구성·옵션 중 하나는 대본에서 다 말하지
  않는다(예: 가격을 훅에 안 썼다면 "가격도 생각보다 착해요" 뉘앙스까지만). 거짓·과장 금지.
- 훅에서 가격(패턴 ⑥)을 이미 말했다면 대본에서 가격 반복은 금지 - 다른 공백을 남긴다.

영상 구성(중요) - 7줄이 이 순서로 나온다:
1. hookText: 스크롤을 멈추게 하는 첫 문장. 썸네일에 초대형으로 박히므로 "18자 이내 1줄 구어체".
   정체·방법·결과 중 최소 하나를 숨겨 "그래서 뭔데?"가 자동으로 나오게 한다. 물음표 최대 1개, 이모지 금지.
   아래 5개 패턴을 순환 사용(같은 패턴 연속 반복 금지):
   ① 지칭 은폐+의문형: 상품명 대신 "이것/이걸" — 예) "배수구에 이걸 왜 끼우지?"
   ② 상식 반전: "~라고?", "~가 이 크기?" — 예) "이게 가습기라고?"
   ③ 결과 예고: "~하면 사라지는 것", "~된 이유" — 예) "빨래 걷으면 사라지는 것"
   ④ 손해 지목(존댓말 질문형): 시청자의 현재 행동을 구체 동사로 콕 — 예) "아직도 맨손으로 건지세요?"
      단, 손해액·기간 창작 금지("평생 손해", "매달 만원" 불가).
   ⑤ 구식 부정: "○○ 버리세요"는 구식 방식·범용 카테고리에만 — 예) "스텐 배수구망 버리세요".
      특정 브랜드·타사 제품 비방 금지.
   ⑥ 가격 반전: 제공된 가격대가 실제 값이고 놀랄 만큼 착하면(대략 2만원 이하) 그 값 그대로 —
      예) "이게 9,900원이라고?". 제공된 가격대 외의 숫자·가격 창작은 절대 금지.
   훅 금지(매우 중요 - 실제로 가장 많이 어기는 지점이다):
     아래 종결·형태는 전부 탈락이다. 대상을 부르거나 상황에 공감만 하면 궁금증이 안 생긴다.
     ✗ "~라면" / "~다면"        예) "아기 키우는 집이라면", "담고 싶다면"
     ✗ "~분들" / "~분?" / "~주부님들" / "~엄마들"   예) "매일 세 끼 차리는 주부님들"
     ✗ "~시죠?" / "~셨죠?" / "~죠" / "~인가요?"     예) "바닥 닦는 거 정말 일이죠?"
     ✗ "~할 때"로 끝내기        예) "새벽에 애 우유 탈 때"
     ✗ 평서형 "~한다/~진다"     예) "차 안에 과자 부스러기가 자주 떨어진다"
     ✗ "~주목", "실화?" 같은 슬랭, 상품 정보에 없는 숫자·가격
     위 형태가 하나라도 걸리면 시스템이 자동으로 탈락시키고 재작성을 요구한다.
   자가 검증: 훅만 읽고 장면과 정답이 다 그려지면 탈락, 다시 쓴다.
   자가 검증2: 훅이 위 ✗ 목록의 종결로 끝나는지 쓰고 나서 반드시 다시 확인한다.
   훅에서 던진 질문·반전의 답은 benefit1~usageTip 에서 반드시 회수한다(낚시로 끝나면 실패).
2. empathyLine: 그 타겟이 겪는 "문제"를 공감하며 짚어준다. 훅의 궁금증을 이어받아 증폭.
3. benefit1: 제품이 그 문제를 어떻게 덜어주는지 핵심 장점을 소개한다.
4. benefit2: 다른 각도의 장점을 하나 더 소개한다(크기·사용 편의·다용도·관리 편함 등).
   benefit1 과 겹치지 않는 새로운 장점이어야 한다. 여전히 "제품의 장점"이지 후기가 아니다.
5. usageTip: 생활 속 활용팁. 언제/어디서/어떻게 쓰면 좋은지 구체적 장면 하나를 그려준다.
   예) "자기 전에 거실만 한 번 쓱 밀어두면 아침 공기가 달라요"
6. reviewLine: 긍정적 후기를 언급한다(사회적 증거). "후기가 꽤 많더라고요",
   "평이 괜찮아 보여요"처럼 남들의 반응을 전하는 톤. 절대 본인이 써봤다고 하지 않는다.
7. (CTA 는 시스템이 자동 생성)
- hookText 와 empathyLine 은 같은 화면에 위아래로 쌓여 나오므로 자연스럽게 이어지게.
- benefit1 → benefit2 는 제품의 장점을 충분히 소개하는 구간이니 서로 다른 매력을 짚어준다.

말투 규칙:
- 과장하지 않고 자연스럽고 짧게. 따뜻하고 생활감 있게.
- 직접 사용해봤다는 표현 절대 금지 (허위 후기 방지).
- 금지 표현: "직접 써봤는데", "우리 아이가 써봤는데", "매일 쓰고 있어요", "효과 확실해요", "무조건 사세요", "인생템", "대박템", "안 사면 손해", "완전 강추"
- 권장 톤: "신랑 차에 하나 놔주면 좋을 것 같아요", "아이들 생각하면 은근 신경 쓰이잖아요", "가족들 챙기다 보면 이런 게 필요하잖아요", "집에 두면 생각보다 자주 쓸 것 같아요", "~해 보여요", "~잖아요"
- 광고 성우 톤, 너무 젊은 밈/유행어 금지.
- 각 문구는 영상 자막 1줄에 들어갈 만큼 짧게.

캡션 규칙:
- 본문은 후킹+공감+장점을 자연스럽게 2~3문장으로.
- 첫 문장이 접힌 캡션에서 유일하게 보이는 줄이다 - 훅의 궁금증을 이어받아 더보기를 누르게 쓴다.
- "가성비 좋고 후기까지 확인한 제품만 골라서 정리하고 있어요." 같은 큐레이션 기준 문장 포함
  (직접 사용해봤다는 표현은 금지 - 고른 기준만 말한다).
- 반드시 "영상 속 제품은 프로필 링크 누르면 바로 확인할 수 있어요. ({번호}번)" 문장 포함 (번호는 "17번"처럼 앞자리 0 없이).
- 마지막 줄에 해시태그 5개 내외 (#살림템 #생활템 #쿠팡추천템 #아이엄마살림 #추천템 등).`;

/** Gemini responseSchema 는 OpenAPI 서브셋(타입 대문자, additionalProperties 미지원) */
const GEMINI_COPY_SCHEMA = {
  type: "OBJECT",
  properties: {
    hookText: { type: "STRING" },
    empathyLine: { type: "STRING" },
    benefit1: { type: "STRING" },
    benefit2: { type: "STRING" },
    usageTip: { type: "STRING" },
    reviewLine: { type: "STRING" },
    captionText: { type: "STRING" },
  },
  required: [
    "hookText",
    "empathyLine",
    "benefit1",
    "benefit2",
    "usageTip",
    "reviewLine",
    "captionText",
  ],
  propertyOrdering: [
    "hookText",
    "empathyLine",
    "benefit1",
    "benefit2",
    "usageTip",
    "reviewLine",
    "captionText",
  ],
};

/**
 * 이번 영상에 권장할 훅 패턴을 번호로 회전시킨다.
 * AI 는 이전 영상을 기억하지 못해 한 패턴(특히 가격 반전)으로 쏠리는데,
 * 번호 기반 회전이면 연속 게시분이 서로 다른 패턴이 되고 재렌더에도 결과가 같다.
 */
const HOOK_PATTERN_HINTS = [
  "① 지칭 은폐+의문형 (상품명 대신 '이걸/이것')",
  "② 상식 반전 ('~라고?', '~가 이 크기?')",
  "③ 결과 예고 ('~하면 사라지는 것', '~된 이유')",
  "④ 손해 지목 ('아직도 ~하세요?')",
  "⑤ 구식 부정 ('○○ 버리세요' - 구식 방식·범용 카테고리만)",
  "⑥ 가격 반전 ('이게 ○○원이라고?')",
];

/** price_text 에서 원 단위 숫자 추출 (가격 반전 훅 가능 여부 판단용) */
function parsePriceWon(priceText?: string | null): number | null {
  if (!priceText) return null;
  const digits = priceText.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hookPatternHint(displayNumber: number, priceText?: string | null): string {
  const price = parsePriceWon(priceText);
  const cheapEnough = price !== null && price <= 20000;
  let idx = displayNumber % HOOK_PATTERN_HINTS.length;
  // 가격 반전은 실제로 놀랄 만한 값일 때만 - 아니면 다음 패턴으로 넘긴다
  if (idx === 5 && !cheapEnough) idx = displayNumber % 5;
  return [
    `이번 영상 권장 훅 패턴: ${HOOK_PATTERN_HINTS[idx]}`,
    "그 패턴이 이 상품에 도저히 안 맞으면 다른 패턴을 써도 되지만, 금지 종결(~라면/~분들/~시죠?/~할 때/평서형)은 어느 경우에도 불가.",
    cheapEnough
      ? "가격 반전을 쓸 경우 값은 제공된 가격대 그대로만 쓴다(창작 금지)."
      : "이 상품은 가격 반전 훅(⑥) 대상이 아니다 - 가격을 훅에 쓰지 마라.",
  ].join("\n");
}

/** 상품 정보 → AI에게 넘길 사용자 프롬프트 (제공사 공통) */
function buildUserPrompt(
  product: Product,
  displayNumber: number,
  templateType: TemplateType
): string {
  const templateHint: Record<TemplateType, string> = {
    A: "템플릿 A(생활 문제 해결형): 문제 제기 → 공감 → 제품 등장 → 장점 → 번호 CTA 흐름.",
    B: "템플릿 B(아이엄마 공감형): 아이 둘 키우는 집의 생활 상황에서 시작해 공감 위주로.",
    C: "템플릿 C(살림 메모형): '이런 거 하나 있으면 은근 편해요' 톤으로 담백한 메모 느낌.",
    D: "템플릿 D(실사용 영상형): 실제 사용 장면 영상 위에 얹히므로 장면과 어울리는 생활감 있는 문장으로.",
  };
  return [
    `다음 상품의 숏폼 문구를 만들어줘. ${templateHint[templateType]}`,
    "",
    `상품명: ${product.product_name}`,
    `카테고리: ${product.category}`,
    `타겟: ${product.target_user ?? "-"}`,
    `불편한 점(painPoint): ${product.pain_point ?? "-"}`,
    `핵심 장점(mainBenefit): ${product.main_benefit ?? "-"}`,
    `가격대: ${product.price_text ?? "-"}`,
    `영상 번호: ${displayNumber}번`,
    "",
    "타겟·불편한점·핵심장점이 '-'로 비어 있으면 상품명을 보고 네가 직접 추론해라.",
    "benefit1·benefit2 에는 이 제품의 '구체적 특징'(소재·기능·크기·용량·사용법 등)을 꼭 담아,",
    "보는 사람이 '아, 이래서 좋은 거구나' 하고 제품을 이해하게 제품 설명을 충분히 넣어라.",
    "hookText 는 매번 새롭고 다르게, 뻔한 첫 문장(예: '이거 하나면')은 피해라.",
    "hookText 는 18자 이내로 짧게 - 썸네일에 초대형으로 박힌다.",
    hookPatternHint(displayNumber, product.price_text),
  ].join("\n");
}

/** 약한 훅이 나왔을 때 재생성에 붙이는 교정 지시 */
function weakHookRetryNote(rejected: string): string {
  return [
    `[재작성 요청] 방금 만든 훅 "${rejected}" 는 탈락이다.`,
    "탈락 사유: 대상을 부르거나 상황에 공감만 해서 궁금증이 생기지 않는다.",
    "다음을 모두 지켜 hookText 만 완전히 새로 써라(나머지 필드도 그에 맞게 다시).",
    "- 금지 종결: ~라면 / ~다면 / ~분들 / ~주부님들 / ~엄마들 / ~시죠? / ~셨죠? / ~죠 / ~인가요? / ~할 때 / ~주목 / 평서형 '~한다'",
    "- 반드시 훅 패턴 ①~⑥ 중 하나를 골라 그 형태로 쓴다(지칭 은폐·상식 반전·결과 예고·손해 지목·구식 부정·가격 반전).",
    "- 훅만 읽었을 때 '그래서 뭔데?'가 나와야 한다. 정답이 훅에 다 드러나면 실패다.",
  ].join("\n");
}

/** Gemini(무료 등급 가능) 로 문구 생성. 실패 시 throw → 상위에서 폴백 */
async function generateWithGemini(
  apiKey: string,
  userPrompt: string
): Promise<VideoCopy | null> {
  // flash-lite = 무료 등급·최저비용, -latest 별칭은 모델 폐기 시 자동으로 현행 모델로 이동
  const model = optionalEnv("GEMINI_MODEL") ?? "gemini-flash-lite-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 1.05,
        responseMimeType: "application/json",
        responseSchema: GEMINI_COPY_SCHEMA,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API 오류 ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text) as VideoCopy;
}

/** Anthropic(유료) 로 문구 생성. 실패 시 throw → 상위에서 폴백 */
async function generateWithAnthropic(
  apiKey: string,
  userPrompt: string
): Promise<VideoCopy | null> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: optionalEnv("AI_MODEL") ?? DEFAULT_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    output_config: {
      format: {
        type: "json_schema",
        schema: COPY_SCHEMA,
      },
    },
    messages: [{ role: "user", content: userPrompt }],
  });
  if (response.stop_reason === "refusal") return null;
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  return JSON.parse(textBlock.text) as VideoCopy;
}

/**
 * 범용 Gemini JSON 생성 헬퍼 (스튜디오 소재 추천 등 다른 모듈에서 재사용).
 * 키가 없으면 null, API 실패 시 throw (호출부에서 폴백 처리).
 * schema 는 Gemini responseSchema 형식(타입 대문자 OBJECT/ARRAY/STRING...).
 */
export async function geminiGenerateJson<T>(opts: {
  system?: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
  /** 모델 강제 지정 (기본: GEMINI_MODEL env → flash-lite) */
  model?: string;
  /** 이미지 입력 (비전 호출용 - 프레임 속 텍스트 감지 등) */
  image?: { base64: string; mimeType: string };
}): Promise<T | null> {
  const apiKey =
    optionalEnv("GEMINI_API_KEY") ?? (await getSetting("GEMINI_API_KEY")) ?? undefined;
  if (!apiKey) return null;

  const model =
    opts.model ?? optionalEnv("GEMINI_MODEL") ?? "gemini-flash-lite-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      ...(opts.system
        ? { systemInstruction: { parts: [{ text: opts.system }] } }
        : {}),
      contents: [
        {
          role: "user",
          parts: [
            ...(opts.image
              ? [
                  {
                    inlineData: {
                      mimeType: opts.image.mimeType,
                      data: opts.image.base64,
                    },
                  },
                ]
              : []),
            { text: opts.prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        responseMimeType: "application/json",
        responseSchema: opts.schema,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini API 오류 ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text) as T;
}

/**
 * 상품 정보로 후킹/공감/장점/캡션 문구 생성.
 * 우선순위: GEMINI_API_KEY(무료) → AI_API_KEY(Anthropic) → 프리셋 폴백.
 * 키가 없거나 실패/금지표현 시 안전한 기본 문구로 폴백한다.
 */
export async function generateVideoCopy(
  product: Product,
  displayNumber: number,
  templateType: TemplateType
): Promise<VideoCopy> {
  // 환경변수 우선, 없으면 Supabase app_settings 에서 조회
  // (GitHub 시크릿을 손대지 않고 키를 넣을 수 있게 - 배포 없이 갱신 가능)
  const geminiKey =
    optionalEnv("GEMINI_API_KEY") ?? (await getSetting("GEMINI_API_KEY")) ?? undefined;
  const anthropicKey =
    optionalEnv("AI_API_KEY") ?? (await getSetting("AI_API_KEY")) ?? undefined;
  if (!geminiKey && !anthropicKey) {
    return fallbackCopy(product, displayNumber);
  }

  const userPrompt = buildUserPrompt(product, displayNumber, templateType);
  const run = (prompt: string) =>
    geminiKey
      ? generateWithGemini(geminiKey, prompt)
      : generateWithAnthropic(anthropicKey as string, prompt);

  try {
    const raw = await run(userPrompt);
    if (!raw) return fallbackCopy(product, displayNumber);
    let copy = sanitizeCopy(raw);
    if (containsBannedPhrase(copy)) {
      return fallbackCopy(product, displayNumber);
    }

    // 훅이 약하면(순한 호명·동의구걸 등) 교정 지시를 붙여 1회만 재생성한다.
    // 무료 등급이라 비용은 0원이고, 실패해도 아래에서 강한 프리셋 훅으로 대체된다.
    if (isWeakHook(copy.hookText)) {
      console.warn(`약한 훅 감지 - 재생성 시도: "${copy.hookText}"`);
      try {
        const retryRaw = await run(
          `${userPrompt}\n\n${weakHookRetryNote(copy.hookText)}`
        );
        if (retryRaw) {
          const retryCopy = sanitizeCopy(retryRaw);
          if (!containsBannedPhrase(retryCopy) && !isWeakHook(retryCopy.hookText)) {
            console.log(`훅 재생성 성공: "${retryCopy.hookText}"`);
            copy = retryCopy;
          }
        }
      } catch (e) {
        console.warn("훅 재생성 실패(원본 유지):", (e as Error).message.slice(0, 150));
      }
    }

    // 재생성까지 실패하면 훅만 카테고리 프리셋(검증된 강한 훅)으로 바꾼다.
    // 나머지 문구는 상품 설명이 담긴 AI 생성분을 그대로 살린다.
    if (isWeakHook(copy.hookText)) {
      const v = CATEGORY_VARIANTS[product.category] ?? CATEGORY_VARIANTS["생활템"];
      const preset = pick(v.hooks, displayNumber + nameHash(product.product_name));
      console.warn(`훅 재생성 실패 - 프리셋 훅으로 대체: "${preset}"`);
      copy = { ...copy, hookText: preset };
    }
    return copy;
  } catch (error) {
    console.error("AI 문구 생성 실패, 기본 문구로 폴백:", error);
    return fallbackCopy(product, displayNumber);
  }
}
