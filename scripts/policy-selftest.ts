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
import {
  checkPublishTexts,
  findPolicyIssues,
  stripBannedFromProductName,
} from "../src/lib/policy";
import { ctaLine, fallbackCopy, composeScriptText } from "../src/lib/ai";
import { youtubeShortsDescription, instagramCaption } from "../src/lib/publishCopy";
import { youtubeTitle } from "../src/lib/youtube";
import { longformDescription, longformTitle } from "../src/lib/longform";
import { cleanProductTitle, shortenProductName } from "../src/lib/format";
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

// ── 7. 판매자 상품명이 발행을 막지 않는지 (2026-09-06 리뷰에서 나온 회귀) ──
//
// 쿠팡 상품명에는 판매자가 붙인 마케팅 문구가 그대로 들어 있다. 이게 제목·설명에
// 섞여 검사에 걸리면, 렌더까지 끝낸 멀쩡한 영상이 발행 직전에 통째로 막힌다.
// 우리가 고칠 수 있는 문구도 아니라(쿠팡에서 받아온 값) 알림을 봐도 손쓸 데가 없다.
// → stripBannedFromProductName 으로 걷어낸 뒤 내보내는 게 맞는 처리다.
const REAL_WORLD_NAMES = [
  "쿠팡특가 스텐 3단 접이식 선반, 화이트, 1개",
  "[한정수량] 극세사 물걸레 청소포 100매",
  "무조건 잘 붙는 초강력 흡착 후크 6개입",
  "오늘만 이 가격 대용량 주방세제 1.5L",
  "국민 대박템 실리콘 주방장갑 2개",
  "최저가 도전 논슬립 옷걸이 50개",
];
for (const raw of REAL_WORLD_NAMES) {
  const clean = shortenProductName(stripBannedFromProductName(raw));
  if (!clean) {
    failures++;
    console.error(`✗ [정화 과다] "${raw}" → 이름이 통째로 사라짐`);
    continue;
  }
  expectClean(`상품명 정화(제목): ${raw}`, youtubeTitle(65, clean));
  expectClean(`상품명 정화(설명): ${raw}`, youtubeShortsDescription(65, clean));
  expectClean(`상품명 정화(롱폼): ${raw}`, `1위. ${cleanProductTitle(stripBannedFromProductName(raw))} - 12,900원`);
}

// ── 8. 구버전 대본의 옛 후기 줄이 랜딩에 뜨지 않는지 ──
//
// 6줄 대본은 [후킹, 공감, 장점1, 장점2, 후기, CTA] 라 index 4 가 옛 후기 줄이다.
// 이 줄은 지금 금칙어에 걸리는 표현이라, 검사기가 확실히 잡아야 한다.
const LEGACY_REVIEW_LINES = [
  "재구매 후기가 수백 개씩 쌓이는 데는 이유가 있더라고요",
  "하나 써보고 더 주문했다는 후기가 많아요",
  "엄마들 커뮤니티에서 입소문 난 데는 다 이유가 있더라고요",
  "출산 선물로도 많이 나가는 스테디셀러라고 하더라고요",
];
for (const line of LEGACY_REVIEW_LINES) {
  expectFlagged("구버전 후기 줄", line);
}

if (failures > 0) {
  console.error(`\n정책 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("정책 자가 점검 통과 (가짜 양성 0건, 놓침 0건)");
