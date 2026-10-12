/**
 * 사장님(쿠팡 판매자 '근사장') 본인 상품 (2026-10-07 사장님 요청: "근사장이 판매하는
 * 물품도 중간중간 홍보").
 *
 * 파트너스 상품과 다른 점:
 *  · 링크: 파트너스 링크가 아니라 쿠팡 상품 페이지로 바로 보낸다(수수료가 아니라 판매
 *    마진이 수익). 본인 상품에 파트너스 링크를 걸어 수수료까지 받는 건 규정이 불확실하고,
 *    위반 2회인 계정이라 위험을 지지 않는다. 주소는 affiliate_url 에 두고
 *    coupang_partner_url 은 비운다 - 그래야 subLinks.ts 가 파트너스 짧은 링크를 발급하지
 *    않는다(그 경로는 coupang_partner_url 이 없으면 호출 없이 건너뛴다).
 *  · 고지: "쿠팡파트너스 활동…" 문장은 사실이 아니므로 쓰지 않고, 판매자 본인이
 *    파는 상품임을 밝힌다(판매자가 제3자 추천처럼 꾸미면 기만 광고).
 *  · 편성: status 는 paused 로 둬 일반 선정(candidate)에 섞이지 않게 하고,
 *    queueDailyVideos 가 하루 OWN_DAILY_DEFAULT 편씩 따로 끼워 넣는다. 12개뿐이라
 *    같은 상품이 돌아가며 다시 나온다(영상 수 적은 순).
 *  · 쿠팡 파트너스 API 를 쓰지 않는다 - 상품 정보는 쿠팡 윙(판매자센터)에서 읽어
 *    scripts/seed-own-products.ts 로 넣었다.
 *
 * 표시는 source_memo 의 OWN_MARKER 로 한다(products.source CHECK 제약을 바꾸는
 * 마이그레이션 없이 쓰기 위해).
 */
export const OWN_MARKER = "[own]";
export const OWN_SELLER_NAME = "근사장";

/** 캡션·설명에 들어가는 고지 (파트너스 DISCLOSURE_LINE 자리) */
export const OWN_DISCLOSURE_LINE = `${OWN_SELLER_NAME}이 쿠팡에서 직접 판매하는 제품이에요.`;

/** 영상 하단 화면 고지 (파트너스 DISCLOSURE_TEXT 자리) */
export const OWN_SCREEN_DISCLOSURE = `${OWN_SELLER_NAME}이 직접 판매하는 제품입니다`;

/** 하루에 끼워 넣을 본인 상품 편수 (app_settings.own_product_daily 로 0~3 조정) */
export const OWN_DAILY_DEFAULT = 1;

export function isOwnProduct(p: { source_memo?: string | null } | null | undefined): boolean {
  return Boolean(p?.source_memo?.includes(OWN_MARKER));
}

/**
 * 판매 중인 본인 상품 목록 (2026-10-07 쿠팡 윙 상품 목록에서 읽음 - 읽기만, 수정 없음).
 * 상품을 추가·변경하면 여기를 고친다. queueDailyVideos 가 매번 ensureOwnProducts 로 DB 와 맞춘다.
 */
export type Own = {
  inv: string; // 등록상품ID
  name: string;
  category: string;
  price: string;
  productId: number;
  vendorItemId: number;
  image: string; // image.coupangcdn.com/image/ 뒤 경로
};

/** 상품 1개 → products 행 (DB 쓰기는 videoItems.ts ensureOwnProducts) */
export function ownProductRow(o: Own) {
  return {
    product_name: o.name,
    category: o.category,
    price_text: o.price,
    source: "coupang",
    coupang_partner_url: null,
    affiliate_url: `https://www.coupang.com/vp/products/${o.productId}?vendorItemId=${o.vendorItemId}`,
    image_url: `https://image.coupangcdn.com/image/${o.image}`,
    source_memo: `${OWN_MARKER} [own:${o.inv}] · ${OWN_SELLER_NAME} 본인 판매 상품 · 쿠팡 윙 등록상품ID ${o.inv}`,
    status: "paused",
  };
}

