/**
 * 대표 사진 검사 자가 점검 (모델 주장 검증기).
 *
 * 2026-09-14 첫 진단에서 flash-lite 는 상품 100개 중 11개를 "외국어 문구 박힘"
 * 으로 걸렀는데 11건 전부 가짜 양성이었다 — 영어 브랜드명, 제품 포장지 문구,
 * 심지어 한국어까지 외국어로 신고했다. 프롬프트를 조이는 것만으로는 이런
 * 실수를 막을 수 없어서, 모델이 근거로 내민 문구를 looksCjk 로 다시 본다.
 *
 * 여기서는 그 실제 오판 사례를 그대로 회귀 테스트로 박아 둔다. 나중에 누가
 * 정규식을 손대도 같은 실수가 되살아나지 않게.
 *
 * 실행: npx tsx scripts/imagecheck-selftest.ts   (또는 npm run imagecheck:check)
 */
import { looksCjk } from "../src/lib/productImageCheck";

let failures = 0;

function expectRejected(label: string, sample: string): void {
  if (looksCjk(sample)) {
    failures++;
    console.error(`✗ [가짜 양성] ${label}\n   근거로 통과돼 버림: "${sample}"`);
  }
}

function expectAccepted(label: string, sample: string): void {
  if (!looksCjk(sample)) {
    failures++;
    console.error(`✗ [놓침] ${label}\n   중국어/일본어인데 걸러짐: "${sample}"`);
  }
}

// ── 1. 2026-09-14 진단에서 실제로 잘못 걸린 11건 ────────────────
// 전부 "모델이 중국어라고 신고했지만 아닌" 문구다. 하나라도 통과하면 회귀다.
const REAL_FALSE_POSITIVES: Array<[string, string]> = [
  ["무전기에 인쇄된 영어", "Antenna"],
  ["브랜드명", "GREATWALL"],
  ["한국어 설명", "줄에 들어갔어요. 눈에"],
  ["브랜드명(슬래시 포함)", "MA/ER"],
  ["포장지 영어 문구", "comet, Natural, KITCHEN TOWEL"],
  ["제품명 영어", "EGG PANG"],
  ["한국어 색상 옵션", "화이트 블랙 핑크"],
  ["원산지 표기", "MADE IN KOREA KUMYONG"],
  ["북유럽풍 브랜드명", "kerätä"],
  ["제품 기능 영어", "Plasma Ion Care Bladeless"],
  ["제품 스펙 영어", "NEWSUN 3.7V Li-ion Cordless Driver"],
];
for (const [label, sample] of REAL_FALSE_POSITIVES) expectRejected(label, sample);

// ── 2. 그 밖에 걸리면 안 되는 것 ──────────────────────────────
expectRejected("빈 근거(모델이 근거를 못 댐)", "");
expectRejected("공백만", "   ");
expectRejected("숫자·기호", "3.7V / 220V · 50Hz");
expectRejected("한글 단독", "대용량 스텐 밀폐용기");
// 한국어 문장에 한자가 낀 경우 - 중국 광고가 아니다
expectRejected("한자 낀 한국어", "特價 세일 중");
expectRejected("한자 낀 한국어2", "無線 청소기");

// ── 3. 반드시 걸러야 하는 것 (진짜 중국어·일본어) ──────────────
expectAccepted("247번의 실제 문구", "收纳小巧 轻松提起");
expectAccepted("중국 공급사 홍보", "厂家直销 品质保证");
expectAccepted("간체 한 구절", "多功能收纳盒");
expectAccepted("번체", "多功能收納盒");
expectAccepted("일본어 히라가나", "かんたん収納");
expectAccepted("일본어 가타카나", "キッチン用品");
expectAccepted("중국어+영어 혼합", "收纳箱 STORAGE BOX");

if (failures > 0) {
  console.error(`\n대표 사진 검사 자가 점검 실패 ${failures}건`);
  process.exit(1);
}
console.log("대표 사진 검사 자가 점검 통과 (가짜 양성 0건, 놓침 0건)");
