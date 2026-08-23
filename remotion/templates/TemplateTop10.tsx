import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EDITORIAL as E, top10NameFontSize, BGM } from "../config/videoConfig";
import { editorialFontFamily } from "../fonts";
import { FontFaceStyle } from "../components/FontFaceStyle";

/**
 * 유튜브 롱폼 "TOP10" 컴포지션 (1280x720, 24fps).
 *
 * 렌더 시간 실측(2026-08-22): 1280x720/24fps/3분59초 영상이 GH Actions 퍼블릭
 * 러너와 동일 사양(로컬 4코어)에서 3분48초에 완성 - 30분 제한에 8배 여유.
 *
 * 디자인: TemplateE(살림 검증 노트)의 브랜드 톤을 그대로 가져온다 - 종이색 배경,
 * 카드 문법(EDITORIAL.card/line/radius), 포인트색(토마토)을 숏폼과 통일해
 * "같은 채널"로 보이게 한다. 순위 콘텐츠 전용 장치로 상단 진행 바(몇 위까지
 * 왔는지 항상 보임 - 롱폼 이탈 방지)와 1~3위 강조(카운트다운 페이오프)를 더했다.
 *
 * 나레이션: 각 상품의 숏폼 대본(hookText/empathyLine/benefit1 - 이미 정책 검증을
 * 거친 문구)을 그대로 재사용한다(src/lib/longform.ts). 새 AI 호출이 없어 비용도
 * 늘지 않는다. TTS 는 렌더 전 워커가 미리 합성해 실측 길이(narrationSeconds)를
 * props 로 넘기고, 각 카드 노출 시간은 그 실측 길이 기준으로 계산한다(고정 시간이
 * 아님 - 숏폼 render-worker 의 나레이션 기반 컷 타이밍과 같은 방식).
 */

export type Top10Item = {
  rank: number;
  displayNumber: number;
  productName: string;
  imageUrl: string | null;
  priceText: string;
  category: string;
  /** 장점 두 줄 (숏폼 대본 재사용) - 나레이션 진행에 맞춰 순서대로 화면에 띄운다 */
  benefit1?: string;
  benefit2?: string;
  /** data:audio/... 나레이션 (워커가 사전 합성). 없으면 무음으로 고정 최소 길이만 노출 */
  narrationUri?: string | null;
  /** 나레이션 실측 길이(초) */
  narrationSeconds?: number | null;
};

export type Top10Props = {
  categoryLabel: string;
  items: Top10Item[]; // 10위 -> 1위 순으로 정렬해서 전달
  introNarrationUri?: string | null;
  introNarrationSeconds?: number | null;
  outroNarrationUri?: string | null;
  outroNarrationSeconds?: number | null;
};

export const TOP10_FPS = 24;
export const TOP10_WIDTH = 1280;
export const TOP10_HEIGHT = 720;

/** 나레이션 뒤 여유(초) - 문장이 끝나자마자 컷되지 않게 */
const ITEM_PAD_SECONDS = 2.2;
const MIN_ITEM_SECONDS = 10;
const MAX_ITEM_SECONDS = 26;
/** 나레이션이 없을 때(TTS 실패)만 쓰는 고정값 */
const FALLBACK_ITEM_SECONDS = 16;

function itemSeconds(item: Top10Item): number {
  if (!item.narrationSeconds) return FALLBACK_ITEM_SECONDS;
  const raw = item.narrationSeconds + ITEM_PAD_SECONDS;
  return Math.min(MAX_ITEM_SECONDS, Math.max(MIN_ITEM_SECONDS, raw));
}

const MIN_INTRO_SECONDS = 5;
const MIN_OUTRO_SECONDS = 12;
const INTRO_PAD_SECONDS = 1.4;
const OUTRO_PAD_SECONDS = 3;

function introSeconds(props: Top10Props): number {
  if (!props.introNarrationSeconds) return MIN_INTRO_SECONDS + 2;
  return Math.max(MIN_INTRO_SECONDS, props.introNarrationSeconds + INTRO_PAD_SECONDS);
}

function outroSeconds(props: Top10Props): number {
  if (!props.outroNarrationSeconds) return MIN_OUTRO_SECONDS;
  return Math.max(MIN_OUTRO_SECONDS, props.outroNarrationSeconds + OUTRO_PAD_SECONDS);
}

