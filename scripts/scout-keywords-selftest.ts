/**
 * 스카우트 검색 키워드 예산 배분 자가 점검 (pickTodayKeywords).
 *
 * 2026-09-18: "카테고리를 더 다양하게, 신기한 물품·신제품 위주로" 요청에 맞춰
 * 테크가젯·뷰티헬스·펫용품 세 카테고리를 SCOUT_KEYWORDS 뒤쪽에 추가했다.
 * 배열 위치로만 도는 rotateForToday 에 맡기면 224개 중 뒤쪽인 이 키워드들은
 * 전체가 한 바퀴 돌 때까지(며칠) 한 번도 안 걸릴 수 있다. 그래서 하루 예산
 * 일부를 신규 카테고리에 항상 떼어 주는데, 그 배분 규칙이 실제로 지켜지는지
 * 여기서 확인한다 - 겉보기엔 "매일 45개 검색"으로 똑같아 보여서, 배분이
 * 깨져도 로그만 봐서는 티가 안 난다.
 *
 * 실행: npx tsx scripts/scout-keywords-selftest.ts (또는 npm run scout-keywords:check)
 */
import { EMERGING_CATEGORIES, SCOUT_KEYWORDS } from "../src/lib/coupang";
import { pickTodayKeywords } from "../src/lib/scout";

let failures = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${label}${detail ? `\n   ${detail}` : ""}`);
  }
}

const totalEmerging = SCOUT_KEYWORDS.filter((k) => EMERGING_CATEGORIES.has(k.appCategory)).length;

// ── 1. 신규 카테고리가 매일 몇 건씩은 반드시 섞인다 ──
{
  const picked = pickTodayKeywords(45);
  const emergingPicked = picked.filter((k) => EMERGING_CATEGORIES.has(k.appCategory));
  check("예산 45개 그대로 채워진다", picked.length === 45, `실제: ${picked.length}`);
  check(
    "신규 카테고리가 매일 최소 몇 건은 걸린다",
    emergingPicked.length > 0,
    `신규 카테고리 선택 수: ${emergingPicked.length}`
  );
}

// ── 2. 신규 카테고리 3종(테크가젯·뷰티헬스·펫용품)이 실제로 존재한다 ──
// (기존 카테고리만 남고 신규가 통째로 안 붙는 실수를 잡는다)
check("신규 카테고리 키워드가 실제로 있다", totalEmerging > 0, `개수: ${totalEmerging}`);
for (const cat of EMERGING_CATEGORIES) {
  const n = SCOUT_KEYWORDS.filter((k) => k.appCategory === cat).length;
  check(`카테고리 "${cat}" 에 키워드가 있다`, n > 0);
}

// ── 3. 예산이 예약분보다 작아도(테스트처럼) 죽지 않는다 ──
{
  const picked = pickTodayKeywords(3);
  check("작은 예산에서도 죽지 않는다", picked.length === 3, `실제: ${picked.length}`);
}

// ── 4. 신규 카테고리 키워드가 결국 전부 한 번씩은 돌아온다 ──
// (예약분만 매일 똑같은 몇 개로 고정돼 나머지가 영영 안 뽑히는 버그를 잡는다)
{
  const ONE_DAY_MS = 86_400_000;
  const now = Date.now();
  const seen = new Set<string>();
  const cycleDays = Math.ceil(totalEmerging / 8) + 2; // 예약분(8개)이 한 바퀴 도는 데 걸리는 날 + 여유
  for (let d = 0; d < cycleDays; d++) {
    const spy = now + d * ONE_DAY_MS;
    const realNow = Date.now;
    // pickTodayKeywords 내부가 Date.now() 를 직접 쓰므로 잠깐 갈아 끼운다
    Date.now = () => spy;
    try {
      const picked = pickTodayKeywords(45);
      for (const k of picked) {
        if (EMERGING_CATEGORIES.has(k.appCategory)) seen.add(k.keyword);
      }
    } finally {
      Date.now = realNow;
    }
  }
  check(
    `${cycleDays}일이면 신규 카테고리 키워드가 전부 한 번씩 돈다`,
    seen.size === totalEmerging,
    `돈 것: ${seen.size}/${totalEmerging}`
  );
}

if (failures > 0) {
  console.error(`\n스카우트 키워드 배분 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("스카우트 키워드 배분 자가 점검 통과 (신규 카테고리 매일 반영 확인)");
