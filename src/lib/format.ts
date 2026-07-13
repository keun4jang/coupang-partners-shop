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

/**
 * 영상 카드/캡션에 쓸 짧은 제품명.
 * 긴 쿠팡 제품명("브랜드 수식어… 제품+구성품, 개수/색상")에서 부가정보를 걷어내고
 * 브랜드+핵심 명사 위주로 줄인다. (DB 원본 이름은 그대로 두고 표시에만 사용)
 */
export function shortenProductName(name: string, maxLen = 18): string {
  let s = (name ?? "").trim();
  // 쉼표/여는 괄호 뒤, '+' 뒤(구성품) 잘라내기
  s = s.split(/[,(]/)[0].split("+")[0];
  // 개수/단위 토큰 제거
  s = s.replace(/\d+\s*(개입|개|매|입|세트|팩|구|병|장|p|ea)\b/gi, " ").replace(/\s+/g, " ").trim();
  // 끝에 붙는 부가 수식어(형태/구성/색상 등)를 반복적으로 떼어낸다
  const TAIL =
    /\s+(본체|리필|세트|대용량|혼합\s*색상|택\s*1|단품|증정|무료배송|캡형|캡|타입|형태|정품)\s*$/;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(TAIL, "").trim();
  }
  if (s.length <= maxLen) return s;
  // 여전히 길면 브랜드(첫 단어)+핵심 명사(끝 단어)만
  const words = s.split(" ");
  if (words.length >= 3) {
    const short = `${words[0]} ${words[words.length - 1]}`;
    if (short.length <= maxLen) return short;
  }
  return s.slice(0, maxLen).trim();
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

/** 드라이브 파일명 규칙: {displayNumber}번_{safeProductName}(suffix).ext (예: 1번_차량용미니청소기.mp4) */
export function driveFileName(
  displayNumber: number,
  productName: string,
  kind: "video" | "caption" | "thumbnail"
): string {
  const base = `${formatDisplayNumber(displayNumber)}_${safeProductName(productName)}`;
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
