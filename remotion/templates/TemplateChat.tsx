import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Narration } from "../components/Narration";
import { MEMO as INK, VIDEO } from "../config/videoConfig";
import { fontFamily, tapeFontFamily } from "../fonts";
import { CtaScene } from "../components/CtaScene";
import { Disclosure, type DisclosureMode } from "../components/Disclosure";
import { FontFaceStyle } from "../components/FontFaceStyle";

/**
 * 대화형 드라마 쇼츠 (2026-10-31 사장님 "스토리가 들어간 드라마 타이즈 릴스" → 추천안 "대화형" 샘플).
 * 메신저 대화가 한 줄씩 올라오고 두 목소리가 주고받는다. 이야기 속에서 검수본 꿀팁이 풀리고,
 * 마지막에 "팔로우" 한 마디 → "오늘의 추천 상품도 알려드릴게요" → 상품 사진·번호.
 * - "연출된 이야기" 표시는 2026-10-31 사장님 요청으로 뺐다. 대신 등장인물이 상품을 써 봤다·좋았다고 말하지 않는다(후기로 오인 방지 - 대본 검사가 막는다).
 * - 특정 메신저 모양·색(상표)을 흉내 내지 않고 메모지 팔레트(MEMO)만 쓴다.
 */
export type ChatLine = { who: "a" | "b"; text: string };

export type ChatProps = {
  title: string;
  names: { a: string; b: string };
  lines: ChatLine[];
  /** [대사1..N, 팔로우, 상품] 나레이션 */
  narration?: (string | null)[] | null;
  /** [대사1..N, 팔로우, 상품] 장면 길이(초) */
  segments?: number[] | null;
  product?: { displayNumber: number; imageUrl: string | null; ctaText: string; heading?: string | null } | null;
  disclosureText?: string | null;
  disclosureMode?: DisclosureMode | null;
  /** 대화 뒤 팔로우 한 줄 (2026-10-31 사장님) */
  followText?: string | null;
};

export const defaultChatProps: ChatProps = {
  title: "엄마가 내 책상 밑을 보더니",
  names: { a: "엄마", b: "나" },
  lines: [
    { who: "a", text: "너 책상 밑 이게 다 뭐야?" },
    { who: "b", text: "전선이지 뭐. 발에 자꾸 걸려" },
    { who: "a", text: "멀티탭을 왜 바닥에 뒀어?" },
  ],
  narration: null,
  segments: null,
  product: null,
};

export function chatSegments(p: ChatProps): number[] {
  const n = p.lines.length + 1 + (p.product ? 1 : 0);
  if (p.segments && p.segments.length === n) return p.segments;
  return [...p.lines.map((l) => Math.max(1.6, l.text.length * 0.11)), 2, ...(p.product ? [3.4] : [])];
}

export function chatDurationSeconds(p: ChatProps): number {
  return chatSegments(p).reduce((a, b) => a + b, 0);
}

const H = VIDEO.height;
/** 대사 소리 시작 지연(프레임) - 렌더 워커는 장면 길이에 이만큼(0.1초)을 더해 둔다 */
export const VOICE_DELAY = 3;
const W = VIDEO.width;
const FONT = 54;
const LINE_H = 74;
const BUBBLE_MAX = 720;
const PAD_X = 34;
const PAD_Y = 22;
const NAME_H = 44;
const GAP = 26;
/** 대화 칸: 제목 아래 ~ 하단 고지·쇼츠 UI 위 */
const CHAT_TOP = H * 0.27;
const CHAT_BOTTOM = H * 0.71;

/** 말풍선 높이 어림 (한글 50px ≈ 글자당 48px) - 넘치면 위로 밀어 올리는 데만 쓴다 */
function bubbleHeight(l: ChatLine, prev?: ChatLine): number {
  const perLine = Math.floor((BUBBLE_MAX - PAD_X * 2) / (FONT * 0.96));
  const rows = Math.max(1, Math.ceil(l.text.length / perLine));
  const showName = l.who === "a" && prev?.who !== "a";
  return rows * LINE_H + PAD_Y * 2 + (showName ? NAME_H : 0) + GAP;
}

