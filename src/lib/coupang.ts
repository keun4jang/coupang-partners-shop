import crypto from "crypto";
import { requireEnv } from "./env";

/**
 * 쿠팡파트너스 Open API 클라이언트.
 * 인증: CEA(HmacSHA256) 서명. access/secret 키는 환경변수에서 읽는다.
 *   - COUPANG_ACCESS_KEY (UUID 형식)
 *   - COUPANG_SECRET_KEY (40자 hex)
 *
 * 상품 API(bestcategories/goldbox/search)는 productUrl 을 이미 제휴링크로 돌려주므로
 * 별도 딥링크 생성 없이 그대로 coupang_partner_url 로 쓸 수 있다.
 */

const HOST = "https://api-gateway.coupang.com";
const BASE = "/v2/providers/affiliate_open_api/apis/openapi/v1";

/** 쿠팡 API 가 돌려주는 상품 1건 (필요한 필드만) */
export interface CoupangProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
  isRocket?: boolean;
  isFreeShipping?: boolean;
}

/** 두 자리 zero-pad */
const pad = (n: number): string => String(n).padStart(2, "0");

/** CEA 서명용 시각: yyMMddTHHmmssZ (GMT) */
function signedDate(): string {
  const d = new Date();
  return (
    `${pad(d.getUTCFullYear() % 100)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Authorization 헤더 생성 (message = datetime + method + path + query) */
function authHeader(method: string, path: string, query: string): string {
  const accessKey = requireEnv("COUPANG_ACCESS_KEY");
  const secretKey = requireEnv("COUPANG_SECRET_KEY");
  const datetime = signedDate();
  const message = datetime + method + path + query;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  query = "",
  body?: unknown
): Promise<T> {
  const url = HOST + path + (query ? `?${query}` : "");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(method, path, query),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: { rCode?: string | number; rMessage?: string; data?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`쿠팡 API 응답 파싱 실패 (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || (json.rCode !== undefined && String(json.rCode) !== "0")) {
    throw new Error(
      `쿠팡 API 오류 (${res.status}, rCode=${json.rCode}): ${json.rMessage ?? text.slice(0, 200)}`
    );
  }
  return json.data as T;
}

/** 카테고리 베스트셀러 (categoryId 는 쿠팡 대분류 id) */
export async function fetchBestCategory(
  categoryId: number,
  limit = 20
): Promise<CoupangProduct[]> {
  const data = await request<CoupangProduct[]>(
    "GET",
    `${BASE}/products/bestcategories/${categoryId}`,
    `limit=${limit}`
  );
  return Array.isArray(data) ? data : [];
}

/** 골드박스 (오늘의 특가) */
export async function fetchGoldbox(): Promise<CoupangProduct[]> {
  const data = await request<CoupangProduct[]>("GET", `${BASE}/products/goldbox`);
  return Array.isArray(data) ? data : [];
}

/** 키워드 검색 */
export async function searchProducts(
  keyword: string,
  limit = 10
): Promise<CoupangProduct[]> {
  // 검색 API 는 limit 최대 10 (초과 시 400 "limit is out of range")
  const safe = Math.max(1, Math.min(limit, 10));
  const query = `keyword=${encodeURIComponent(keyword)}&limit=${safe}`;
  const data = await request<{ productData?: CoupangProduct[] }>(
    "GET",
    `${BASE}/products/search`,
    query
  );
  return data?.productData ?? [];
}

/** 커미션 리포트 1행(일자별). commission 은 정산 예정 커미션(원). */
export interface CommissionRow {
  date: string; // YYYYMMDD (KST)
  trackingCode: string;
  subId: string;
  commission: number;
  click: number;
}

/**
 * 일자별 커미션 리포트 (수익 집계용).
 * - startDate/endDate 는 yyyyMMdd (KST). 조회 기간은 약 31일 이내 권장.
 * - commission 은 "0E-9" 같은 BigDecimal 문자열로 올 수 있어 Number 로 정규화한다.
 */
export async function fetchCommissionReport(
  startDate: string,
  endDate: string
): Promise<CommissionRow[]> {
  const query = `startDate=${startDate}&endDate=${endDate}`;
  const data = await request<
    Array<{
      date?: string;
      trackingCode?: string;
      subId?: string;
      commission?: number | string;
      click?: number | string;
    }>
  >("GET", `${BASE}/reports/commission`, query);
  return (Array.isArray(data) ? data : []).map((r) => ({
    date: String(r.date ?? ""),
    trackingCode: r.trackingCode ?? "",
    subId: r.subId ?? "",
    commission: Number(r.commission) || 0,
    click: Number(r.click) || 0,
  }));
}

/** 일반 쿠팡 상품 URL → 제휴 딥링크 (수동으로 URL 붙여넣을 때 사용) */
export async function createDeeplink(coupangUrls: string[]): Promise<string[]> {
  const data = await request<Array<{ landingUrl?: string; shortenUrl?: string }>>(
    "POST",
    `${BASE}/deeplink`,
    "",
    { coupangUrls }
  );
  return (data ?? []).map((d) => d.shortenUrl ?? d.landingUrl ?? "").filter(Boolean);
}

/**
 * 스카우트 검색 키워드(우선순위 순).
 * 방향(A안): "싸고 신기해서 바로 사게 되는" 남녀 공통 신박템.
 * - 저가 살림템(주부) + 신기/신박 아이디어 상품 + 30~40대 남자도 혹하는
 *   차량·공구·캠핑·전자가젯·자취가전 (계정을 나누지 않고 성별 중립으로 폭만 넓힘).
 * - 가격 상한을 50만원으로 크게 열었다(클릭·트래픽 우선). 비싸도 클릭·조회 잘
 *   나올 관심구매 가젯이면 넣는다 - 커미션이 판매가의 %라 고가 1건 수익이 크다.
 * 카테고리 ID(bestcategories)는 매핑이 불투명해 엉뚱한 상품이 섞이므로,
 * 주제가 명확한 키워드 검색을 쓴다. appCategory 는 이 서비스의 카테고리
 * (자막 톤/브롤/폴백문구에 쓰임)로 매핑.
 */
export const SCOUT_KEYWORDS: Array<{ keyword: string; appCategory: string }> = [
  // 신기/신박/아이디어 (남녀 공통 - 호기심 훅 잘 먹힘)
  { keyword: "신박한 아이디어 상품", appCategory: "생활템" },
  { keyword: "신기한 생활용품", appCategory: "생활템" },
  { keyword: "신박한 살림템", appCategory: "생활템" },
  { keyword: "신제품 생활용품", appCategory: "생활템" },
  // 남자도 혹하는 신박템 (차량·공구·캠핑·가젯·자취)
  { keyword: "차량용품 신박템", appCategory: "차량용품" },
  { keyword: "차량용 청소기", appCategory: "차량용품" },
  { keyword: "미니 전동드라이버", appCategory: "생활템" },
  { keyword: "만능 공구 세트", appCategory: "생활템" },
  { keyword: "캠핑 용품 아이디어", appCategory: "캠핑" },
  { keyword: "차박 캠핑 소품", appCategory: "캠핑" },
  { keyword: "USB 가젯", appCategory: "생활템" },
  { keyword: "자취 필수템 가전", appCategory: "자취템" },
  // 클릭·조회 잘 나오는 "관심 구매" 가젯 (가격 상한 완화로 편입 - 비싸도 클릭 우선)
  { keyword: "미니 빔프로젝터", appCategory: "생활템" },
  { keyword: "가성비 로봇청소기", appCategory: "청소템" },
  { keyword: "무선 청소기 가성비", appCategory: "청소템" },
  { keyword: "액션캠 입문용", appCategory: "생활템" },
  { keyword: "휴대용 미니 선풍기 신상", appCategory: "생활템" },
  { keyword: "가성비 블루투스 스피커", appCategory: "생활템" },
  // 검증된 저가 살림템 (주부 충동구매 주력)
  { keyword: "신기한 주방용품", appCategory: "주방템" },
  { keyword: "신기한 청소용품", appCategory: "청소템" },
  { keyword: "실리콘 주방", appCategory: "주방템" },
  { keyword: "수납정리함", appCategory: "수납템" },
  { keyword: "욕실청소", appCategory: "청소템" },
  { keyword: "살림템", appCategory: "생활템" },
];

/** 가격을 "21,990원" 형태로 */
export function priceText(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}
