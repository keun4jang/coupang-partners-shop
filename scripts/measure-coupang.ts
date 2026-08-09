/** 쿠팡파트너스 커미션 리포트: 도달 클릭 / 커미션 / 주문 (30일 단위로 나눠 조회) */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { fetchCommissionReport } from "../src/lib/coupang";

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

async function window_(label: string, start: Date, end: Date) {
  const rows = await fetchCommissionReport(ymd(start), ymd(end));
  const click = rows.reduce((s, r) => s + r.click, 0);
  const comm = rows.reduce((s, r) => s + r.commission, 0);
  console.log(
    `${label} (${ymd(start)}~${ymd(end)}): 도달 클릭 ${click}건 · 커미션 ${comm.toLocaleString()}원 · 리포트 행 ${rows.length}`
  );
  const bySub = new Map<string, { c: number; k: number }>();
  for (const r of rows) {
    const k = r.subId || "(subId 없음)";
    const v = bySub.get(k) ?? { c: 0, k: 0 };
    v.c += r.commission; v.k += r.click;
    bySub.set(k, v);
  }
  if (bySub.size) {
    for (const [k, v] of [...bySub].sort((a, b) => b[1].k - a[1].k).slice(0, 10))
      console.log(`    subId ${k.padEnd(16)} 클릭 ${v.k} · 커미션 ${v.c.toLocaleString()}원`);
  }
  return { click, comm };
}

async function main() {
  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400_000);

  console.log("=== 쿠팡파트너스 커미션 리포트 ===");
  const recent = await window_("개편 후 (최근 14일)", daysAgo(14), today);
  const prior = await window_("개편 전 (그 이전 14일)", daysAgo(28), daysAgo(15));
  await window_("전체 (최근 30일)", daysAgo(29), today);

  console.log(
    `\n개편 전 → 후: 도달 클릭 ${prior.click} → ${recent.click} · 커미션 ${prior.comm} → ${recent.comm}원`
  );
}
main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
