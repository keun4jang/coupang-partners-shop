import React, { createContext, useContext } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { DISCLOSURE_TEXT, FONT_SIZES, LAYOUT } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 영상 하단 고지 문구. 템플릿 루트에서 props.disclosureText 로 덮어쓴다
 * (사장님 본인 상품 = 판매자 고지, 그 외 = 쿠팡파트너스 고지).
 * 고지 컴포넌트가 템플릿 안쪽 깊이 있어 props 대신 컨텍스트로 내려보낸다.
 */
export const DisclosureTextContext = createContext<string>(DISCLOSURE_TEXT);
export const useDisclosureText = () => useContext(DisclosureTextContext);

/**
 * 고지 표시 방식 (2026-10-15 사장님 "추천대로 진행", 10/26 렌더분부터):
 *  always = 영상 내내, edges = 처음 3초 + 마지막 3초만(공정위 지침의 "동영상 시작·끝 표시").
 * 쇼츠 설명란·릴스 '더보기' 안 고지는 바로 안 보이므로 영상 속 고지 자체는 없애지 않는다.
 *  off = 표시 안 함 - **근사장 본인 상품만** (2026-10-19 사장님 "2번": 화면 판매자 문구는 빼고 캡션·설명에만).
 *        파트너스 상품에는 절대 쓰지 않는다 (render-worker 가 본인 상품일 때만 넣는다).
 */
export type DisclosureMode = "always" | "edges" | "off";
export const DisclosureModeContext = createContext<DisclosureMode>("always");
const EDGE_SECONDS = 3;

/** 지금 프레임에 고지를 보여야 하는가 */
export function useDisclosureVisible(): boolean {
  const mode = useContext(DisclosureModeContext);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (mode === "off") return false;
  if (mode !== "edges") return true;
  const edge = EDGE_SECONDS * fps;
  return frame < edge || frame >= durationInFrames - edge;
}

/** 숏폼 템플릿을 감싸 props.disclosureText 를 하단 고지 컨텍스트로 넣는다 (Root.tsx) */
export function withDisclosureText<P extends { disclosureText?: string | null; disclosureMode?: DisclosureMode | null }>(
  Template: React.FC<P>
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <DisclosureTextContext.Provider value={props.disclosureText || DISCLOSURE_TEXT}>
      <DisclosureModeContext.Provider value={props.disclosureMode || "always"}>
        <Template {...props} />
      </DisclosureModeContext.Provider>
    </DisclosureTextContext.Provider>
  );
  Wrapped.displayName = `WithDisclosure(${Template.displayName ?? Template.name})`;
  return Wrapped;
}

/** 하단 대가성 문구 - 영상 내내 작게 표시 (하단 데드존 위에 배치) */
export const Disclosure: React.FC = () => {
  const text = useDisclosureText();
  const visible = useDisclosureVisible();
  const mode = useContext(DisclosureModeContext);
  if (!visible) return null;
  return (
    // 2026-10-19 사장님: 문장에 테두리·배경을 넣지 말자 → 상자 없이 글자만.
    // 밝은 화면에서도 읽히도록 은은한 그림자만 깐다 (테두리 선·배경 상자는 없음).
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
          // edges 모드는 짧은 문구라 조금 더 작게 (10/26~)
          fontSize: mode === "edges" ? Math.round(FONT_SIZES.disclosure * 0.9) : FONT_SIZES.disclosure,
          fontWeight: 500,
          fontFamily,
          textShadow: "0 1px 6px rgba(0, 0, 0, 0.55), 0 0 2px rgba(0, 0, 0, 0.35)",
        }}
      >
        {text}
      </span>
    </div>
  );
};
