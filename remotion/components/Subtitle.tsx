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
    lineHeight: 1.35,
    wordBreak: "keep-all",
    transform: `scale(${0.85 + pop * 0.15}) translateY(${(1 - pop) * 30}px)`,
    opacity: pop,
  };

  if (variant === "bubble") {
    return (
      <div
        style={{
          ...base,
          left: width * 0.08,
          width: width * 0.84,
          background: "rgba(255, 248, 240, 0.95)",
          color: COLORS.ink,
          borderRadius: 36,
          padding: "36px 32px",
          boxShadow: `0 12px 40px ${COLORS.subtitleShadow}`,
        }}
      >
        {text}
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
