import React from "react";
import {
  AbsoluteFill,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ShortsProps } from "../types";
import {
  COVER_BAND,
  COVER_FRAME_COUNT,
  EDITORIAL as E,
  MOTION_E,
  VIDEO,
  coverHookFontSizeE,
  eHookFontSize,
  eRowTextSize,
  resolveTiming,
  secondsToFrames as f,
} from "../config/videoConfig";
import { editorialFontFamily } from "../fonts";
import { FontFaceStyle } from "../components/FontFaceStyle";
import { BgmAudio } from "../components/Background";
import { Narration } from "../components/Narration";

/**
 * Template E: 살림 검증 노트 (2026-08 디자인 컨설팅 A안 첫3초 + C안 본문 하이브리드)
 *
 * 기존 D(전면 스톡영상 + 떠다니는 자막)와 완전히 다른 문법:
 *  - 종이색 단색 배경. 텍스트는 외곽선 없이 잉크색으로 (노래방 자막 제거)
 *  - 0초부터 제품 사진이 보인다 (D 는 4.6초 - 평균 시청 2.72초라 대부분 못 봄)
 *  - 본문은 "검증 노트": 장점1→장점2→사용TIP→후기 행이 나레이션에 맞춰 쌓이고
 *    끝까지 남아 마지막 화면이 그대로 "한눈 요약"이 된다 (저장 유도 장치)
 *  - 스톡 영상은 둥근 사진 창 안에만, 컷 3개 이하
 *  - CTA 는 전체 화면 점거(380px 원) 대신 사진 창 자리의 포인트 카드
 *
 * 화면 문구 = 나레이션 원칙 유지: 행 본문은 전부 나레이션된 문장 그대로이고,
 * "장점 1 / 사용 TIP / 후기" 라벨은 D 의 "보관 TIP" 배지와 같은 구조 라벨이다.
 */

const CONTENT_W = VIDEO.width - E.safeX * 2;

/** 절제된 팝인 (밀리는 정도 24px, 오버슈트 거의 없음) */
function useRise(delayFrames = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delayFrames,
    fps,
    config: { damping: MOTION_E.springDamping },
  });
  return {
    opacity: s,
    transform: `translateY(${(1 - s) * 24}px)`,
  };
}

/** 번호 칩 - 시청 내내 떠 있어 번호를 초반부터 기억시킨다 */
const NumberChip: React.FC<{ displayNumber: number; label?: string }> = ({
  displayNumber,
  label = "오늘의 체크",
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14,
      background: E.green,
      color: "#FFFFFF",
      borderRadius: 999,
      padding: "12px 26px",
      fontSize: 30,
      fontWeight: 600,
      letterSpacing: "-0.01em",
      width: "fit-content",
    }}
  >
    <span style={{ opacity: 0.85, fontSize: 30 }}>{label}</span>
    {/* 번호는 시청자가 기억해서 랜딩에서 찾아야 하는 값이라 라벨보다 크게 */}
    <span style={{ fontWeight: 800, fontSize: 42 }}>{displayNumber}번</span>
  </div>
);

/**
 * 대가성 고지 - 작고 차분한 한 줄. 번호 칩 옆에 붙여 늘 함께 떠 있게 한다
 * (첫 프레임 커버 1장만 예외 - CoverPoster 가 덮는다).
 *
 * 공정위 「추천·보증 등에 관한 표시·광고 심사지침」: 표시문구는 "게시물의 제목
 * 또는 동영상 내"에 있어야 하고 "'더보기'를 눌러야만 확인 가능한 경우"는
 * 부적절 - 랜딩 페이지에만 두던 기존 구성은 이 기준에 못 미쳤다(2026-08-28
 * 전체 점검, 사장님 확인 후 복원). 문구는 TemplateTop10 Intro 화면과 통일.
 */
