/**
 * 웹 클릭 퍼널 실측.
 *
 * ── 측정 기록 (다음 재측정 때 비교 기준으로 쓴다) ────────────────────
 *  2026-07-26  랜딩 원탭 개편 + 후킹 강화 배포 직전
 *    유튜브 33개 · 평균 조회 434 · 좋아요율 0.15%
 *    실제 클릭 의도 17건(일 1.28) · 쿠팡 도달 19건 · 커미션 0원
 *  2026-08-09  개편 2주 후
 *    유튜브 40개 · 평균 조회 431 · 좋아요율 0.09%
 *    실제 클릭 의도 10건(일 0.71) · 쿠팡 도달 14건 · 커미션 4,704원
 *    → 조회·클릭은 안 늘고 좋아요율 하락. 병목은 "조회→링크"(CTR 0.08%).
 *      단 도달 후 전환은 좋음(클릭당 336원).
 *  주의: slot 계측과 subId 부착은 2026-08-03 배포라 그 이전 데이터엔 없다.
 * ───────────────────────────────────────────────────────────────
 *
 * 원본 click_logs 는 그대로 쓰면 안 된다. 두 종류의 가짜가 섞여 있다:
 *  1) 자동 순회 — 같은 UA 가 "서로 다른 번호" 를 초 단위로 훑음 (7/22: 31개 번호, 간격 0초)
 *     → 사람이 아니다. 통째로 제외.
 *  2) 중복 탭 — 같은 UA 가 "같은 번호" 를 몇 초 안에 반복 탭 (8/05: 4번을 5초에 8번)
 *     → 사람이 맞다. 다만 구매 의도는 1건이므로 1건으로 합친다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { supabaseAdmin } from "../src/lib/supabase";

const CUTOFF = "2026-07-26T00:00:00Z"; // 개편 배포
const SLOT_SHIPPED = "2026-08-03"; // slot 계측 배포일
const UA_BOT = /bot|crawler|spider|slurp|preview|headless|python|curl|wget|node-fetch|axios/i;
const DEDUP_WINDOW_SEC = 120; // 같은 사람이 같은 상품을 다시 누른 것으로 볼 시간
const CRAWL_GAP_SEC = 5;
const CRAWL_MIN_DISTINCT = 5; // 이 개수 이상 서로 다른 번호를 연속으로 훑으면 크롤

type Row = {
  display_number: number;
  slot: string | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
};

/**
 * 유입 채널 판정. 랜딩 진입 URL 이 referer 헤더에 통째로 남아(동일 출처 이동),
 * 인스타 바이오 링크에 붙여둔 utm_source=ig 가 그대로 실려 온다.
 * → DB 컬럼을 새로 파지 않고도 채널을 가를 수 있다.
 */
