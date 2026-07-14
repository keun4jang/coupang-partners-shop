import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { COLORS, FONT_SIZES, SAFE_ZONE, VIDEO } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 영상 맨 첫 프레임(1프레임)만 나오는 "썸네일용" 정적 화면.
 * 플랫폼이 영상 첫 프레임을 미리보기/썸네일로 잡거나, 우리가 직접 썸네일 PNG를
 * 이 프레임에서 뽑는 경우를 위해 - 제품 사진을 꽉 채우고 번호+후킹 문구를 크게 얹는다.
 * 애니메이션 없이 처음부터 완성된 상태로 그린다(1프레임만 존재하므로 스프링 팝인이 의미 없음).
 */
export const CoverFrame: React.FC<{
  productImageUrl: string | null;
  displayNumber: number;
  hookLine: string;
}> = ({ productImageUrl, displayNumber, hookLine }) => {
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        background: `linear-gradient(160deg, ${COLORS.cream} 0%, ${COLORS.accentSoft} 100%)`,
      }}
    >
      {/* 사진을 자르지 않고(contain) 그대로 보여준다 - 빈 공간은 배경색 그대로 */}
      {productImageUrl && (
        <Img
          src={productImageUrl}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}

      {/* 번호 배지 - 상단 안전대 */}
      <div
        style={{
          position: "absolute",
          top: VIDEO.height * SAFE_ZONE.top + 16,
          left: 40,
          background: COLORS.cream,
          border: `5px solid ${COLORS.accent}`,
          borderRadius: 999,
          padding: "12px 28px",
          boxShadow: "0 8px 30px rgba(63, 52, 44, 0.3)",
        }}
      >
        <span
          style={{
            color: COLORS.primaryDark,
            fontWeight: 900,
            fontSize: FONT_SIZES.coverBadge,
          }}
        >
          {displayNumber}번
        </span>
      </div>

      {/* 후킹 문구 - 하단 안전대. 사진 위든 여백 위든 항상 읽히도록 말풍선 카드로 */}
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          bottom: VIDEO.height * SAFE_ZONE.bottom + 36,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: "100%",
            background: "rgba(255, 248, 240, 0.95)",
            color: COLORS.ink,
            fontWeight: 900,
            fontSize: FONT_SIZES.coverHook,
            lineHeight: 1.3,
            textAlign: "center",
            wordBreak: "keep-all",
            borderRadius: 24,
            padding: "16px 28px",
            boxShadow: `0 10px 34px ${COLORS.subtitleShadow}`,
          }}
        >
          {hookLine}
        </div>
      </div>
    </AbsoluteFill>
  );
};
