import React from "react";
import {
  AbsoluteFill,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ShortsProps } from "../types";
import {
  COLORS,
  DURATION_IN_FRAMES,
  FONT_SIZES,
  MOTION,
  TEMPLATE_BADGE,
  TIMING,
  secondsToFrames as f,
} from "../config/videoConfig";
import { fontFamily } from "../fonts";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { Disclosure } from "../components/Disclosure";
import { TopBadge } from "../components/TopBadge";

/** 메모 카드의 체크 항목 - startFrame 이후 순서대로 팝인 */
const MemoLine: React.FC<{ text: string; delayFrames: number }> = ({
  text,
  delayFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: MOTION.springDamping },
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 18,
        opacity: pop,
        transform: `translateX(${(1 - pop) * 40}px)`,
        marginTop: 26,
      }}
    >
      <span style={{ color: COLORS.primary, fontSize: 44, fontWeight: 900 }}>
        ✓
      </span>
      <span
        style={{
          color: COLORS.ink,
          fontSize: 46,
          fontWeight: 700,
          lineHeight: 1.4,
          wordBreak: "keep-all",
        }}
      >
        {text}
      </span>
    </div>
  );
};

/**
 * Template C: 살림 메모형
 * "이런 거 하나 있으면 은근 편해요" 톤 → 메모 카드에 체크리스트가 하나씩 적히고
 * 제품은 폴라로이드 느낌으로 등장 → 번호 CTA
 */
export const TemplateC: React.FC<ShortsProps> = (props) => {
  const ctaFrom = f(TIMING.cta.from);
  const memoFrom = f(TIMING.empathy.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} />

      <Sequence durationInFrames={ctaFrom}>
        <TopBadge text={TEMPLATE_BADGE.C ?? ""} />
      </Sequence>

      {/* 0~1.5초: 후킹 */}
      <Sequence durationInFrames={f(TIMING.hook.to)}>
        <Subtitle text={props.hookLine} size={FONT_SIZES.hook} y={0.38} />
      </Sequence>

      {/* 1.5초~: 메모 카드 (공감/장점이 체크리스트로 하나씩 적힘) */}
      <Sequence from={memoFrom} durationInFrames={ctaFrom - memoFrom}>
        <div
          style={{
            position: "absolute",
            top: "13%",
            left: "7%",
            width: "86%",
            background: "rgba(255, 248, 240, 0.96)",
            borderRadius: 28,
            padding: "40px 44px 48px",
            boxShadow: "0 20px 60px rgba(63, 52, 44, 0.35)",
            fontFamily,
          }}
        >
          <div
            style={{
              color: COLORS.sub,
              fontSize: 34,
              fontWeight: 700,
              borderBottom: `3px dashed ${COLORS.accent}`,
              paddingBottom: 18,
            }}
          >
            {props.productName}
          </div>
          <MemoLine text={props.empathyLine} delayFrames={0} />
          <MemoLine
            text={props.benefit1}
            delayFrames={f(TIMING.product.from - TIMING.empathy.from)}
          />
          <MemoLine
            text={props.benefit2}
            delayFrames={f(TIMING.benefit2.from - TIMING.empathy.from)}
          />
        </div>
      </Sequence>

      {/* 3.5초~: 제품 폴라로이드 */}
      <Sequence
        from={f(TIMING.product.from)}
        durationInFrames={ctaFrom - f(TIMING.product.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          polaroid
          topRatio={0.4}
          widthRatio={0.44}
        />
      </Sequence>

      <Sequence from={ctaFrom} durationInFrames={DURATION_IN_FRAMES - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
      </Sequence>

      <Disclosure />
    </AbsoluteFill>
  );
};
