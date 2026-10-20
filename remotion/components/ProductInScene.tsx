import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../fonts";

/**
 * 장면 합성 (2026-10-20 제안 A): 누끼 뜬 상품을 배경 스톡 장면 위 바닥 자리에 그림자와 함께 올린다.
 * - 배경(스톡)과 상품이 서로 다른 속도로 움직여(시차) 사진 한 장이 그 장소에 놓인 것처럼 보이게 한다.
 * - 상품 모양은 그대로(크기·위치만 바뀜). 실제 사용 장면이 아니므로 오른쪽 위에 "연출 화면"을 작게 띄운다
 *   (표시광고법상 실사용으로 오인하지 않게 - brollCatalog DIRECTED_SCENE_LABEL 과 같은 말).
 * 위치: 후킹·공감 자막(화면 높이 0.26·0.40) 아래 0.50~0.765, 하단 고지(0.8 선) 위.
 */
export const ProductInScene: React.FC<{ src: string; durationFrames: number }> = ({ src, durationFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, mass: 0.8 } });
  const leave = interpolate(frame, [durationFrames - 8, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const t = frame / Math.max(1, durationFrames);
  // 상품은 천천히 다가오고(1.0→1.08) 옆으로 살짝 흐른다 - 배경 스톡의 움직임과 달라 입체감이 생긴다
  const scale = (0.86 + 0.14 * enter) * (1 + 0.08 * t);
  const driftX = interpolate(t, [0, 1], [-18, 18]);
  const boxW = width * 0.66;
  const boxH = height * 0.26;
  // 상품 바닥선 - 하단 고지(화면 아래 20% 선 바로 위)와 쇼츠 UI 를 피한다
  const baseY = height * 0.765;
  return (
    <AbsoluteFill style={{ opacity: leave }}>
      {/* 바닥 그림자 */}
      <div
        style={{
          position: "absolute",
          left: width / 2 - boxW * 0.42 + driftX,
          top: baseY - 26,
          width: boxW * 0.84,
          height: 52,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 72%)",
          transform: `scale(${scale})`,
          opacity: enter,
          filter: "blur(6px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: width / 2 - boxW / 2 + driftX,
          top: baseY - boxH,
          width: boxW,
          height: boxH,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          transform: `translateY(${(1 - enter) * 120}px) scale(${scale})`,
          transformOrigin: "50% 100%",
          opacity: Math.min(1, enter * 1.4),
        }}
      >
        <Img
          src={src}
          style={{
            // 작은 사진도 칸을 채우도록 키운다 (maxWidth 로는 원래 크기보다 커지지 않는다)
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "50% 100%",
            filter: "drop-shadow(0 18px 22px rgba(0,0,0,0.35)) drop-shadow(0 2px 3px rgba(0,0,0,0.25))",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: height * 0.06,
          right: 36,
          color: "rgba(255,255,255,0.82)",
          fontFamily,
          fontWeight: 600,
          fontSize: 26,
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
          opacity: enter,
        }}
      >
        연출 화면
      </div>
    </AbsoluteFill>
  );
};
