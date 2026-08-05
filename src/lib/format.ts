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
 * 제품의 정체를 알려주는 "핵심 명사". 이걸로 끝나는 단어를 제품명의 기준점으로 삼는다.
 * (쿠팡 제목은 "브랜드 + 수식어 나열 + 핵심명사 + 구성/색상/개수" 구조라
 *  끝 단어가 곧 제품인 경우가 드물다. 예: "…빨래건조대 스틸 3단 … 신발걸이")
 */
const CORE_NOUNS = [
  // 청소·세탁
  "청소기", "세탁기", "건조대", "건조기", "걸레", "밀대", "빗자루", "쓰레받기",
  "청소포", "청소도구", "청소솔", "청소브러쉬", "브러쉬", "브러시", "수세미", "행주",
  "세제", "세정제", "제거제", "세척제", "살균제", "클리너", "크리너", "클렌저", "스프레이",
  // 수납·정리
  "수납장", "서랍장", "정리함", "정리대", "정리랙", "정리트레이", "수납함", "수납백",
  "수납박스", "보관함", "리빙박스", "폴딩박스", "바구니", "바스켓", "트레이", "선반",
  "거치대", "스탠드", "홀더", "행거", "옷걸이", "옷장", "팬트리", "걸이",
  // 주방
  "도마", "채칼", "주걱", "스파츌라", "뒤집개", "국자", "스푼", "집게", "핀셋",
  "키친툴", "조리도구", "조리기구", "주방용품", "냄비", "프라이팬", "믹싱볼",
  "그릇", "접시", "면기", "물병", "착즙기", "가림막", "물막이", "거름망", "디스펜서",
  "장갑", "손잡이", "시트지", "매트",
  // 위생·육아
  "물티슈", "티슈", "타올", "타월", "수건", "손수건", "욕조", "세면대", "크레용",
  "칫솔", "샴푸캡", "수유등", "탕온계", "트리머", "워머", "턱받이", "속싸개",
  "젖병", "풀장", "의자", "리클라이너", "샴푸", "워시",
  // 가전·기타
  "카메라", "이어폰", "헤드폰", "스피커",
].sort((a, b) => b.length - a.length);

/** 위 명사가 하나도 없을 때만 쓰는 일반 명사 (단독으로는 제품을 특정하지 못한다) */
const FALLBACK_NOUNS = [
  "케이스", "커버", "세트", "박스", "스틱", "패드", "시트", "봉", "판", "팩",
  "랙", "볼", "솔", "캡", "통", "함", "백", "대", "기",
].sort((a, b) => b.length - a.length);

/** 앞 단어와 붙어야 뜻이 사는 조각 ("기름때 방지"의 "방지") */
const FRAGMENT_WORD = /^(방지|가능|겸용|절약|조절|없이|전용|용)$/;

/** 색상·구성처럼 제품을 설명하지 않는 토막 */
const NOISE_WORD =
  /^(화이트|블랙|그레이|베이지|아이보리|실버|브라운|네이비|핑크|옐로우|오렌지|그린|블루|레드|퍼플|투명|반투명|크림|차콜|은색|검정색?|흰색|단일색상|단일상품|단일\s*제품|혼합색상|혼합|랜덤발송|무료배송|증정|사은품|정품|단품|본품|본체|택1|단순배송상품|캡형|캡|리필|타입|형태|포함|구성|옵션|프로모션|할인|특가|세일|이벤트|베스트|신상)$/;

/** 제품명을 표시용 단어 배열로 정리 (옵션·개수·색상 제거) */
function nameWords(name: string): string[] {
  let s = (name ?? "").trim();
  s = s.replace(/[[\]【】_]/g, " "); // 대괄호 태그는 내용만, 밑줄은 구분자로
  s = s.replace(/\d+\s*\+\s*\d+/g, " "); // "1+1" 같은 행사 표기
  s = s.split(/[,()]/)[0]; // 첫 쉼표/괄호 뒤는 옵션
  s = s.split("+")[0]; // "본체+리필" 구성품
  // 개수/용량 토큰 제거 ("2개입", "3단", "500ml", "19L", "핸들2개", "높이9cm")
  // 앞이 영문이면 모델명이므로 건드리지 않는다 ("8IN1", "X4", "H400").
  // (lookbehind 는 구형 사파리에서 파싱 에러가 나므로 캡처로 대신한다)
  s = s.replace(
    /([A-Za-z])?\d+(?:\.\d+)?\s*(?:개입|개|매|입|세트|팩|구|병|장|종|단|겹|통|롤|캔|인치|p|ea|ml|l|kg|g|cm|mm)(?![가-힣a-z])/gi,
    (m, pre) => (pre ? m : " ")
  );
  return s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !NOISE_WORD.test(w) && !/^\d+$/.test(w));
}

