import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { ShortsProps } from "../types";
import {
  DURATION_IN_FRAMES,
  FONT_SIZES,
  TIMING,
  secondsToFrames as f,
} from "../config/videoConfig";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { Disclosure } from "../components/Disclosure";
import { Narration } from "../components/Narration";

/**
 * Template A: 생활 문제 해결형
 * 문제 제기 → 공감 → 제품 등장 → 장점 1~2개 → 번호 CTA
 */
export const TemplateA: React.FC<ShortsProps> = (props) => {
  const ctaFrom = f(TIMING.cta.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} />

      {/* 0~1.5초: 후킹 문구 크게 */}
      <Sequence durationInFrames={f(TIMING.hook.to)}>
        <Subtitle text={props.hookLine} size={FONT_SIZES.hook} y={0.38} />
        <Narration src={props.narration?.[0]} />
      </Sequence>

      {/* 1.5~3.5초: 공감 (배경은 계속 줌인) */}
      <Sequence
        from={f(TIMING.empathy.from)}
        durationInFrames={f(TIMING.empathy.to - TIMING.empathy.from)}
      >
        <Subtitle text={props.empathyLine} y={0.42} />
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* 3.5초~CTA 직전: 제품 카드가 아래에서 올라옴 */}
      <Sequence from={f(TIMING.product.from)} durationInFrames={ctaFrom - f(TIMING.product.from)}>
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
        />
      </Sequence>

      {/* 3.5~6.5초: 장점 1 (카드 위쪽) */}
      <Sequence
        from={f(TIMING.product.from)}
        durationInFrames={f(TIMING.product.to - TIMING.product.from)}
      >
        <Subtitle text={props.benefit1} size={FONT_SIZES.benefit} y={0.16} />
        <Narration src={props.narration?.[2]} />
      </Sequence>

      {/* 6.5~8.5초: 장점 2 / 사용 상황 */}
      <Sequence
        from={f(TIMING.benefit2.from)}
        durationInFrames={f(TIMING.benefit2.to - TIMING.benefit2.from)}
      >
        <Subtitle text={props.benefit2} size={FONT_SIZES.benefit} y={0.16} />
        <Narration src={props.narration?.[3]} />
      </Sequence>

      {/* 8.5초~끝: CTA */}
      <Sequence from={ctaFrom} durationInFrames={DURATION_IN_FRAMES - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[4]} />
      </Sequence>

      <Disclosure />
    </AbsoluteFill>
  );
};
