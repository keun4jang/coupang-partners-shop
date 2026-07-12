import Anthropic from "@anthropic-ai/sdk";
import type { Product, VideoCopy, TemplateType } from "@/types/db";
import { optionalEnv } from "./env";

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
    captionText: copy.captionText,
  };
}

function containsBannedPhrase(copy: VideoCopy): boolean {
  const all = [
    copy.hookText,
    copy.empathyLine,
    copy.benefit1,
    copy.benefit2,
    copy.captionText,
  ].join("\n");
  return BANNED_PHRASES.some((p) => all.includes(p));
}

/** 스크립트 전문: 후킹 → 공감 → 장점1 → 장점2 → 번호 CTA (줄 단위, 워커가 그대로 장면으로 사용) */
export function composeScriptText(copy: VideoCopy, displayNumber: number): string {
  return [
    copy.hookText,
    copy.empathyLine,
    copy.benefit1,
    copy.benefit2,
    ctaLine(displayNumber),
  ].join("\n");
}

export function ctaLine(displayNumber: number): string {
  return `영상 속 제품은 ${displayNumber}번에 정리해뒀어요`;
}

const DISCLOSURE =
  "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.";

/** AI 미설정/실패 시 사용하는 카테고리 기반 기본 문구 */
export function fallbackCopy(product: Product, displayNumber: number): VideoCopy {
  const category = product.category || "생활템";
  const pain = product.pain_point?.trim();
  const benefit = product.main_benefit?.trim();

  const presets: Record<string, { hook: string; empathy: string; b1: string; b2: string }> = {
    차량용품: {
      hook: "신랑 차에 부스러기 자꾸 쌓이면",
      empathy: "치우기 은근 번거롭잖아요",
      b1: "차에 하나 놔주면 괜찮아 보여요",
      b2: "작아서 신랑도 부담 없이 쓸 것 같고요",
    },
    청소템: {
      hook: "가족들 쓰는 욕실이라",
      empathy: "물때는 더 신경 쓰이잖아요",
      b1: "하나쯤 있으면 편해 보여요",
      b2: "구석구석 청소할 때 은근 쓸 일 많고요",
    },
    수납템: {
      hook: "아이 둘 키우다 보면",
      empathy: "물건이 금방 늘어나잖아요",
      b1: "아이들 물건 정리할 때 괜찮아 보여요",
      b2: "작은 집에도 부담 없어 보이고요",
    },
    주방템: {
      hook: "매일 가족 밥 차리다 보면",
      empathy: "주방에 정리할 게 쌓이잖아요",
      b1: "살림할 때 이런 게 은근 필요하잖아요",
      b2: "하나 두면 자주 손이 갈 것 같아요",
    },
    육아생활템: {
      hook: "아이들 키우는 집은",
      empathy: "이런 상황 정말 많죠",
      b1: "아이들 챙기다 보면 은근 필요하잖아요",
      b2: "집에 두면 생각보다 자주 쓸 것 같아요",
    },
  };

  const preset = presets[category] ?? {
    hook: pain ? `${pain}` : "가족들 챙기다 보면 이런 게",
    empathy: "은근 신경 쓰이잖아요",
    b1: benefit ?? "하나 있으면 은근 편해 보여요",
    b2: "집에 두면 생각보다 자주 쓸 것 같아요",
  };

  const copy: VideoCopy = {
    hookText: pain && pain.length <= 24 ? pain : preset.hook,
    empathyLine: preset.empathy,
    benefit1: benefit && benefit.length <= 28 ? benefit : preset.b1,
    benefit2: preset.b2,
    captionText: "",
  };

  copy.captionText = [
    `${copy.hookText} ${copy.empathyLine}.`,
    `${product.product_name}, ${copy.benefit1}.`,
    "",
    `영상 속 제품은 프로필 링크에서 ${displayNumber}번으로 찾아보시면 돼요.`,
    "",
    DISCLOSURE,
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
      description: "첫 1초에 크게 보이는 후킹 문구. 문제 상황 제시. 20자 내외, 1줄.",
    },
    empathyLine: {
      type: "string",
      description: "공감 문장. 15자 내외, 1줄. 예: 은근 신경 쓰이잖아요",
    },
    benefit1: {
      type: "string",
      description: "제품을 해결책처럼 담백하게 소개하는 장점 1. 20자 내외.",
    },
    benefit2: {
      type: "string",
      description: "두 번째 장점 또는 사용 상황. 20자 내외.",
    },
    captionText: {
      type: "string",
      description:
        "SNS 업로드용 캡션 전문. 본문 2~3문장 + 빈 줄 + '영상 속 제품은 프로필 링크에서 N번으로 찾아보시면 돼요.' + 빈 줄 + 대가성 문구 + 해시태그.",
    },
  },
  required: ["hookText", "empathyLine", "benefit1", "benefit2", "captionText"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `너는 아이 2명을 키우는 30~40대 한국인 엄마다. 살림하면서 눈에 띈 생활템을 친구에게 알려주듯 8~12초 숏폼 문구를 쓴다.

화자 관점(중요):
- 항상 "가족을 챙기는 주부"의 시선으로 쓴다. 신랑, 우리 아이(들), 가족을 위하는 마음이 문구에 자연스럽게 배어나게.
- 예) 신랑 챙겨주고 싶은 마음, 아이들 생각해서 신경 쓰이는 마음, 가족 쓰는 물건이라 더 눈이 가는 마음.
- 단, "가족을 위한다"는 마음을 담되 실제로 사서 써봤다는 후기/경험 주장은 금지(아래 규칙).

말투 규칙:
- 과장하지 않고 자연스럽고 짧게. 따뜻하고 생활감 있게.
- 직접 사용해봤다는 표현 절대 금지 (허위 후기 방지).
- 금지 표현: "직접 써봤는데", "우리 아이가 써봤는데", "매일 쓰고 있어요", "효과 확실해요", "무조건 사세요", "인생템", "대박템", "안 사면 손해", "완전 강추"
- 권장 톤: "신랑 차에 하나 놔주면 좋을 것 같아요", "아이들 생각하면 은근 신경 쓰이잖아요", "가족들 챙기다 보면 이런 게 필요하잖아요", "집에 두면 생각보다 자주 쓸 것 같아요", "~해 보여요", "~잖아요"
- 광고 성우 톤, 너무 젊은 밈/유행어 금지.
- 각 문구는 영상 자막 1줄에 들어갈 만큼 짧게.

캡션 규칙:
- 본문은 후킹+공감+장점을 자연스럽게 2~3문장으로.
- 반드시 "영상 속 제품은 프로필 링크에서 {번호}번으로 찾아보시면 돼요." 문장 포함 (번호는 "17번"처럼 앞자리 0 없이).
- 반드시 "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다." 포함.
- 마지막 줄에 해시태그 5개 내외 (#살림템 #생활템 #쿠팡추천템 #아이엄마살림 #추천템 등).`;

/**
 * 상품 정보로 후킹/공감/장점/캡션 문구 생성.
 * AI_API_KEY 가 없거나 결과에 금지 표현이 포함되면 안전한 기본 문구로 폴백한다.
 */
export async function generateVideoCopy(
  product: Product,
  displayNumber: number,
  templateType: TemplateType
): Promise<VideoCopy> {
  const apiKey = optionalEnv("AI_API_KEY");
  if (!apiKey) {
    return fallbackCopy(product, displayNumber);
  }

  const templateHint: Record<TemplateType, string> = {
    A: "템플릿 A(생활 문제 해결형): 문제 제기 → 공감 → 제품 등장 → 장점 → 번호 CTA 흐름.",
    B: "템플릿 B(아이엄마 공감형): 아이 둘 키우는 집의 생활 상황에서 시작해 공감 위주로.",
    C: "템플릿 C(살림 메모형): '이런 거 하나 있으면 은근 편해요' 톤으로 담백한 메모 느낌.",
  };

  try {
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
      messages: [
        {
          role: "user",
          content: [
            `다음 상품의 숏폼 문구를 만들어줘. ${templateHint[templateType]}`,
            "",
            `상품명: ${product.product_name}`,
            `카테고리: ${product.category}`,
            `타겟: ${product.target_user ?? "-"}`,
            `불편한 점(painPoint): ${product.pain_point ?? "-"}`,
            `핵심 장점(mainBenefit): ${product.main_benefit ?? "-"}`,
            `가격대: ${product.price_text ?? "-"}`,
            `영상 번호: ${displayNumber}번`,
          ].join("\n"),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return fallbackCopy(product, displayNumber);
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return fallbackCopy(product, displayNumber);
    }

    const copy = sanitizeCopy(JSON.parse(textBlock.text) as VideoCopy);
    if (containsBannedPhrase(copy)) {
      return fallbackCopy(product, displayNumber);
    }
    return copy;
  } catch (error) {
    console.error("AI 문구 생성 실패, 기본 문구로 폴백:", error);
    return fallbackCopy(product, displayNumber);
  }
}
