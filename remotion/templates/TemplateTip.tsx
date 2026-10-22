import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Narration } from "../components/Narration";
import { INK, VIDEO } from "../config/videoConfig";
import { fontFamily, tapeFontFamily } from "../fonts";
import { CtaScene } from "../components/CtaScene";
import { Disclosure, type DisclosureMode } from "../components/Disclosure";

/**
 * 살림 정보 쇼츠 (2026-10-20 사장님 "추천대로 진행": 하루 6편을 정보 4 + 상품 2 로).
 * 상품·링크·광고 없이 "저장해 둘 만한" 살림 정보 한 가지를 단계 3~4개로 알려 준다.
 *
 * 화면: 배경 스톡(흐리고 어둡게) 위에 - 첫 장면 질문(훅) → 단계 카드(남색 번호 테이프 + 제목 + 설명) → 마무리 한 줄.
 * 디자인은 상품 영상과 같은 한 벌(흰 종이 카드 · 먹색 · 남색 번호 테이프, videoConfig INK).
 * 장면 길이는 나레이션 길이(segments, 초)를 그대로 따른다.
 *
 * 꿀팁 + 상품 마무리 (2026-10-22 사장님: "처음엔 상품 관련 생활 꿀팁, 마지막에 아주 짧게 상품 사진이랑 번호만 -
 * 계정을 유용한 정보 얻는 곳으로 만들어 사람을 모으자"): product 가 있으면 마무리 뒤에 상품 사진+번호 화면(CtaScene)을
 * 한 장면 붙인다. 이때만 하단 고지(Disclosure)를 띄운다 - 파트너스는 처음·끝 3초, 본인 상품은 off(캡션에만).
 */
export type TipStep = { title: string; detail: string };

export type TipProps = {
  topic: string;
  hook: string;
  steps: TipStep[];
  outro: string;
  brollFiles?: string[] | null;
  brollDurations?: number[] | null;
  /** [훅, 단계1..N, 마무리] 나레이션 (data URI) */
  narration?: (string | null)[] | null;
  /** [훅, 단계1..N, 마무리(, 상품)] 장면 길이(초) */
  segments?: number[] | null;
  /** 꿀팁 + 상품 마무리 영상이면 마지막 상품 화면 (없으면 순수 정보 영상 - 고지 없음) */
  product?: { displayNumber: number; imageUrl: string | null; ctaText: string } | null;
  disclosureText?: string | null;
  disclosureMode?: DisclosureMode | null;
};

export const defaultTipProps: TipProps = {
  topic: "수건 냄새",
  hook: "수건에서 꿉꿉한 냄새, 빨래 순서 하나로 달라져요",
  steps: [
    { title: "젖은 채 두지 않기", detail: "쓴 수건은 바로 펼쳐 말린 뒤 빨래통에 넣어요" },
    { title: "수건만 따로 빨기", detail: "옷과 섞으면 보풀이 엉켜 냄새가 잘 빠지지 않아요" },
    { title: "섬유유연제는 빼기", detail: "유연제가 남으면 물기를 덜 먹고 냄새가 배기 쉬워요" },
  ],
  outro: "저장해 두고 다음 빨래 때 한 번 해 보세요",
  brollFiles: null,
  brollDurations: null,
  narration: null,
  segments: null,
};

/** 나레이션이 없을 때 장면 길이 (초) */
export function tipSegments(p: TipProps): number[] {
  const n = p.steps.length + (p.product ? 3 : 2);
  if (p.segments && p.segments.length === n) return p.segments;
  return [3, ...p.steps.map(() => 4.2), 3, ...(p.product ? [3.4] : [])];
}

export function tipDurationSeconds(p: TipProps): number {
  return tipSegments(p).reduce((a, b) => a + b, 0);
}

const Dim: React.FC<{ strength: number }> = ({ strength }) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, 9], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        backdropFilter: `blur(${Math.round(28 * k * strength)}px)`,
        WebkitBackdropFilter: `blur(${Math.round(28 * k * strength)}px)`,
        background: `rgba(14, 15, 18, ${0.5 * k * strength})`,
      }}
    />
  );
};

/** 꼬리표 - 이 채널의 "살림 메모" 묶음이라는 표시. 가운데 글·카드 바로 위에 붙인다 (10/20 사장님 "글자랑 가운데랑 더 가깝게") */
const Label: React.FC<{ text: string; gap: number }> = ({ text, gap }) => (
  <div style={{ marginBottom: gap, display: "flex", justifyContent: "center" }}>
    <span
      style={{
        background: INK.tape,
        color: "#FFFFFF",
        fontFamily,
        fontWeight: 800,
        fontSize: 50,
        padding: "14px 30px",
        borderRadius: 3,
        letterSpacing: "0.03em",
      }}
    >
      {text}
    </span>
  </div>
);

