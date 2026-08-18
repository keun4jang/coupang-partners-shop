import React, { useState } from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, LAYOUT, MOTION, PALETTE } from "../config/videoConfig";
import { fontFamily } from "../fonts";
import { Badge } from "./Badge";

/**
 * 제품 쇼케이스 카드 (살림템 추천 감성).
 * - 따뜻한 크림 카드 + 연한 베이지 이너 보더 + 부드러운 그림자
 * - 상단: 용량/구성 배지 (예: "19L 대용량") — 상품명에서 자동 추출
 * - 중앙: 제품 이미지(디테일 컷 모션) + 뒤에 은은한 하이라이트로 떠 보이게
 * - 하단: 제품명(정보 위계 최상위) + "오늘의 살림템 N번" 코랄 배지
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
}> = ({
  productName,
  productImageUrl,
  displayNumber,
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

  const cardWidth = width * widthRatio;
  const label = shelfLabel(productName);

  return (
    <div
      style={{
        position: "absolute",
        top: height * topRatio,
        left: (width - cardWidth) / 2,
        width: cardWidth,
        background: `linear-gradient(180deg, ${PALETTE.cardCream} 0%, #FFFDF8 100%)`,
        borderRadius: 40,
        padding: "26px 28px 30px",
        boxShadow: "0 26px 60px rgba(63, 52, 44, 0.28)",
        border: `1.5px solid ${PALETTE.warmBeige}`,
        transform: `translateY(${(1 - rise) * 380}px) scale(${0.94 + rise * 0.06})`,
        opacity: rise,
        fontFamily,
      }}
    >
      {/* 상단 용량/구성 배지 */}
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <Badge
          label={label}
          bg={PALETTE.sageMint}
          color={PALETTE.brown}
          fontSize={FONT_SIZES.volumeBadge}
          delayFrames={4}
        />
      </div>

      {/* 제품 이미지 - 카드 위에 떠 있는 타일 */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 28,
          overflow: "hidden",
          background: `radial-gradient(120% 120% at 50% 30%, #FFFFFF 0%, ${PALETTE.warmBeige} 100%)`,
          boxShadow:
            "0 16px 34px rgba(63,52,44,0.18), inset 0 0 0 1.5px rgba(255,255,255,0.7)",
          transform: `scale(${0.95 + pop * 0.05})`,
        }}
      >
        {productImageUrl && !imageFailed ? (
          <Img
            src={productImageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transformOrigin: "0 0",
              transform: `translate(${tx}%, ${ty}%) scale(${shot.z})`,
            }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 150,
            }}
          >
            🧺
          </span>
        )}
      </div>

      {/* 제품명 - 정보 위계 최상위 */}
      <div
        style={{
          marginTop: 20,
          textAlign: "center",
          color: PALETTE.brown,
          fontWeight: 800,
          fontSize: FONT_SIZES.productName,
          lineHeight: 1.22,
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
          textWrap: "balance",
          // 상품명이 길어 3줄 이상이 되면 카드가 늘어나 번호 배지·대가성 고지와
          // 겹친다. 2줄로 잘라 카드 높이를 예측 가능하게 유지한다.
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {productName}
      </div>

      {/* 번호 배지 - 이 영상이 몇 번 제품인지 알려주는 식별 표시.
          ("링크 누르세요" 류의 클릭 유도 문구는 쿠팡파트너스 운영정책상 금지라
           번호 안내로만 둔다) */}
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <Badge
          label={`오늘의 살림템 ${displayNumber}번`}
          bg={PALETTE.badgeCoral}
          color="#FFFFFF"
          fontSize={FONT_SIZES.numberBadge}
          delayFrames={10}
        />
      </div>
    </div>
  );
};
