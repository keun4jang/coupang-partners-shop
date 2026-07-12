import React from "react";
import { staticFile } from "remotion";
import { FONT_NAME } from "../fonts";

const WEIGHTS = ["400", "700", "900"] as const;

/**
 * @font-face CSS 선언 (delayRender 없이 순수 CSS 로 로드).
 * Remotion 은 프레임 캡처 전 폰트 로딩 완료를 자동으로 기다리므로
 * 별도 delayRender/continueRender 관리가 필요 없다.
 */
export const FontFaceStyle: React.FC = () => (
  <style>
    {WEIGHTS.map(
      (weight) => `
      @font-face {
        font-family: '${FONT_NAME}';
        src: url('${staticFile(`fonts/NotoSansKR-${weight}.woff2`)}') format('woff2');
        font-weight: ${weight};
        font-display: block;
      }
    `
    ).join("\n")}
  </style>
);