export const OWN_PRODUCTS: Own[] = [
  { inv: "16406646025", name: "승마 안장 패드 퀼팅 종합마장 안장깔개 보아 안감 고정 끈 포함", category: "생활템", price: "30,600원", productId: 8625864138, vendorItemId: 96157334752, image: "vendor_inventory/3515/0993e99d7c980f3fe5fad980d73f5ab49106ab467f5954c24c166fee636a.jpg" },
  { inv: "16406642034", name: "왁스 캔버스 오토바이 가방 빈티지 가죽 벨트 메신저백 어깨끈 포함", category: "생활템", price: "44,900원", productId: 9768625051, vendorItemId: 96157322705, image: "vendor_inventory/ba49/8ce1bc756f45ad88c3c1fabd99ea2be33487ea6c991121ea3296e2085c59.jpg" },
  { inv: "16406631053", name: "소가죽 A5 노트 커버 세트 빈티지 가죽 다이어리 줄노트 88매 포함", category: "생활템", price: "31,700원", productId: 9768611863, vendorItemId: 96157288731, image: "vendor_inventory/82b1/01d062658735a389ddadae7dcfd3b3fd950161c9e8c965a54eb927695c37.jpg" },
  { inv: "16402572453", name: "오토바이 사이드백 좌우 한 쌍 클래식 PU 가죽 바이크 가방 물병가방 포함", category: "생활템", price: "50,900원", productId: 9761726850, vendorItemId: 96139743843, image: "vendor_inventory/4fe8/a7851e67347437ae839baacf3b28688806edb1527947df4399845b9c5430.jpg" },
  { inv: "16402196836", name: "입는 판초 블랭킷 후드 퀼팅 캠핑 담요 차박 낚시 보온 망토 수납가방 포함", category: "캠핑", price: "51,900원", productId: 8665777776, vendorItemId: 96137213977, image: "vendor_inventory/8b2c/fbd32ab98909ae9c7d813cb9650641ea998a7dd8818a575062e1efd9126e.jpg" },
  { inv: "16402137876", name: "판초라이너 퀼팅 캠핑 블랭킷 담요 경량 보온 차박 백패킹 수납가방 포함", category: "캠핑", price: "39,800원", productId: 9747008648, vendorItemId: 96136805844, image: "vendor_inventory/89bb/71d4e6af395e0a3fe6ea8e53964ec3fa376820d141b29cec79ca9f9a8ad3.jpg" },
  { inv: "16401937393", name: "1인용 백패킹 트레킹폴 텐트 무폴 피라미드 경량 메쉬 이너 일체형", category: "캠핑", price: "98,000원", productId: 9759033951, vendorItemId: 96135407807, image: "vendor_inventory/4ba9/13e9065603630e8e4ac1b726125e28d8e4d319a4f822ac23b132defb4edb.jpg" },
  { inv: "16401454048", name: "20D 나일론 스퀘어 타프 3x3", category: "캠핑", price: "62,900원", productId: 9694182097, vendorItemId: 96132561012, image: "vendor_inventory/d755/8d23c24a088d2399b0ac9b19a21644622325db7cbcec6ca2a16b73e03fe8.jpg" },
  { inv: "16401093842", name: "텐트형 해먹 타프 일체형", category: "캠핑", price: "89,000원", productId: 9389055860, vendorItemId: 96130212060, image: "vendor_inventory/347a/fc3b7226b05082bcba6f0863ff7e92fdeca44b5d8710aacae2a0b8c12ff4.jpg" },
  { inv: "16400857663", name: "해먹 모기장 타프 세트", category: "캠핑", price: "45,500원", productId: 9758435938, vendorItemId: 96128851741, image: "vendor_inventory/9b88/2b82ba01fc71a91286f6f6de9674725a85691f914d6790c8f21d27917038.jpg" },
  { inv: "16400778007", name: "SUV 트렁크 테일 텐트 타프 현관폴 세트", category: "캠핑", price: "49,800원", productId: 9755076803, vendorItemId: 96128329595, image: "vendor_inventory/a326/ae210e6e513baeaa6eca3826e4241152c493b17983b74fae74a20937b89e.jpg" },
  { inv: "16399283403", name: "캠핑 타프 웨빙 스트랩 6종 세트 3m 4개 5m 2개 알루미늄 후크 길이조절 수납가방 포함", category: "캠핑", price: "30,000원", productId: 9751877497, vendorItemId: 96120917841, image: "vendor_inventory/64ea/608337d6c2d49819ccb290e06ac7a1e45318d47c0fc599f901fc02a60435.jpg" },
];