/** 1~3위는 카운트다운의 보상 구간이라 배지·타이포를 키운다 */
const isTopThree = (rank: number) => rank <= 3;

/**
 * 장점 두 줄이 나타날 시점(초, 카드 시작 기준 - Sequence 로컬 프레임과 맞음).
 * 나레이션이 "N위, 이름. 훅 [장점1] [장점2]" 순서로 합성되므로, 그 비율을
 * 글자수로 추정해 장점 문구가 화면에도 그 타이밍쯤 나타나게 한다(정확한 워드
 * 타임스탬프는 없어 근사치다 - 목적은 카드가 오래 떠 있어도 화면이 한 번씩
 * 바뀌게 하는 것이라 완벽히 맞을 필요는 없다).
 */
const BENEFIT_INTRO_FRACTION = 0.24; // "N위, 이름. 훅" 구간이 차지할 것으로 보는 비율
function benefitRevealSeconds(item: Top10Item): { b1: number; b2: number } {
  const total = item.narrationSeconds ?? 0;
  const b1Len = item.benefit1?.length ?? 0;
  const b2Len = item.benefit2?.length ?? 0;
  const bTotal = b1Len + b2Len || 1;
  const introSec = total * BENEFIT_INTRO_FRACTION;
  const remain = total - introSec;
  return { b1: introSec, b2: introSec + remain * (b1Len / bTotal) };
}

/**
 * 각 상품 카드의 시작 시각(초, 인트로 뒤부터 누적) + 노출 시간.
 * Root.tsx 의 calculateMetadata·본문 Sequence 커서·설명란 타임스탬프(src/lib/longform.ts)
 * 가 전부 이 한 함수를 공유해야 셋이 어긋나지 않는다.
 */
export function top10Ranges(
  props: Top10Props
): Array<{ item: Top10Item; from: number; dur: number }> {
  let cursor = introSeconds(props);
  return props.items.map((item) => {
    const dur = itemSeconds(item);
    const from = cursor;
    cursor += dur;
    return { item, from, dur };
  });
}

export function top10DurationSeconds(props: Top10Props): number {
  const ranges = top10Ranges(props);
  const last = ranges[ranges.length - 1];
  const bodyEnd = last ? last.from + last.dur : introSeconds(props);
  return bodyEnd + outroSeconds(props);
}

const secToFrame = (s: number) => Math.round(s * TOP10_FPS);

/** 배경음악. Background.tsx 의 BgmAudio 와 같은 트랙이지만 fps 를 이 컴포지션(24)
 *  기준으로 직접 계산한다 - 그쪽은 숏폼 fps(30) 상수를 쓰고 있어 그대로 재사용하면
 *  페이드 길이가 어긋난다. */
const LongformBgm: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();
  const fadeFrames = Math.round(BGM.fadeOutSeconds * fps);
  return (
    <Audio
      src={staticFile(BGM.file)}
      loop
      loopVolumeCurveBehavior="extend"
      volume={(f) =>
        interpolate(
          f,
          [0, 12, durationInFrames - fadeFrames, durationInFrames],
          [0, BGM.volume, BGM.volume, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      }
    />
  );
};

/**
 * 상단 진행 바 - 10칸, 현재 순위까지 채워진다.
 * 롱폼은 이탈이 관건이라 "얼마나 왔는지"를 항상 보여주는 게 컨설팅 답변에 없던
 * 리텐션 장치다. 왼쪽 = 10위(시작), 오른쪽 = 1위(끝).
 */
const ProgressBar: React.FC<{ rank: number }> = ({ rank }) => {
  const passedCount = 10 - rank; // rank=10 이면 0칸, rank=1 이면 9칸 채워짐(현재 칸은 아래서 강조)
  return (
    <div
      style={{
        position: "absolute",
        top: 32,
        left: 64,
        right: 64,
        display: "flex",
        gap: 6,
      }}
    >
      {Array.from({ length: 10 }, (_, i) => {
        const segRank = 10 - i;
        const done = i < passedCount;
        const current = segRank === rank;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: current ? E.accent : done ? E.green : E.line,
              opacity: current ? 1 : done ? 0.55 : 0.6,
            }}
          />
        );
      })}
    </div>
  );
};

