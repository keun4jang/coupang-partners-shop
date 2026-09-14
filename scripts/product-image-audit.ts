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
 *   npm run images:audit
 *
 * --apply 는 products.status 를 'paused' 로 바꾼다. 삭제가 아니라서
 * 언제든 되돌릴 수 있고, paused 는 영상 생성 대상에서 빠진다(productSelector).
 * 이미 영상이 나간 상품은 영상 자체를 건드리지 않는다 - 그건 사람이 판단할 일이다.
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

/**
 * 호출 사이에 쉬는 시간. 1.2초(=분당 50회)로 돌렸더니 100건 중 6건이 429
 * (분당 한도 초과)로 날아갔다(2026-09-14 실측). 분당 20회 아래로 낮춘다.
 * 검사 모듈 자체도 429 면 15초 쉬고 한 번 더 시도한다.
 */
const DELAY_MS = 3_500;

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

async function main() {
  const products = await loadCandidates();
  const targets = products.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(
    `점검 대상 ${targets.length}개 (전체 candidate ${products.length}개)` +
      `${apply ? " · --apply: 문제 상품을 paused 로 바꿉니다" : " · 진단만 (변경 없음)"}`
  );

  const bad: Array<{ p: Product; reason: string }> = [];
  let checked = 0;
  let unchecked = 0;

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

  const ids = bad.map((b) => b.p.id);
  const { error } = await supabaseAdmin()
    .from("products")
    .update({ status: "paused" })
    .in("id", ids);
  if (error) throw new Error(`상태 변경 실패: ${error.message}`);
  console.log(`\n${ids.length}개를 paused 로 바꿨습니다 (삭제 아님 - 되돌릴 수 있습니다).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
