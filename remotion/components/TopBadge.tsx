import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, MOTION } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/** 상단 작은 배지 (템플릿 B/C 의 감성 라벨) */
export const TopBadge: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame,
    fps,
    config: { damping: MOTION.springDamping },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 90,
        left: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - pop) * -30}px)`,
        opacity: pop,
      }}
    >
      <span
        style={{
          background: "rgba(255, 248, 240, 0.92)",
          color: COLORS.primaryDark,
          fontFamily,
          fontWeight: 700,
          fontSize: FONT_SIZES.badge,
          borderRadius: 999,
          padding: "16px 34px",
          boxShadow: "0 8px 30px rgba(63, 52, 44, 0.25)",
        }}
      >
        {text}
      </span>
    </div>
  );
};
