import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EDITORIAL as E, top10NameFontSize } from "../config/videoConfig";
import { editorialFontFamily } from "../fonts";
import { FontFaceStyle } from "../components/FontFaceStyle";

/**
 * 프로토타입: 유튜브 롱폼 "카테고리 TOP10" 컴포지션 (1280x720, 24fps).
 *
 * 목적은 실제 GH Actions 러너에서 렌더 시간을 실측하는 것 - 실측 결과(2026-08-22):
 * 1280x720/24fps/3분59초 영상이 로컬 4코어(GH Actions 퍼블릭 러너와 동일 사양)에서
 * 3분48초에 완성. 30분 제한에 8배 여유가 있어 이 방향으로 확정.
 *
 * 디자인: TemplateE(살림 검증 노트)의 브랜드 톤을 그대로 가져온다 - 종이색 배경,
 * 카드 문법(EDITORIAL.card/line/radius), 포인트색(토마토)을 숏폼과 통일해
 * "같은 채널"로 보이게 한다. 순위 콘텐츠 전용 장치로 상단 진행 바(몇 위까지
 * 왔는지 항상 보임 - 롱폼 이탈 방지)와 1~3위 강조(카운트다운 페이오프)를 더했다.
 *
 * 정식 버전 전 확정할 것(README 참고): 실제 AI 대본 생성, TTS 나레이션 연동,
 * N번 재사용 정책(1차는 이미 발행된 숏폼 상품만 사용 권장), 설명란 타임스탬프
 * 자동 생성. 이 파일은 그 전 단계 - 포맷·타이밍·렌더 실현 가능성 검증용이다.
 */

export type Top10Item = {
  rank: number;
  displayNumber: number;
  productName: string;
  imageUrl: string | null;
  priceText: string;
  category: string;
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
/** 1~3위는 카운트다운의 보상 구간이라 배지·타이포를 키운다 */
const isTopThree = (rank: number) => rank <= 3;

export function top10DurationSeconds(items: Top10Item[]): number {
  const body = items.reduce((sum, it) => sum + SECONDS_BY_RANK(it.rank), 0);
  return INTRO_SECONDS + body + OUTRO_SECONDS;
}

const secToFrame = (s: number) => Math.round(s * TOP10_FPS);

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

const ProductCard: React.FC<{ item: Top10Item }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 22 } });
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

const Intro: React.FC<{ categoryLabel: string }> = ({ categoryLabel }) => {
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
          쿠팡 카테고리 베스트셀러 순위 기준 · 10위부터 공개합니다
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ items: Top10Item[] }> = ({ items }) => {
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
      }}
    >
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