function sourceOf(referrer: string | null): string {
  const r = referrer ?? "";
  if (/utm_source=ig|fbclid=|instagram/i.test(r)) return "인스타";
  if (/utm_source=(yt|youtube)|youtube\.com/i.test(r)) return "유튜브";
  if (/[?&]s=direct|\/n\//.test(r)) return "영상 직행링크";
  if (r) return "출처표시 없음";
  return "(referrer 없음)";
}

function classify(rows: Row[]) {
  const crawl = new Set<number>();
  const byUa = new Map<string, number[]>();
  rows.forEach((r, i) => byUa.set(r.user_agent ?? "", [...(byUa.get(r.user_agent ?? "") ?? []), i]));

  // 1) 자동 순회 탐지: 연속(≤5초) 구간 안에서 서로 다른 번호가 5개 이상
  for (const idxs of byUa.values()) {
    let run: number[] = [];
    const flush = () => {
      if (new Set(run.map((i) => rows[i].display_number)).size >= CRAWL_MIN_DISTINCT)
        run.forEach((i) => crawl.add(i));
      run = [];
    };
    for (const cur of idxs) {
      const prev = run[run.length - 1];
      const gap = prev === undefined ? Infinity
        : (Date.parse(rows[cur].created_at) - Date.parse(rows[prev].created_at)) / 1000;
      if (gap <= CRAWL_GAP_SEC) run.push(cur);
      else { flush(); run = [cur]; }
    }
    flush();
  }

  // 2) 남은 것 중 (UA+번호) 가 짧은 시간 안에 반복되면 1건으로 합침
  const kept: Row[] = [];
  const lastSeen = new Map<string, number>();
  let merged = 0;
  rows.forEach((r, i) => {
    if (crawl.has(i) || UA_BOT.test(r.user_agent ?? "")) return;
    const key = `${r.user_agent ?? ""}|${r.display_number}`;
    const t = Date.parse(r.created_at);
    const prev = lastSeen.get(key);
    if (prev !== undefined && (t - prev) / 1000 <= DEDUP_WINDOW_SEC) { merged++; return; }
    lastSeen.set(key, t);
    kept.push(r);
  });
  return { crawl: crawl.size, merged, kept };
}

async function main() {
  const { data, error } = await supabaseAdmin()
    .from("click_logs")
    .select("display_number, slot, user_agent, referrer, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Row[];
  const { crawl, merged, kept } = classify(all);

  console.log(`원본 클릭 ${all.length}건`);
  console.log(`  − 자동 순회 ${crawl}건  − UA 봇 ${all.filter((r) => UA_BOT.test(r.user_agent ?? "")).length}건  − 중복 탭 합침 ${merged}건`);
  console.log(`  = 실제 클릭 의도 ${kept.length}건`);

  const now = Date.now();
  const win = (d: number) => kept.filter((r) => now - Date.parse(r.created_at) <= d * 86400_000).length;
  console.log(`  최근 7일 ${win(7)}건 · 최근 14일 ${win(14)}건 · 최근 30일 ${win(30)}건`);
  console.log(`  마지막 클릭: ${kept[kept.length - 1]?.created_at.slice(0, 16) ?? "없음"}`);

  const before = kept.filter((r) => r.created_at < CUTOFF);
  const after = kept.filter((r) => r.created_at >= CUTOFF);
  const perDay = (rows: Row[], from: string, to: number) =>
    (rows.length / Math.max(1, (to - Date.parse(from)) / 86400_000)).toFixed(2);
  const firstTs = all[0]?.created_at ?? CUTOFF;
  console.log(`\n개편(${CUTOFF.slice(0, 10)}) 전후 · 실제 의도만`);
  console.log(`  전 ${before.length}건 → 일 ${perDay(before, firstTs, Date.parse(CUTOFF))}건`);
  console.log(`  후 ${after.length}건 → 일 ${perDay(after, CUTOFF, now)}건`);

  const slotted = kept.filter((r) => r.created_at.slice(0, 10) >= SLOT_SHIPPED);
  console.log(`\n랜딩 slot (계측 ${SLOT_SHIPPED} 배포 이후 ${slotted.length}건):`);
  const m = new Map<string, number>();
  for (const r of slotted) m.set(r.slot ?? "(미기록)", (m.get(r.slot ?? "(미기록)") ?? 0) + 1);
  for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v}건`);

  console.log("\n유입 채널 (실제 의도 기준):");
  const src = new Map<string, number>();
  for (const r of kept) src.set(sourceOf(r.referrer), (src.get(sourceOf(r.referrer)) ?? 0) + 1);
  for (const [k, v] of [...src].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(16)} ${v}건`);

  console.log("\n일자별 실제 클릭 의도:");
  const day = new Map<string, number>();
  for (const r of kept) day.set(r.created_at.slice(0, 10), (day.get(r.created_at.slice(0, 10)) ?? 0) + 1);
  for (const [k, v] of day) console.log(`  ${k}  ${"█".repeat(v)} ${v}`);
}
main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
