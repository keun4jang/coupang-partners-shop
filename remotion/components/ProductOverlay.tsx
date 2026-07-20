import React, { useState } from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, LAYOUT, MOTION } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 제품 카드 오버레이 - 아래에서 부드럽게 올라오며 등장.
 * polaroid=true 면 살짝 기울어진 폴라로이드 느낌 (템플릿 C).
 * topRatio/widthRatio 로 세로 위치·크기를 템플릿마다 조정(데드존 회피).
 */
export const ProductOverlay: React.FC<{
  productName: string;
  productImageUrl: string | null;
  displayNumber: number;
  polaroid?: boolean;
  /** 카드 상단 세로 위치(화면 높이 비율) */
  topRatio?: number;
  /** 카드 가로 폭(화면 너비 비율) */
  widthRatio?: number;
}> = ({
  productName,
  productImageUrl,
  displayNumber,
  polaroid = false,
  topRatio = LAYOUT.productCardTop,
  widthRatio = LAYOUT.productCardWidth,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  // 상품 이미지가 만료/차단되어 로드에 실패해도 렌더 전체가 죽지 않도록
  // 기본 아이콘으로 대체한다 (죽은 URL 하나로 영상 생성이 실패하면 안 됨).
  const [imageFailed, setImageFailed] = useState(false);

  const rise = spring({
    frame,
    fps,
    config: { damping: MOTION.productDamping },
  });

  // 디테일 컷: 상품 사진 1장을 여러 컷(전체→부분 확대)으로 "딱딱" 전환.
  // 같은 사진이지만 부분을 다르게 보여줘 여러 샷처럼 느껴지게 한다(움직임 없이 하드컷).
  // z=확대배율, (cx,cy)=초점(이미지 비율 0~1). container 가 overflow:hidden 이라 잘림.
  const shots = [
    { z: 1.0, cx: 0.5, cy: 0.5 }, // 전체
    { z: 1.6, cx: 0.5, cy: 0.5 }, // 중앙 줌
    { z: 2.1, cx: 0.32, cy: 0.3 }, // 좌상단 디테일
    { z: 2.2, cx: 0.66, cy: 0.68 }, // 우하단 디테일
  ];
  const CUT_FRAMES = Math.round(fps * 2.2);
  const shot = shots[Math.floor(frame / CUT_FRAMES) % shots.length];
  const tx = (0.5 - shot.cx * shot.z) * 100;
  const ty = (0.5 - shot.cy * shot.z) * 100;

  const cardWidth = width * widthRatio;

  return (
    <div
      style={{
        position: "absolute",
        top: height * topRatio,
        left: (width - cardWidth) / 2,
        width: cardWidth,
        background: COLORS.card,
        borderRadius: polaroid ? 18 : 40,
        padding: polaroid ? "26px 26px 34px" : 30,
        boxShadow: "0 24px 70px rgba(63, 52, 44, 0.4)",
        border: `6px solid ${COLORS.accentSoft}`,
        transform: `translateY(${(1 - rise) * 420}px) rotate(${
          polaroid ? -2.5 : 0
        }deg) scale(${0.9 + rise * 0.1})`,
        opacity: rise,
        fontFamily,
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: polaroid ? 8 : 28,
          overflow: "hidden",
          background: COLORS.accentSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
          <span style={{ fontSize: 140 }}>🧺</span>
        )}
      </div>
      <div
        style={{
          marginTop: 22,
          textAlign: "center",
          color: COLORS.ink,
          fontWeight: 700,
          fontSize: FONT_SIZES.productName,
          lineHeight: 1.3,
          wordBreak: "keep-all",
        }}
      >
        {productName}
      </div>
      <div
        style={{
          marginTop: 10,
          textAlign: "center",
          color: COLORS.primaryDark,
          fontWeight: 900,
          fontSize: FONT_SIZES.badge,
        }}
      >
        {displayNumber}번
      </div>
    </div>
  );
};
