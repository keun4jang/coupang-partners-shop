/**
 * 꿀팁 없음 집계 (읽기만) - 2026-11-05 사장님 "추천대로 진행": 어떤 상품이 꿀팁 주제가 안 맞아 빠지는지,
 * 남은 후보(candidate) 재고 중 꿀팁 규칙에 맞는 게 몇 개인지 숫자로 본다. 쿠팡 API 는 부르지 않는다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { supabaseAdmin } from "../src/lib/supabase";
import { matchTipTopicsByRule } from "../src/lib/tipMatch";

type Row = { id: string; product_name: string; category: string | null; status: string; source_memo: string | null };

function tally(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const db = supabaseAdmin();
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("products").select("id, product_name, category, status, source_memo").range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const missed = all.filter((r) => (r.source_memo ?? "").includes("꿀팁없음"));
  const cand = all.filter((r) => r.status === "candidate");
  const candFit = cand.filter((r) => matchTipTopicsByRule(r.product_name).length > 0);
  console.log(`전체 상품 ${all.length}개 · 꿀팁없음으로 빠진 상품 ${missed.length}개 · 남은 후보 ${cand.length}개 (꿀팁 규칙 맞음 ${candFit.length}개)`);

  const days = tally(missed, (r) => (r.source_memo ?? "").match(/꿀팁없음 (\d{4}-\d{2}-\d{2})/)?.[1] ?? "?");
  console.log("\n── 꿀팁없음 날짜별 ──");
  for (const [d, n] of days.sort()) console.log(`  ${d}  ${n}개`);

  console.log("\n── 꿀팁없음 카테고리별 ──");
  for (const [c, n] of tally(missed, (r) => r.category ?? "미분류")) console.log(`  ${c.padEnd(10)} ${n}개`);
  console.log("\n── 꿀팁없음 상품 예시 (카테고리별 최대 6개) ──");
  const byCat = new Map<string, Row[]>();
  for (const r of missed) byCat.set(r.category ?? "미분류", [...(byCat.get(r.category ?? "미분류") ?? []), r]);
  for (const [c, rs] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [${c}]`);
    for (const r of rs.slice(0, 6)) console.log(`    - ${r.product_name.slice(0, 40)}`);
  }

  console.log("\n── 남은 후보 카테고리별 (꿀팁 규칙 맞음 / 전체) ──");
  const candCat = tally(cand, (r) => r.category ?? "미분류");
  for (const [c, n] of candCat) {
    const fit = candFit.filter((r) => (r.category ?? "미분류") === c).length;
    console.log(`  ${c.padEnd(10)} ${fit} / ${n}`);
  }
  console.log("\n── 남은 후보 중 꿀팁 규칙 안 맞는 상품 예시 ──");
  for (const r of cand.filter((r) => !candFit.includes(r)).slice(0, 25)) console.log(`  - [${r.category ?? "미분류"}] ${r.product_name.slice(0, 40)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
