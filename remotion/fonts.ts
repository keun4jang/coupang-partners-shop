/**
 * 한글 자막 폰트 (모두 OFL 라이선스 - 무료, 상업 이용 가능).
 * public/fonts/ 의 woff2 를 CSS @font-face 로 선언한다.
 * (렌더용 <FontFaceStyle /> 컴포넌트는 components/FontFaceStyle.tsx 참고)
 *
 * - NotoSansKR 400/700/900: 기존 템플릿(A~D)용
 * - Pretendard 400/600/800: 포맷 E(검증 노트)용 - 컨설팅 반영.
 *   전부 900 두께로 쓰면 위계가 사라지므로 E 는 400/600/800 세 단계를 섞는다.
 */
export const FONT_NAME = "NotoSansKR";

export const fontFamily = `'${FONT_NAME}', 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;

export const EDITORIAL_FONT_NAME = "Pretendard";

export const editorialFontFamily = `'${EDITORIAL_FONT_NAME}', '${FONT_NAME}', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
