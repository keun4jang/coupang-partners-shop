/**
 * 선반(구체적 구매 키워드 비교 롱폼) 주제 후보 집계 (2026-10-07).
 *
 * 왜: 롱폼 실측에서 조회의 48%가 '세탁세제 추천·식기건조대'처럼 구체적 구매 검색어에서 왔다.
 * 선반 1호 키워드를 고르려면 키워드별로 (a) 이미 숏폼이 나가 대본이 있는 상품 수,
 * (b) 아직 안 쓴 후보 상품 수를 알아야 한다.
 *
 * 읽기 전용: Supabase select 만. 쿠팡·유튜브 API 없음.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";

const KEYWORDS = [
  "전기요", "전기장판", "온수매트", "전기담요", "가습기", "제습기", "히터", "난로", "온풍기",
  "세탁세제", "캡슐세제", "섬유유연제", "식기건조대", "건조대", "빨래건조대", "수세미",
  "밀폐용기", "보온병", "텀블러", "보조배터리", "청소기", "물걸레", "행거", "수납", "선반",
  "도어락", "멀티탭", "방풍", "문풍지", "뽁뽁이", "극세사", "이불", "베개", "슬리퍼",
];

async function all<T>(table: string, cols: string, filter?: (q: any) => any): Promise<T[]> {
  const db = supabaseAdmin();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main(): Promise<void> {
  type P = { id: string; product_name: string; status: string; source_memo: string | null };
  type V = { product_id: string; video_status: string };
  const products = await all<P>("products", "id, product_name, status, source_memo");
  const vids = await all<V>("video_items", "product_id, video_status", (q) => q.eq("video_status", "completed"));
  const published = new Set(vids.map((v) => v.product_id));

  console.log("키워드 | 숏폼 나간 상품 | 미사용 후보 | 예시(숏폼 나간 것)");
  const rows = KEYWORDS.map((kw) => {
    const hit = products.filter((p) => p.product_name.includes(kw) || (p.source_memo ?? "").includes(`'${kw}'`));
    const pub = hit.filter((p) => published.has(p.id));
    const fresh = hit.filter((p) => !published.has(p.id) && p.status === "candidate");
    return { kw, pub, fresh };
  }).sort((a, b) => b.pub.length - a.pub.length);
  for (const r of rows) {
    const ex = r.pub.slice(0, 3).map((p) => p.product_name.slice(0, 24)).join(" / ");
    console.log(`${r.kw} | ${r.pub.length} | ${r.fresh.length} | ${ex}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
