/**
 * 정책 검사기 자가 점검.
 *
 * 두 가지를 본다.
 *  1) 우리가 실제로 쓰는 문구(프리셋 대본·CTA·설명란·캡션)가 검사기에 걸리지 않는가
 *     → 걸리면 멀쩡한 영상이 발행 직전에 막힌다(가짜 양성).
 *  2) 정책이 금지하는 예시 문구는 확실히 걸리는가 (가짜 음성).
 *
 * 실행: npx tsx scripts/policy-selftest.ts
 */
import { CATEGORY_VARIANTS } from "../src/lib/copyPresets";
import { checkPublishTexts, findPolicyIssues } from "../src/lib/policy";
import { ctaLine, fallbackCopy, composeScriptText } from "../src/lib/ai";
import { youtubeShortsDescription, instagramCaption } from "../src/lib/publishCopy";
import { youtubeTitle } from "../src/lib/youtube";
import { longformDescription, longformTitle } from "../src/lib/longform";
import type { Product } from "../src/types/db";

let failures = 0;

function expectClean(label: string, text: string): void {
  const issues = findPolicyIssues(text);
  if (issues.length > 0) {
    failures++;
    console.error(`✗ [가짜 양성] ${label}\n   걸린 표현: ${issues.join(", ")}\n   문구: ${text.slice(0, 120)}`);
  }
}

function expectFlagged(label: string, text: string): void {
  const issues = findPolicyIssues(text);
  if (issues.length === 0) {
    failures++;
    console.error(`✗ [놓침] ${label}\n   문구: ${text}`);
  }
}

// ── 1. 카테고리 프리셋 전 문장 ───────────────────────────────
for (const [category, v] of Object.entries(CATEGORY_VARIANTS)) {
  const lines = [...v.hooks, ...v.empathies, v.b1, v.b2, ...v.tips, ...v.checks];
  for (const line of lines) expectClean(`프리셋 ${category}`, line);
}

// ── 2. CTA 변형 ─────────────────────────────────────────────
for (let n = 1; n <= 6; n++) expectClean(`CTA ${n}번`, ctaLine(n));

// ── 3. 폴백 대본 + 실제 발행 텍스트 조립 결과 ─────────────────
const sampleProduct: Product = {
  id: "test",
  product_name: "펜로리스 접이식 원터치 다용도 이동식 선반, 5단, 화이트",
  category: "수납템",
  target_user: null,
  pain_point: null,
  main_benefit: null,
  price_text: "36,800원",
  source: "coupang",
  coupang_partner_url: "https://link.coupang.com/a/test",
  affiliate_url: null,
  image_url: null,
  source_memo: null,
  status: "candidate",
  source_video_url: null,
  source_video_origin: null,
  source_video_checked_at: null,
  created_at: "",
  updated_at: "",
};

for (const category of Object.keys(CATEGORY_VARIANTS)) {
  const product = { ...sampleProduct, category };
  for (const n of [7, 65, 201]) {
    const copy = fallbackCopy(product, n);
    const script = composeScriptText(copy, n);
    const title = youtubeTitle(n, "펜로리스 이동식 선반");
    const caption = instagramCaption(copy.captionText, n);
    const description = youtubeShortsDescription(n, "펜로리스 이동식 선반", "usecase");

    const issues = checkPublishTexts({ title, script, caption, description });
    if (issues.length > 0) {
      failures++;
      console.error(
        `✗ [가짜 양성] 발행 텍스트 ${category} ${n}번\n   ${issues
          .map((i) => `${i.field}: ${i.phrases.join(", ")}`)
          .join(" / ")}`
      );
    }
  }
}

// ── 4. 롱폼 제목·설명란 ─────────────────────────────────────
const top10 = Array.from({ length: 10 }, (_, i) => ({
  rank: 10 - i,
  displayNumber: 100 + i,
  productName: "펜로리스 접이식 원터치 다용도 이동식 선반",
  imageUrl: null,
  priceText: "36,800원",
  category: "수납템",
  benefit1: "놀던 공간이 다 수납장이 돼요",
  benefit2: "안 쓸 땐 납작하게 접어둘 수 있어요",
  productId: "p",
  videoItemId: "v",
  linkUrl: "https://link.coupang.com/a/test",
}));
expectClean("롱폼 제목", longformTitle("수납템"));
expectClean(
  "롱폼 설명란",
  longformDescription("수납템", top10, top10.map((_, i) => i * 20))
);

// ── 5. 금지 표현은 확실히 잡히는지 ───────────────────────────
const mustFlag = [
  "지금 눌러보세요, 링크 클릭하시면 됩니다",
  "품절 전에 서둘러 확인하세요",
  "역대급 최저가 특가입니다",
  "후기 수백 개에 다들 만족하는 검증된 인기템이에요",
  "재구매 후기가 많고 평이 좋은 스테디셀러예요",
  "난리난 아이템, 안 사면 손해예요",
  "제가 직접 써봤는데 효과 확실해요",
  "오늘만 한정 수량이라 재입고 어려워요",
];
for (const text of mustFlag) expectFlagged("금지 표현", text);

// ── 6. 정상 표현이 잘못 걸리지 않는지 ────────────────────────
const mustPass = [
  "지금 사용하는 자리에 맞는지 재보면 좋아요",
  "바로 사용할 수 있게 조립돼서 나와요",
  "설치 위치 두께를 먼저 확인해 보세요",
  "걸이형·선반형·흡착형처럼 설치 방식이 먼저 갈려요",
  "1위. 펜로리스 접이식 선반 - 36,800원",
  "제품 정보는 프로필 링크에 정리해 뒀어요",
];
for (const text of mustPass) expectClean("정상 표현", text);

if (failures > 0) {
  console.error(`\n정책 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("정책 자가 점검 통과 (가짜 양성 0건, 놓침 0건)");
