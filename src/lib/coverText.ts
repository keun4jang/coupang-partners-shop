/**
 * 썸네일 "누구에게" 줄 (2026-10-08 사장님: "꼭 필요한 사람한테 이 상품이 갔으면").
 *
 * 표지 맨 위에 작게 "이 물건이 필요한 사람"(예: "출근길에 커피 들고 다니는 분께")을 쓰고,
 * 그 아래 크게 훅을 쓴다. 따로 DB 컬럼을 만들지 않고 video_items.hook_text 에
 * "누구에게\n훅" 두 줄로 담는다(운영 DB 마이그레이션은 사장님이 직접 해야 해서).
 * 한 줄짜리 옛 hook_text 는 그대로 훅으로 읽힌다.
 */

/** 너무 길면 표지에서 두 줄로 넘어가 사진을 가린다 */
export const FOR_WHO_MAX = 22;

export function cleanForWho(raw: string | null | undefined): string | null {
  const s = (raw ?? "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[.!?~…]+$/, "")
    .trim();
  if (!s || s === "-" || s.length > FOR_WHO_MAX) return null;
  return s;
}

/** hook_text 에 저장할 값. 누구에게 줄이 없으면 훅 한 줄만 */
export function packHookText(forWho: string | null | undefined, hook: string): string {
  const who = cleanForWho(forWho);
  return who ? `${who}\n${hook}` : hook;
}

/** hook_text → { forWho, hook }. 옛 한 줄 값은 forWho=null */
export function unpackHookText(hookText: string | null | undefined): {
  forWho: string | null;
  hook: string | null;
} {
  const lines = (hookText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { forWho: null, hook: null };
  if (lines.length === 1) return { forWho: null, hook: lines[0] };
  return { forWho: cleanForWho(lines[0]), hook: lines.slice(1).join(" ") };
}
