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
import { Disclosure } from "../components/Disclosure";

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
          y={0.26}
          strong
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

      {/* 제품 노출: 장점1에서 한 번 등장한 뒤 CTA 직전까지 화면 전환 없이 쭉 유지.
          (같은 상품 사진이 장면마다 다시 팝인되면 3번 전환되는 것처럼 보여서
           하나의 연속 노출로 합침 - 자막만 장점1→장점2→후기로 바뀐다) */}
      <Sequence
        from={f(T.product.from)}
        durationInFrames={ctaFrom - f(T.product.from)}
      >
        <ProductOverlay
          productName={props.productName}
          productImageUrl={props.productImageUrl}
          displayNumber={props.displayNumber}
          topRatio={0.25}
          widthRatio={0.66}
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

      {/* 사용팁 (구버전 대본이면 구간이 0초라 자연히 스킵) */}
      {props.usageTip && (
        <Sequence
          from={f(T.tip.from)}
          durationInFrames={Math.max(1, f(T.tip.to - T.tip.from))}
        >
          <Subtitle
            text={props.usageTip}
            size={FONT_SIZES.benefit}
            variant="bubble"
            y={0.13}
            badge="보관 TIP"
          />
          <Narration src={props.narration?.[4]} />
        </Sequence>
      )}

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
        <Narration src={props.narration?.[5]} />
      </Sequence>

      {/* CTA */}
      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene displayNumber={props.displayNumber} ctaText={props.ctaText} />
        <Narration src={props.narration?.[6]} />
      </Sequence>

      {/* 대가성 고지 - 영상 내내 하단에 표시 (표시광고법·쿠팡파트너스 운영정책).
          커버 프레임보다 아래 레이어라 썸네일에는 안 잡히고 본편에만 보인다. */}
      <Disclosure />

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