/** 핵심 명사 위치. 같은 계열이 반복되면(쿠팡 제목의 키워드 반복) 그게 주력 상품이다 */
function coreNounIndex(words: string[]): number {
  for (const list of [CORE_NOUNS, FALLBACK_NOUNS]) {
    const hits: { i: number; key: string }[] = [];
    words.forEach((w, i) => {
      const key = list.find((n) => w.endsWith(n));
      if (key) hits.push({ i, key });
    });
    if (hits.length === 0) continue;
    const count = new Map<string, number>();
    for (const h of hits) count.set(h.key, (count.get(h.key) ?? 0) + 1);
    const [topKey, topCount] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    // 반복된 명사가 있으면 그 첫 등장 위치, 없으면 가장 오른쪽 명사.
    // (오른쪽 우선: "냄비 손잡이 … 주방장갑"의 실제 상품은 주방장갑이다.
    //  왼쪽을 잡으면 "마르쿠진 냄비"처럼 다른 물건으로 읽힌다)
    return topCount >= 2
      ? hits.find((h) => h.key === topKey)!.i
      : hits[hits.length - 1].i;
  }
  return -1;
}

/**
 * 영상 카드/캡션에 쓸 짧은 제품명.
 * 긴 쿠팡 제품명("브랜드 수식어… 제품+구성품, 개수/색상")에서 옵션을 걷어내고
 * 핵심 명사를 기준으로 [브랜드 + 수식어 + 핵심명사] 형태로 줄인다.
 * (DB 원본 이름은 그대로 두고 표시에만 사용)
 *
 * 예전에는 길면 "첫 단어 + 끝 단어"로 만들었는데, 끝 단어가 핵심 명사가 아니라
 * "New 신발걸이"(실제로는 빨래건조대), "허글리 향"(세탁세제)처럼 오인 소지가 있었다.
 */
export function shortenProductName(name: string, maxLen = 18): string {
  const words = nameWords(name);
  if (words.length === 0) {
    // 정리하고 나니 남는 단어가 없는 이례적인 이름 - 구분자만 걷어내고 그대로
    return (name ?? "")
      .replace(/[,()+[\]_]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen);
  }

  const full = words.join(" ");
  if (full.length <= maxLen) return full;

  const nounAt = coreNounIndex(words);
  const end = nounAt >= 0 ? nounAt : words.length - 1;
  const noun = words[end];
  if (end === 0) return noun.slice(0, maxLen).trim();

  // 브랜드(첫 단어)는 고정하고, 핵심 명사 왼쪽 수식어를 들어가는 만큼 붙인다
  let out = `${words[0]} ${noun}`;
  if (out.length > maxLen) return noun.slice(0, maxLen).trim();
  const mods: string[] = [];
  for (let k = end - 1; k >= 1; k--) {
    const next = [words[0], words[k], ...mods, noun].join(" ");
    if (next.length > maxLen) break;
    // "물자국 없는", "기름때 방지"처럼 앞 단어와 한 덩어리인 수식어는
    // 짝을 못 붙이면 넣지 않는다 ("무루어 없는 다용도 마법행주" 같은 토막 방지)
    if (/[는은]$/.test(words[k]) || FRAGMENT_WORD.test(words[k])) {
      const withPair = [words[0], words[k - 1], words[k], ...mods, noun].join(" ");
      if (k - 1 < 1 || withPair.length > maxLen) break;
    }
    mods.unshift(words[k]);
    out = next;
  }
  return out;
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
