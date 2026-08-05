import React from "react";
import { DISCLOSURE_TEXT, FONT_SIZES, LAYOUT } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/** 하단 대가성 문구 - 영상 내내 작게 표시 (하단 데드존 위에 배치) */
export const Disclosure: React.FC = () => {
  return (
    // 상품 카드가 길어지면 이 문구와 겹쳐 흰 글씨가 크림색 카드 위에 놓여
    // 읽히지 않는다. 반투명 어두운 배경을 깔아 어떤 화면에서도 읽히게 한다.
    <div
      style={{
        position: "absolute",
        bottom: LAYOUT.disclosureBottom,
        left: 0,
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          maxWidth: "92%",
          textAlign: "center",
          color: "rgba(255, 255, 255, 0.95)",
          fontSize: FONT_SIZES.disclosure,
          fontWeight: 500,
          fontFamily,
          background: "rgba(35, 28, 24, 0.55)",
          borderRadius: 999,
          padding: "8px 20px",
        }}
      >
        {DISCLOSURE_TEXT}
      </span>
    </div>
  );
};
