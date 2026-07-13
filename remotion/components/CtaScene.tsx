import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, CTA_SUB_TEXT, FONT_SIZES, MOTION } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/** 마지막 CTA 화면: 큰 번호 + 행동 안내 한 줄 (문구 최소화 - 내용은 나레이션이 전달) */
export const CtaScene: React.FC<{
  displayNumber: number;
  /** 나레이션용 문구 - 화면에는 표시하지 않는다 */
  ctaText?: string;
}> = ({ displayNumber }) => {
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

      {/* 화면 문구는 행동 안내 한 줄만 - 나머지는 나레이션이 말해준다 */}
      <div
        style={{
          marginTop: 56,
          width: "84%",
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 46,
          lineHeight: 1.4,
          wordBreak: "keep-all",
          transform: `translateY(${(1 - textIn) * 40}px)`,
          opacity: textIn,
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        {CTA_SUB_TEXT}
      </div>
    </AbsoluteFill>
  );
};