const CategoryTag: React.FC<{ label: string }> = ({ label }) => (
  <span
    style={{
      display: "inline-block",
      background: E.green,
      color: "#FFFFFF",
      borderRadius: 999,
      padding: "6px 16px",
      fontSize: 18,
      fontWeight: 600,
      width: "fit-content",
    }}
  >
    {label}
  </span>
);

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
  const top3 = isTopThree(rank);
  const size = top3 ? 132 : 104;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: top3
          ? `linear-gradient(160deg, ${E.accent} 0%, #C94A32 100%)`
          : E.ink,
        color: "#FFFFFF",
        fontWeight: 800,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        flexShrink: 0,
        boxShadow: top3
          ? "0 14px 32px rgba(233,95,69,0.38)"
          : "0 8px 20px rgba(36,33,30,0.18)",
      }}
    >
      <span style={{ fontSize: top3 ? 56 : 44 }}>{rank}</span>
      <span style={{ fontSize: top3 ? 24 : 18, opacity: 0.85 }}>위</span>
    </div>
  );
};

/** 장점 한 줄 - revealSeconds 시점에 페이드인 (카드가 오래 떠 있어도 화면이 바뀌게) */
const BenefitLine: React.FC<{
  text?: string;
  revealSeconds: number;
  frame: number;
  fps: number;
}> = ({ text, revealSeconds, frame, fps }) => {
  if (!text) return null;
  const local = frame - revealSeconds * fps;
  const p = interpolate(local, [0, fps * 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        opacity: p,
        transform: `translateY(${(1 - p) * 10}px)`,
      }}
    >
      <span style={{ color: E.accent, fontWeight: 800, fontSize: 22, lineHeight: 1.4 }}>✓</span>
      <span
        style={{
          fontSize: 24,
          color: E.ink,
          fontWeight: 600,
          lineHeight: 1.35,
          wordBreak: "keep-all",
        }}
      >
        {text}
      </span>
    </div>
  );
};

