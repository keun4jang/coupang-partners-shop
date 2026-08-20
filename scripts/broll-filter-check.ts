/**
 * 스톡 클립 필터 회귀 검사.
 *
 * 실행: npx tsx scripts/broll-filter-check.ts
 *
 * 케이스는 전부 "실제로 배경에 깔렸던 클립"의 Pixabay 태그다(추측 아님).
 * 필터를 손볼 때 이걸 먼저 돌려서, 막아야 할 걸 막고 살려야 할 걸 살리는지 본다.
 * 특히 집안일 하는 사람 컷(청소·설거지·빨래)이 사무실/인물 필터에 휩쓸려
 * 날아가지 않는지가 핵심이다 - 그 컷이 우리가 원하는 실사용 장면이다.
 */
import { isUnusableClip } from "../src/lib/broll";

// 실제 캐시된 클립의 Pixabay 태그로 검증한다 (추측 아님)
const CASES: Array<{ id: string; tags: string; query: string; block: boolean; why: string }> = [
  // ── 막아야 하는 것 ──
  { id: "43559", block: true, why: "노트북 치는 사람 (오늘 욕실 세정제 배경으로 깔림)",
    query: "bathroom cleaning spray tiles home",
    tags: "keyboard, laptop, computer, technology, work, typing, desk, student, workplace, working, work from home, home, office, internet, study, web, pc, notebook" },
  { id: "141481", block: true, why: "돈·금융 연출",
    query: "housework daily home", tags: "home, work, business, money, finance, cash" },
  { id: "116266", block: true, why: "달팽이 (동물 필터를 빠져나갔던 케이스)",
    query: "housework daily home", tags: "snail, mollusk, crawl, slow, rain, home" },
  { id: "143162", block: true, why: "차·커피 연출 (세정제와 무관)",
    query: "bathroom cleaning spray tiles home", tags: "tea, drink, cup, hot, coffee, kitchen, to work, house" },
  { id: "200129", block: true, why: "치킨 튀김", query: "wiping kitchen counter home",
    tags: "chicken strips, schnitzel, flesh, meal, grill, cook, food, frying pan, stove, fried, kitchen" },
  { id: "218379", block: true, why: "만화경 모션그래픽", query: "bathroom cleaning spray tiles home",
    tags: "geometric, golden, texture, expanding, moving, motion, symmetry, hexagon, tile, background" },

  // ── 반드시 살려야 하는 것 (사람이 나와도 집안일이면 통과) ──
  { id: "138391", block: false, why: "빗자루로 쓰는 장면", query: "housework daily home",
    tags: "sweeping, sweep, cleaning, broom, home, sawdust, dust, dji, camera" },
  { id: "35778", block: false, why: "소독 스프레이 (세정제에 딱 맞음)", query: "bathroom cleaning spray tiles home",
    tags: "disinfectant, spray, cleaner, disinfect, clean, liquid, sprayer, hygiene, household, chemical, trigger, squirt, disinfecting, cleaning, corona, germs, kills, covid-19, sanitize" },
  { id: "37972", block: false, why: "세탁기·빨래", query: "laundry washing machine clothes home",
    tags: "washing machine, laundry, water, cleaning, italy" },
  { id: "가상1", block: false, why: "책상에서 설거지? → 집안일 신호가 있으면 사무실 단어가 있어도 통과",
    query: "washing dishes home", tags: "woman washing dishes at kitchen sink, work, home" },
  { id: "가상2", block: false, why: "책상 정리 제품이면 desk 는 정답", query: "organizing desk storage home",
    tags: "desk, organizing, office, storage" },
  { id: "가상3", block: false, why: "주방 검색어에서는 요리 장면 허용", query: "kitchen cooking home",
    tags: "cooking, kitchen, food, pan" },
];

let fail = 0;
for (const c of CASES) {
  const got = isUnusableClip(c.tags, c.query);
  const ok = got === c.block;
  if (!ok) fail++;
  console.log(`${ok ? "OK " : "NG "} ${c.block ? "차단" : "통과"} 기대 → ${got ? "차단" : "통과"} | ${c.id} · ${c.why}`);
}
console.log(fail ? `\n❌ ${fail}건 불일치` : `\n✅ ${CASES.length}건 전부 기대대로`);
if (fail) process.exit(1);
