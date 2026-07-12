import React from "react";
import { DISCLOSURE_TEXT, FONT_SIZES, LAYOUT } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/** 하단 대가성 문구 - 영상 내내 작게 표시 (하단 데드존 위에 배치) */
export const Disclosure: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: LAYOUT.disclosureBottom,
        left: 0,
        width: "100%",
        textAlign: "center",
        color: "rgba(255, 255, 255, 0.85)",
        fontSize: FONT_SIZES.disclosure,
        fontWeight: 400,
        fontFamily,
        textShadow: "0 1px 6px rgba(0,0,0,0.5)",
      }}
    >
      {DISCLOSURE_TEXT}
    </div>
  );
};
