/**
 * 허브·안내 페이지 점검 (읽기만, 링크는 누르지 않음) - 2026-11-04 사장님 "누르면 바로 쿠팡, 가격은 쿠팡에서만".
 * 허브 카드 링크가 /go/ 로 가는지, 안내 페이지(/n)에 가격이 없는지 HTML 로 확인한다.
 */
const BASE = "https://momitemmom.vercel.app";
async function main() {
  for (const p of ["instagram", "youtube-shorts"]) {
    const html = await (await fetch(`${BASE}/from/${p}`)).text();
    const go = html.match(/href="\/go\/(\d+)/g) ?? [];
    const n = html.match(/href="\/n\/(\d+)/g) ?? [];
    console.log(`/from/${p}: 카드 → /go ${go.length}개 · /n ${n.length}개 (예: ${go[0] ?? "-"})`);
    const top = html.split("방금 올라온 영상")[1];
    console.log(`  맨 위 '방금 올라온 영상': ${top ? (top.match(/href="\/go\/(\d+)/g) ?? []).slice(0, 3).map((h) => h.replace(/\D/g, "") + "번").join(", ") : "없음"}`);
  }
  const html = await (await fetch(`${BASE}/from/instagram`)).text();
  const num = html.match(/href="\/go\/(\d+)/)?.[1];
  if (num) {
    const page = await (await fetch(`${BASE}/n/${num}`)).text();
    const hasPrice = /영상 만들 때 가격|[0-9],[0-9]{3}원/.test(page);
    console.log(`/n/${num}: 가격 표시 ${hasPrice ? "있음 ⚠️" : "없음 ✅"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
