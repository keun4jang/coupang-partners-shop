import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ShortsProps } from "../types";
import {
  COVER_FRAME_COUNT,
  FONT_SIZES,
  hookFontSize,
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
  // 제품 먼저 모드: 카드가 커버 프레임 바로 뒤에 뜨고, 후킹·공감 문구는 카드 위
  // 빈 자리(장점 자막과 같은 줄)에 한 줄씩 바뀌어 나온다. 기본 모드의 문구 위치
  // (0.26·0.40)는 카드(0.25~약 0.77)와 겹치기 때문.
  const productFirst = !!props.productFirst;
  const productFrom = productFirst ? COVER_FRAME_COUNT : f(T.product.from);

  return (
    <AbsoluteFill>
      <Background
        brollFile={props.brollFile}
        brollFiles={props.brollFiles}
        brollDurations={props.brollDurations}
        // 배경 컷 경계. 예전엔 4개뿐이라 마지막 컷이 영상의 49%(21초 중 10.2초)를
        // 혼자 차지해 후반 내내 같은 배경이 깔렸다. 사용팁·확인할 점 경계를 넣어 고르게 나눈다.
        // 사용팁이 없는 구버전 대본은 tip.to === benefit2.to 라 0초 컷이 생기므로
        // 중복을 제거한다.
        cutSeconds={[
          ...new Set([
            0,
            T.empathy.to,
            T.product.to,
            T.benefit2.to,
            T.tip.to,
            T.review.to,
          ]),
        ]}
        bgImageUrl={
          props.brollFiles?.length || props.brollFile
            ? null
            : props.productImageUrl
        }
      />

      {/* 인트로: 후킹(타겟 호명)+공감 두 문장이 한 화면에 순서대로 쌓임 */}
      <Sequence durationInFrames={f(productFirst ? T.hook.to : T.empathy.to)}>
        <Subtitle
          text={props.hookLine}
          size={hookFontSize(props.hookLine)}
          variant="bubble"
          y={productFirst ? 0.1 : 0.26}
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
        <Subtitle
          text={props.empathyLine}
          variant="bubble"
          y={productFirst ? 0.13 : 0.4}
        />
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* 제품 노출: 장점1에서 한 번 등장한 뒤 CTA 직전까지 화면 전환 없이 쭉 유지.
          (같은 상품 사진이 장면마다 다시 팝인되면 3번 전환되는 것처럼 보여서
           하나의 연속 노출로 합침 - 자막만 장점1→장점2→확인할 점으로 바뀐다) */}
      <Sequence from={productFrom} durationInFrames={ctaFrom - productFrom}>
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

      {/* 확인할 점 */}
      <Sequence
        from={f(T.review.from)}
        durationInFrames={f(T.review.to - T.review.from)}
      >
        <Subtitle
          text={props.checkPoint}
          size={FONT_SIZES.benefit}
          variant="bubble"
          y={0.13}
        />
        <Narration src={props.narration?.[5]} />
      </Sequence>

      {/* CTA */}
      <Sequence from={ctaFrom} durationInFrames={durationInFrames - ctaFrom}>
        <CtaScene
          displayNumber={props.displayNumber}
          ctaText={props.ctaText}
          productImageUrl={props.productImageUrl}
        />
        <Narration src={props.narration?.[6]} />
      </Sequence>

      {/* 대가성 고지 - 영상 내내 하단에 작게.
          2026-08-05 에 뺐다가 2026-08-28 전체 점검에서 포맷 E 에만 되살렸고, D 는
          그 뒤로 안 쓰여 빠진 채 남아 있었다. 2026-09-27 D 를 다시 켜면서 복원한다.
          공정위 「추천·보증 등에 관한 표시·광고 심사지침」: 표시문구는 "게시물의
          제목 또는 동영상 내"에 있어야 한다 - 캡션·랜딩에만 두면 기준 미달이다. */}
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
