import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Background } from "../components/Background";
import { Narration } from "../components/Narration";
import { INK, VIDEO } from "../config/videoConfig";
import { fontFamily, tapeFontFamily } from "../fonts";
import { CtaScene } from "../components/CtaScene";
import { splitPhrase } from "../components/phraseBreak";
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
  product?: { displayNumber: number; imageUrl: string | null; ctaText: string; heading?: string | null } | null;
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

/** 숫자를 우리말로 (딱 세 가지) */
export function countWord(n: number): string {
  return ["영", "한", "두", "세", "네", "다섯"][n] ?? String(n);
}

/** 강조 노랑 */
const HILITE = "#FFD84D";
const H = VIDEO.height;

/**
 * 2026-10-28 아트디렉터 검토(4/10 "PPT 슬라이드 - 볼 장면이 없다") 반영 개편:
 * - 배경 영상을 화면 위쪽(12~48%)에 선명하게 두고 아래만 어둡게 → 글·카드는 아래쪽(50~78%)에.
 * - 단계마다 배경이 천천히 다가온다(1.00→1.08).
 * - 띠·알약·"1/3"·번쩍임 같은 중복·장식은 뺐다. "오늘의 살림 꿀팁"(10/22 사장님 요청)은 작은 글자로만.
 * - 설명 문장은 카드에서 빼고 나레이션에 맞춰 2~3단어씩 자막으로(지금 말하는 단어 노랑).
 */

/** 위는 맑게, 아래는 어둡게 - 영상은 보이고 글은 읽히게 */
const Shade: React.FC<{ hook?: boolean }> = ({ hook }) => (
  <AbsoluteFill
    style={{
      background: hook
        ? "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 16%, rgba(10,10,12,0.55) 40%, rgba(10,10,12,0.72) 70%, rgba(10,10,12,0.8) 100%)"
        : "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.04) 14%, rgba(0,0,0,0.04) 40%, rgba(10,10,12,0.78) 56%, rgba(10,10,12,0.9) 100%)",
    }}
  />
);