const Bubble: React.FC<{ line: ChatLine; name: string; showName: boolean; enterFrame: number }> = ({
  line,
  name,
  showName,
  enterFrame,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: frame - enterFrame, fps, config: { damping: 14, stiffness: 190 } });
  const mine = line.who === "b";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        marginBottom: GAP,
        opacity: Math.min(1, k * 2),
        transform: `translateY(${(1 - k) * 40}px) scale(${0.9 + 0.1 * k})`,
        transformOrigin: mine ? "100% 100%" : "0% 100%",
      }}
    >
      {showName && (
        <div style={{ height: NAME_H, color: INK.ink, opacity: 0.6, fontFamily, fontWeight: 700, fontSize: 32, paddingLeft: 8 }}>
          {name}
        </div>
      )}
      <div
        style={{
          maxWidth: BUBBLE_MAX,
          padding: `${PAD_Y}px ${PAD_X}px`,
          background: mine ? INK.ink : "#FFFFFF",
          color: mine ? INK.paper : INK.ink,
          fontFamily,
          fontWeight: 700,
          fontSize: FONT,
          lineHeight: `${LINE_H}px`,
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
          textWrap: "balance",
          borderRadius: mine ? "34px 34px 8px 34px" : "34px 34px 34px 8px",
          boxShadow: "0 6px 18px rgba(36,33,28,0.10)",
        }}
      >
        {line.text}
      </div>
    </div>
  );
};

/** 다음 말풍선 전 "입력 중" 점 세 개 - 다음 대사를 기다리게 만든다 */
const Typing: React.FC<{ mine: boolean }> = ({ mine }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "22px 28px",
          background: mine ? INK.ink : "#FFFFFF",
          borderRadius: 30,
          boxShadow: "0 6px 18px rgba(36,33,28,0.10)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: mine ? INK.paper : INK.ink,
              opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - i * 4) / 4)),
            }}
          />
        ))}
      </div>
    </div>
  );
};

const Title: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div style={{ position: "absolute", top: H * 0.135, left: 60, right: 60, textAlign: "center" }}>
      {/* 2026-10-31 사장님: 제목 위에 "오늘의 꿀팁" 같은 말 - 꿀팁 영상 첫 화면과 같은 문구로 채널 느낌을 맞춘다 */}
      <div style={{ color: INK.ink, opacity: 0.7, fontFamily, fontWeight: 800, fontSize: 40, marginBottom: 16 }}>
        오늘의 살림 꿀팁
      </div>
      <span
        style={{
          background: INK.accent,
          color: INK.ink,
          fontFamily: tapeFontFamily,
          fontSize: 76,
          lineHeight: 1.35,
          padding: "2px 16px",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          wordBreak: "keep-all",
          display: "inline-block",
          transform: `scale(${1.15 - 0.15 * k})`,
        }}
      >
        {text}
      </span>
    </div>
  );
};

/** 대화가 끝난 뒤 가운데 알림처럼 뜨는 한 줄 (목소리와 같은 말) */
const FollowPill: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame, fps, config: { damping: 13 } });
  return (
    <div style={{ position: "absolute", left: 0, width: W, top: CHAT_BOTTOM - 20, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          background: INK.accent,
          color: INK.ink,
          fontFamily: tapeFontFamily,
          fontSize: 50,
          padding: "16px 34px 10px",
          borderRadius: 8,
          boxShadow: "0 10px 26px rgba(36,33,28,0.18)",
          transform: `translateY(${(1 - k) * 30}px) scale(${0.9 + 0.1 * k})`,
          opacity: Math.min(1, k * 2),
        }}
      >
        {text}
      </div>
    </div>
  );
};

const ProductCover: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: "#2A2621", opacity: interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }} />;
};

const Sfx: React.FC<{ name: "pop" | "whoosh"; volume?: number }> = ({ name, volume = 0.3 }) => (
  <Audio src={staticFile(`sfx/${name}.mp3`)} volume={volume} />
);