const Hook: React.FC<{ text: string; topic: string }> = ({ text, topic }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <Label text={`살림 메모 · ${topic}`} gap={44} />
      <div
        style={{
          width: "84%",
          textAlign: "center",
          color: "#FFFFFF",
          fontFamily,
          fontWeight: 900,
          fontSize: 82,
          lineHeight: 1.26,
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
          textWrap: "balance",
          textShadow: "0 3px 0 rgba(0,0,0,0.28), 0 8px 26px rgba(0,0,0,0.45)",
          WebkitTextStroke: "2px rgba(0,0,0,0.55)",
          paintOrder: "stroke fill" as const,
          transform: `translateY(${(1 - pop) * 40}px)`,
          opacity: Math.min(1, pop * 1.5),
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const StepCard: React.FC<{ n: number; total: number; step: TipStep; topic: string }> = ({ n, total, step, topic }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 18 } });
  const cardW = width * 0.88;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      {/* 번호 테이프가 카드 위로 34px 튀어나오므로 그만큼 더 띄운다 */}
      <Label text={`살림 메모 · ${topic}`} gap={78} />
      <div
        style={{
          position: "relative",
          width: cardW,
          background: INK.paper,
          borderRadius: 8,
          padding: "100px 50px 60px",
          boxShadow: "0 24px 50px rgba(0,0,0,0.35)",
          transform: `translateY(${(1 - rise) * 90}px)`,
          opacity: Math.min(1, rise * 1.6),
          fontFamily,
        }}
      >
        {/* 번호 라벨 테이프 */}
        <div
          style={{
            position: "absolute",
            top: -34,
            left: 36,
            transform: "rotate(-4deg)",
            background: INK.tape,
            color: "#FFFFFF",
            fontFamily: tapeFontFamily,
            fontSize: 84,
            lineHeight: 1,
            padding: "16px 28px 10px",
            borderRadius: 3,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 5px 0 rgba(0,0,0,0.22)",
          }}
        >
          {n}
        </div>
        <div style={{ position: "absolute", top: 28, right: 36, color: INK.sub, fontSize: 38, fontWeight: 500 }}>
          {n} / {total}
        </div>
        <div
          style={{
            color: INK.ink,
            fontWeight: 900,
            fontSize: 86,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
          }}
        >
          {step.title}
        </div>
        <div
          style={{
            marginTop: 26,
            color: "#3F423E",
            fontWeight: 600,
            fontSize: 56,
            lineHeight: 1.48,
            wordBreak: "keep-all",
          }}
        >
          {step.detail}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", fontFamily }}>
      <div
        style={{
          width: "82%",
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.36,
          wordBreak: "keep-all",
          textWrap: "balance",
          textShadow: "0 3px 0 rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.45)",
          opacity: Math.min(1, pop * 1.5),
          transform: `translateY(${(1 - pop) * 30}px)`,
        }}
      >
        {text}
      </div>
      <div
        style={{
          marginTop: 48,
          color: "rgba(255,255,255,0.85)",
          fontFamily: tapeFontFamily,
          fontSize: 50,
          letterSpacing: "0.04em",
          opacity: pop,
        }}
      >
        살림템 메모장
      </div>
    </AbsoluteFill>
  );
};

export const TemplateTip: React.FC<TipProps> = (props) => {
  const seg = tipSegments(props);
  const fps = VIDEO.fps;
  const starts: number[] = [];
  let acc = 0;
  for (const s of seg) {
    starts.push(acc);
    acc += s;
  }
  const f = (s: number) => Math.round(s * fps);
  const outroIdx = props.steps.length + 1;
  const productIdx = props.product ? outroIdx + 1 : -1;
  return (
    <AbsoluteFill style={{ background: "#111214" }}>
      <Background
        brollFile={null}
        brollFiles={props.brollFiles ?? null}
        brollDurations={props.brollDurations ?? null}
        cutSeconds={starts}
        bgImageUrl={null}
      />
      {/* 훅: 배경을 살짝만 어둡게 */}
      <Sequence durationInFrames={f(seg[0])}>
        <Dim strength={0.45} />
        <Hook text={props.hook} topic={props.topic} />
        <Narration src={props.narration?.[0]} />
      </Sequence>
      {/* 단계 카드: 배경을 흐리고 어둡게 - 카드에 집중 */}
      {props.steps.map((st, i) => (
        <Sequence key={i} from={f(starts[i + 1])} durationInFrames={f(seg[i + 1])}>
          <Dim strength={1} />
          <StepCard n={i + 1} total={props.steps.length} step={st} topic={props.topic} />
          <Narration src={props.narration?.[i + 1]} />
        </Sequence>
      ))}
      <Sequence from={f(starts[outroIdx])} durationInFrames={f(seg[outroIdx])}>
        <Dim strength={0.8} />
        <Outro text={props.outro} />
        <Narration src={props.narration?.[outroIdx]} />
      </Sequence>
      {/* 상품 마무리: 사진 + 번호만 짧게 */}
      {props.product && (
        <Sequence from={f(starts[productIdx])} durationInFrames={f(seg[productIdx])}>
          <CtaScene
            displayNumber={props.product.displayNumber}
            ctaText={props.product.ctaText}
            productImageUrl={props.product.imageUrl}
          />
          <Narration src={props.narration?.[productIdx]} />
        </Sequence>
      )}
      {props.product && <Disclosure />}
    </AbsoluteFill>
  );
};
