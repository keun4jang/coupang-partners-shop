import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ShortsProps } from "../types";
import {
  FONT_SIZES,
  TEMPLATE_BADGE,
  resolveTiming,
  secondsToFrames as f,
} from "../config/videoConfig";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { Disclosure } from "../components/Disclosure";
import { TopBadge } from "../components/TopBadge";
import { Narration } from "../components/Narration";

/**
 * Template B: 아이엄마 공감형
 * 아이 둘 키우는 집의 생활 상황 → 공감 → 제품 등장 → 정리/청소/편의성 → 번호 CTA
 * 상단 배지 + 말풍선 자막으로 더 따뜻한 느낌.
 * 장면 컷은 나레이션 실측 길이(props.timing)에 맞춰 움직인다.
 */
export const TemplateB: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const ctaFrom = f(T.cta.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} />

      {/* 상단 감성 배지 - CTA 전까지 유지 */}
      <Sequence durationInFrames={ctaFrom}>
        <TopBadge text={TEMPLATE_BADGE.B ?? ""} />
      </Sequence>

      <Sequence durationInFrames={f(T.hook.to)}>
        <Subtitle
          text={props.hookLine}
          size={FONT_SIZES.hook}
          variant="bubble"
          y={0.36}
        />
        <Narration src={props.narration?.[0]} />
      </Sequence>

      <Sequence
        from={f(T.empathy.from)}
        durationInFrames={f(T.empathy.to - T.empathy.from)}
      >
        <Subtitle text={props.empathyLine} variant="bubble" y={0.4} />
        <Narration src={props.narration?.[1]} />
      </Sequence>

      <Sequence
        from={f(T.product.from)}
        durationInFrames={ctaFrom - f(T.product.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
        />
      </Sequence>

      <Sequence
        from={f(T.product.from)}
        durationInFrames={f(T.product.to - T.product.from)}
      >
        <Subtitle
          text={props.benefit1}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.15}
        />
        <Narration src={props.narration?.[2]} />
      </Sequence>

      <Sequence
        from={f(T.benefit2.from)}
        durationInFrames={f(T.benefit2.to - T.benefit2.from)}
      >
        <Subtitle
          text={props.benefit2}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.15}
        />
        <Narration src={props.narration?.[3]} />
      </Sequence>

      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[4]} />
      </Sequence>

      <Disclosure />
    </AbsoluteFill>
  );
};
