/**
 * 기존 상품 대표 사진 일괄 점검.
 *
 * 스카우트(scout.ts)는 이제 새로 담는 상품의 사진을 검사하지만, 그 전에 쌓인
 * 재고에는 검사가 안 걸려 있다. 이 스크립트로 한 번 훑어 문제 상품을 찾는다.
 *
 * 실행:
 *   npx tsx scripts/product-image-audit.ts               # 진단만 (아무것도 안 바꿈)
 *   npx tsx scripts/product-image-audit.ts --limit 100   # 100개만
 *   npx tsx scripts/product-image-audit.ts --apply       # 문제 상품을 paused 로
 *   npx tsx scripts/product-image-audit.ts --numbers 247,265  # 특정 영상 번호만
 *   npx tsx scripts/product-image-audit.ts --apply --skip 400  # 400개 건너뛰고 이어서
 *   npm run images:audit
 *
 * --numbers 는 영상 번호(display_number)로 그 상품만 콕 집어 판정을 전부 찍는다.
 * 판정 축이 실제로 작동하는지 확인할 때 쓴다 - 2026-09-14 진단에서 "제품이
 * 안 보임"이 두 회차 연속 0건이었는데, 표본에 그런 사진이 없어서인지 모델이
 * 그 판단을 못 해서인지 구분이 안 됐다. 문제를 실제로 본 번호(247)를 직접
 * 찔러보면 그 자리에서 답이 나온다.
 *
 * --apply 는 products.status 를 'paused' 로 바꾼다. 삭제가 아니라서
 * 언제든 되돌릴 수 있고, paused 는 영상 생성 대상에서 빠진다(productSelector).
 * 이미 영상이 나간 상품은 영상 자체를 건드리지 않는다 - 그건 사람이 판단할 일이다.
 *
 * 전체(1,271개)를 돌리면 90분이 넘는다. 그래서 --apply 는 끝에 한 번에 쓰지 않고
 * APPLY_CHUNK 건씩 그때그때 반영한다 - 중간에 타임아웃이나 오류로 끊겨도 거기까지는
 * 남는다. paused 가 된 상품은 다음 실행의 조회 대상(status=candidate)에서 빠지므로
 * 그냥 다시 돌리면 이어서 진행되고, 이미 통과한 상품까지 다시 보기 싫으면
 * --skip 으로 앞부분을 건너뛴다(진행 로그의 "N/전체" 숫자를 그대로 주면 된다).
 */
