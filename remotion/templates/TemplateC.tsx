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
  COVER_FRAME_COUNT,
  FONT_SIZES,
  MOTION,
  TEMPLATE_BADGE,
  resolveTiming,
  secondsToFrames as f,
} from "../config/videoConfig";
import { fontFamily } from "../fonts";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { TopBadge } from "../components/TopBadge";
import { Narration } from "../components/Narration";
import { CoverFrame } from "../components/CoverFrame";

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
 * 장면 컷은 나레이션 실측 길이(props.timing)에 맞춰 움직인다.
 */
export const TemplateC: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const ctaFrom = f(T.cta.from);
  const memoFrom = f(T.empathy.from);

  return (
    <AbsoluteFill>
      <Background brollFile={props.brollFile} bgImageUrl={props.productImageUrl} />

      <Sequence durationInFrames={ctaFrom}>
        <TopBadge text={TEMPLATE_BADGE.C ?? ""} />
      </Sequence>

      {/* 후킹 */}
      <Sequence durationInFrames={f(T.hook.to)}>
        <Subtitle
          text={props.hookLine}
          size={FONT_SIZES.hook}
          variant="bubble"
          y={0.3}
        />
        <Narration src={props.narration?.[0]} />
      </Sequence>

      {/* 나레이션: 메모 체크라인이 적히는 타이밍에 맞춰 재생 */}
      <Sequence
        from={f(T.empathy.from)}
        durationInFrames={f(T.product.from - T.empathy.from)}
      >
        <Narration src={props.narration?.[1]} />
      </Sequence>
      <Sequence
        from={f(T.product.from)}
        durationInFrames={f(T.benefit2.from - T.product.from)}
      >
        <Narration src={props.narration?.[2]} />
      </Sequence>
      <Sequence
        from={f(T.benefit2.from)}
        durationInFrames={f(T.tip.from - T.benefit2.from)}
      >
        <Narration src={props.narration?.[3]} />
      </Sequence>
      {props.usageTip && (
        <Sequence
          from={f(T.tip.from)}
          durationInFrames={Math.max(1, f(T.review.from - T.tip.from))}
        >
          <Narration src={props.narration?.[4]} />
        </Sequence>
      )}
      <Sequence
        from={f(T.review.from)}
        durationInFrames={ctaFrom - f(T.review.from)}
      >
        <Narration src={props.narration?.[5]} />
      </Sequence>

      {/* 메모 카드 (공감/장점이 체크리스트로 하나씩 적힘) */}
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
            delayFrames={f(T.product.from - T.empathy.from)}
          />
          <MemoLine
            text={props.benefit2}
            delayFrames={f(T.benefit2.from - T.empathy.from)}
          />
          {props.usageTip && (
            <MemoLine
              text={props.usageTip}
              delayFrames={f(T.tip.from - T.empathy.from)}
            />
          )}
          <MemoLine
            text={props.reviewLine}
            delayFrames={f(T.review.from - T.empathy.from)}
          />
        </div>
      </Sequence>

      {/* 제품 폴라로이드 */}
      <Sequence
        from={f(T.product.from)}
        durationInFrames={ctaFrom - f(T.product.from)}
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

      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[6]} />
      </Sequence>

      {/* 첫 프레임 썸네일용 커버 */}
      <Sequence durationInFrames={COVER_FRAME_COUNT}>
        <CoverFrame
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          hookLine={props.hookLine}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