/** 형광펜으로 칠해지는 글자 (줄이 바뀌어도 줄마다 칠한다) */
const Marker: React.FC<{ text: string; progress: number }> = ({ text, progress }) => (
  <span
    style={{
      color: INK.ink,
      backgroundImage: `linear-gradient(${HILITE}, ${HILITE})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `${Math.round(progress * 100)}% 100%`,
      boxDecorationBreak: "clone",
      WebkitBoxDecorationBreak: "clone",
      padding: "0 12px",
      borderRadius: 6,
      textShadow: "none",
    }}
  >
    {text}
  </span>
);

const Hook: React.FC<{ text: string; count: number }> = ({ text, count }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const punch = spring({ frame, fps, config: { damping: 14, stiffness: 200 } });
  // 형광펜은 첫 프레임부터 다 칠해 둔다 - 0프레임(피드에 처음 보이는 화면)에 글자가 묻히면 안 된다
  const mark = 1;
  void frame;
  const parts = splitPhrase(text);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.3 }}>
      <div style={{ color: "rgba(255,255,255,0.85)", fontFamily, fontWeight: 700, fontSize: 40, letterSpacing: "0.08em", marginBottom: 36 }}>
        오늘의 살림 꿀팁
      </div>
      <div
        style={{
          width: "88%",
          textAlign: "center",
          color: "#FFFFFF",
          fontFamily: tapeFontFamily,
          fontSize: 92,
          lineHeight: 1.3,
          wordBreak: "keep-all",
          textShadow: "0 4px 24px rgba(0,0,0,0.5)",
          transform: `scale(${1.1 - 0.1 * punch})`,
        }}
      >
        {parts ? (
          <>
            <Marker text={parts[0]} progress={mark} />
            <br />
            <span>{parts[1]}</span>
          </>
        ) : (
          <Marker text={text} progress={mark} />
        )}
      </div>
      <div style={{ marginTop: 44, color: HILITE, fontFamily: tapeFontFamily, fontSize: 54, textShadow: "0 3px 16px rgba(0,0,0,0.5)" }}>
        딱 {countWord(count)} 가지
      </div>
    </AbsoluteFill>
  );
};

/** 설명 문장을 나레이션에 맞춰 2~3단어씩 (지금 말하는 단어 노랑). 시점은 글자 수 비율로 어림한다. */
const WordCaption: React.FC<{ text: string; startFrame: number; endFrame: number }> = ({ text, startFrame, endFrame }) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || frame < startFrame) return null;
  // 단어 묶음: 최대 3단어·12자
  const chunks: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  words.forEach((w, i) => {
    if (cur.length && (cur.length >= 3 || len + w.length > 12)) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += w.length;
  });
  if (cur.length) chunks.push(cur);
  const total = words.reduce((a, w) => a + w.length + 1, 0);
  const p = Math.min(0.999, (frame - startFrame) / Math.max(1, endFrame - startFrame));
  let acc = 0;
  let wi = words.length - 1;
  for (let i = 0; i < words.length; i++) {
    acc += words[i].length + 1;
    if (acc / total > p) {
      wi = i;
      break;
    }
  }
  const chunk = chunks.find((c) => c.includes(wi)) ?? chunks[chunks.length - 1];
  return (
    <div
      style={{
        position: "absolute",
        top: H * 0.36,
        left: 0,
        width: "100%",
        textAlign: "center",
        fontFamily,
        fontWeight: 900,
        fontSize: 68,
        letterSpacing: "-0.02em",
        color: "#FFFFFF",
        textShadow: "0 3px 0 rgba(0,0,0,0.35), 0 6px 22px rgba(0,0,0,0.6)",
      }}
    >
      {chunk.map((i) => (
        <span key={i} style={{ color: i === wi ? HILITE : "#FFFFFF" }}>
          {words[i]}{" "}
        </span>
      ))}
    </div>
  );
};

const StepCard: React.FC<{ n: number; step: TipStep; segFrames: number }> = ({ n, step, segFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 15, stiffness: 170 } });
  // 나레이션은 "제목. 설명" - 설명이 시작되는 때를 글자 수 비율로 어림
  const titleShare = step.title.length / (step.title.length + step.detail.length + 2);
  const detailStart = Math.round(segFrames * titleShare * 0.9);
  return (
    <AbsoluteFill>
      <WordCaption text={step.detail} startFrame={detailStart} endFrame={segFrames - 12} />
      <div
        style={{
          position: "absolute",
          top: H * 0.53,
          left: width * 0.06,
          width: width * 0.88,
          background: INK.paper,
          borderRadius: 10,
          padding: "70px 52px 54px",
          boxShadow: "0 24px 50px rgba(0,0,0,0.4)",
          transform: `translateY(${(1 - rise) * 80}px)`,
          opacity: Math.min(1, rise * 2),
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -40,
            left: 40,
            transform: "rotate(-4deg)",
            background: INK.tape,
            color: "#FFFFFF",
            fontFamily: tapeFontFamily,
            fontSize: 88,
            lineHeight: 1,
            padding: "16px 30px 10px",
            borderRadius: 3,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 5px 0 rgba(0,0,0,0.22)",
          }}
        >
          {n}
        </div>
        <div style={{ color: INK.ink, fontFamily: tapeFontFamily, fontSize: 84, lineHeight: 1.22, wordBreak: "keep-all", textWrap: "balance" }}>
          {step.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 마무리 요약 - 세 단계를 한 번에 (저장·다시 보기를 부르는 장면) */
const Recap: React.FC<{ steps: TipStep[] }> = ({ steps }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: H * 0.44, width: "100%", textAlign: "center", color: HILITE, fontFamily: tapeFontFamily, fontSize: 60, textShadow: "0 3px 16px rgba(0,0,0,0.5)" }}>
        정리
      </div>
      <div style={{ position: "absolute", top: H * 0.51, left: width * 0.06, width: width * 0.88, display: "flex", flexDirection: "column", gap: 20 }}>
        {steps.map((st, i) => {
          const k = spring({ frame: frame - i * 5, fps, config: { damping: 15 } });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                background: INK.paper,
                borderRadius: 10,
                padding: "20px 28px",
                transform: `translateX(${(1 - k) * 90}px)`,
                opacity: Math.min(1, k * 2),
              }}
            >
              <span style={{ background: INK.tape, color: "#FFFFFF", fontFamily: tapeFontFamily, fontSize: 52, lineHeight: 1, padding: "10px 18px 6px", borderRadius: 3 }}>
                {i + 1}
              </span>
              <span style={{ color: INK.ink, fontFamily: tapeFontFamily, fontSize: 58, wordBreak: "keep-all" }}>{st.title}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** 진행 막대 - 쇼츠·릴스 위쪽 버튼 아래(화면 13%)에 */
const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: H * 0.13, left: width * 0.06, width: width * 0.88, height: 10, borderRadius: 5, background: "rgba(255,255,255,0.28)" }}>
      <div style={{ width: `${Math.min(100, (frame / durationInFrames) * 100)}%`, height: "100%", borderRadius: 5, background: HILITE }} />
    </div>
  );
};

/** 장면 전환 효과음 (ffmpeg 로 직접 만든 소리 - public/sfx, 저작권 없음) */
const Sfx: React.FC<{ name: "pop" | "whoosh"; volume?: number }> = ({ name, volume = 0.35 }) => (
  <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
);

export const TemplateTip: React.FC<TipProps> = (props) => {
  const frame = useCurrentFrame();
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
  // 장면마다 배경이 천천히 다가온다 (1.00 → 1.08)
  const t = frame / fps;
  let si = 0;
  for (let i = 0; i < starts.length; i++) if (t >= starts[i]) si = i;
  const local = Math.min(1, (t - starts[si]) / Math.max(0.1, seg[si]));
  return (
    <AbsoluteFill style={{ background: "#111214" }}>
      <AbsoluteFill style={{ transform: `scale(${1 + 0.08 * local})` }}>
        <Background
          brollFile={null}
          brollFiles={props.brollFiles ?? null}
          brollDurations={props.brollDurations ?? null}
          cutSeconds={starts}
          bgImageUrl={null}
        />
      </AbsoluteFill>
      <Sequence durationInFrames={f(seg[0])}>
        <Shade hook />
        <Hook text={props.hook} count={props.steps.length} />
        <Sfx name="pop" />
        <Narration src={props.narration?.[0]} />
      </Sequence>
      {props.steps.map((st, i) => (
        <Sequence key={i} from={f(starts[i + 1])} durationInFrames={f(seg[i + 1])}>
          <Shade />
          <StepCard n={i + 1} step={st} segFrames={f(seg[i + 1])} />
          <Sfx name="whoosh" volume={0.3} />
          <Narration src={props.narration?.[i + 1]} />
        </Sequence>
      ))}
      <Sequence from={f(starts[outroIdx])} durationInFrames={f(seg[outroIdx])}>
        <Shade />
        <Recap steps={props.steps} />
        <Sfx name="whoosh" volume={0.3} />
        <Narration src={props.narration?.[outroIdx]} />
      </Sequence>
      {props.product && (
        <Sequence from={f(starts[productIdx])} durationInFrames={f(seg[productIdx])}>
          <CtaScene
            displayNumber={props.product.displayNumber}
            ctaText={props.product.ctaText}
            productImageUrl={props.product.imageUrl}
            heading={props.product.heading}
            large
          />
          <Narration src={props.narration?.[productIdx]} />
        </Sequence>
      )}
      <ProgressBar />
      {/* 고지: 아래 캡션·버튼에 덜 가리게 화면 74% 선 (아트디렉터) */}
      {props.product && <Disclosure bottomPx={Math.round(H * 0.26)} />}
    </AbsoluteFill>
  );
};
