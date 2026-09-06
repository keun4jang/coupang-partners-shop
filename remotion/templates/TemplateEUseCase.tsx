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
 * Template E-UseCase: 사용상황형 (클릭률 개선 1차, 2026-09)
 *
 * TemplateE(살림 검증 노트)를 대체하지 않고 나란히 둔다 - 어느 쪽이 링크까지
 * 데려가는지 비교해야 하기 때문이다(video_items.template_variant + /go 추적).
 *
 * E 와 무엇이 다른가:
 *  · E 는 "제품이 이래서 좋다"(장점1·장점2)를 연달아 말한다. 광고 문법이라
 *    실측 CTR 이 0.08% 수준까지 떨어졌다.
 *  · 여기서는 "생활 상황 → 용도 → 구조 → 확인할 점 → 맞는 집" 순으로 간다.
 *    사기 전에 궁금한 순서라, 다음 행동이 자연스럽게 "정보 더 보기"가 된다.
 *  · 배경도 제품 사진 한 장이 아니라 "그 물건이 놓이는 자리" 영상을 쓴다.
 *
 * 공통으로 지키는 것(E 와 동일):
 *  · 종이색 배경 · Pretendard · EDITORIAL 팔레트 (같은 채널로 보이게)
 *  · 대가성 고지는 본편 첫 화면부터 끝까지 (ChipWithDisclosure)
 *  · 자막 외곽선·노래방 스타일 없음
 *  · 첫 프레임 커버 1장은 썸네일 전용 (고지 없음 - 바로 다음 화면부터 나온다)
 *
 * 배경 영상 라벨(중요): 우리가 쓰는 배경은 스톡·연출 소재이지 "그 제품을 쓰는
 * 영상"이 아니다. 오인 소지를 없애려고 창 안에 작게 "사용 상황 예시"를 띄운다.
 * 판매자 상세페이지 영상·리뷰 영상은 어떤 경우에도 쓰지 않는다.
 */

const CONTENT_W = VIDEO.width - E.safeX * 2;

/** 절제된 팝인 (E 와 같은 모션 언어 - 채널 톤 유지) */
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

const NumberChip: React.FC<{ displayNumber: number }> = ({ displayNumber }) => (
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
    <span style={{ opacity: 0.85, fontSize: 30 }}>메모장</span>
    <span style={{ fontWeight: 800, fontSize: 42 }}>{displayNumber}번</span>
  </div>
);

/** 대가성 고지 - 문구·크기 모두 TemplateE / TemplateTop10 과 통일 */
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
 * 번호 칩 + 고지 2줄 고정 블록.
 * 고지 줄이 제품명 길이에 밀리지 않도록 flexShrink:0 을 반드시 유지한다
 * (TemplateE 에서 실측으로 찾은 문제 - 긴 제품명이 칩을 찌그러뜨렸다).
 */
const ChipWithDisclosure: React.FC<{
  displayNumber: number;
  trailing?: React.ReactNode;
}> = ({ displayNumber, trailing }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
      <div style={{ flexShrink: 0 }}>
        <NumberChip displayNumber={displayNumber} />
      </div>
      {trailing}
    </div>
    <DisclosureTag />
  </div>
);

/** 제품 사진 - 로드 실패해도 렌더가 죽지 않게 이모지로 떨어진다 */
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
 * 배경 클립.
 *
 * onError 를 다는 이유: 이게 없으면 Remotion 이 cancelRender() 로 렌더를 즉시
 * 죽인다. 달아두면 최소한 "이 컷만 비는" 쪽으로 흘러간다.
 *
 * 다만 이것만으로 안전해지지는 않는다(실측 2026-09-06). 파일이 아예 없으면
 * Remotion 은 onError 를 부르고도 delayRender() 핸들을 닫지 않아, 결국 28초 뒤
 * 타임아웃으로 렌더가 실패한다. 그래서 진짜 방어선은 워커 쪽이다 -
 * 렌더에 넘기기 전에 존재하는 파일만 남긴다(src/lib/brollCatalog.ts
 * existingBrollFiles). 여기 onError 는 그 뒤에 남는 예외(코덱 문제 등)를 위한
 * 2차 그물이다.
 */
const SafeBroll: React.FC<{ file: string }> = ({ file }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    <OffthreadVideo
      src={staticFile(`assets/broll/${file}`)}
      muted
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
};

/** "사용 상황 예시" 안내 - 배경이 실제 제품 사용 영상으로 오해되지 않게 */
const SceneNotice: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: 20,
      top: 18,
      background: "rgba(36,33,30,0.62)",
      color: "rgba(255,255,255,0.94)",
      borderRadius: 999,
      padding: "8px 18px",
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "-0.01em",
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </div>
);

