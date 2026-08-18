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
  COVER_FRAME_COUNT,
  EDITORIAL as E,
  MOTION_E,
  VIDEO,
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
    <span style={{ opacity: 0.85 }}>{label}</span>
    <span style={{ fontWeight: 800 }}>{displayNumber}번</span>
  </div>
);

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
    {imageUrl ? (
      <Img
        src={imageUrl}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    ) : (
      <span style={{ fontSize: 160 }}>🧺</span>
    )}
  </div>
);

/**
 * 포스터 화면 (커버 프레임 + 훅/공감 장면 공용).
 * animated=false 면 등장 완료 상태로 정적으로 그린다 (1프레임 커버·썸네일용).
 */
const Poster: React.FC<{
  props: ShortsProps;
  animated: boolean;
  showEmpathy: boolean;
  empathyDelayFrames: number;
}> = ({ props, animated, showEmpathy, empathyDelayFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hookSize = eHookFontSize(props.hookLine);
  const words = props.hookLine.trim().split(/\s+/).filter(Boolean);

  const wordStyle = (i: number): React.CSSProperties => {
    if (!animated) return {};
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

  const cardIn = animated
    ? spring({ frame: frame - 8, fps, config: { damping: MOTION_E.springDamping } })
    : 1;
  const empathyIn = animated
    ? spring({
        frame: frame - empathyDelayFrames,
        fps,
        config: { damping: MOTION_E.springDamping },
      })
    : 1;

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
        <NumberChip displayNumber={props.displayNumber} />
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
        {/* 공감 문장 - 나레이션 시작에 맞춰 훅 아래로 (보조 위계: 600/회색).
            커버(showEmpathy=false)에서도 자리는 차지시켜 커버→본편 사이에
            제품 카드가 1프레임 만에 툭 내려앉는 레이아웃 점프를 막는다. */}
        <div
          style={{
            color: E.sub,
            fontSize: 46,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            wordBreak: "keep-all",
            textAlign: "left",
            opacity: showEmpathy ? empathyIn : 0,
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
      {files.length > 0 ? (
        cutSeconds.map((startSec, i) => {
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
        })
      ) : (
        // 스톡이 없으면 제품 사진을 창에 (블러·중첩 오버레이 없이 그대로)
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            boxSizing: "border-box",
          }}
        >
          {props.productImageUrl ? (
            <Img
              src={props.productImageUrl}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 120 }}>🧺</span>
          )}
        </div>
      )}
      {/* 제품 미니 카드 - 스톡이 재생되는 동안에도 제품이 화면에서 사라지지 않게 */}
      {files.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 20,
            bottom: 20,
            width: 168,
            height: 168,
            borderRadius: 20,
            background: E.card,
            border: `1px solid ${E.line}`,
            boxShadow: "0 8px 24px rgba(36,33,30,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            boxSizing: "border-box",
          }}
        >
          {props.productImageUrl ? (
            <Img
              src={props.productImageUrl}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 64 }}>🧺</span>
          )}
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
        <Poster
          props={props}
          animated
          showEmpathy
          empathyDelayFrames={f(T.empathy.from)}
        />
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
            {/* 헤더: 번호 칩 + 제품명 한 줄 */}
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <NumberChip displayNumber={props.displayNumber} />
              <div
                style={{
                  color: E.sub,
                  fontSize: 32,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {props.productName}
              </div>
            </div>

            {/* 사진 창 (본문) → CTA 카드 (마지막) */}
            <div style={{ width: "100%", height: 470, position: "relative" }}>
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

      {/* 첫 프레임 커버 (썸네일) - 포스터를 등장 완료 상태로 정적으로 */}
      <Sequence durationInFrames={COVER_FRAME_COUNT}>
        <AbsoluteFill style={{ backgroundColor: E.paper }}>
          <Poster props={props} animated={false} showEmpathy={false} empathyDelayFrames={0} />
        </AbsoluteFill>
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
