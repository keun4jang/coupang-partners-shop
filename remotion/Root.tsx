import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { DURATION_IN_FRAMES, VIDEO } from "./config/videoConfig";
import { ShortsProps, defaultShortsProps } from "./types";
import { TemplateA } from "./templates/TemplateA";
import { TemplateB } from "./templates/TemplateB";
import { TemplateC } from "./templates/TemplateC";
import { TemplateD } from "./templates/TemplateD";
import { TemplateE } from "./templates/TemplateE";
import {
  TOP10_FPS,
  TOP10_HEIGHT,
  TOP10_WIDTH,
  TemplateTop10,
  Top10Props,
  top10DurationSeconds,
} from "./templates/TemplateTop10";

/** 나레이션 타이밍(timing.ctaTo)이 있으면 영상 길이를 거기에 맞춘다 */
const calculateMetadata: CalculateMetadataFunction<ShortsProps> = ({ props }) => ({
  durationInFrames: Math.round(
    (props.timing?.ctaTo ?? VIDEO.durationSeconds) * VIDEO.fps
  ),
});

/** 상품 개수에 맞춰 길이를 계산 (렌더 시간 실측 프로토타입 - 정식 연동 전) */
const top10Metadata: CalculateMetadataFunction<Top10Props> = ({ props }) => ({
  durationInFrames: Math.round(top10DurationSeconds(props) * TOP10_FPS),
});

const defaultTop10Props: Top10Props = { categoryLabel: "생활템", items: [] };

export const RemotionRoot: React.FC = () => {
  const shared = {
    width: VIDEO.width,
    height: VIDEO.height,
    fps: VIDEO.fps,
    durationInFrames: DURATION_IN_FRAMES,
    defaultProps: defaultShortsProps,
    calculateMetadata,
  };

  return (
    <>
      <Composition id="TemplateA" component={TemplateA} {...shared} />
      <Composition id="TemplateB" component={TemplateB} {...shared} />
      <Composition id="TemplateC" component={TemplateC} {...shared} />
      <Composition id="TemplateD" component={TemplateD} {...shared} />
      <Composition id="TemplateE" component={TemplateE} {...shared} />
      <Composition
        id="TemplateTop10"
        component={TemplateTop10}
        width={TOP10_WIDTH}
        height={TOP10_HEIGHT}
        fps={TOP10_FPS}
        durationInFrames={secToDefaultFrames()}
        defaultProps={defaultTop10Props}
        calculateMetadata={top10Metadata}
      />
    </>
  );
};

function secToDefaultFrames() {
  return 60 * TOP10_FPS; // 실제 길이는 calculateMetadata 가 props.items 로 다시 계산
}
