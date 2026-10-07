import React, { createContext, useContext } from "react";
import { DISCLOSURE_TEXT, FONT_SIZES, LAYOUT } from "../config/videoConfig";
import { fontFamily } from "../fonts";

/**
 * 영상 하단 고지 문구. 템플릿 루트에서 props.disclosureText 로 덮어쓴다
 * (사장님 본인 상품 = 판매자 고지, 그 외 = 쿠팡파트너스 고지).
 * 고지 컴포넌트가 템플릿 안쪽 깊이 있어 props 대신 컨텍스트로 내려보낸다.
 */
export const DisclosureTextContext = createContext<string>(DISCLOSURE_TEXT);
export const useDisclosureText = () => useContext(DisclosureTextContext);

/** 숏폼 템플릿을 감싸 props.disclosureText 를 하단 고지 컨텍스트로 넣는다 (Root.tsx) */
export function withDisclosureText<P extends { disclosureText?: string | null }>(
  Template: React.FC<P>
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <DisclosureTextContext.Provider value={props.disclosureText || DISCLOSURE_TEXT}>
      <Template {...props} />
    </DisclosureTextContext.Provider>
  );
  Wrapped.displayName = `WithDisclosure(${Template.displayName ?? Template.name})`;
  return Wrapped;
}

/** 하단 대가성 문구 - 영상 내내 작게 표시 (하단 데드존 위에 배치) */
export const Disclosure: React.FC = () => {
  const text = useDisclosureText();
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
        {text}
      </span>
    </div>
  );
};
