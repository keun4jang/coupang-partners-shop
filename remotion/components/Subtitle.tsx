import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, MOTION, PALETTE } from "../config/videoConfig";
import { fontFamily } from "../fonts";
import { Badge } from "./Badge";

type Variant = "plain" | "bubble";

/**
 * 자막 텍스트 (Sequence 안에서 사용 - 등장 시점 기준으로 팝인).
 * plain: 흰 글자 + 그림자 / bubble: "살림 꿀팁 메모지" 크림 카드(+옵션 TIP 배지)
 */
export const Subtitle: React.FC<{
  text: string;
  size?: number;
  variant?: Variant;
  /** 세로 위치 (0~1, 화면 높이 비율) */
  y?: number;
  /** bubble 상단 왼쪽 라벨 (예: "보관 TIP"). 있으면 메모지 탭처럼 표시 */
  badge?: string;
  /** 훅용 강조: 두꺼운 검정 테두리로 어떤 배경에서도 튀게 */
  strong?: boolean;
}> = ({ text, size = FONT_SIZES.subtitle, variant = "plain", y = 0.42, badge, strong }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: MOTION.springDamping, mass: MOTION.springMass },
  });

  const base: React.CSSProperties = {
    position: "absolute",
    top: height * y,
    left: width * 0.06,
    width: width * 0.88,
    textAlign: "center",
    fontFamily,
    fontWeight: 900,
    fontSize: size,
    lineHeight: 1.32,
    letterSpacing: "-0.015em",
    wordBreak: "keep-all",
    // 2줄이 될 때 위/아래 글자 수를 비슷하게 나눠 균형 있게
    textWrap: "balance",
    transform: `scale(${0.85 + pop * 0.15}) translateY(${(1 - pop) * 30}px)`,
    opacity: pop,
  };

  if (variant === "bubble") {
    // 흰 글자 + 그림자만 (카드 없음 - 흰 솔리드는 상품 쇼케이스 카드에만 쓴다).
    // 배경이 밝은 장면에서도 읽히도록 그림자를 여러 겹으로 깔아준다.
    return (
      <div
        style={{
          position: "absolute",
          top: height * y,
          left: 0,
          width: "100%",
          transform: base.transform,
          opacity: pop,
        }}
      >
        <div
          style={{
            width: "fit-content",
            maxWidth: width * 0.86,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          {badge && (
            <Badge
              label={badge}
              bg={PALETTE.softPeach}
              color={PALETTE.brown}
              fontSize={FONT_SIZES.tipLabel}
            />
          )}
          <div
            style={{
              width: "100%",
              textAlign: "center",
              fontFamily,
              fontWeight: 900,
              fontSize: size,
              lineHeight: 1.3,
              letterSpacing: "-0.015em",
              wordBreak: "keep-all",
              textWrap: "balance",
              color: "#FFFFFF",
              textShadow: `0 4px 24px ${COLORS.subtitleShadow}, 0 2px 10px rgba(0,0,0,0.55), 0 0 30px rgba(0,0,0,0.28)`,
              ...(strong
                ? {
                    WebkitTextStroke: "8px rgba(0,0,0,0.88)",
                    paintOrder: "stroke fill" as const,
                    lineHeight: 1.2,
                  }
                : {}),
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        color: "#FFFFFF",
        textShadow: `0 4px 24px ${COLORS.subtitleShadow}, 0 2px 8px rgba(0,0,0,0.4)`,
      }}
    >
      {text}
    </div>
  );
};
