import React, { useState } from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_SIZES, INK, LAYOUT, MOTION } from "../config/videoConfig";
import { fontFamily, tapeFontFamily } from "../fonts";

/**
 * 제품 쇼케이스 카드 (2026-10-19 개편 - 사이트 /n 과 같은 한 벌).
 * - 흰 종이 한 장 + 회색 사진 칸(사진은 multiply 로 흰 바탕이 녹아든다)
 * - 사진 왼쪽 위에 남색 번호 라벨 테이프 (Black Han Sans)
 * - 아래: 상품명(왼쪽 정렬 먹색) + 작은 회색 줄(용량/구성 · 살림템 메모장)
 * props 구조는 파이프라인 호환을 위해 유지(productName/productImageUrl/displayNumber).
 */

/** 상품명에서 카드 상단 배지 문구 자동 생성 (대용량/구성/카테고리 순) */
function shelfLabel(productName: string): string {
  // \b 는 한글 뒤에서 매치되지 않아(JS \w 는 영숫자만) "리터" 분기가 죽어 있었다
  const vol = productName.match(/(\d+(?:\.\d+)?)\s*(L|리터|kg|ml|g)(?![A-Za-z])/i);
  if (vol) {
    const unit = vol[2].toLowerCase();
    const big = unit === "l" || unit === "리터" || unit === "kg";
    const u = unit === "리터" ? "L" : unit.toUpperCase();
    return `${vol[1]}${u}${big ? " 대용량" : ""}`;
  }
  const qty = productName.match(/(\d+)\s*(개입|개|매|장|입|세트|팩|종)/);
  if (qty) return `${qty[1]}${qty[2]} 구성`;
  return "살림템 추천";
}

