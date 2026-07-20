import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_SIZES, MOTION, PALETTE } from "../config/videoConfig";
import { fontFamily } from "../fonts";
import { Badge } from "./Badge";

type Variant = "plain" | "bubble";

/**
 * 자막 텍스트 (Sequence 안에서 사용 - 등장 시점 기준으로 팝인).
 * plain: 흰 글자 + 그림자 / bubble: "살림 꿀팁 메모지" 크림 카드(+옵션 TIP 배지)
 */
export const Subtitle: React.FC<{
  text: string;
  size?: number;
  variant?: Variant;
  /** 세로 위치 (0~1, 화면 높이 비율) */
  y?: number;
  /** bubble 상단 왼쪽 라벨 (예: "보관 TIP"). 있으면 메모지 탭처럼 표시 */
  badge?: string;
}> = ({ text, size = FONT_SIZES.subtitle, variant = "plain", y = 0.42, badge }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: MOTION.springDamping, mass: MOTION.springMass },
  });

  const base: React.CSSProperties = {
    position: "absolute",
    top: height * y,
    left: width * 0.06,
    width: width * 0.88,
    textAlign: "center",
    fontFamily,
    fontWeight: 900,
    fontSize: size,
    lineHeight: 1.32,
    letterSpacing: "-0.015em",
    wordBreak: "keep-all",
    // 2줄이 될 때 위/아래 글자 수를 비슷하게 나눠 균형 있게
    textWrap: "balance",
    transform: `scale(${0.85 + pop * 0.15}) translateY(${(1 - pop) * 30}px)`,
    opacity: pop,
  };

  if (variant === "bubble") {
    // "살림 꿀팁 메모지" 느낌: 순백 종이 카드 + 강한 그림자로 배경/상품카드 위에 "올려진" 느낌.
    // 크림색 상품 카드와 겹쳐도 한 덩어리로 안 보이게 더 밝은 종이색 + 살구 액센트로 구분.
    return (
      <div
        style={{
          position: "absolute",
          top: height * y,
          left: 0,
          width: "100%",
          transform: base.transform,
          opacity: pop,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "fit-content",
            maxWidth: width * 0.78,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 10,
            background: `linear-gradient(180deg, #FFFFFF 0%, #FFFBF3 100%)`,
            color: PALETTE.brown,
            borderRadius: 28,
            // 배지형(TIP)은 왼쪽 살구 액센트 바를 피해 왼쪽 패딩을 넉넉히
            padding: badge ? "16px 28px 18px 36px" : "15px 28px",
            // 2단 그림자: 배경 broll·크림 상품카드 위에서도 확실히 떠 보이게
            boxShadow: `0 20px 44px rgba(47,39,34,0.30), 0 6px 16px rgba(47,39,34,0.16)`,
            border: `1.5px solid ${PALETTE.warmBeige}`,
          }}
        >
          {/* 왼쪽 살구 액센트 바 - "메모지 탭" 느낌 (배지형에서만) */}
          {badge && (
            <div
              style={{
                position: "absolute",
                left: 16,
                top: 16,
                bottom: 16,
                width: 7,
                borderRadius: 5,
                background: PALETTE.softPeach,
              }}
            />
          )}
          {badge && (
            <Badge
              label={badge}
              bg={PALETTE.softPeach}
              color={PALETTE.brown}
              fontSize={FONT_SIZES.tipLabel}
            />
          )}
          <div
            style={{
              width: "100%",
              textAlign: badge ? "left" : "center",
              fontFamily,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.28,
              letterSpacing: "-0.015em",
              wordBreak: "keep-all",
              textWrap: "balance",
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...base,
        color: "#FFFFFF",
        textShadow: `0 4px 24px ${COLORS.subtitleShadow}, 0 2px 8px rgba(0,0,0,0.4)`,
      }}
    >
      {text}
    </div>
  );
};
