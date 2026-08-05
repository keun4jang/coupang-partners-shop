import React, { useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BGM, BROLL_VEIL, COLORS, VIDEO } from "../config/videoConfig";
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
  brollDurations?: number[] | null;
  /** 각 컷의 시작 시각(초). 길이 = 컷 수, 첫 값은 0 */
  cutSeconds?: number[];
}> = ({ brollFile, bgImageUrl, brollFiles, brollDurations, cutSeconds }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  // 배경만 아주 천천히 확대(zoom-in) - 정적인 배경에 은은한 생동감
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.08], {
    extrapolateRight: "clamp",
  });
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
          clipFrames: brollDurations?.[i % brollFiles.length]
            ? Math.max(1, Math.round(brollDurations[i % brollFiles.length] * fps))
            : null,
        }))
      : null;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.cream }}>
      <FontFaceStyle />
      <BgmAudio />
      {/* 배경 미디어 - 아주 느린 zoom-in */}
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {cuts ? (
          <>
            {cuts.map((cut, i) => (
              <Sequence
                key={i}
                from={cut.fromFrame}
                durationInFrames={cut.toFrame - cut.fromFrame}
              >
                {/* 클립이 컷 구간보다 짧으면 마지막 프레임에서 멈춰 정지화면처럼
                    보인다. Loop 로 이어 붙여 배경이 계속 움직이게 한다.
                    (이 덕분에 스톡 검색 최소 길이를 16초 → 8초로 낮출 수 있었다) */}
                {cut.clipFrames && cut.clipFrames < cut.toFrame - cut.fromFrame ? (
                  <Loop durationInFrames={cut.clipFrames}>
                    <OffthreadVideo
                      src={staticFile(`assets/broll/${cut.file}`)}
                      muted
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </Loop>
                ) : (
                  <OffthreadVideo
                    src={staticFile(`assets/broll/${cut.file}`)}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
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
        {/* 스톡 영상 위 크림 베일 - 배경에 시선이 쏠리지 않게 */}
        {(cuts || brollSrc) && (
          <AbsoluteFill
            style={{ background: COLORS.cream, opacity: BROLL_VEIL.opacity }}
          />
        )}
      </AbsoluteFill>
      {/* 따뜻한 아이보리/베이지/살구 오버레이 - 차가운 파란통·배경을 살림템 톤으로 */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(255,247,236,0.42) 0%, rgba(243,227,207,0.14) 45%, rgba(255,216,194,0.34) 100%)`,
          mixBlendMode: "multiply",
        }}
      />
      {/* 은은한 빛 번짐(세탁실/베란다 햇살 느낌) - 상단 중앙 소프트 글로우 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(58% 40% at 50% 24%, rgba(255,253,248,0.5) 0%, rgba(255,253,248,0) 70%)`,
        }}
      />
      {/* 가독성용 상·하단 그라데이션 (하단은 자막·정보가 묻히지 않게 살짝 어둡게) */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${COLORS.overlayTintTop} 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 62%, ${COLORS.overlayTintBottom} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