export const ProductOverlay: React.FC<{
  productName: string;
  productImageUrl: string | null;
  displayNumber: number;
  polaroid?: boolean;
  topRatio?: number;
  widthRatio?: number;
  /** 차례로 넘길 사진들 (2장 이상일 때만 넘긴다) */
  images?: string[] | null;
  /** 카드가 떠 있는 길이(프레임) - 사진 한 장당 시간을 고르게 나누는 데 쓴다 */
  durationFrames?: number;
}> = ({
  productName,
  productImageUrl,
  displayNumber,
  images,
  durationFrames,
  topRatio = LAYOUT.productCardTop,
  widthRatio = LAYOUT.productCardWidth,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const [imageFailed, setImageFailed] = useState(false);

  // 카드: 아래에서 부드럽게 등장
  const rise = spring({ frame, fps, config: { damping: MOTION.productDamping } });
  // 제품 이미지: 0.95 → 1.0 로 살짝 pop
  const pop = spring({ frame, fps, config: { damping: 18, mass: 0.6 } });

  // 디테일 컷: 한 장을 전체→부분확대로 "딱딱" 전환(움직임 없이 하드컷).
  //
  // 쿠팡이 주는 이미지는 상품당 1장뿐이라 이 확대 컷이 "여러 장처럼" 보이게 하는
  // 유일한 수단이다. 다만 예전 설정(2.1~2.2배 + 구석 크롭)은 확대가 과해서
  // 제품 형태가 안 보이고 배경만 잡히는 컷이 나왔다 → 배율을 낮추고 중앙 쪽으로
  // 모아, 어느 컷에서든 제품이 보이게 한다.
  const shots = [
    { z: 1.0, cx: 0.5, cy: 0.5 }, // 전체
    { z: 1.35, cx: 0.5, cy: 0.48 }, // 살짝 당김
    { z: 1.5, cx: 0.42, cy: 0.45 }, // 왼쪽 위 디테일
    { z: 1.5, cx: 0.58, cy: 0.55 }, // 오른쪽 아래 디테일
  ];
  const shot = shots[Math.floor(frame / Math.round(fps * 2.2)) % shots.length];
  const tx = (0.5 - shot.cx * shot.z) * 100;
  const ty = (0.5 - shot.cy * shot.z) * 100;

  // 사진 여러 장 (근사장 본인 상품): 한 장씩 넘기며 천천히 다가간다. 한 장당 1.6초 이상,
  // 카드가 떠 있는 동안 고르게 나눠 마지막 사진까지 다 보이게 한다.
  const gallery = images && images.length > 1 ? images : null;
  const per = gallery
    ? Math.max(Math.round(fps * 1.6), Math.floor((durationFrames ?? fps * 20) / gallery.length))
    : 1;
  const gi = gallery ? Math.floor(frame / per) % gallery.length : 0;
  const local = gallery ? (frame % per) / per : 0;
  const galleryPop = gallery ? spring({ frame: frame % per, fps, config: { damping: 16, mass: 0.5 } }) : 1;

  const cardWidth = width * widthRatio;
  const label = shelfLabel(productName);

  // 2026-10-19 디자인 개편 (사장님 "AI 가 만든 것 같다 · 촌스럽다 · 세련되게"):
  // 크림 그라데이션 둥근 카드 + 민트/코랄 알약 배지 → 흰 종이 한 장 + 회색 사진 칸 + 남색 번호 라벨 테이프
  // (사이트 /n 과 같은 한 벌). 상품명은 왼쪽 정렬 먹색. 둥둥 떠오르지 않고 짧게 올라와 멈춘다.
  return (
    <div
      style={{
        position: "absolute",
        top: height * topRatio,
        left: (width - cardWidth) / 2,
        width: cardWidth,
        background: INK.paper,
        borderRadius: 8,
        padding: "20px 20px 26px",
        boxShadow: "0 24px 50px rgba(0, 0, 0, 0.32)",
        transform: `translateY(${(1 - rise) * 120}px)`,
        opacity: Math.min(1, rise * 1.6),
        fontFamily,
      }}
    >
      {/* 사진 칸 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          background: INK.photoBg,
          borderRadius: 3,
        }}
      >
        {gallery ? (
          <Img
            key={gi}
            src={gallery[gi]}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              mixBlendMode: "multiply",
              transform: `scale(${(0.96 + galleryPop * 0.04) * (1 + local * 0.06)})`,
            }}
          />
        ) : productImageUrl && !imageFailed ? (
          <Img
            src={productImageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              mixBlendMode: "multiply",
              transformOrigin: "0 0",
              transform: `translate(${tx}%, ${ty}%) scale(${shot.z})`,
            }}
            onError={() => setImageFailed(true)}
          />
        ) : null}
        {/* 사진이 여러 장이면 몇 번째인지 아래에 작은 점으로 */}
        {gallery && (
          <div style={{ position: "absolute", bottom: 14, left: 0, width: "100%", display: "flex", justifyContent: "center", gap: 8 }}>
            {gallery.map((_, i) => (
              <span key={i} style={{ width: 9, height: 9, borderRadius: 9, background: i === gi ? INK.tape : "rgba(30,31,28,0.18)" }} />
            ))}
          </div>
        )}
      </div>

      {/* 번호 라벨 테이프 - 사진 왼쪽 위에 비스듬히 붙인다 */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: -14,
          transform: `rotate(-4deg) scale(${0.9 + pop * 0.1})`,
          background: INK.tape,
          color: "#FFFFFF",
          fontFamily: tapeFontFamily,
          fontSize: 66,
          letterSpacing: "0.04em",
          lineHeight: 1,
          padding: "14px 22px 10px",
          borderRadius: 3,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 0 rgba(0,0,0,0.2)",
        }}
      >
        {displayNumber}
        <span style={{ fontSize: "0.48em", marginLeft: "0.08em", letterSpacing: 0, opacity: 0.85 }}>번</span>
      </div>

      {/* 상품명 - 왼쪽 정렬 먹색 */}
      <div
        style={{
          marginTop: 20,
          color: INK.ink,
          fontWeight: 800,
          fontSize: FONT_SIZES.productName * 0.82,
          lineHeight: 1.28,
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
          // 3줄 이상이면 카드가 늘어나 고지와 겹친다 - 2줄로 자른다
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {productName}
      </div>
      <div style={{ marginTop: 10, color: INK.sub, fontSize: 28, fontWeight: 500 }}>
        {label === "살림템 추천" ? "살림템 메모장" : `${label} · 살림템 메모장`}
      </div>
    </div>
  );
};