const DisclosureTag: React.FC = () => (
  <div
    style={{
      fontSize: 20,
      lineHeight: 1.3,
      color: E.sub,
      opacity: 0.82,
      fontWeight: 500,
      letterSpacing: "-0.005em",
      wordBreak: "keep-all",
      whiteSpace: "nowrap",
    }}
  >
    [광고] 쿠팡파트너스 활동의 일환으로 수수료를 제공받습니다
  </div>
);

/**
 * 번호 칩 + 대가성 고지를 한 세트로 묶는다 - 고지는 항상 칩 바로 아래 자기
 * 줄에 고정(gap 8, 세로 높이 ≈ 34px 로 고정)한다. 예전에는 남는 가로폭에
 * 따라(flexWrap) 제품명이 길고 짧음에 따라 매번 줄바꿈 위치가 달라졌는데,
 * 영상마다 모양이 들쑥날쑥해 보여 고정 2줄 블록으로 바꿨다(2026-08-28).
 */
const ChipWithDisclosure: React.FC<{
  displayNumber: number;
  trailing?: React.ReactNode;
}> = ({ displayNumber, trailing }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
      {/* flexShrink:0 필수 - 안 붙이면 옆의 긴 제품명에 밀려 칩 자체가
          찌그러지면서 "오늘의 체크" 글자가 줄바꿈된다(실측으로 발견) */}
      <div style={{ flexShrink: 0 }}>
        <NumberChip displayNumber={displayNumber} />
      </div>
      {trailing}
    </div>
    <DisclosureTag />
  </div>
);

/**
 * 제품 사진. 로드에 실패하면 렌더 전체가 죽지 않도록 폴백으로 떨어진다.
 *
 * Remotion 의 <Img> 는 onError 가 없으면 로드 실패 시 예외를 던져 렌더가 통째로
 * 실패하고, 그 영상은 failed 로 남아 자동 재시도가 없다. 제품 이미지는 워커가
 * data URI 로 심어주지만(fetchImageAsDataUri) 그게 실패하면 원본 CDN URL 이
 * 그대로 넘어와 헤드리스 브라우저에서 차단될 수 있다. 사진 한 장 때문에
 * 영상을 통째로 잃는 것보다 사진 없이 나가는 편이 낫다.
 */
const ProductImage: React.FC<{
  src: string | null;
  fallbackSize: number;
  style?: React.CSSProperties;
}> = ({ src, fallbackSize, style }) => {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) return <span style={{ fontSize: fallbackSize }}>🧺</span>;
  return (
    <Img
      src={src}
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "contain", ...style }}
    />
  );
};

/** 제품 사진 카드 (흰 바탕, 얇은 테두리, 은은한 그림자) */
const ProductCard: React.FC<{
  imageUrl: string | null;
  style?: React.CSSProperties;
}> = ({ imageUrl, style }) => (
  <div
    style={{
      background: E.card,
      borderRadius: 32,
      border: `1px solid ${E.line}`,
      boxShadow: "0 14px 44px rgba(36,33,30,0.10)",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
      boxSizing: "border-box",
      ...style,
    }}
  >
    <ProductImage src={imageUrl} fallbackSize={160} />
  </div>
);

/**
 * 본편 첫 장면: 문제 훅 + 공감 + 제품 사진.
 * (썸네일은 별도 CoverPoster 를 쓴다 - 그리드에서 읽히려면 훅이 훨씬 커야 해서 분리했다)
 */
