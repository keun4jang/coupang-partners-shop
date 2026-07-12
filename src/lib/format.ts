/** http/https 스킴만 허용 (관리자 폼으로 저장되는 링크가 그대로 redirect 되므로 검증 필요) */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 사용자에게 보이는 번호 표기.
 * 반드시 앞자리 0 없이 "17번" 형식. "017번" 형식은 절대 사용하지 않는다.
 */
export function formatDisplayNumber(n: number): string {
  return `${n}번`;
}

/** 파일명에 안전한 상품명 (한글 유지, 공백/특수문자 제거) */
export function safeProductName(name: string): string {
  return (
    name
      .replace(/\s+/g, "")
      .replace(/[\\/:*?"<>|#%&{}$!'@+`=~^;,.\[\]()]/g, "")
      .slice(0, 40) || "상품"
  );
}

/** 드라이브 파일명 규칙: {displayNumber}_{safeProductName}(suffix).ext */
export function driveFileName(
  displayNumber: number,
  productName: string,
  kind: "video" | "caption" | "thumbnail"
): string {
  const base = `${displayNumber}_${safeProductName(productName)}`;
  switch (kind) {
    case "video":
      return `${base}.mp4`;
    case "caption":
      return `${base}_caption.txt`;
    case "thumbnail":
      return `${base}_thumbnail.png`;
  }
}

/** YYYY-MM-DD (KST 기준 날짜 폴더명) */
export function dateFolderName(date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
