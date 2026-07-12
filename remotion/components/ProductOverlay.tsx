import React, { useState } from "react";
import { Img, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, MOTION } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 제품 카드 오버레이 - 아래에서 부드럽게 올라오며 등장.
 * polaroid=true 면 살짝 기울어진 폴라로이드 느낌 (템플릿 C).
 */
export const ProductOverlay: React.FC<{
  productName: string;
  productImageUrl: string | null;
  displayNumber: number;
  polaroid?: boolean;
}> = ({ productName, productImageUrl, displayNumber, polaroid = false }) => {
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

  const cardWidth = width * 0.62;

  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.5,
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
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