const Poster: React.FC<{
  props: ShortsProps;
  empathyDelayFrames: number;
}> = ({ props, empathyDelayFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hookSize = eHookFontSize(props.hookLine);
  const words = props.hookLine.trim().split(/\s+/).filter(Boolean);

  const wordStyle = (i: number): React.CSSProperties => {
    const s = spring({
      frame: frame - 4 - i * 3,
      fps,
      config: { damping: MOTION_E.springDamping },
    });
    return {
      opacity: s,
      transform: `translateY(${(1 - s) * 30}px)`,
      display: "inline-block",
    };
  };

  const cardIn = spring({
    frame: frame - 8,
    fps,
    config: { damping: MOTION_E.springDamping },
  });
  const empathyIn = spring({
    frame: frame - empathyDelayFrames,
    fps,
    config: { damping: MOTION_E.springDamping },
  });

  return (
    <AbsoluteFill style={{ fontFamily: editorialFontFamily }}>
      <div
        style={{
          position: "absolute",
          top: E.safeTop,
          left: E.safeX,
          width: CONTENT_W,
          height: E.safeBottom - E.safeTop,
          display: "flex",
          flexDirection: "column",
          gap: 30,
        }}
      >
        <ChipWithDisclosure displayNumber={props.displayNumber} />
        {/* 문제 훅 - 왼쪽 정렬 대형 타이포, 외곽선 없이 잉크색 */}
        <div
          style={{
            color: E.ink,
            fontSize: hookSize,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
            textAlign: "left",
          }}
        >
          {words.map((w, i) => (
            <React.Fragment key={i}>
              <span style={wordStyle(i)}>{w}</span>
              {i < words.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </div>
        {/* 공감 문장 - 나레이션 시작에 맞춰 훅 아래로 (보조 위계: 600/회색) */}
        <div
          style={{
            color: E.sub,
            fontSize: 46,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            wordBreak: "keep-all",
            textAlign: "left",
            opacity: empathyIn,
            transform: `translateY(${(1 - empathyIn) * 24}px)`,
          }}
        >
          {props.empathyLine}
        </div>
        {/* 제품 사진 - 0초부터 화면에 (첫 3초 안에 "무엇에 대한 영상인지" 증거) */}
        <div
          style={{
            flex: 1,
            minHeight: 380,
            opacity: cardIn,
            transform: `translateY(${(1 - cardIn) * 30}px)`,
          }}
        >
          <ProductCard imageUrl={props.productImageUrl} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 사진 창 - 스톡 클립을 둥근 창 안에서만 재생 (컷 경계에서 다음 클립으로) */
const MediaWindow: React.FC<{
  props: ShortsProps;
  /** 창 안 컷 시작 시각(초, 본문 시작 기준 절대 시각) */
  cutSeconds: number[];
  fromSecond: number;
  toSecond: number;
}> = ({ props, cutSeconds, fromSecond, toSecond }) => {
  const files = props.brollFiles ?? [];
  const durations = props.brollDurations ?? [];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: E.radius,
        overflow: "hidden",
        border: `1px solid ${E.line}`,
        background: E.card,
      }}
    >
      {/* 실사용 클립이 카드 전체(≈16:9 가로)에 깔리고, 제품 사진 카드가 그 위에
          얹힌다 (사장님 피드백 2026-08-18: 영상 소스는 16:9 가로로, 제품은 그 위에).
          워커가 E 용으로는 가로 클립을 받아오므로 크롭 손실이 거의 없다. */}
      {files.length > 0 ? (
        <>
          {cutSeconds.map((startSec, i) => {
            const endSec = i + 1 < cutSeconds.length ? cutSeconds[i + 1] : toSecond;
            if (endSec <= startSec) return null;
            const file = files[i % files.length];
            const clipFrames = durations[i % files.length]
              ? Math.max(1, Math.round(durations[i % files.length] * VIDEO.fps))
              : null;
            const seqFrames = f(endSec - startSec);
            const video = (
              <OffthreadVideo
                src={staticFile(`assets/broll/${file}`)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            );
            return (
              <Sequence
                key={i}
                from={f(startSec - fromSecond)}
                durationInFrames={seqFrames}
              >
                {clipFrames && clipFrames < seqFrames ? (
                  <Loop durationInFrames={clipFrames}>{video}</Loop>
                ) : (
                  video
                )}
              </Sequence>
            );
          })}
          {/* 제품 사진 오버레이 카드 - 왼쪽에 크게, 영상 위에 떠 있다 */}
          <div
            style={{
              position: "absolute",
              left: 28,
              top: "50%",
              transform: "translateY(-50%)",
              width: 410,
              height: 410,
              borderRadius: E.radius,
              background: E.card,
              border: `1px solid ${E.line}`,
              boxShadow: "0 14px 40px rgba(36,33,30,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              boxSizing: "border-box",
            }}
          >
            <ProductImage src={props.productImageUrl} fallbackSize={120} />
          </div>
        </>
      ) : (
        // 스톡이 없으면 제품 사진을 카드 전체에 크게
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            boxSizing: "border-box",
          }}
        >
          <ProductImage src={props.productImageUrl} fallbackSize={160} />
        </div>
      )}
    </div>
  );
};

type NoteRow = {
  label: string;
  labelBg: string;
  labelColor: string;
  text: string;
  fromSecond: number;
};

/** 검증 노트 행: 라벨 칩 + 나레이션과 동일한 문장. 등장 후 끝까지 남는다 */
const NoteRowView: React.FC<{
  row: NoteRow;
  /** 이 행의 나레이션 구간이 지났는지 (지나면 살짝 가라앉음) */
  isPast: boolean;
  bodyFromSecond: number;
}> = ({ row, isPast, bodyFromSecond }) => {
  const rise = useRise(f(row.fromSecond - bodyFromSecond));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 20,
        opacity: rise.opacity * (isPast ? 0.66 : 1),
        transform: rise.transform,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 132,
          borderRadius: 14,
          background: row.labelBg,
          color: row.labelColor,
          fontSize: 27,
          fontWeight: 600,
          textAlign: "center",
          padding: "11px 0",
          letterSpacing: "-0.01em",
        }}
      >
        {row.label}
      </div>
      <div
        style={{
          color: E.ink,
          fontSize: eRowTextSize(row.text),
          fontWeight: 600,
          lineHeight: 1.32,
          letterSpacing: "-0.01em",
          wordBreak: "keep-all",
          paddingTop: 2,
        }}
      >
        {row.text}
      </div>
    </div>
  );
};

