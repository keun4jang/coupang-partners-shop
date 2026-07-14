import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, MOTION } from "../config/videoConfig";
import { fontFamily } from "../fonts";

type Variant = "plain" | "bubble";

/**
 * 자막 텍스트 (Sequence 안에서 사용 - 등장 시점 기준으로 팝인).
 * plain: 흰 글자 + 그림자 / bubble: 크림색 말풍선 카드
 */
export const Subtitle: React.FC<{
  text: string;
  size?: number;
  variant?: Variant;
  /** 세로 위치 (0~1, 화면 높이 비율) */
  y?: number;
}> = ({ text, size = FONT_SIZES.subtitle, variant = "plain", y = 0.42 }) => {
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
    // 말풍선은 글자 크기에 맞춰 내용을 감싸도록(가운데 정렬 + inline-block).
    // 여백/모서리를 작게 해 테두리가 두껍지 않게 한다.
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
            // 내용 폭에 맞춰 감싸되(좌우 빈칸 최소화), 너무 길면 이 폭에서 줄바꿈
            width: "fit-content",
            maxWidth: width * 0.66,
            margin: "0 auto",
            background: "rgba(255, 248, 240, 0.95)",
            color: COLORS.ink,
            borderRadius: 20,
            padding: "12px 22px",
            boxShadow: `0 8px 28px ${COLORS.subtitleShadow}`,
            textAlign: "center",
            fontFamily,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1.3,
            letterSpacing: "-0.015em",
            wordBreak: "keep-all",
            // 2줄이 될 때 위/아래 글자 수를 비슷하게 나눠 균형 있게(어절 단위)
            textWrap: "balance",
          }}
        >
          {text}
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