/**
 * 상황 창 - 그 물건이 놓이는 자리를 보여준다.
 * 배경 클립이 없으면 제품 사진만 크게 (라벨도 띄우지 않는다 - 사진은 상품 사진이라
 * 오해할 여지가 없다).
 */
const SceneWindow: React.FC<{
  props: ShortsProps;
  cutSeconds: number[];
  fromSecond: number;
  toSecond: number;
  /** 제품 사진을 함께 얹을지 (첫 화면에서는 크게, 본문에서는 작게) */
  productOverlaySize?: number;
}> = ({ props, cutSeconds, fromSecond, toSecond, productOverlaySize = 410 }) => {
  const files = props.brollFiles ?? [];
  const durations = props.brollDurations ?? [];
  const notice = props.brollNotice ?? null;

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
        <>
          {cutSeconds.map((startSec, i) => {
            const endSec = i + 1 < cutSeconds.length ? cutSeconds[i + 1] : toSecond;
            if (endSec <= startSec) return null;
            const file = files[i % files.length];
            const clipFrames = durations[i % files.length]
              ? Math.max(1, Math.round(durations[i % files.length] * VIDEO.fps))
              : null;
            const seqFrames = f(endSec - startSec);
            const video = <SafeBroll file={file} />;
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
          <div
            style={{
              position: "absolute",
              left: 28,
              top: "50%",
              transform: "translateY(-50%)",
              width: productOverlaySize,
              height: productOverlaySize,
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
          {/* 배경이 스톡·연출이면 반드시 라벨을 띄운다 */}
          {notice ? <SceneNotice text={notice} /> : null}
        </>
      ) : (
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

/**
 * 본편 첫 화면: 생활 상황 훅 + 공감 + 상황 창(제품은 창 안에 카드로).
 *
 * E 의 Poster 와 다른 점은 아래 사진 자리다. E 는 제품 사진 카드 한 장이고,
 * 여기서는 "그 물건이 놓이는 자리"가 배경으로 깔리고 제품이 그 위에 얹힌다.
 * 배경이 없으면 자동으로 E 와 같은 모습(제품 사진 카드)이 된다.
 */
const SituationPoster: React.FC<{
  props: ShortsProps;
  empathyDelayFrames: number;
  toSecond: number;
}> = ({ props, empathyDelayFrames, toSecond }) => {
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
        <div
          style={{
            color: E.ink,
            fontSize: hookSize,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
            textAlign: "left",
            textWrap: "balance",
          }}
        >
          {words.map((w, i) => (
            <React.Fragment key={i}>
              <span style={wordStyle(i)}>{w}</span>
              {i < words.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </div>
        <div
          style={{
            color: E.sub,
            fontSize: 46,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            wordBreak: "keep-all",
            textWrap: "balance",
            textAlign: "left",
            opacity: empathyIn,
            transform: `translateY(${(1 - empathyIn) * 24}px)`,
          }}
        >
          {props.empathyLine}
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 380,
            opacity: cardIn,
            transform: `translateY(${(1 - cardIn) * 30}px)`,
          }}
        >
          <SceneWindow
            props={props}
            cutSeconds={[0]}
            fromSecond={0}
            toSecond={toSecond}
            productOverlaySize={360}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

type NoteRow = {
  label: string;
  labelBg: string;
  labelColor: string;
  text: string;
  fromSecond: number;
};

const NoteRowView: React.FC<{
  row: NoteRow;
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
          width: 148,
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
          // 라벨 칩이 E(132)보다 16px 넓어 본문 폭도 그만큼 줄여 잡는다
          fontSize: eRowTextSize(row.text) - 2,
          fontWeight: 600,
          lineHeight: 1.32,
          letterSpacing: "-0.01em",
          wordBreak: "keep-all",
          textWrap: "balance",
          paddingTop: 2,
        }}
      >
        {row.text}
      </div>
    </div>
  );
};

/**
 * CTA 카드 - "어디에 정리돼 있는지"만 담백하게.
 *
 * 클릭 명령("링크 클릭"), 긴급성("품절 전"), 최저가 단정은 쿠팡파트너스
 * 운영정책 위반이라 어떤 문구도 쓰지 않는다. 위치 안내는 정보 제공이다.
 */
const CtaCard: React.FC<{ displayNumber: number }> = ({ displayNumber }) => {
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
        gap: 14,
        padding: "0 48px",
        boxSizing: "border-box",
        opacity: rise.opacity,
        transform: rise.transform,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 30, fontWeight: 600 }}>
        제품명 · 가격 · 상세 정보
      </div>
      <div
        style={{
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 150,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}
      >
        {displayNumber}
        <span style={{ fontSize: "0.5em" }}>번</span>
      </div>
      <div
        style={{
          color: "#FFFFFF",
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1.35,
          textAlign: "center",
          wordBreak: "keep-all",
          textWrap: "balance",
        }}
      >
        살림템 메모장에 정리해 뒀어요
      </div>
    </div>
  );
};

/** 커버(썸네일) 전용 - E 와 같은 규격(COVER_BAND)이라 피드에서 한 채널로 읽힌다 */
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
          textWrap: "balance",
          textAlign: "left",
        }}
      >
        {props.hookLine}
      </div>
      <ProductCard
        imageUrl={props.productImageUrl}
        style={{ width: "100%", flex: 1, minHeight: COVER_BAND.cardMinHeight }}
      />
    </div>
  </AbsoluteFill>
);

export const TemplateEUseCase: React.FC<ShortsProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const T = resolveTiming(props.timing);
  const bodyFrom = T.product.from;
  const ctaFrom = T.cta.from;

  /**
   * 대본 7줄의 자리는 그대로 두고 라벨만 사용상황형으로 바꾼다.
   *   3번째 줄(benefit1) → 용도 / 4번째(benefit2) → 구조
   *   5번째(usageTip) → 확인 / 6번째(checkPoint) → 맞는 집
   * ai.ts 의 USECASE_PROMPT_BLOCK 이 각 자리에 그 성격의 문장을 채운다.
   */
  const rows: NoteRow[] = [
    {
      label: "용도",
      labelBg: E.green,
      labelColor: "#FFFFFF",
      text: props.benefit1,
      fromSecond: T.product.from,
    },
    {
      label: "구조",
      labelBg: E.green,
      labelColor: "#FFFFFF",
      text: props.benefit2,
      fromSecond: T.benefit2.from,
    },
    ...(props.usageTip && T.tip.to > T.tip.from
      ? [
          {
            label: "확인",
            labelBg: E.highlight,
            labelColor: E.ink,
            text: props.usageTip,
            fromSecond: T.tip.from,
          },
        ]
      : []),
    {
      label: "맞는 집",
      labelBg: E.ink,
      labelColor: "#FFFFFF",
      text: props.checkPoint,
      fromSecond: T.review.from,
    },
  ];

  // 상황 창 컷 경계 - 최대 3컷 (본문 시작 / 구조 / 맞는 집)
  const windowCuts = [
    ...new Set([bodyFrom, T.benefit2.from, T.review.from]),
  ].filter((s) => s < ctaFrom);

  return (
    <AbsoluteFill style={{ backgroundColor: E.paper, fontFamily: editorialFontFamily }}>
      <FontFaceStyle />
      <BgmAudio />

      {/* ── 첫 화면: 생활 상황 훅 + 공감 + 상황 창 ── */}
      <Sequence durationInFrames={f(T.empathy.to)}>
        <SituationPoster
          props={props}
          empathyDelayFrames={f(T.empathy.from)}
          toSecond={T.empathy.to}
        />
      </Sequence>
      <Sequence durationInFrames={f(T.hook.to)}>
        <Narration src={props.narration?.[0]} />
      </Sequence>
      <Sequence from={f(T.empathy.from)} durationInFrames={f(T.empathy.to - T.empathy.from)}>
        <Narration src={props.narration?.[1]} />
      </Sequence>

      {/* ── 본문: 용도 → 구조 → 확인 → 맞는 집 (쌓이고 끝까지 남는다) ── */}
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

            {/* 높이 526 = 936÷16×9 (E 와 같은 안전대 계산 - 헤더 90 + 26 + 526 + 26 +
                행 4개 최악 554 = 1222, 콘텐츠 안전대 1220px 여유 폭 안) */}
            <div style={{ width: "100%", height: 526, position: "relative" }}>
              <Sequence durationInFrames={f(ctaFrom - bodyFrom)} layout="none">
                <SceneWindow
                  props={props}
                  cutSeconds={windowCuts}
                  fromSecond={bodyFrom}
                  toSecond={ctaFrom}
                />
              </Sequence>
              <Sequence from={f(ctaFrom - bodyFrom)} layout="none">
                <CtaCard displayNumber={props.displayNumber} />
              </Sequence>
            </div>

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

      {/* 본문·CTA 나레이션 (슬롯 순서는 E 와 동일) */}
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

      {/* 썸네일 전용 커버 1프레임 */}
      <Sequence durationInFrames={COVER_FRAME_COUNT}>
        <CoverPoster props={props} />
      </Sequence>
    </AbsoluteFill>
  );
};

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
  const inCta = frame >= f(ctaFromSecond - bodyFromSecond);
  const isPast = !inCta && frame >= f(rowEnd - bodyFromSecond);
  return <NoteRowView row={row} isPast={isPast} bodyFromSecond={bodyFromSecond} />;
};
