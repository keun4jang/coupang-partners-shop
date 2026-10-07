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

