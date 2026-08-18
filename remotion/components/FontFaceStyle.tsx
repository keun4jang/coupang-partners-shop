import React from "react";
import { staticFile } from "remotion";
import { EDITORIAL_FONT_NAME, FONT_NAME } from "../fonts";

const NOTO_WEIGHTS = ["400", "700", "900"] as const;

/** Pretendard 는 파일명이 두께 이름이라 (숫자, 파일명) 쌍으로 매핑한다 */
const PRETENDARD_WEIGHTS: ReadonlyArray<readonly [string, string]> = [
  ["400", "Regular"],
  ["600", "SemiBold"],
  ["800", "ExtraBold"],
];

/**
 * @font-face CSS 선언 (delayRender 없이 순수 CSS 로 로드).
 * Remotion 은 프레임 캡처 전 폰트 로딩 완료를 자동으로 기다리므로
 * 별도 delayRender/continueRender 관리가 필요 없다.
 */
export const FontFaceStyle: React.FC = () => (
  <style>
    {[
      ...NOTO_WEIGHTS.map(
        (weight) => `
      @font-face {
        font-family: '${FONT_NAME}';
        src: url('${staticFile(`fonts/NotoSansKR-${weight}.woff2`)}') format('woff2');
        font-weight: ${weight};
        font-display: block;
      }
    `
      ),
      ...PRETENDARD_WEIGHTS.map(
        ([weight, file]) => `
      @font-face {
        font-family: '${EDITORIAL_FONT_NAME}';
        src: url('${staticFile(`fonts/Pretendard-${file}.woff2`)}') format('woff2');
        font-weight: ${weight};
        font-display: block;
      }
    `
      ),
    ].join("\n")}
  </style>
);
