import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ShortsProps } from "../types";
import {
  FONT_SIZES,
  resolveTiming,
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
 * 장면 컷은 나레이션 실측 길이(props.timing)에 맞춰 움직인다.
 */
export const TemplateA: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const ctaFrom = f(T.cta.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} bgImageUrl={props.productImageUrl} />

      {/* 인트로: 후킹(타겟 호명)+공감 두 문장이 한 화면에 순서대로 쌓임 (컷 전환 없음) */}
      <Sequence durationInFrames={f(T.empathy.to)}>
        <Subtitle
          text={props.hookLine}
          size={FONT_SIZES.hook}
          variant="bubble"
          y={0.26}
        />
      </Sequence>
      <Sequence durationInFrames={f(T.hook.to)}>
        <Narration src={props.narration?.[0]} />
      </Sequence>
      <Sequence
        from={f(T.empathy.from)}
        durationInFrames={f(T.empathy.to - T.empathy.from)}
      >
        <Subtitle text={props.empathyLine} variant="bubble" y={0.47} />
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* 제품 카드가 아래에서 올라옴 (CTA 직전까지 유지) */}
      <Sequence from={f(T.product.from)} durationInFrames={ctaFrom - f(T.product.from)}>
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
        />
      </Sequence>

      {/* 장점 1 (카드 위쪽) */}
      <Sequence
        from={f(T.product.from)}
        durationInFrames={f(T.product.to - T.product.from)}
      >
        <Subtitle text={props.benefit1} size={FONT_SIZES.benefit} variant="bubble" y={0.14} />
        <Narration src={props.narration?.[2]} />
      </Sequence>

      {/* 장점 2 / 사용 상황 */}
      <Sequence
        from={f(T.benefit2.from)}
        durationInFrames={f(T.benefit2.to - T.benefit2.from)}
      >
        <Subtitle text={props.benefit2} size={FONT_SIZES.benefit} variant="bubble" y={0.14} />
        <Narration src={props.narration?.[3]} />
      </Sequence>

      {/* CTA */}
      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[4]} />
      </Sequence>

      <Disclosure />
    </AbsoluteFill>
  );
};
