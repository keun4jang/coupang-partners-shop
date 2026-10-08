/**
 * 선정 시점 대표 사진 게이트 자가 점검 (takeFirstPassing).
 *
 * 왜 이 파일이 따로 있나: 이 게이트의 위험은 "안 걸러지는 것"이 아니라
 * "검사한 척 통과시키는 것"이다. 2026-09-15 전체 진단이 API 일일 한도가 말라
 * 1,100건을 조용히 통과시키고도 로그에는 "문제 0건"으로 찍혔다. 여기 걷는
 * 규칙에도 통과 처리가 세 군데 있다(검사 불가·예산 소진·사진 없음). 그래서
 * 규칙 자체를 API·DB 없이 시험할 수 있게 검사 함수와 시계를 주입한다.
 *
 * 실행: npx tsx scripts/selector-selftest.ts   (또는 npm run selector:check)
 */
import { orderBySpreadKeyword, takeFirstPassing } from "../src/lib/productSelector";
import { offBrandReason } from "../src/lib/appeal";
import type { Product } from "../src/types/db";

let failures = 0;

function check(label: string, cond: boolean, detail = ""): void {
  if (!cond) {
    failures++;
    console.error(`✗ ${label}${detail ? `\n   ${detail}` : ""}`);
  }
}

/** 시험용 상품. id 로 순서를 확인한다 */
function product(id: string, image: string | null = "https://img/x.jpg"): Product {
  return {
    id,
    product_name: `상품 ${id}`,
    category: "생활템",
    target_user: null,
    pain_point: null,
    main_benefit: null,
    price_text: null,
    source: "coupang",
    coupang_partner_url: "https://link",
    affiliate_url: null,
    image_url: image,
    source_memo: null,
    status: "candidate",
    source_video_url: null,
    source_video_origin: null,
    source_video_checked_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const FAR_FUTURE = Date.now() + 3600_000;
const ids = (list: Product[]) => list.map((p) => p.id).join(",");

async function main() {
  // ── 1. 앞쪽이 떨어지면 그 다음 순번으로 메운다 (편수가 비면 안 된다) ──
  {
    const pool = ["a", "b", "c", "d"].map((i) => product(i));
    const { picked, rejected, checks } = await takeFirstPassing(pool, 2, {
      check: async (p) =>
        p.id === "a" || p.id === "b"
          ? { ok: false, reason: "중국어·일본어 박힘" }
          : { ok: true, reason: "정상" },
      deadlineAt: FAR_FUTURE,
      maxChecks: 10,
    });
    check("떨어진 만큼 다음 후보로 채운다", ids(picked) === "c,d", `뽑힘: ${ids(picked)}`);
    check("떨어진 상품을 돌려준다(paused 대상)", ids(rejected) === "a,b");
    check("필요한 만큼만 검사한다", checks === 4, `검사 ${checks}회`);
  }

  // ── 2. 검사 불가(null)는 통과 처리한다 (검사 장치가 죽어도 발행은 나간다) ──
  {
    const pool = ["a", "b"].map((i) => product(i));
    const { picked, rejected } = await takeFirstPassing(pool, 2, {
      check: async () => null,
      deadlineAt: FAR_FUTURE,
      maxChecks: 10,
    });
    check("검사 불가는 통과", ids(picked) === "a,b", `뽑힘: ${ids(picked)}`);
    check("검사 불가는 paused 대상이 아니다", rejected.length === 0);
  }

  // ── 3. 횟수 예산을 넘기면 남은 자리는 검사 없이 채운다 ──
  {
    const pool = ["a", "b", "c", "d", "e"].map((i) => product(i));
    let called = 0;
    const { picked, checks } = await takeFirstPassing(pool, 3, {
      check: async () => {
        called++;
        return { ok: false, reason: "제품이 안 보임" };
      },
      deadlineAt: FAR_FUTURE,
      maxChecks: 2,
    });
    check("예산을 넘겨 검사하지 않는다", called === 2, `검사 ${called}회`);
    check("예산 소진 뒤에는 검사 없이 채운다", picked.length === 3, `뽑힘 ${picked.length}개`);
    check("검사 횟수를 정확히 보고한다", checks === 2);
  }

  // ── 4. 시간 예산도 같다 (한 건이 오래 걸려도 큐잉이 멈추지 않는다) ──
  {
    const pool = ["a", "b", "c"].map((i) => product(i));
    let clock = 1_000;
    let called = 0;
    const { picked } = await takeFirstPassing(pool, 3, {
      check: async () => {
        called++;
        clock += 60_000; // 한 건에 60초 걸린 셈
        return { ok: true, reason: "정상" };
      },
      deadlineAt: 1_000 + 15_000,
      maxChecks: 99,
      now: () => clock,
    });
    check("마감을 넘기면 더 검사하지 않는다", called === 1, `검사 ${called}회`);
    check("마감 뒤에도 편수는 다 채운다", ids(picked) === "a,b,c", `뽑힘: ${ids(picked)}`);
  }

  // ── 5. 사진 없는 상품은 API 를 쓰지 않고 건너뛴다 (paused 도 아니다) ──
  {
    const pool = [product("a", null), product("b", ""), product("c")];
    let called = 0;
    const { picked, rejected } = await takeFirstPassing(pool, 1, {
      check: async () => {
        called++;
        return { ok: true, reason: "정상" };
      },
      deadlineAt: FAR_FUTURE,
      maxChecks: 10,
    });
    check("사진 없는 상품은 검사하지 않는다", called === 1, `검사 ${called}회`);
    check("사진 있는 다음 후보를 고른다", ids(picked) === "c", `뽑힘: ${ids(picked)}`);
    check("사진 없는 상품은 paused 대상이 아니다", rejected.length === 0);
  }

  // ── 6. 전부 떨어지면 빈손으로 돌려준다 (나쁜 사진을 되살리지 않는다) ──
  {
    const pool = ["a", "b"].map((i) => product(i));
    const { picked, rejected } = await takeFirstPassing(pool, 2, {
      check: async () => ({ ok: false, reason: "중국어·일본어 박힘" }),
      deadlineAt: FAR_FUTURE,
      maxChecks: 10,
    });
    check("통과가 없으면 아무것도 안 뽑는다", picked.length === 0);
    check("둘 다 paused 대상", rejected.length === 2);
  }

  // 같은 키워드 연속 방지 (2026-10-08 암막커튼 두 번 연속)
  {
    const mk = (id: string, kw: string | null): Product => ({
      ...product(id),
      source_memo: kw ? `스카우트 · '${kw}' 검색 · [cpid:${id}] · 2026-10-08` : "골드박스",
    });
    const out = orderBySpreadKeyword(
      [mk("a", "암막커튼"), mk("b", "암막커튼"), mk("c", "텀블러"), mk("d", null), mk("e", "수세미")],
      ["수세미"]
    ).map((p) => p.id);
    check("같은 키워드는 하나만 앞에", out.join("") === "acdbe", out.join(""));
  }

  // 품목 규칙 (2026-10-05 스카우트에서 새어 들어온 실제 이름들)
  {
    const blocked = [
      "[골드박스] ★연휴찬스★ 경주월드 종일권(~10/11) 소인",
      "★롯데월드 아쿠아리움 1인권(~10/18)",
      "라이프익스텐션 뉴로-매그 마그네슘 L-트레오네이트 베지테리안 캡슐",
      "곰곰 2026년산 햅쌀 소중한 우리쌀 상등급",
      "비비고 왕교자 (냉동)",
    ];
    for (const n of blocked) check(`부적합 품목 차단: ${n}`, offBrandReason(n) !== null);
    const allowed = ["피지 캡슐세제 60개", "쌀통 10kg", "아이스크림 스쿱", "식기건조대 2단", "쌀국수 그릇", "핸드크림 거치대"];
    for (const n of allowed) check(`살림템 통과: ${n}`, offBrandReason(n) === null, String(offBrandReason(n)));
  }

  if (failures > 0) {
    console.error(`\n자가 점검 실패 ${failures}건`);
    process.exit(1);
  }
  console.log("선정 게이트 자가 점검 통과 (통과 처리 경로 3종 포함)");
}

main().catch((e) => {
  console.error("자가 점검 실행 실패:", e);
  process.exit(1);
});
