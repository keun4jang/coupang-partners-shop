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

export function ctaLine(displayNumber: number): string {
  // CTA 화면 자막과 나레이션이 완전히 같은 문장을 쓴다
  return `영상 속 제품은 프로필 링크 ${displayNumber}번에 정리해뒀어요`;
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

  // 후킹: 타겟이 명시돼 있으면 호명, 아니면 pain, 아니면 변형 후킹
  const target = product.target_user?.trim();
  const hookText =
    target && target.length <= 14
      ? `${target.replace(/[을를이가은는]$/, "")}이라면 주목`
      : pain && pain.length <= 28
        ? pain
        : pick(v.hooks, seed);

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
    `영상 속 제품은 프로필 링크에서 ${displayNumber}번으로 찾아보시면 돼요.`,
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
        "SNS 업로드용 캡션 전문. 본문 2~3문장 + 빈 줄 + '영상 속 제품은 프로필 링크에서 N번으로 찾아보시면 돼요.' + 빈 줄 + 해시태그.",
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

const SYSTEM_PROMPT = `너는 아이 키우는 40대 한국인 아줌마다. "동네에 한 명씩 있는 친한 언니"처럼 살림 꿀템을 솔직하게 알려주는 15~20초 숏폼 문구를 쓴다. 목표는 보는 사람이 "이거 나도 사야겠다" 싶게 구매욕을 확 올리는 것.

화자 관점(중요):
- 항상 "가족 챙기는 아줌마"의 시선. 신랑, 아이들, 가족을 위하는 마음이 자연스럽게 배어나게.
- 광고 성우/AI 말투 절대 금지. 옆집 언니가 수다 떨듯 편하고 진짜 사람 같은 말투.
- 단, 실제로 사서 써봤다는 후기/경험 주장은 금지(아래 규칙).

구매욕 올리는 법(중요):
- 후킹·공감에서 "그 문제 진짜 짜증나죠"라고 콕 찔러 공감을 극대화한다.
- 장점은 "이걸 쓰면 내 삶이 이렇게 편해진다"를 구체적·생생하게(시간 절약, 힘 덜 듦, 집이 깔끔해짐 등).
- 가성비/부담 없는 가격도 슬쩍 언급해 "사도 되겠다" 마음을 만든다.

영상 구성(중요) - 7줄이 이 순서로 나온다:
1. hookText: 이 물건이 필요할 "타겟"을 콕 집어 부른다.
   예) "아이 태우고 다니는 집이라면", "욕실 청소 미루게 되는 분?", "매일 세 끼 차리는 주부님들"
2. empathyLine: 그 타겟이 겪는 "문제"를 공감하며 짚어준다.
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
- "가성비 좋고 후기까지 확인한 제품만 골라서 정리하고 있어요." 같은 큐레이션 기준 문장 포함
  (직접 사용해봤다는 표현은 금지 - 고른 기준만 말한다).
- 반드시 "영상 속 제품은 프로필 링크에서 {번호}번으로 찾아보시면 돼요." 문장 포함 (번호는 "17번"처럼 앞자리 0 없이).
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
  try {
    const raw = geminiKey
      ? await generateWithGemini(geminiKey, userPrompt)
      : await generateWithAnthropic(anthropicKey as string, userPrompt);
    if (!raw) return fallbackCopy(product, displayNumber);
    const copy = sanitizeCopy(raw);
    if (containsBannedPhrase(copy)) {
      return fallbackCopy(product, displayNumber);
    }
    return copy;
  } catch (error) {
    console.error("AI 문구 생성 실패, 기본 문구로 폴백:", error);
    return fallbackCopy(product, displayNumber);
  }
}
