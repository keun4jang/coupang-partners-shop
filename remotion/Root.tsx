import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { DURATION_IN_FRAMES, VIDEO } from "./config/videoConfig";
import { ShortsProps, defaultShortsProps } from "./types";
import { TemplateA } from "./templates/TemplateA";
import { TemplateB } from "./templates/TemplateB";
import { TemplateC } from "./templates/TemplateC";

/** 나레이션 타이밍(timing.ctaTo)이 있으면 영상 길이를 거기에 맞춘다 */
const calculateMetadata: CalculateMetadataFunction<ShortsProps> = ({ props }) => ({
  durationInFrames: Math.round(
    (props.timing?.ctaTo ?? VIDEO.durationSeconds) * VIDEO.fps
  ),
});

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
    </>
  );
};
