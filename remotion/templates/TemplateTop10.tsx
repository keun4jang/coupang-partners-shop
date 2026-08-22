import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EDITORIAL as E } from "../config/videoConfig";
import { editorialFontFamily } from "../fonts";
import { FontFaceStyle } from "../components/FontFaceStyle";

/**
 * 프로토타입: 유튜브 롱폼 "카테고리 TOP10" 컴포지션 (1280x720, 24fps).
 *
 * 목적은 실제 GH Actions 러너에서 렌더 시간을 실측하는 것 - 컨설팅 답변이
 * "6~30분 걸릴 수 있다"고 추정했는데, 우리 실측 렌더 로그(TemplateE 744프레임
 * 1080x1920 = 58초)로 역산하면 4분 안팎이어야 한다. 실제로 렌더해서 확인한다.
 *
 * 프레임당 무게를 의도적으로 가볍게 뒀다(정적 카드 + 슬라이드 진입만, 스프링
 * 레이어 최소화) - TemplateE 는 스프링 3중+그림자 다층이라 프레임당 무거운 편인데,
 * 롱폼은 프레임 수가 9배라 프레임당 무게가 총 렌더시간에 훨씬 크게 곱해진다.
 *
 * 정식 버전 전 확정할 것(README 참고): 실제 AI 대본 생성, TTS 나레이션 연동,
 * N번 재사용 로직(기존 발행된 숏폼 상품만 쓸지), 설명란 타임스탬프 자동 생성.
 * 이 파일은 그 전 단계 - "렌더가 시간 안에 끝나는가"만 검증하는 프로토타입이다.
 */

export type Top10Item = {
  rank: number;
  displayNumber: number;
  productName: string;
  imageUrl: string | null;
  priceText: string;
};

export type Top10Props = {
  categoryLabel: string;
  items: Top10Item[]; // 10위 -> 1위 순으로 정렬해서 전달
};

export const TOP10_FPS = 24;
export const TOP10_WIDTH = 1280;
export const TOP10_HEIGHT = 720;
/** 상품 1개당 화면 노출 시간(초). 10위~6위는 짧게, 5위~1위는 길게 (컨설팅 권고 반영) */
const SECONDS_BY_RANK = (rank: number): number => {
  if (rank >= 6) return 18;
  if (rank >= 4) return 22;
  return 28;
};
const INTRO_SECONDS = 7;
const OUTRO_SECONDS = 14;

export function top10DurationSeconds(items: Top10Item[]): number {
  const body = items.reduce((sum, it) => sum + SECONDS_BY_RANK(it.rank), 0);
  return INTRO_SECONDS + body + OUTRO_SECONDS;
}

const secToFrame = (s: number) => Math.round(s * TOP10_FPS);

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => (
  <div
    style={{
      width: 108,
      height: 108,
      borderRadius: 24,
      background: E.accent,
      color: "#FFFFFF",
      fontWeight: 800,
      fontSize: 48,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 1,
      flexShrink: 0,
    }}
  >
    <span>{rank}</span>
    <span style={{ fontSize: 20, opacity: 0.85 }}>위</span>
  </div>
);

const ProductCard: React.FC<{ item: Top10Item }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 22 } });
  return (
    <AbsoluteFill
      style={{
        fontFamily: editorialFontFamily,
        backgroundColor: E.paper,
        opacity: slide,
        transform: `translateX(${(1 - slide) * 40}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 64,
          left: 64,
          right: 64,
          bottom: 64,
          display: "flex",
          alignItems: "center",
          gap: 48,
        }}
      >
        <div
          style={{
            width: 420,
            height: 420,
            flexShrink: 0,
            background: E.card,
            borderRadius: E.radius,
            border: `1px solid ${E.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {item.imageUrl ? (
            <Img
              src={item.imageUrl}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span style={{ fontSize: 120 }}>🧺</span>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <RankBadge rank={item.rank} />
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: E.ink,
              lineHeight: 1.25,
              wordBreak: "keep-all",
            }}
          >
            {item.productName}
          </div>
          <div style={{ fontSize: 28, color: E.sub, fontWeight: 600 }}>
            {item.priceText} · N{item.displayNumber}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ categoryLabel: string }> = ({ categoryLabel }) => (
  <AbsoluteFill
    style={{
      fontFamily: editorialFontFamily,
      backgroundColor: E.ink,
      color: "#FFFFFF",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      textAlign: "center",
      padding: 80,
    }}
  >
    <div style={{ fontSize: 24, opacity: 0.7 }}>
      [광고] 쿠팡파트너스 활동의 일환으로 수수료를 제공받습니다
    </div>
    <div style={{ fontSize: 64, fontWeight: 800 }}>{categoryLabel} TOP10</div>
    <div style={{ fontSize: 28, opacity: 0.8 }}>쿠팡 카테고리 베스트셀러 순위 기준</div>
  </AbsoluteFill>
);

const Outro: React.FC<{ items: Top10Item[] }> = ({ items }) => (
  <AbsoluteFill
    style={{
      fontFamily: editorialFontFamily,
      backgroundColor: E.paper,
      padding: 64,
    }}
  >
    <div style={{ fontSize: 40, fontWeight: 800, color: E.ink, marginBottom: 24 }}>
      오늘의 TOP10 요약
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {items
        .slice()
        .reverse()
        .map((it) => (
          <div
            key={it.rank}
            style={{
              fontSize: 24,
              color: E.ink,
              display: "flex",
              gap: 10,
              minWidth: 0,
            }}
          >
            <b style={{ flexShrink: 0 }}>{it.rank}위</b>
            <span style={{ color: E.sub, flexShrink: 0 }}>N{it.displayNumber}</span>
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.productName}
            </span>
          </div>
        ))}
    </div>
    <div style={{ marginTop: 32, fontSize: 24, color: E.sub }}>
      상품 정보는 설명란 각 순위 옆 링크에 정리했습니다
    </div>
  </AbsoluteFill>
);

export const TemplateTop10: React.FC<Top10Props> = ({ categoryLabel, items }) => {
  let cursor = INTRO_SECONDS;
  const ranges = items.map((it) => {
    const from = cursor;
    const dur = SECONDS_BY_RANK(it.rank);
    cursor += dur;
    return { item: it, from, dur };
  });
  const outroFrom = cursor;

  return (
    <AbsoluteFill>
      <FontFaceStyle />
      <Sequence durationInFrames={secToFrame(INTRO_SECONDS)}>
        <Intro categoryLabel={categoryLabel} />
      </Sequence>
      {ranges.map(({ item, from, dur }) => (
        <Sequence key={item.rank} from={secToFrame(from)} durationInFrames={secToFrame(dur)}>
          <ProductCard item={item} />
        </Sequence>
      ))}
      <Sequence from={secToFrame(outroFrom)} durationInFrames={secToFrame(OUTRO_SECONDS)}>
        <Outro items={items} />
      </Sequence>
    </AbsoluteFill>
  );
};