export const TemplateChat: React.FC<ChatProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seg = chatSegments(props);
  const f = (s: number) => Math.round(s * fps);
  const starts: number[] = [];
  seg.reduce((acc, s, i) => {
    starts[i] = acc;
    return acc + f(s);
  }, 0);
  const n = props.lines.length;
  const productAt = props.product ? n + 1 : -1;

  // 지금까지 나온 말풍선 수와, 넘치면 위로 밀어 올릴 거리
  const shown = props.lines.filter((_, i) => frame >= starts[i]).length;
  const heights = props.lines.map((l, i) => bubbleHeight(l, props.lines[i - 1]));
  const room = CHAT_BOTTOM - CHAT_TOP;
  const scrollFor = (count: number) => Math.max(0, heights.slice(0, count).reduce((a, b) => a + b, 0) + 90 - room);
  const lastStart = shown > 0 ? starts[shown - 1] : 0;
  const scroll = interpolate(frame - lastStart, [0, 8], [scrollFor(Math.max(0, shown - 1)), scrollFor(shown)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // 다음 대사 직전 0.35초 동안 입력 중 표시
  const nextIdx = shown;
  const typingOn = nextIdx > 0 && nextIdx < n && frame >= starts[nextIdx] - f(0.35);

  return (
    <AbsoluteFill style={{ background: INK.paper }}>
      <FontFaceStyle />
      {/* 아주 옅은 줄 - 메모지 느낌 */}
      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(36,33,28,0.045) 0 2px, transparent 2px 96px)",
        }}
      />
      <Title text={props.title} />
      <div
        style={{
          position: "absolute",
          top: CHAT_TOP,
          left: 56,
          right: 56,
          height: room,
          overflow: "hidden",
          maskImage: "linear-gradient(to bottom, transparent 0, black 70px)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 70px)",
        }}
      >
        <div style={{ paddingTop: 70, transform: `translateY(${-scroll}px)` }}>
          {props.lines.slice(0, shown).map((l, i) => (
            <Bubble
              key={i}
              line={l}
              name={props.names[l.who]}
              showName={l.who === "a" && props.lines[i - 1]?.who !== "a"}
              enterFrame={starts[i]}
            />
          ))}
          {typingOn && <Typing mine={props.lines[nextIdx].who === "b"} />}
        </div>
      </div>

      {props.lines.map((_, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={f(seg[i])}>
          <Sfx name="pop" volume={0.14} />
          {/* 말풍선 '톡' 소리 뒤 0.1초에 말을 시작 - 겹치면 첫 글자가 묻혀 끊겨 들린다 (2026-10-31 사장님 "아직도 말이 끊기는 부분") */}
          <Sequence from={VOICE_DELAY}>
            <Narration src={props.narration?.[i]} />
          </Sequence>
        </Sequence>
      ))}
      <Sequence from={starts[n]} durationInFrames={f(seg[n])}>
        <FollowPill text={props.followText ?? "도움 됐다면 팔로우해 두세요"} />
        <Narration src={props.narration?.[n]} />
      </Sequence>
      {props.product && (
        <Sequence from={starts[productAt]} durationInFrames={f(seg[productAt])}>
          {/* 대화 화면을 완전히 덮고 상품만 - 말풍선이 비쳐 보이면 지저분하다 */}
          <ProductCover />
          <CtaScene
            displayNumber={props.product.displayNumber}
            ctaText={props.product.ctaText}
            productImageUrl={props.product.imageUrl}
            heading={props.product.heading}
            large
          />
          <Sfx name="whoosh" />
          <Narration src={props.narration?.[productAt]} />
        </Sequence>
      )}
      {/* 끝 3초는 상품 화면(어두운 바탕)이라 흰 글자, 앞쪽은 메모지 바탕이라 먹색 */}
      <Disclosure bottomPx={H * 0.26} onLight={!props.product || frame < starts[productAt]} />
    </AbsoluteFill>
  );
};
