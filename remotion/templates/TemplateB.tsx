import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { ShortsProps } from "../types";
import {
  DURATION_IN_FRAMES,
  FONT_SIZES,
  TEMPLATE_BADGE,
  TIMING,
  secondsToFrames as f,
} from "../config/videoConfig";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { Disclosure } from "../components/Disclosure";
import { TopBadge } from "../components/TopBadge";

/**
 * Template B: 아이엄마 공감형
 * 아이 둘 키우는 집의 생활 상황 → 공감 → 제품 등장 → 정리/청소/편의성 → 번호 CTA
 * 상단 배지 + 말풍선 자막으로 더 따뜻한 느낌.
 */
export const TemplateB: React.FC<ShortsProps> = (props) => {
  const ctaFrom = f(TIMING.cta.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} />

      {/* 상단 감성 배지 - CTA 전까지 유지 */}
      <Sequence durationInFrames={ctaFrom}>
        <TopBadge text={TEMPLATE_BADGE.B ?? ""} />
      </Sequence>

      <Sequence durationInFrames={f(TIMING.hook.to)}>
        <Subtitle
          text={props.hookLine}
          size={FONT_SIZES.hook}
          variant="bubble"
          y={0.36}
        />
      </Sequence>

      <Sequence
        from={f(TIMING.empathy.from)}
        durationInFrames={f(TIMING.empathy.to - TIMING.empathy.from)}
      >
        <Subtitle text={props.empathyLine} variant="bubble" y={0.4} />
      </Sequence>

      <Sequence
        from={f(TIMING.product.from)}
        durationInFrames={ctaFrom - f(TIMING.product.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
        />
      </Sequence>

      <Sequence
        from={f(TIMING.product.from)}
        durationInFrames={f(TIMING.product.to - TIMING.product.from)}
      >
        <Subtitle
          text={props.benefit1}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.15}
        />
      </Sequence>

      <Sequence
        from={f(TIMING.benefit2.from)}
        durationInFrames={f(TIMING.benefit2.to - TIMING.benefit2.from)}
      >
        <Subtitle
          text={props.benefit2}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.15}
        />
      </Sequence>

      <Sequence from={ctaFrom} durationInFrames={DURATION_IN_FRAMES - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
      </Sequence>

      <Disclosure />
    </AbsoluteFill>
  );
};
