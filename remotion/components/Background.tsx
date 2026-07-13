import React, { useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BGM, COLORS, MOTION, VIDEO } from "../config/videoConfig";
import { FontFaceStyle } from "./FontFaceStyle";
import { useVideoConfig } from "remotion";

/** 밝은 배경음악 - 나레이션을 가리지 않게 아주 작게, 끝에서 페이드아웃 */
const BgmAudio: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const fadeFrames = Math.round(BGM.fadeOutSeconds * VIDEO.fps);
  return (
    <Audio
      src={staticFile(BGM.file)}
      loop
      volume={(f) =>
        interpolate(
          f,
          [0, 12, durationInFrames - fadeFrames, durationInFrames],
          [0, BGM.volume, BGM.volume, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      }
    />
  );
};

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

/** 상품 사진을 흐리게 깔아주는 레이어 - 글자만 있는 초반 화면이 허전하지 않게 */
const BlurredImageLayer: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <AbsoluteFill style={{ opacity: 0.3 }}>
      <Img
        src={src}
        onError={() => setFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(30px) saturate(0.9)",
          transform: "scale(1.2)",
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * 영상 배경: B-roll(mp4) 이 있으면 줌 모션과 함께 사용, 없으면 그라디언트 모션
 * 위에 상품 사진을 흐리게(블러+저불투명) 깔아 내용과 연결되게 한다.
 * 자막 가독성을 위해 위→아래 따뜻한 틴트를 얹는다.
 *
 * brollFiles + cutSeconds 가 있으면(포맷 D) 장면 경계마다 다음 클립으로
 * 전환되는 멀티컷 배경으로 동작한다.
 */
export const Background: React.FC<{
  brollFile: string | null;
  /** 흐린 배경으로 깔 상품 이미지 (data URI 권장) */
  bgImageUrl?: string | null;
  /** 멀티컷 배경 클립 목록 (있으면 brollFile 보다 우선) */
  brollFiles?: string[] | null;
  /** 각 컷의 시작 시각(초). 길이 = 컷 수, 첫 값은 0 */
  cutSeconds?: number[];
}> = ({ brollFile, bgImageUrl, brollFiles, cutSeconds }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const brollSrc = brollFile ? staticFile(`assets/broll/${brollFile}`) : null;

  // 멀티컷: 각 컷 구간마다 다른 클립 재생 (클립이 모자라면 순환)
  const cuts =
    brollFiles && brollFiles.length > 0 && cutSeconds && cutSeconds.length > 0
      ? cutSeconds.map((startSec, i) => ({
          fromFrame: Math.round(startSec * fps),
          toFrame:
            i + 1 < cutSeconds.length
              ? Math.round(cutSeconds[i + 1] * fps)
              : durationInFrames,
          file: brollFiles[i % brollFiles.length],
        }))
      : null;

  const zoom = interpolate(
    frame,
    [0, durationInFrames],
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
      <BgmAudio />
      <AbsoluteFill style={{ transform: `scale(${zoom + pulse})` }}>
        {cuts ? (
          <>
            {cuts.map((cut, i) => (
              <Sequence
                key={i}
                from={cut.fromFrame}
                durationInFrames={cut.toFrame - cut.fromFrame}
              >
                <OffthreadVideo
                  src={staticFile(`assets/broll/${cut.file}`)}
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Sequence>
            ))}
          </>
        ) : brollSrc ? (
          <OffthreadVideo
            src={brollSrc}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <GradientMotion />
        )}
        {bgImageUrl && <BlurredImageLayer src={bgImageUrl} />}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${COLORS.overlayTintTop} 0%, rgba(0,0,0,0) 40%, ${COLORS.overlayTintBottom} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
