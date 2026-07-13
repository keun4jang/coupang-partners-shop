import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  COLORS,
  CTA_SUB_TEXT,
  FONT_SIZES,
  MOTION,
  TRUST_TEXT,
} from "../config/videoConfig";
import { fontFamily } from "../fonts";

/** 마지막 CTA 화면: 큰 번호 + "영상 속 제품은 N번에 정리해뒀어요" */
export const CtaScene: React.FC<{
  displayNumber: number;
  ctaText: string;
}> = ({ displayNumber, ctaText }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: MOTION.springDamping },
  });
  const textIn = spring({
    frame: frame - Math.round(fps * 0.25),
    fps,
    config: { damping: MOTION.springDamping },
  });

  return (
    <AbsoluteFill
      style={{
        background: "rgba(63, 52, 44, 0.72)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      <div
        style={{
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: COLORS.cream,
          border: `14px solid ${COLORS.accent}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 20px 80px rgba(0,0,0,0.35)",
          transform: `scale(${0.6 + pop * 0.4})`,
          opacity: pop,
        }}
      >
        <span
          style={{
            color: COLORS.primaryDark,
            fontWeight: 900,
            fontSize: FONT_SIZES.ctaNumber,
          }}
        >
          {displayNumber}번
        </span>
      </div>

      <div
        style={{
          marginTop: 60,
          width: "84%",
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 900,
          fontSize: FONT_SIZES.ctaText,
          lineHeight: 1.4,
          wordBreak: "keep-all",
          transform: `translateY(${(1 - textIn) * 40}px)`,
          opacity: textIn,
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        {ctaText}
      </div>

      <div
        style={{
          marginTop: 24,
          color: COLORS.accent,
          fontWeight: 700,
          fontSize: 38,
          opacity: textIn,
        }}
      >
        {CTA_SUB_TEXT}
      </div>

      <div
        style={{
          marginTop: 40,
          color: "rgba(255, 248, 240, 0.75)",
          fontWeight: 600,
          fontSize: 32,
          opacity: textIn,
        }}
      >
        {TRUST_TEXT}
      </div>
    </AbsoluteFill>
  );
};
