import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../fonts";

/**
 * 재사용 알약(pill) 배지. "보관 TIP", "19L 대용량", "오늘의 살림템 28번" 등에 사용.
 * delayFrames 로 여러 배지를 0.1초 간격 순차 등장시킨다(부드러운 spring).
 */
export const Badge: React.FC<{
  label: string;
  bg: string;
  color?: string;
  fontSize?: number;
  /** 순차 등장 지연(프레임) */
  delayFrames?: number;
  style?: React.CSSProperties;
}> = ({ label, bg, color = "#FFFFFF", fontSize = 30, delayFrames = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: 16, mass: 0.7 },
  });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: bg,
        color,
        fontFamily,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: "-0.01em",
        padding: `${Math.round(fontSize * 0.42)}px ${Math.round(fontSize * 0.7)}px`,
        borderRadius: 999,
        boxShadow: "0 6px 16px rgba(63,52,44,0.18)",
        transform: `translateY(${(1 - enter) * 14}px) scale(${0.9 + enter * 0.1})`,
        opacity: enter,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </div>
  );
};
