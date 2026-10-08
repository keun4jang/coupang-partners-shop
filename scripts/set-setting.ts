/**
 * 운영 설정(app_settings) 한 줄 바꾸기 - 허용된 키만.
 *
 * 왜 따로 두나: 디자인 전환(D↔E)이나 하루 발행 편수처럼 "코드 수정 없이 DB
 * 값 하나로" 바꾸게 만들어 둔 스위치가 있는데, 그 값을 바꾸려면 매번 Supabase
 * 대시보드에 들어가야 했다. 이 스크립트를 settings 워크플로로 돌리면 실행 페이지
 * 한 번으로 끝나고, 되돌릴 때도 같다.
 *
 * app_settings 에는 쿠팡·유튜브 자격증명도 같이 들어 있다. 그래서 아무 키나
 * 쓰게 두지 않고, 아래 ALLOWED 에 적은 키만 정해진 값 형식으로 받는다.
 * 키 목록을 늘릴 때도 값 검증을 꼭 같이 적는다.
 *
 * 실행: npx tsx scripts/set-setting.ts design_template D
 *       npx tsx scripts/set-setting.ts design_template        (현재 값만 보기)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { getSetting, setSetting } from "../src/lib/settings";

const ALLOWED: Record<string, { check: (v: string) => boolean; hint: string }> = {
  // 렌더 템플릿. worker/render-worker.ts 가 FORCE_TEMPLATE·DB template_type 보다
  // 이 값을 먼저 본다.
  design_template: { check: (v) => /^[A-E]$/.test(v), hint: "A~E 중 하나 (지금 쓰는 건 D 또는 E)" },
  // 하루 자동 발행 편수. src/app/api/cron/scout/route.ts 가 1~12 범위만 받는다.
  daily_video_target: {
    check: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 12,
    hint: "1~12 사이 정수",
  },
  // 포맷 D 에서 제품 카드를 첫 장면부터 띄울지. worker/render-worker.ts 가 읽는다.
  d_product_first: { check: (v) => v === "on" || v === "off", hint: "on 또는 off" },
  // 선반(구매 키워드 비교 롱폼) 1회 예약. 다음 새벽 롱폼 창(05:20~06:50 KST)에서 이 주제로
  // 비공개(unlisted) 업로드 후 스스로 비운다. "-" 는 예약 취소. (worker/longform-worker.ts)
  longform_topic_once: {
    check: (v) => v === "-" || /^[가-힣A-Za-z0-9 ]{2,20}$/.test(v),
    hint: "한글·영문·숫자 2~20자 키워드(예: 세탁세제), 취소는 -",
  },
  // 하루에 끼워 넣을 근사장 본인 상품 편수 (src/lib/ownProducts.ts)
  own_product_daily: { check: (v) => /^[0-3]$/.test(v), hint: "0~3" },
};

async function main(): Promise<void> {
  const key = (process.argv[2] ?? "").trim();
  const value = (process.argv[3] ?? "").trim();

  const rule = ALLOWED[key];
  if (!rule) {
    console.error(`바꿀 수 없는 키입니다: "${key}". 허용: ${Object.keys(ALLOWED).join(", ")}`);
    process.exit(1);
  }

  const before = await getSetting(key);
  console.log(`현재 ${key} = ${before ?? "(없음)"}`);
  if (!value) return; // 값 없이 부르면 조회만

  const normalized = key === "design_template" ? value.toUpperCase() : value;
  if (!rule.check(normalized)) {
    console.error(`값이 올바르지 않습니다: "${value}" - ${rule.hint}`);
    process.exit(1);
  }
  if (before === normalized) {
    console.log("이미 같은 값이라 바꾸지 않았습니다.");
    return;
  }

  const ok = await setSetting(key, normalized);
  if (!ok) {
    console.error("저장 실패 - 위 경고를 확인하세요.");
    process.exit(1);
  }
  // 저장됐다고 믿지 않고 다시 읽어 확인한다.
  const after = await getSetting(key);
  console.log(`변경 ${key}: ${before ?? "(없음)"} → ${after}`);
  if (after !== normalized) {
    console.error("다시 읽은 값이 기대와 다릅니다.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("실패:", (e as Error).message);
  process.exit(1);
});