const ProductCard: React.FC<{ item: Top10Item }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 22 } });
  const benefitReveal = benefitRevealSeconds(item);
  const top3 = isTopThree(item.rank);
  // 1~3위는 등장 시 살짝 더 튀어 보이게(카운트다운 보상감)
  const pop = top3
    ? spring({ frame, fps, config: { damping: 12, mass: 0.6 } })
    : 1;

  return (
    <AbsoluteFill
      style={{
        fontFamily: editorialFontFamily,
        backgroundColor: E.paper,
        opacity: slide,
        transform: `translateX(${(1 - slide) * 40}px)`,
      }}
    >
      {item.narrationUri ? <Audio src={item.narrationUri} /> : null}
      <ProgressBar rank={item.rank} />
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 64,
          right: 64,
          bottom: 56,
          display: "flex",
          alignItems: "center",
          gap: 48,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 400,
            height: 400,
            flexShrink: 0,
            background: E.card,
            borderRadius: E.radius,
            border: `1px solid ${E.line}`,
            boxShadow: "0 14px 40px rgba(36,33,30,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "visible",
          }}
        >
          <div style={{ width: "88%", height: "88%", overflow: "hidden" }}>
            {item.imageUrl ? (
              <Img
                src={item.imageUrl}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: 120 }}>🧺</span>
            )}
          </div>
          {/* 배지를 카드 모서리에 겹쳐 - 순위가 "표"가 아니라 "도장"처럼 보이게 */}
          <div
            style={{
              position: "absolute",
              top: -22,
              left: -22,
              transform: `scale(${0.85 + pop * 0.15})`,
            }}
          >
            <RankBadge rank={item.rank} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <CategoryTag label={item.category} />
          <div
            style={{
              fontSize: top10NameFontSize(item.productName, top3),
              fontWeight: 800,
              color: E.ink,
              lineHeight: 1.28,
              wordBreak: "keep-all",
              textWrap: "balance",
            }}
          >
            {item.productName}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <BenefitLine
              text={item.benefit1}
              revealSeconds={benefitReveal.b1}
              frame={frame}
              fps={fps}
            />
            <BenefitLine
              text={item.benefit2}
              revealSeconds={benefitReveal.b2}
              frame={frame}
              fps={fps}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 30, color: E.accent, fontWeight: 800 }}>
              {item.priceText}
            </span>
            <span
              style={{
                fontSize: 20,
                color: E.sub,
                fontWeight: 600,
                background: "#FFFFFF",
                border: `1px solid ${E.line}`,
                borderRadius: 999,
                padding: "4px 14px",
              }}
            >
              N{item.displayNumber}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ categoryLabel: string; narrationUri?: string | null }> = ({
  categoryLabel,
  narrationUri,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const in1 = spring({ frame, fps, config: { damping: 20 } });
  const glow = interpolate(frame, [0, fps * 3], [0.5, 0.85], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        fontFamily: editorialFontFamily,
        backgroundColor: E.ink,
        overflow: "hidden",
      }}
    >
      {narrationUri ? <Audio src={narrationUri} /> : null}
      {/* 종이색 글로우 - 완전히 검지 않게, 브랜드 톤을 남긴다 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 50% at 50% 40%, rgba(247,243,234,${glow * 0.14}) 0%, rgba(247,243,234,0) 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          color: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          textAlign: "center",
          padding: 80,
          opacity: in1,
          transform: `translateY(${(1 - in1) * 20}px)`,
        }}
      >
        <span
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 999,
            padding: "6px 18px",
          }}
        >
          [광고] 쿠팡파트너스 활동의 일환으로 수수료를 제공받습니다
        </span>
        <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-0.02em" }}>
          {categoryLabel}{" "}
          <span style={{ color: E.accent }}>TOP10</span>
        </div>
        <div style={{ fontSize: 26, opacity: 0.75 }}>
          반응이 좋았던 아이템을 모아 정리했어요 · 10위부터 공개합니다
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ items: Top10Item[]; narrationUri?: string | null }> = ({
  items,
  narrationUri,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const in1 = spring({ frame, fps, config: { damping: 20 } });
  const ranked = items.slice().reverse(); // 1위 -> 10위

  return (
    <AbsoluteFill
      style={{
        fontFamily: editorialFontFamily,
        backgroundColor: E.paper,
        padding: 56,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {narrationUri ? <Audio src={narrationUri} /> : null}
      <div style={{ fontSize: 36, fontWeight: 800, color: E.ink, marginBottom: 20 }}>
        오늘의 TOP10 요약
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 14,
          opacity: in1,
          transform: `translateY(${(1 - in1) * 16}px)`,
        }}
      >
        {ranked.map((it) => (
          <div
            key={it.rank}
            style={{
              background: E.card,
              border: `1px solid ${E.line}`,
              borderRadius: 16,
              padding: "14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: isTopThree(it.rank) ? E.accent : E.ink,
                }}
              >
                {it.rank}위
              </span>
              <span style={{ fontSize: 15, color: E.sub }}>N{it.displayNumber}</span>
            </div>
            <div
              style={{
                fontSize: 16,
                color: E.ink,
                fontWeight: 600,
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {it.productName}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28, fontSize: 22, color: E.sub }}>
        상품 정보는 설명란 각 순위 옆 링크에 정리했습니다
      </div>
    </AbsoluteFill>
  );
};

export const TemplateTop10: React.FC<Top10Props> = (props) => {
  const { categoryLabel, items } = props;
  const introDur = introSeconds(props);
  const outroDur = outroSeconds(props);
  const ranges = top10Ranges(props);
  const last = ranges[ranges.length - 1];
  const outroFrom = last ? last.from + last.dur : introDur;

  return (
    <AbsoluteFill>
      <FontFaceStyle />
      <LongformBgm />
      <Sequence durationInFrames={secToFrame(introDur)}>
        <Intro categoryLabel={categoryLabel} narrationUri={props.introNarrationUri} />
      </Sequence>
      {ranges.map(({ item, from, dur }) => (
        <Sequence key={item.rank} from={secToFrame(from)} durationInFrames={secToFrame(dur)}>
          <ProductCard item={item} />
        </Sequence>
      ))}
      <Sequence from={secToFrame(outroFrom)} durationInFrames={secToFrame(outroDur)}>
        <Outro items={items} narrationUri={props.outroNarrationUri} />
      </Sequence>
    </AbsoluteFill>
  );
};
