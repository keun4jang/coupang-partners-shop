import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { COLORS, FONT_SIZES, PALETTE, VIDEO } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 영상 첫 프레임(1프레임)이자 유튜브/인스타 커스텀 썸네일용 정적 화면.
 * "형님여기" 류 성공 채널 레이아웃을 살림템 톤으로:
 *  - 상단: 코랄 밴드 위 2줄 초대형 헤드라인(흰 글자 + 두꺼운 브라운 테두리)
 *  - 하단: 제품 사진을 흰 카드에 크게 (그리드에서 뭐 파는지 한눈에)
 *  - 우상단: 작은 "오늘의 N번" 칩
 * 애니메이션 없이 처음부터 완성된 상태로 그린다(1프레임만 존재).
 *
 * 데드존: 인스타 프로필 그리드는 세로 9:16 커버를 위·아래로 잘라 보여주고,
 * 재생 중엔 상·하단에 플랫폼 UI가 겹친다. 그래서 밴드·제품 카드를
 * 세로 11%~86% 안쪽에 배치해 어느 쪽에서도 잘리지 않게 한다.
 */
export const CoverFrame: React.FC<{
  productImageUrl: string | null;
  /** 파이프라인 호환용(현재 썸네일엔 미표시 - 번호는 영상 끝 CTA에 노출) */
  displayNumber?: number;
  hookLine: string;
}> = ({ productImageUrl, hookLine }) => {
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        background: `linear-gradient(165deg, ${PALETTE.ivory} 0%, ${PALETTE.warmBeige} 100%)`,
      }}
    >
      {/* 상단 헤드라인 밴드 - 코랄, 화면 폭 거의 꽉 채우고 2줄 대형 텍스트
          (데드존 회피: 최상단 11% 아래에 배치) */}
      <div
        style={{
          position: "absolute",
          top: VIDEO.height * 0.11,
          left: VIDEO.width * 0.04,
          width: VIDEO.width * 0.92,
          minHeight: VIDEO.height * 0.235,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(160deg, ${PALETTE.badgeCoral} 0%, #F26A47 100%)`,
          borderRadius: 44,
          border: "8px solid #FFFFFF",
          boxShadow: "0 18px 44px rgba(63,52,44,0.32)",
          padding: "34px 40px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            textAlign: "center",
            color: "#FFFFFF",
            fontWeight: 900,
            fontSize: FONT_SIZES.coverHook,
            lineHeight: 1.14,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
            textWrap: "balance",
            WebkitTextStroke: "11px rgba(47,39,34,0.92)",
            paintOrder: "stroke fill",
            textShadow: "0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          {hookLine}
        </div>
      </div>

      {/* 하단 제품 사진 - 흰 카드에 크게 (데드존 회피: 아래 86% 위에서 끝나게).
          번호는 썸네일에 넣지 않는다(레퍼런스처럼 깔끔하게 - 번호는 영상 끝 CTA에 크게 노출) */}
      <div
        style={{
          position: "absolute",
          top: VIDEO.height * 0.37,
          left: VIDEO.width * 0.05,
          width: VIDEO.width * 0.9,
          height: VIDEO.height * 0.49,
          background: "#FFFFFF",
          borderRadius: 40,
          border: `3px solid ${PALETTE.warmBeige}`,
          boxShadow: "0 20px 50px rgba(63,52,44,0.22)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {productImageUrl ? (
          <Img
            src={productImageUrl}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 220 }}>🧺</span>
        )}
      </div>
    </AbsoluteFill>
  );
};
