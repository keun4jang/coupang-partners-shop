import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { VIDEO } from "../config/videoConfig";
import { editorialFontFamily } from "../fonts";
import { FontFaceStyle } from "./FontFaceStyle";

/**
 * 영상 첫 프레임(1프레임)이자 유튜브/인스타 커스텀 썸네일용 정적 화면.
 *
 * 2026-10-08 사장님: "썸네일 디자인이 너무 AI 가 만든 것 같다" → 시안 3종 중 B(사진 위주) 채택.
 * 예전 표지의 코랄 그라데이션 띠·흰 테두리·글자 외곽선·그림자 카드를 전부 걷고,
 * 흰 바탕에 검정 글씨 + 상품 사진만 남겼다.
 *  - 위: 큰 글씨 훅, 짧은 검정 줄, "누구에게" 작은 줄(이 물건이 꼭 필요한 사람)
 *  - 아래: 상품 사진을 화면 폭 가득
 * 애니메이션 없이 처음부터 완성된 상태로 그린다(1프레임만 존재).
 *
 * 데드존: 인스타 프로필 그리드는 세로 9:16 커버를 위·아래로 잘라 보여주고,
 * 재생 중엔 상·하단에 플랫폼 UI가 겹친다. 그래서 글자·사진을
 * 세로 12%~88% 안쪽에 둔다.
 */
const INK = "#1F1B17";

/** 훅 길이에 맞춰 두 줄 안에 들어가게 */
function headlineSize(text: string): number {
  const n = text.replace(/\s/g, "").length;
  if (n <= 9) return 124;
  if (n <= 14) return 110;
  return 100;
}

export const CoverFrame: React.FC<{
  productImageUrl: string | null;
  /** 파이프라인 호환용(현재 썸네일엔 미표시 - 번호는 영상 끝 CTA에 노출) */
  displayNumber?: number;
  hookLine: string;
  /** "누구에게" 작은 줄. 없으면(옛 대본) 줄과 함께 생략 */
  forWho?: string | null;
}> = ({ productImageUrl, hookLine, forWho }) => {
  const W = VIDEO.width;
  const H = VIDEO.height;
  const pad = W * 0.07;
  return (
    <AbsoluteFill style={{ background: "#FFFFFF", fontFamily: editorialFontFamily }}>
      <FontFaceStyle />
      <div
        style={{
          position: "absolute",
          top: H * 0.36,
          left: 0,
          right: 0,
          height: H * 0.52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {productImageUrl ? (
          <Img src={productImageUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontSize: 220 }}>🧺</span>
        )}
      </div>
      <div style={{ position: "absolute", top: H * 0.12, left: pad, right: pad }}>
        <div
          style={{
            color: INK,
            fontWeight: 800,
            fontSize: headlineSize(hookLine),
            lineHeight: 1.18,
            letterSpacing: "-0.035em",
            wordBreak: "keep-all",
            textWrap: "balance",
          }}
        >
          {hookLine}
        </div>
        {forWho ? (
          <>
            <div style={{ marginTop: 30, height: 6, width: 120, background: INK }} />
            <div style={{ marginTop: 26, color: "#5B524A", fontSize: 50, fontWeight: 600 }}>
              {forWho}
            </div>
          </>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