/** CTA 카드 - 사진 창 자리를 이어받는 포인트 카드 (전체 화면 점거 없음) */
const CtaCard: React.FC<{ displayNumber: number; ctaText: string }> = ({
  displayNumber,
  ctaText,
}) => {
  const rise = useRise(0);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: E.radius,
        background: E.accent,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 48px",
        boxSizing: "border-box",
        opacity: rise.opacity,
        transform: rise.transform,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 30, fontWeight: 600 }}>
        영상 속 제품 번호
      </div>
      <div
        style={{
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 168,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {displayNumber}
        <span style={{ fontSize: "0.5em" }}>번</span>
      </div>
      {/* 나레이션과 동일한 문장 */}
      <div
        style={{
          color: "#FFFFFF",
          fontSize: 38,
          fontWeight: 600,
          lineHeight: 1.35,
          textAlign: "center",
          wordBreak: "keep-all",
          textWrap: "balance",
        }}
      >
        {ctaText}
      </div>
    </div>
  );
};

/**
 * 커버(썸네일) 전용 화면.
 *
 * 본편 첫 장면(Poster)을 그대로 쓰다가 사장님 지적으로 분리했다 - 피드 그리드에서
 * 훅이 안 읽혔다(실측: 200px 폭으로 줄이면 글자당 3px 남짓, 위아래 빈 공간만 컸다).
 * 커버는 재생 중 1프레임만 보이므로 본편과 달라도 되고, 오직 "손톱만 한 크기에서
 * 읽히는가"만 보면 된다. 그래서 훅을 최대 150px 까지 키우고 요소를 화면 가운데
 * 띠(COVER_BAND)에 모은다 - 인스타 그리드가 9:16 을 가운데 정사각으로 자르기 때문.
 */
