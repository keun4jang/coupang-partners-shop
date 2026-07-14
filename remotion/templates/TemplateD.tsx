import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ShortsProps } from "../types";
import {
  COVER_FRAME_COUNT,
  FONT_SIZES,
  resolveTiming,
  secondsToFrames as f,
} from "../config/videoConfig";
import { Background } from "../components/Background";
import { Subtitle } from "../components/Subtitle";
import { ProductOverlay } from "../components/ProductOverlay";
import { CtaScene } from "../components/CtaScene";
import { Narration } from "../components/Narration";
import { CoverFrame } from "../components/CoverFrame";

/**
 * Template D: 실사용 영상형
 * 카테고리에 맞는 스톡 실사용 영상(brollFile)이 처음부터 끝까지 배경으로 재생되고
 * 그 위에 자막·상품카드·번호 CTA 가 얹힌다.
 * brollFile 이 없으면(키 미설정/검색 실패) 블러 상품사진 배경으로 폴백.
 * 장면 컷은 나레이션 실측 길이(props.timing)에 맞춰 움직인다.
 */
export const TemplateD: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const ctaFrom = f(T.cta.from);

  return (
    <AbsoluteFill>
      <Background
        brollFile={props.brollFile}
        brollFiles={props.brollFiles}
        cutSeconds={[0, T.empathy.to, T.product.to, T.benefit2.to]}
        bgImageUrl={
          props.brollFiles?.length || props.brollFile
            ? null
            : props.productImageUrl
        }
      />

      {/* 인트로: 후킹(타겟 호명)+공감 두 문장이 한 화면에 순서대로 쌓임 */}
      <Sequence durationInFrames={f(T.empathy.to)}>
        <Subtitle
          text={props.hookLine}
          size={FONT_SIZES.hook}
          variant="bubble"
          y={0.28}
        />
      </Sequence>
      <Sequence durationInFrames={f(T.hook.to)}>
        <Narration src={props.narration?.[0]} />
      </Sequence>
      <Sequence
        from={f(T.empathy.from)}
        durationInFrames={f(T.empathy.to - T.empathy.from)}
      >
        <Subtitle text={props.empathyLine} variant="bubble" y={0.4} />
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* 제품 1차 노출(장점1): 크게 '히어로' 샷으로 제품을 확실히 보여준다 */}
      <Sequence
        from={f(T.product.from)}
        durationInFrames={f(T.benefit2.from - T.product.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          topRatio={0.24}
          widthRatio={0.72}
        />
      </Sequence>

      {/* 제품 2차 노출(장점2): 크게 유지하며 다시 팝인 */}
      <Sequence
        from={f(T.benefit2.from)}
        durationInFrames={f(T.review.from - T.benefit2.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          topRatio={0.26}
          widthRatio={0.72}
        />
      </Sequence>

      {/* 제품 3차 노출(후기): 크게 유지하며 한 번 더 팝인 */}
      <Sequence
        from={f(T.review.from)}
        durationInFrames={ctaFrom - f(T.review.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          topRatio={0.24}
          widthRatio={0.72}
        />
      </Sequence>

      {/* 장점 1 */}
      <Sequence
        from={f(T.product.from)}
        durationInFrames={f(T.product.to - T.product.from)}
      >
        <Subtitle
          text={props.benefit1}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.13}
        />
        <Narration src={props.narration?.[2]} />
      </Sequence>

      {/* 장점 2 */}
      <Sequence
        from={f(T.benefit2.from)}
        durationInFrames={f(T.benefit2.to - T.benefit2.from)}
      >
        <Subtitle
          text={props.benefit2}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.13}
        />
        <Narration src={props.narration?.[3]} />
      </Sequence>

      {/* 후기 언급 */}
      <Sequence
        from={f(T.review.from)}
        durationInFrames={f(T.review.to - T.review.from)}
      >
        <Subtitle
          text={props.reviewLine}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.13}
        />
        <Narration src={props.narration?.[4]} />
      </Sequence>

      {/* CTA */}
      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[5]} />
      </Sequence>

      {/* 첫 프레임 썸네일용 커버 - 맨 위 레이어라 1프레임 동안 다른 요소를 전부 가림 */}
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
