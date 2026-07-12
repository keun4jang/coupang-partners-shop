import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { COLORS, DURATION_IN_FRAMES, MOTION, VIDEO } from "../config/videoConfig";
import { FontFaceStyle } from "./FontFaceStyle";

/** B-roll 없이 쓰는 그라디언트 모션 배경 (부드러운 베이지 블롭이 떠다님) */
const GradientMotion: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / VIDEO.fps;

  const x1 = 540 + Math.sin(t * 0.7) * 220;
  const y1 = 500 + Math.cos(t * 0.5) * 180;
  const x2 = 540 + Math.cos(t * 0.4 + 2) * 260;
  const y2 = 1300 + Math.sin(t * 0.6 + 1) * 220;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.cream} 0%, ${COLORS.accentSoft} 55%, ${COLORS.accent} 100%)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: x1 - 350,
          top: y1 - 350,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: COLORS.accent,
          opacity: 0.5,
          filter: "blur(120px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x2 - 300,
          top: y2 - 300,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: COLORS.primary,
          opacity: 0.35,
          filter: "blur(140px)",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * 영상 배경: B-roll(mp4) 이 있으면 줌 모션과 함께 사용, 없으면 그라디언트 모션.
 * 자막 가독성을 위해 위→아래 따뜻한 틴트를 얹는다.
 */
export const Background: React.FC<{ brollFile: string | null }> = ({
  brollFile,
}) => {
  const frame = useCurrentFrame();
  const brollSrc = brollFile ? staticFile(`assets/broll/${brollFile}`) : null;

  const zoom = interpolate(
    frame,
    [0, DURATION_IN_FRAMES],
    [MOTION.bgZoomFrom, MOTION.bgZoomTo],
    { extrapolateRight: "clamp" }
  );
  // 0.8~1.5초마다 시각 변화: 미세한 줌 펄스
  const pulse =
    Math.sin((frame / VIDEO.fps / MOTION.pulseSeconds) * Math.PI * 2) *
    MOTION.pulseScale;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.cream }}>
      <FontFaceStyle />
      <AbsoluteFill style={{ transform: `scale(${zoom + pulse})` }}>
        {brollSrc ? (
          <OffthreadVideo
            src={brollSrc}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <GradientMotion />
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${COLORS.overlayTintTop} 0%, rgba(0,0,0,0) 40%, ${COLORS.overlayTintBottom} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
