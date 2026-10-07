/**
 * 사장님 본인 상품을 DB 에 맞춘다(수동 실행용). 평소에는 queueDailyVideos 가
 * 큐잉할 때마다 같은 일을 자동으로 하므로 따로 돌릴 필요가 없다.
 * 목록은 src/lib/ownProducts.ts OWN_PRODUCTS.
 *
 * 실행: npx tsx scripts/seed-own-products.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { ensureOwnProducts } from "../src/lib/videoItems";

ensureOwnProducts()
  .then((r) => console.log(`본인 상품: 추가 ${r.added} · 갱신 ${r.updated}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
