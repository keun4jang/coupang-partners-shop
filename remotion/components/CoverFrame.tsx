import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { COLORS, FONT_SIZES, PALETTE, SAFE_ZONE, VIDEO } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 영상 맨 첫 프레임(1프레임)만 나오는 "썸네일용" 정적 화면.
 * 피드에서 손톱만 하게 보여도 읽히도록: 상단에 초대형 훅(흰 글자+검정 테두리,
 * 핵심어 노란 하이라이트 느낌의 바탕), 하단에 번호 배지. 제품 사진 꽉 채움.
 * 애니메이션 없이 처음부터 완성된 상태로 그린다(1프레임만 존재).
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

      {/* 위·아래 어두운 그라데이션 - 훅/배지가 사진 위에서도 무조건 읽히게 */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0) 66%, rgba(0,0,0,0.45) 100%)",
        }}
      />

      {/* 초대형 훅 - 상단 안전대 바로 아래, 흰 글자 + 두꺼운 검정 테두리 */}
      <div
        style={{
          position: "absolute",
          left: "4%",
          right: "4%",
          top: VIDEO.height * SAFE_ZONE.top + 10,
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 900,
          fontSize: FONT_SIZES.coverHook,
          lineHeight: 1.18,
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
          textWrap: "balance",
          WebkitTextStroke: "10px rgba(0,0,0,0.9)",
          paintOrder: "stroke fill",
          textShadow: "0 8px 28px rgba(0,0,0,0.55)",
        }}
      >
        {hookLine}
      </div>

      {/* 하단: 코랄 번호 배지 - 쿠폰처럼 톡 튀게 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: VIDEO.height * SAFE_ZONE.bottom + 30,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: PALETTE.badgeCoral,
            border: "5px solid #FFFFFF",
            borderRadius: 999,
            padding: "12px 40px",
            boxShadow: "0 10px 34px rgba(0,0,0,0.4)",
            transform: "rotate(-2deg)",
          }}
        >
          <span
            style={{
              color: "#FFFFFF",
              fontWeight: 900,
              fontSize: FONT_SIZES.coverBadge,
            }}
          >
            오늘의 {displayNumber}번
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
