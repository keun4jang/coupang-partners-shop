import React from "react";
import { Audio } from "remotion";

/**
 * 장면 나레이션 오디오 (data URI mp3).
 * Sequence 안에서 사용 - 장면이 끝나면 자동으로 잘린다.
 * src 가 없으면(합성 실패 등) 아무것도 렌더하지 않는다.
 */
export const Narration: React.FC<{ src?: string | null }> = ({ src }) => {
  if (!src) return null;
  return <Audio src={src} />;
};
