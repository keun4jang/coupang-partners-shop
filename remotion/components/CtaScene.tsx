import React, { useState } from "react";
import {
  AbsoluteFill,
  Img,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  INK,
  MOTION,
  ctaNumberFontSize,
  ctaTemplate,
} from "../config/videoConfig";
import { fontFamily, tapeFontFamily } from "../fonts";

/**
 * 마지막 CTA 화면: 큰 번호 + 문장 한 줄.
 * 화면 문장은 나레이션과 완전히 동일해야 한다 (자막≠음성이면 혼란).
 *
 * 제품 사진(productImageUrl)을 번호 원 옆에 작게 남긴다(2026-09 클릭률 개선
 * 2차) - 예전엔 이 화면에서 사진이 완전히 사라져 "무슨 상품이었지?"가 됐다.
 * 번호 기억은 프로필 허브(/from/[platform])에서 상품을 고르는 첫 단서라,
 * 사진이 있어야 그 목록에서 다시 알아볼 수 있다.
 */
export const CtaScene: React.FC<{
  displayNumber: number;
  /** CTA 문장 - 나레이션과 같은 문장. 없으면 ctaTemplate 로 생성 */
  ctaText?: string;
  productImageUrl?: string | null;
  /** 사진 위 소개 줄 - "캠핑 자주 가는 분께 필요한 물건" (2026-10-22 사장님: 상품이 띡 나오기보다 어떤 분께 필요한 물건인지) */
  heading?: string | null;
  /** 꿀팁 영상 마무리용 큰 판 (2026-10-28 아트디렉터): 사진 크게, 번호 크게 한 번만, 아래 문장 없음 */
  large?: boolean;
}> = ({ displayNumber, ctaText, productImageUrl, heading, large }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame,
    fps,
    config: { damping: MOTION.springDamping },
  });
  const textIn = spring({
    frame: frame - Math.round(fps * 0.25),
    fps,
    config: { damping: MOTION.springDamping },
  });

  // 2026-10-19 개편: 살구색 동그라미 + 앱 아이콘 같은 타일 → 회색 사진 칸 위 남색 번호 라벨 테이프 (사이트와 같은 한 벌)
  return (
    <AbsoluteFill
      style={{
        background: INK.scrim,
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      {heading && (
        <div
          style={{
            marginBottom: 110,
            width: "86%",
            textAlign: "center",
            color: "#FFFFFF",
            fontWeight: 800,
            fontSize: 54,
            lineHeight: 1.32,
            letterSpacing: "-0.02em",
            wordBreak: "keep-all",
            textWrap: "balance",
            textShadow: "0 3px 0 rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.45)",
            transform: `translateY(${(1 - pop) * 30}px)`,
            opacity: Math.min(1, pop * 1.5),
          }}
        >
          {heading}
        </div>
      )}
      <div
        style={{
          position: "relative",
          width: large ? 640 : 420,
          height: large ? 640 : 420,
          background: INK.photoBg,
          borderRadius: 4,
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          transform: `translateY(${(1 - pop) * 60}px)`,
          opacity: Math.min(1, pop * 1.6),
        }}
      >
        {productImageUrl && !imageFailed && (
          <Img
            src={productImageUrl}
            style={{ width: "100%", height: "100%", objectFit: "contain", mixBlendMode: "multiply" }}
            onError={() => setImageFailed(true)}
          />
        )}
        {/* 숫자와 "번"은 한 덩어리 - 줄바꿈하지 않는다 */}
        <div
          style={{
            position: "absolute",
            left: -36,
            top: -40,
            transform: `rotate(-4deg) scale(${0.85 + pop * 0.15})`,
            background: INK.tape,
            color: "#FFFFFF",
            fontFamily: tapeFontFamily,
            fontSize: large ? 150 : Math.round(ctaNumberFontSize(displayNumber) * 0.8),
            lineHeight: 1,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            padding: "18px 30px 12px",
            borderRadius: 4,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 0 rgba(0,0,0,0.22)",
          }}
        >
          {displayNumber}
          <span style={{ fontSize: "0.46em", marginLeft: "0.08em", letterSpacing: 0, opacity: 0.85 }}>번</span>
        </div>
      </div>

      {/* 나레이션과 동일한 문장 한 줄 (큰 판에서는 번호와 겹치는 말이라 뺀다) */}
      {!large && <div
        style={{
          marginTop: 64,
          width: "84%",
          textAlign: "center",
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 46,
          lineHeight: 1.42,
          letterSpacing: "-0.01em",
          wordBreak: "keep-all",
          textWrap: "balance",
          transform: `translateY(${(1 - textIn) * 24}px)`,
          opacity: textIn,
        }}
      >
        {ctaText ?? ctaTemplate(displayNumber)}
      </div>}
    </AbsoluteFill>
  );
};