import dotenv from "dotenv";
// quiet: dotenv 17 은 로드할 때마다 홍보성 팁 배너를 찍는다. 그 줄이 진단
// 로그에 섞이면 결과를 읽는 사람(이나 에이전트)이 오해한다.
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";
import { checkProductImage } from "../src/lib/productImageCheck";
import type { Product } from "../src/types/db";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const skipIdx = args.indexOf("--skip");
const skip = skipIdx >= 0 ? Math.max(0, Number(args[skipIdx + 1]) || 0) : 0;
const numbersIdx = args.indexOf("--numbers");
const numbers =
  numbersIdx >= 0
    ? (args[numbersIdx + 1] ?? "")
        .split(",")
        .map((n) => Number.parseInt(n.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

/**
 * 호출 사이에 쉬는 시간. 1.2초(=분당 50회)로 돌렸더니 100건 중 6건이 429
 * (분당 한도 초과)로 날아갔다(2026-09-14 실측). 분당 20회 아래로 낮춘다.
 * 검사 모듈 자체도 429 면 15초 쉬고 한 번 더 시도한다.
 */
const DELAY_MS = 3_500;

/** --apply 를 이 건수마다 중간 저장한다 (끊겨도 거기까지는 남게) */
const APPLY_CHUNK = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadCandidates(): Promise<Product[]> {
  // PostgREST 는 limit 미지정 시 1000행에서 조용히 자른다 - 페이지로 다 읽는다.
  const db = supabaseAdmin();
  const all: Product[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("products")
      .select("*")
      .eq("status", "candidate")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`상품 조회 실패: ${error.message}`);
    const rows = (data ?? []) as Product[];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

/** 영상 번호로 상품을 찾아 판정을 전부 찍는다 (축이 작동하는지 보는 용도) */
async function inspectNumbers(nums: number[]): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, products(*)")
    .in("display_number", nums);
  if (error) throw new Error(`영상 조회 실패: ${error.message}`);
  // supabase-js 는 조인 결과를 배열로 타이핑하지만 실제로는 단일 객체다
  // (다른 곳도 같은 방식으로 단언한다 - src/lib/report.ts 참고).
  const rows = (data ?? []) as unknown as Array<{
    display_number: number;
    products: Product | null;
  }>;
  if (rows.length === 0) {
    console.log(`해당 번호를 찾지 못했습니다: ${nums.join(", ")}`);
    return;
  }
  for (const row of rows.sort((a, b) => a.display_number - b.display_number)) {
    const p = row.products;
    console.log(`\n── ${row.display_number}번 ──`);
    if (!p) {
      console.log("  상품이 연결돼 있지 않습니다.");
      continue;
    }
    console.log(`  상품명: ${p.product_name}`);
    console.log(`  사진: ${p.image_url ?? "(없음)"}`);
    const verdict = await checkProductImage({
      imageUrl: p.image_url,
      productName: p.product_name,
    });
    if (!verdict) {
      console.log("  판정: 검사 불가 (키 없음·다운로드 실패·API 오류)");
      continue;
    }
    console.log(`  판정: ${verdict.ok ? "통과" : "부적합"} — ${verdict.reason}`);
    console.log(`    중국어·일본어: ${verdict.cjkTextOverlay}`);
    console.log(`    제품이 보이나: ${verdict.showsProduct}`);
    console.log(`    주요 피사체: ${verdict.mainSubject || "(응답 없음)"}`);
    await sleep(DELAY_MS);
  }
}

async function main() {
  if (numbers.length > 0) {
    console.log(`영상 번호 ${numbers.join(", ")} 의 대표 사진을 판정합니다 (변경 없음).`);
    await inspectNumbers(numbers);
    return;
  }

  const products = await loadCandidates();
  const afterSkip = products.slice(skip);
  const targets = afterSkip.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(
    `점검 대상 ${targets.length}개 (전체 candidate ${products.length}개` +
      `${skip > 0 ? `, 앞 ${skip}개 건너뜀` : ""})` +
      `${apply ? " · --apply: 문제 상품을 paused 로 바꿉니다" : " · 진단만 (변경 없음)"}`
  );

  const bad: Array<{ p: Product; reason: string }> = [];
  let checked = 0;
  let unchecked = 0;
  let pendingIds: string[] = [];
  let appliedTotal = 0;

  // 모아둔 것을 paused 로 반영하고 비운다. 실패해도 점검은 계속한다
  // (한 번 못 썼다고 남은 1,000여 개 검사를 버릴 이유가 없다).
  async function flushApply(): Promise<void> {
    if (!apply || pendingIds.length === 0) return;
    const ids = pendingIds;
    pendingIds = [];
    const { error } = await supabaseAdmin()
      .from("products")
      .update({ status: "paused" })
      .in("id", ids);
    if (error) {
      console.warn(`  상태 변경 실패 ${ids.length}건(계속 진행): ${error.message.slice(0, 120)}`);
      return;
    }
    appliedTotal += ids.length;
    console.log(`  → ${ids.length}개 paused 반영 (누적 ${appliedTotal}개)`);
  }

  for (const p of targets) {
    const verdict = await checkProductImage({
      imageUrl: p.image_url,
      productName: p.product_name,
    });
    if (!verdict) {
      // 검사 불가(키 없음·네트워크·API 오류). 판정을 내리지 않는다.
      unchecked++;
    } else {
      checked++;
      if (!verdict.ok) {
        bad.push({ p, reason: verdict.reason });
        console.log(`  ✗ ${p.product_name.slice(0, 45)} — ${verdict.reason}`);
        pendingIds.push(p.id);
        if (pendingIds.length >= APPLY_CHUNK) await flushApply();
      }
    }
    if ((checked + unchecked) % 25 === 0) {
      console.log(`  ... ${checked + unchecked}/${targets.length} 진행 (문제 ${bad.length}건)`);
    }
    await sleep(DELAY_MS);
  }

  // 사유를 축별로 나눠 본다. 첫 진단에서 "제품이 안 보임"이 한 번도 안 걸려
  // 그 축이 죽어 있다는 걸 이 집계가 없었으면 못 알아챘을 것이다.
  const byCjk = bad.filter((b) => b.reason.includes("중국어")).length;
  const byNoProduct = bad.filter((b) => b.reason.includes("제품이 안 보임")).length;

  console.log(`\n검사 완료: ${checked}개 판정 · ${unchecked}개 검사 불가 · 문제 ${bad.length}건`);
  console.log(`  사유별: 중국어·일본어 ${byCjk}건 · 제품이 안 보임 ${byNoProduct}건`);
  if (unchecked > 0) {
    console.log("(검사 불가는 GEMINI_API_KEY 미설정이거나 이미지 다운로드/API 실패입니다)");
  }
  if (checked > 0) {
    console.log(`문제 비율: ${((bad.length / checked) * 100).toFixed(1)}%`);
  }

  if (bad.length === 0) return;

  if (!apply) {
    console.log("\n바꾸려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  await flushApply();
  console.log(`\n총 ${appliedTotal}개를 paused 로 바꿨습니다 (삭제 아님 - 되돌릴 수 있습니다).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