/**
 * 본인 상품 추가 사진 (2026-10-12 쿠팡 윙 OPEN API 로 읽음 - scripts/wing-images.ts, 읽기만).
 * 값은 image.coupangcdn.com/image/ 뒤 경로. gallery = 대표·추가 이미지(첫 장이 대표),
 * detail = 상세페이지 이미지(글씨가 많은 안내 그림일 수 있어 그대로 쓰기 전에 확인).
 * 아직 렌더에서 쓰지 않는다 - 다음 시험(사진 1장 → 여러 컷)에서 쓸 재료.
 * 윙은 허용 IP 만 받아 GitHub Actions 에서는 못 읽는다 → 상품이 바뀌면 PC 에서 다시 실행해 갱신.
 */
export const OWN_IMAGES: Record<string, { gallery: string[]; detail: string[] }> = {
  "16406646025": {
    gallery: ["vendor_inventory/3515/0993e99d7c980f3fe5fad980d73f5ab49106ab467f5954c24c166fee636a.jpg","vendor_inventory/14af/e15c3c31d04219554af8cf393e48f1157dc98e2316f1f909de5d822d1c2c.jpg","vendor_inventory/6b42/87eaa88040bcf824a663e7ef25587ec690ebb83cfbbe77491d099d4f4ee0.jpg","vendor_inventory/2df9/06671c6c3d87e17beb422352cda180f0757b81eb2377626f96469f1d0ed5.jpg","vendor_inventory/3e10/9a367df27c8245b4bda5d5c5e1901a0487f0c9a203c2411a130f10599934.jpg","vendor_inventory/165a/47366445fdb6311062b5e80b88886737af6e1d9e35e22c7611adabfa9879.jpg","vendor_inventory/c59e/f25f7fed791801a9a94aa230808f1f9bebbc4aefacac64421b796ac70a9b.jpg"],
    detail: ["vendor_inventory/4216/093bdd5e2ed12790f93d92ddc7d21c8a62ea84e055d242c0f13a58afe0e0.jpg","vendor_inventory/c356/a22f7b3d487b66d93fe673c299709ca27752696e5206bfaf242b1631b887.jpg","vendor_inventory/ddc1/9d5a11a0421f18055b894d4020c0b10089d4325ab5277146e7a9fe934358.jpg","vendor_inventory/016a/a20ce441b876d54685463cd7eac8f5b72197cf7561695b91419dd2f9d794.jpg","vendor_inventory/c69d/9709bfc816adf27ba1634ad8cfb0c03e7c987606d8fb383fe1eee0d51702.jpg","vendor_inventory/6116/19b83ce8b00483bf91c2f6f3b1fbd37d2db99884131e4a6c17f6b11ccf33.jpg","vendor_inventory/4d98/3768e8c5efb90174c77f6030b25e91fbd4035ffa4c51c2c2026b6e11d532.jpg"],
  },
  "16406642034": {
    gallery: ["vendor_inventory/ba49/8ce1bc756f45ad88c3c1fabd99ea2be33487ea6c991121ea3296e2085c59.jpg","vendor_inventory/8e0d/22a2c1c36f78a74e1ed0942fccd69fc10e4d529ff8ec0b4540247cc5df98.jpg","vendor_inventory/1fe7/53dc267a2a51707c92f7dad11430cdb1abb59676e2c978b31a86b96a6af8.jpg","vendor_inventory/8c90/e49f60848169883027bec3bd4462536ddd23b42a3a6966454625b7cde64b.jpg"],
    detail: ["vendor_inventory/29b6/81f8bdaa47d9b9e48518313a49b1cca25bf266dce2197078a06198a6f85b.jpg","vendor_inventory/237c/ad9ceda0271d7493b7f3ece62bf9b38d7438853278b76f9c5eb90f6084ad.jpg","vendor_inventory/4685/261cbc46f22093f6d570f56041a3fd4bdcd50c823dda4ec2827165b5ac3e.jpg","vendor_inventory/d7e5/5585775deb14a0c6d4237232e9f4f2c94b6c05351c4a2d519efebc21f39a.jpg"],
  },
  "16406631053": {
    gallery: ["vendor_inventory/82b1/01d062658735a389ddadae7dcfd3b3fd950161c9e8c965a54eb927695c37.jpg","vendor_inventory/ea04/11b0db70ba6328d8a99eefab666b5134ff3c7186b88a80db7aede5631ca8.jpg","vendor_inventory/d2d3/1b5f537aeb37878af4e1cbe9e1b9b79cd5de8dd5f58c33b4709469e43124.jpg","vendor_inventory/9ce5/c9dcb546dfbb7b286d9a2297bcd646ff71962070ec7bc3fe44142f385357.jpg","vendor_inventory/1a4c/789edf72cb68903ff7a28c9eb0d64fab3fd2044aa1578dda04c033ed303c.jpg"],
    detail: ["vendor_inventory/095d/644c110e56be814a12ca6b162e50d796ad996ee4a98d6665d993e4a0f45f.jpg","vendor_inventory/ced0/5870b79e427d3590cd107b4af02268238542d47434f7d05bb42b1dbc081e.jpg","vendor_inventory/5572/0ee2155f912c7b27bc3364fe6c688f0c27ad48d3f3d5e8070811b7a697ce.jpg","vendor_inventory/0bab/197591e515758c01fc1898d28b7ee1d71b30d557b08c4223082968bb966d.jpg","vendor_inventory/fbc4/bf9f08e066ff1d3b14b38b2e603ad24e44a46bc4ec94e4236509a540b76e.jpg"],
  },
  "16402572453": {
    gallery: ["vendor_inventory/4fe8/a7851e67347437ae839baacf3b28688806edb1527947df4399845b9c5430.jpg","vendor_inventory/88ac/62713dfdafc0a54bbf324c91a2a7a152ebc40035b4fb90c2c770e44a2f04.jpg","vendor_inventory/3c60/bc540f877df854f22ecc53888ccab5c69be361b6079b391a153f56c64065.jpg"],
    detail: ["vendor_inventory/4168/d58e4b9b9d86f79f41692bd473516b0ee9b59b659292b817cda803811f4a.jpg","vendor_inventory/77a0/393750e39856e09fa6d3a0f3b6173797e75754b9394897e4b65f8dcaca91.jpg","vendor_inventory/2243/21eadad1d2968206f00cda19e09f00831287dad1de2a981c5824229fa148.jpg"],
  },
  "16402196836": {
    gallery: ["vendor_inventory/8b2c/fbd32ab98909ae9c7d813cb9650641ea998a7dd8818a575062e1efd9126e.jpg","vendor_inventory/d974/a0fc7b98b070aa52e4d709467f1df47d596179fdc0071fdd76ca83e4f8f1.jpg","vendor_inventory/cf5d/8143cca3ff8b1eed4c5be404d607db7d38261846ad8bda53a2fe778a572f.jpg"],
    detail: ["vendor_inventory/900b/2bf2dc30f995311f993a0880b4bfd0e92ea150d49c86a1fb2e2acdc0c440.jpg","vendor_inventory/224c/ad012d9555c88c0d9e4bfd291d8ede62c213eb5c050b6bd89792dc4d5097.jpg","vendor_inventory/94b0/d78f53a7c0d40ccf7e801fdd95fc10e25ec95f2dd1f18cf29116e746cfad.jpg"],
  },
  "16402137876": {
    gallery: ["vendor_inventory/89bb/71d4e6af395e0a3fe6ea8e53964ec3fa376820d141b29cec79ca9f9a8ad3.jpg","vendor_inventory/e00b/aea3e2b22c68b47529b14a1c29f3eafd1458fd1daf3c68cae58fbe59cc7d.jpg","vendor_inventory/7928/efeec6a3f4c9c7e0a9c4405e910511c3a36aa2b45eab68a68995c27eaa58.jpg","vendor_inventory/5aab/97c18bd1695c0b074b496c36fae63e57554436114c6a9b5861313cdbf67c.jpg"],
    detail: ["vendor_inventory/89bb/71d4e6af395e0a3fe6ea8e53964ec3fa376820d141b29cec79ca9f9a8ad3.jpg","vendor_inventory/e00b/aea3e2b22c68b47529b14a1c29f3eafd1458fd1daf3c68cae58fbe59cc7d.jpg","vendor_inventory/7928/efeec6a3f4c9c7e0a9c4405e910511c3a36aa2b45eab68a68995c27eaa58.jpg","vendor_inventory/5aab/97c18bd1695c0b074b496c36fae63e57554436114c6a9b5861313cdbf67c.jpg"],
  },
  "16401937393": {
    gallery: ["vendor_inventory/4ba9/13e9065603630e8e4ac1b726125e28d8e4d319a4f822ac23b132defb4edb.jpg","vendor_inventory/775e/0bb87129ea0dfbf2a45ae7de9df5e95908ef24eb89ca2f5a05fb8d8d9131.jpg","vendor_inventory/b0b1/fdfdd18d4da8c2c84ae1b1375e49f12ee10db7edafb5ad8caa710dfa9b86.jpg","vendor_inventory/8972/5e7871faf99c8a0193e4fa767fc615e6fc11cf2ce2328bca3d65448a49bc.jpg","vendor_inventory/4e2d/33acecc1691a4f8a9a67bdaa1359b1a5e68873cd2eb4f2a9af455bc324a3.jpg","vendor_inventory/da31/d2c27f3db9da54bb40a175ab1e84881b641184699928fbe7903a9f3b144f.jpg","vendor_inventory/8746/4e1819a9f48cf322380de1e1aa640f1e848749319b7553121bb5e91dab0f.jpg","vendor_inventory/6f9f/66d730afd02e0e413e0fb392a616fa28927f1e91272f1f265268a896ec44.jpg"],
    detail: ["vendor_inventory/775e/0bb87129ea0dfbf2a45ae7de9df5e95908ef24eb89ca2f5a05fb8d8d9131.jpg","vendor_inventory/4e2d/33acecc1691a4f8a9a67bdaa1359b1a5e68873cd2eb4f2a9af455bc324a3.jpg","vendor_inventory/b0b1/fdfdd18d4da8c2c84ae1b1375e49f12ee10db7edafb5ad8caa710dfa9b86.jpg","vendor_inventory/8972/5e7871faf99c8a0193e4fa767fc615e6fc11cf2ce2328bca3d65448a49bc.jpg","vendor_inventory/4ba9/13e9065603630e8e4ac1b726125e28d8e4d319a4f822ac23b132defb4edb.jpg"],
  },
  "16401454048": {
    gallery: ["vendor_inventory/d755/8d23c24a088d2399b0ac9b19a21644622325db7cbcec6ca2a16b73e03fe8.jpg","vendor_inventory/63e2/40356ca3f2ed212530ea0e6b153518aae8cb15a37ac98efb81b5ac939825.jpg","vendor_inventory/c90c/7a1eb81fcd10b8d01dada1e75c3b5d1c359b5ee9b8e806cb9f8d400f543e.jpg","vendor_inventory/c0cb/0e57851eb9a958a85a0bfdd71d9bd9196849a3d15674b06293d14f5eb4a0.jpg","vendor_inventory/3759/e1d628ab095c5e7f6984437ceb7a6c30b44f40a3f45aa7dd37976acefde3.jpg"],
    detail: ["vendor_inventory/dab1/deea238c44b5a9eff46b1a286818ca4e7ec981440e099454feb68f97cd86.jpg","vendor_inventory/f5f5/bcea11d05431d250ee1c88584fa56181ef68f9367e75d7896aa9ec366a79.jpg","vendor_inventory/92e2/477b632a7deba62b2c806d190d33c7ec635cf38a365cead5c7116a2a5ecf.jpg","vendor_inventory/fd28/70506748975a3d3d40ec8f4b7fc9b0eacc583ff932a13fa32123d94c5a58.jpg","vendor_inventory/5aca/06d14dac5bcc6368bb0de6d5ee2a64ecf9257794e1b8820b56c91855bec0.jpg"],
  },
  "16401093842": {
    gallery: ["vendor_inventory/347a/fc3b7226b05082bcba6f0863ff7e92fdeca44b5d8710aacae2a0b8c12ff4.jpg","vendor_inventory/ccbb/d801475a8512dd787ed619ca821a805b4caee3a6615ae59d2ae1e523e634.jpg","vendor_inventory/079f/6a949d686962c3feb2e74493be0727eeda9c89cef2235e493b5ebb57df57.jpg","vendor_inventory/f166/d23dd7355fe3c3191b88e89868c4e046c4b3bd013adbeb400e1779e3e184.jpg","vendor_inventory/aad8/937ba51a36842e417def2b92078ba608f5aaf900c5b93c78e763032b176b.jpg","vendor_inventory/1820/bcde980ba9041f6b84054418f6f3e3218c19df7ef454275bb5a6ca141643.jpg","vendor_inventory/d941/40ba40d3c8f953fde912af081c2c2f22addb39e7e29ae5b3b53d2be8a4aa.jpg","vendor_inventory/986e/67e1c92d742f29f8bcadfbd209a8a91b7999f0a702182773a67793d0460c.jpg","vendor_inventory/29c5/35072bd00e272f86977edf6eb653326058faa1522f9cc1e5a53452563a5e.jpg"],
    detail: ["vendor_inventory/bd6f/4845a7c2552a5ca1a414d0b2bb990517e85db07e2f721d3c56db0eb89b89.jpg","vendor_inventory/aad8/937ba51a36842e417def2b92078ba608f5aaf900c5b93c78e763032b176b.jpg","vendor_inventory/29c5/35072bd00e272f86977edf6eb653326058faa1522f9cc1e5a53452563a5e.jpg","vendor_inventory/4a4d/f6ebc13cbed72184294d9cc8f4cf6d87252291fcff010618a74f27f671e6.jpg","vendor_inventory/948d/5931171ed8d9c466f059f348b663f11e13d800fb469b9f3dd3804d6ad035.jpg","vendor_inventory/7add/d8014bfae740ecef9bd8376566d4cbb32e35517b29dc4c22a084208ec58f.jpg"],
  },
  "16400857663": {
    gallery: ["vendor_inventory/9b88/2b82ba01fc71a91286f6f6de9674725a85691f914d6790c8f21d27917038.jpg","vendor_inventory/12a5/f67857eeaea32499e7fd650d3f350ad9a15968a42548095987d6c10fe5c7.jpg","vendor_inventory/bad7/07e1e355cdb85f244536fc5f3c9cead09c7452e5b59cbb600cd01cb0cd70.jpg","vendor_inventory/9138/599e1ce64c88c04967ec008d625f417d13b83fc724a79ef854b539095e2f.jpg","vendor_inventory/ab37/94c5916d0d4f43fd224e7f463e94c83c6c44f6c2e1656148b9dadddaaced.jpg","vendor_inventory/0312/0157a7c41990b4b09b77e581e5e3f89a7201392672cb3cdc61c59d80e725.jpg","vendor_inventory/9361/8d19ede47455ced706843e7910663af9888bbb6edcfdbbe4bf5c4cb6c7a2.jpg"],
    detail: ["vendor_inventory/50c8/b53627e3948439a2336103c3ae132a77b1ce353459dd56dd0e803bd0836d.jpg","vendor_inventory/962b/c0919ea641838647ccce71d96ab2681b39d9818e0dabc747cb0d1ff34fd9.jpg","vendor_inventory/6a23/d328c9ba1f5f6f5d31f356e44c260f21bab8b447e53cf9956c8abed9b6f5.jpg","vendor_inventory/eb89/23df38b9552e744ddb8a868963f864d5b2b79c8558ad098216834174e897.jpg","vendor_inventory/71fe/fa696da77b582e5322f353ca6e99c79927a83ec48927bd146d4807134df0.jpg","vendor_inventory/faad/4f8505996bdfc54975647c3da8a9d1190b467cff9ad92b2d0f949f3c679c.jpg","vendor_inventory/7d24/08f9ca91de0f34dfc44ef1493c66d1892e1a9c9fe5615bb206244f929645.jpg"],
  },
  "16400778007": {
    gallery: ["vendor_inventory/a326/ae210e6e513baeaa6eca3826e4241152c493b17983b74fae74a20937b89e.jpg","vendor_inventory/b60e/5ed6b98cb8d7c2602c6c4893180f9e5f2137991881a75b331fa97ef04e5f.jpg","vendor_inventory/1258/96e8eb51cac1782f3f4bedfd696e86aaa541b86f5ac992044bef64154cad.jpg","vendor_inventory/b62f/aefe89471b5baa021597b689fe908bc6d9c983e23ef434374373b7e421df.jpg","vendor_inventory/b3ec/770edc5b7fa3f774ea648ef598a60b38ad2c9f28e02666972603e1f6e4bf.jpg","vendor_inventory/eda7/5c6282e5ccbe18af1ee13d59fbe188b1ef0d91838ffd319559b52c202ff7.jpg","vendor_inventory/ee30/903949dc721cf70a55183e542722c081fd393d303877031ceee6ffa65c33.jpg","vendor_inventory/f1ea/29f30c9fed3a5418649036a961639991170212d3fbcd42337b103a555ddc.jpg","vendor_inventory/4db7/6b9bc343e8d8da704c6d27b964c746951cc178c82d05988b686ac9cc4b7e.jpg","vendor_inventory/649a/8c3dc97fc0f52b0dc384b0e32329808dcb6c4c80b3a7dcf9ba0031962f21.jpg","vendor_inventory/268c/8a1f03f0bf043c364b4d508848a2633c8586aabfaeb9cffb94cd7a1e2e2e.jpg","vendor_inventory/3dd8/5b7230e82ba23dc28443214c45fe34921de0a78a1077116901dc854bbb6e.jpg"],
    detail: ["vendor_inventory/ee30/903949dc721cf70a55183e542722c081fd393d303877031ceee6ffa65c33.jpg","vendor_inventory/f1ea/29f30c9fed3a5418649036a961639991170212d3fbcd42337b103a555ddc.jpg","vendor_inventory/4db7/6b9bc343e8d8da704c6d27b964c746951cc178c82d05988b686ac9cc4b7e.jpg","vendor_inventory/649a/8c3dc97fc0f52b0dc384b0e32329808dcb6c4c80b3a7dcf9ba0031962f21.jpg","vendor_inventory/268c/8a1f03f0bf043c364b4d508848a2633c8586aabfaeb9cffb94cd7a1e2e2e.jpg","vendor_inventory/3dd8/5b7230e82ba23dc28443214c45fe34921de0a78a1077116901dc854bbb6e.jpg"],
  },
  "16399283403": {
    gallery: ["vendor_inventory/64ea/608337d6c2d49819ccb290e06ac7a1e45318d47c0fc599f901fc02a60435.jpg","vendor_inventory/a12c/992a7939f54b36b99551e1d9aea5e2973ae275f5e0b1331cc9acae994d29.jpg","vendor_inventory/58d6/f7258b4cfa9d37767d30fdd75971a16a7c096c5acd96ed6eabd302cd31f6.jpg","vendor_inventory/08db/aae4e47d5ee2529ad640bf7c1a3fee2ed5ac4abe05cd13466043e21a24e3.jpg","vendor_inventory/5ffa/b3787c4efc315d0b8e62d05c1932e71b114b4bcfd7e46f85324708a5e3b7.jpg"],
    detail: ["vendor_inventory/bef2/d3c954cf63d1960d086f708c4d626d25c10f34f52817fc7d693f3fa55b57.jpg","vendor_inventory/54b8/d0ab343dbc619fbdeb02ce23d8a046fe21cbf00e2f988b77dc6216882254.jpg","vendor_inventory/f49e/bdbd6d4b83ea428cc37e151c540fb52f0f20e9284b331210a36a35950bc1.jpg","vendor_inventory/3cc4/ddcd08869260b201f691703a5f224bafe96cb4fa339ab812f21c7df84ea4.jpg","vendor_inventory/bbbe/ff0e6363adef050bdea8f603e78ce865e6906deea88db9c7ad187dbcab19.jpg","vendor_inventory/ba10/2e8613b8baa6d2b532f76b593987a46b523b7e4bce70cfde5d94c9cf1608.jpg","vendor_inventory/2321/9c9162547fb05951e685dd6600565190b4075c3d6edc731b9c884e4897ea.jpg","vendor_inventory/6326/a550090f606881ed70483a71c151bca26507af1d5c5f2632004a6dc1a6a9.jpg"],
  },
};

/** 본인 상품의 사진 URL 목록 (추가 이미지 → 상세 이미지 순, 없으면 대표 사진 1장) */
export function ownImageUrls(o: Own): string[] {
  const x = OWN_IMAGES[o.inv];
  const paths = x ? [...x.gallery, ...x.detail] : [o.image];
  return [...new Set(paths)].map((p) => `https://image.coupangcdn.com/image/${p}`);
}