const CoverPoster: React.FC<{ props: ShortsProps }> = ({ props }) => (
  <AbsoluteFill style={{ backgroundColor: E.paper, fontFamily: editorialFontFamily }}>
    <div
      style={{
        position: "absolute",
        top: COVER_BAND.top,
        left: E.safeX,
        width: CONTENT_W,
        height: COVER_BAND.height,
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}
    >
      {/* 번호는 칩 대신 큰 글씨로 (사장님 지적 2026-08-20: 초록 칩 안 글씨가
          그리드에서 안 읽힌다 → "그냥 번호만 크게"). 칩은 배경이 글자 자리를
          잡아먹어 30px 이 한계였는데, 맨글씨로 빼면 96px 까지 키울 수 있다.
          색은 포인트색(토마토) - 종이색 위에서 대비가 가장 세고 시선이 걸린다. */}
      <div
        style={{
          color: E.accent,
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {props.displayNumber}
        <span style={{ fontSize: "0.62em", marginLeft: "0.04em" }}>번</span>
      </div>
      <div
        style={{
          color: E.ink,
          fontSize: coverHookFontSizeE(props.hookLine),
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          wordBreak: "keep-all",
          textAlign: "left",
        }}
      >
        {props.hookLine}
      </div>
      {/* 남는 높이를 전부 제품 카드가 가져간다 - 세로로 긴 제품도 크게 보이게 */}
      <ProductCard
        imageUrl={props.productImageUrl}
        style={{ width: "100%", flex: 1, minHeight: COVER_BAND.cardMinHeight }}
      />
    </div>
  </AbsoluteFill>
);

export const TemplateE: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const bodyFrom = T.product.from;
  const ctaFrom = T.cta.from;

  const rows: NoteRow[] = [
    {
      label: "장점 1",
      labelBg: E.green,
      labelColor: "#FFFFFF",
      text: props.benefit1,
      fromSecond: T.product.from,
    },
    {
      label: "장점 2",
      labelBg: E.green,
      labelColor: "#FFFFFF",
      text: props.benefit2,
      fromSecond: T.benefit2.from,
    },
    ...(props.usageTip && T.tip.to > T.tip.from
      ? [
          {
            label: "사용 TIP",
            labelBg: E.highlight,
            labelColor: E.ink,
            text: props.usageTip,
            fromSecond: T.tip.from,
          },
        ]
      : []),
    {
      label: "후기",
      labelBg: E.ink,
      labelColor: "#FFFFFF",
      text: props.reviewLine,
      fromSecond: T.review.from,
    },
  ];

  // 사진 창 컷 경계 - 최대 3컷 (본문 시작 / 장점2 / 후기)
  const windowCuts = [
    ...new Set([bodyFrom, T.benefit2.from, T.review.from]),
  ].filter((s) => s < ctaFrom);

  return (
    <AbsoluteFill style={{ backgroundColor: E.paper, fontFamily: editorialFontFamily }}>
      <FontFaceStyle />
      <BgmAudio />

      {/* ── 포스터 장면: 문제 훅 + 공감 + 제품 (0초부터) ── */}
      <Sequence durationInFrames={f(T.empathy.to)}>
        <Poster props={props} empathyDelayFrames={f(T.empathy.from)} />
      </Sequence>
      <Sequence durationInFrames={f(T.hook.to)}>
        <Narration src={props.narration?.[0]} />
      </Sequence>
      <Sequence from={f(T.empathy.from)} durationInFrames={f(T.empathy.to - T.empathy.from)}>
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* ── 본문: 검증 노트 (행이 쌓이고, CTA까지 남아 한눈 요약이 된다) ── */}
      <Sequence from={f(bodyFrom)} durationInFrames={durationInFrames - f(bodyFrom)}>
        <AbsoluteFill style={{ fontFamily: editorialFontFamily }}>
          <div
            style={{
              position: "absolute",
              top: E.safeTop,
              left: E.safeX,
              width: CONTENT_W,
              height: E.safeBottom - E.safeTop,
              display: "flex",
              flexDirection: "column",
              gap: 26,
            }}
          >
            {/* 헤더: 번호 칩 + 제품명(칩 옆, 길면 ellipsis) + 고지(칩 아래 고정 줄) -
                고지 줄 위치가 제품명 길이에 안 흔들리게 ChipWithDisclosure 로 고정했다 */}
            <ChipWithDisclosure
              displayNumber={props.displayNumber}
              trailing={
                <div
                  style={{
                    color: E.sub,
                    fontSize: 32,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    flex: "1 1 auto",
                  }}
                >
                  {props.productName}
                </div>
              }
            />

            {/* 사진 창 (본문) → CTA 카드 (마지막).
                높이 526 = 936÷16×9, 정확한 16:9 (헤더 블록 90 = 칩54+gap8+고지28,
                행 4개 최악 높이까지 더해도 콘텐츠 안전대 1220px 안:
                90+26+526+26+554 = 1222 - 여유 폭 안. 고지 줄이 항상 고정 높이라
                제품명 길이와 무관하게 이 계산이 매번 그대로 성립한다) */}
            <div style={{ width: "100%", height: 526, position: "relative" }}>
              <Sequence durationInFrames={f(ctaFrom - bodyFrom)} layout="none">
                <MediaWindow
                  props={props}
                  cutSeconds={windowCuts}
                  fromSecond={bodyFrom}
                  toSecond={ctaFrom}
                />
              </Sequence>
              <Sequence from={f(ctaFrom - bodyFrom)} layout="none">
                <CtaCard displayNumber={props.displayNumber} ctaText={props.ctaText} />
              </Sequence>
            </div>

            {/* 검증 노트 행 - 나레이션에 맞춰 쌓임 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {rows.map((row, i) => (
                <RowAtTime
                  key={row.label}
                  row={row}
                  rows={rows}
                  index={i}
                  bodyFromSecond={bodyFrom}
                  ctaFromSecond={ctaFrom}
                />
              ))}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* 본문·CTA 나레이션 */}
      <Sequence from={f(T.product.from)} durationInFrames={f(T.product.to - T.product.from)}>
        <Narration src={props.narration?.[2]} />
      </Sequence>
      <Sequence from={f(T.benefit2.from)} durationInFrames={f(T.benefit2.to - T.benefit2.from)}>
        <Narration src={props.narration?.[3]} />
      </Sequence>
      {props.usageTip && T.tip.to > T.tip.from && (
        <Sequence from={f(T.tip.from)} durationInFrames={Math.max(1, f(T.tip.to - T.tip.from))}>
          <Narration src={props.narration?.[4]} />
        </Sequence>
      )}
      <Sequence from={f(T.review.from)} durationInFrames={f(T.review.to - T.review.from)}>
        <Narration src={props.narration?.[5]} />
      </Sequence>
      <Sequence from={f(ctaFrom)} durationInFrames={durationInFrames - f(ctaFrom)}>
        <Narration src={props.narration?.[6]} />
      </Sequence>

      {/* 첫 프레임 커버 (썸네일) - 그리드에서 읽히도록 훅을 크게 키운 전용 화면 */}
      <Sequence durationInFrames={COVER_FRAME_COUNT}>
        <CoverPoster props={props} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** 행 렌더 - 나레이션 구간이 지나면 살짝 가라앉혀 현재 행이 도드라지게 */
const RowAtTime: React.FC<{
  row: NoteRow;
  rows: NoteRow[];
  index: number;
  bodyFromSecond: number;
  ctaFromSecond: number;
}> = ({ row, rows, index, bodyFromSecond, ctaFromSecond }) => {
  const frame = useCurrentFrame();
  const next = rows[index + 1];
  const rowEnd = next ? next.fromSecond : ctaFromSecond;
  // CTA 구간에서는 전 행을 또렷하게 - 마지막 화면 자체가 "한눈 요약"
  const inCta = frame >= f(ctaFromSecond - bodyFromSecond);
  const isPast = !inCta && frame >= f(rowEnd - bodyFromSecond);
  return <NoteRowView row={row} isPast={isPast} bodyFromSecond={bodyFromSecond} />;
};
