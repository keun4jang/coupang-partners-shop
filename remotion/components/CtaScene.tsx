import React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  COLORS,
  MOTION,
  ctaNumberFontSize,
  ctaTemplate,
} from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 마지막 CTA 화면: 큰 번호 + 문장 한 줄.
 * 화면 문장은 나레이션과 완전히 동일해야 한다 (자막≠음성이면 혼란).
 */
export const CtaScene: React.FC<{
  displayNumber: number;
  /** CTA 문장 - 나레이션과 같은 문장. 없으면 ctaTemplate 로 생성 */
  ctaText?: string;
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
        {/* 숫자와 "번"을 한 덩어리로 두되 절대 줄바꿈시키지 않는다.
            107번부터 원(안지름 352px) 밖으로 "번"이 삐져나갔다 - 두 자리까지는
            맞았지만 세 자리가 되며 폭이 넘쳤다. 자릿수에 맞춰 크기를 줄인다. */}
        <span
          style={{
            color: COLORS.primaryDark,
            fontWeight: 900,
            fontSize: ctaNumberFontSize(displayNumber),
            whiteSpace: "nowrap",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {displayNumber}
          <span style={{ fontSize: "0.55em", marginLeft: "0.04em" }}>번</span>
        </span>
      </div>

      {/* 나레이션과 동일한 문장 한 줄 */}
      <div
        style={{
          marginTop: 56,
          width: "86%",
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 48,
          lineHeight: 1.4,
          wordBreak: "keep-all",
          textWrap: "balance",
          transform: `translateY(${(1 - textIn) * 40}px)`,
          opacity: textIn,
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        {ctaText ?? ctaTemplate(displayNumber)}
      </div>
    </AbsoluteFill>
  );
};
