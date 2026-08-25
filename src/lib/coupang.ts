import crypto from "crypto";
import { optionalEnv, requireEnv } from "./env";

/**
 * 쿠팡파트너스 Open API 클라이언트.
 * 인증: CEA(HmacSHA256) 서명. access/secret 키는 환경변수에서 읽는다.
 *   - COUPANG_ACCESS_KEY (UUID 형식)
 *   - COUPANG_SECRET_KEY (40자 hex)
 *
 * 상품 API(bestcategories/goldbox/search)는 productUrl 을 이미 제휴링크로 돌려주므로
 * 별도 딥링크 생성 없이 그대로 coupang_partner_url 로 쓸 수 있다.
 */

/** 쿠팡 키가 현재 프로세스 환경에 있는지 */
export function hasCoupangEnv(): boolean {
  return Boolean(optionalEnv("COUPANG_ACCESS_KEY") && optionalEnv("COUPANG_SECRET_KEY"));
}

/**
 * app_settings 에 저장된 쿠팡 키가 있으면 process.env 를 채운다.
 *
 * 왜 필요한가(실측 2026-08-25): 쿠팡 키는 Vercel 환경변수에만 있고 GitHub Actions
 * 시크릿(WORKER_ENV)에는 없다. 그래서 scout.yml 의 수집 단계가 매번 조용히
 * 건너뛰어졌고(자격증명 없음 → 두 경로 모두 skip), 수집은 Vercel 크론 하나에만
 * 매달려 있었다. 그 크론마저 결과를 못 남기면서 8/21 이후 신규 상품 유입이
 * 0이 됐는데도 워크플로는 계속 초록불이었다.
 *
 * 유튜브·알리 자격증명이 이미 쓰는 패턴과 같다(loadYoutubeCredsFromSettings 등):
 * DB 에 키를 넣어두면 배포나 시크릿 수정 없이 어느 실행 환경에서든 집어간다.
 * 사장님은 Supabase 대시보드 app_settings 에 두 줄만 넣으면 되고, 키가 채팅이나
 * 저장소를 거치지 않는다.
 */
export async function loadCoupangCredsFromSettings(): Promise<void> {
  if (hasCoupangEnv()) return;
  try {
    const { getSettings } = await import("./settings");
    const s = await getSettings(["COUPANG_ACCESS_KEY", "COUPANG_SECRET_KEY"]);
    const key = s.COUPANG_ACCESS_KEY;
    const secret = s.COUPANG_SECRET_KEY;
    if (key && secret) {
      process.env.COUPANG_ACCESS_KEY = key;
      process.env.COUPANG_SECRET_KEY = secret;
      console.log("쿠팡 키: app_settings 값 사용");
    }
  } catch (e) {
    console.warn("쿠팡 키 설정 조회 실패(env 값 유지):", (e as Error).message);
  }
}

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
  // 타임아웃이 없으면 응답이 안 오는 호출 하나가 스카우트 전체를 붙잡는다.
  // Vercel 함수는 60초에 강제 종료되므로 그 자리에서 수집분이 통째로 날아간다
  // (deadlineAt 도 진행 중인 fetch 는 못 끊는다).
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(method, path, query),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
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

/**
 * 쿠팡파트너스 링크에 subId 를 붙인다 (이미 있으면 건드리지 않음).
 * subId 는 커미션 리포트에 그대로 실려 오므로 "어느 영상이 구매를 만들었는지"를
 * 되짚는 유일한 수단이다. 없으면 수익이 한 덩어리로만 보인다.
 */
export function withSubId(partnerUrl: string, subId: string): string {
  try {
    const u = new URL(partnerUrl);
    if (u.searchParams.has("subId")) return partnerUrl;
    u.searchParams.set("subId", subId);
    return u.toString();
  } catch {
    // URL 파싱이 안 되면 원본 그대로 (리다이렉트를 막지 않는다)
    return partnerUrl;
  }
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
  // "저게 뭐야?" 소리 나오는 아이템 - 가격 무관, 혹하는 힘만 본다.
  // 움직임·변신·자동화가 있어야 15초 영상으로 보여줄 게 생긴다.
  { keyword: "접이식 아이디어 상품", appCategory: "생활템" },
  { keyword: "자동 주방 도구", appCategory: "주방템" },
  { keyword: "전동 청소 브러쉬", appCategory: "청소템" },
  { keyword: "무타공 자석 수납", appCategory: "수납템" },
  { keyword: "회전 수납 정리대", appCategory: "수납템" },
  { keyword: "압축 이불 정리", appCategory: "수납템" },
  { keyword: "만능 다용도 도구", appCategory: "생활템" },
  { keyword: "원터치 주방템", appCategory: "주방템" },
  { keyword: "초소형 생활가전", appCategory: "생활템" },
  { keyword: "센서 자동 조명", appCategory: "생활템" },
  { keyword: "욕실 물때 제거템", appCategory: "청소템" },
  { keyword: "창문 청소 도구", appCategory: "청소템" },

  // ── 2026-08-19 확장 ──────────────────────────────────────────────
  // 왜 키워드를 늘렸나: 쿠팡 검색 API 는 키워드당 최대 10개만 주고 페이지 넘기기가
  // 없다(coupang.ts searchProducts 주석 참고). 즉 "검색을 더 깊게" 파는 방법이
  // 없어서, 같은 키워드는 매일 같은 상위 10개를 돌려주고 그게 전부 이미 등록된
  // 상품이라 하루 1~2개밖에 신규가 안 쌓였다(실측: 43개 재고에 순감소 1.5개/일).
  // 재고를 늘리는 유일한 수단이 키워드 수라서 기존 38개에 아래를 더한다.
  // 원칙: 기존 키워드와 검색 결과가 최대한 안 겹치게 구체적인 물건 이름으로.
  { keyword: "주방 물기 제거 트레이", appCategory: "주방템" },
  { keyword: "싱크대 배수구 거름망", appCategory: "주방템" },
  { keyword: "실리콘 냄비 받침", appCategory: "주방템" },
  { keyword: "밀폐용기 세트", appCategory: "주방템" },
  { keyword: "다지기 채칼", appCategory: "주방템" },
  { keyword: "전자레인지 조리용기", appCategory: "주방템" },
  { keyword: "커피 드립 도구", appCategory: "주방템" },
  { keyword: "도마 살균", appCategory: "주방템" },

  { keyword: "물걸레 청소포", appCategory: "청소템" },
  { keyword: "먼지 제거 롤러", appCategory: "청소템" },
  { keyword: "배수구 뚫는 도구", appCategory: "청소템" },
  { keyword: "샤워기 필터", appCategory: "청소템" },
  { keyword: "곰팡이 제거제", appCategory: "청소템" },
  { keyword: "틈새 청소 브러쉬", appCategory: "청소템" },
  { keyword: "세탁조 클리너", appCategory: "청소템" },
  { keyword: "유리창 물기 제거기", appCategory: "청소템" },

  { keyword: "옷장 정리함", appCategory: "수납템" },
  { keyword: "신발 정리대", appCategory: "수납템" },
  { keyword: "냉장고 정리 용기", appCategory: "수납템" },
  { keyword: "싱크대 하부장 선반", appCategory: "수납템" },
  { keyword: "케이블 정리함", appCategory: "수납템" },
  { keyword: "화장품 정리대", appCategory: "수납템" },
  { keyword: "벽걸이 수납 선반", appCategory: "수납템" },
  { keyword: "서랍 칸막이", appCategory: "수납템" },

  { keyword: "빨래 건조대 접이식", appCategory: "생활템" },
  { keyword: "제습기 소형", appCategory: "생활템" },
  { keyword: "무선 충전 거치대", appCategory: "생활템" },
  { keyword: "휴대용 스팀다리미", appCategory: "생활템" },
  { keyword: "발 매트 규조토", appCategory: "생활템" },
  { keyword: "옷 보풀 제거기", appCategory: "생활템" },
  { keyword: "전동 코털 정리기", appCategory: "생활템" },
  { keyword: "휴대용 미니 가습기", appCategory: "생활템" },
  { keyword: "led 무드등", appCategory: "생활템" },
  { keyword: "타이머 콘센트", appCategory: "생활템" },
  { keyword: "문틈 방풍", appCategory: "생활템" },
  { keyword: "전기 요금 절약 가전", appCategory: "생활템" },

  { keyword: "차량용 방향제", appCategory: "차량용품" },
  { keyword: "차량용 핸드폰 거치대", appCategory: "차량용품" },
  { keyword: "차량용 트렁크 정리함", appCategory: "차량용품" },
  { keyword: "김서림 방지 코팅", appCategory: "차량용품" },
  { keyword: "차량 실내 청소 도구", appCategory: "차량용품" },

  { keyword: "캠핑 랜턴 충전식", appCategory: "캠핑" },
  { keyword: "휴대용 폴딩 테이블", appCategory: "캠핑" },
  { keyword: "캠핑 화로대", appCategory: "캠핑" },
  { keyword: "보냉 아이스박스", appCategory: "캠핑" },

  { keyword: "자취 소형 밥솥", appCategory: "자취템" },
  { keyword: "1인용 미니 냄비", appCategory: "자취템" },
  { keyword: "원룸 수납 아이디어", appCategory: "자취템" },
  { keyword: "자취방 인테리어 소품", appCategory: "자취템" },

  // ── 2026-08-19 2차 확장 ──────────────────────────────────────────────
  // 키워드 수가 곧 신규 재고량이다(검색 API 가 키워드당 10개 고정이라 다른 축이 없다).
  // 다만 Vercel 함수 60초 제한 때문에 한 번에 다 돌 수 없어서, scout.ts 가
  // 날짜로 회전시키며 하루에 일부만 검색한다. 그래서 총량은 마음껏 늘려도 된다.
  { keyword: "주방 정리 선반", appCategory: "주방템" },
  { keyword: "양념통 세트", appCategory: "주방템" },
  { keyword: "실리콘 주걱 집게", appCategory: "주방템" },
  { keyword: "계량컵 계량스푼", appCategory: "주방템" },
  { keyword: "베이킹 도구 세트", appCategory: "주방템" },
  { keyword: "김치통 김치용기", appCategory: "주방템" },
  { keyword: "국자 거치대", appCategory: "주방템" },
  { keyword: "수세미 거치대", appCategory: "주방템" },
  { keyword: "주방 가위 다용도", appCategory: "주방템" },
  { keyword: "냄비 뚜껑 정리", appCategory: "주방템" },
  { keyword: "실리콘 뚜껑 덮개", appCategory: "주방템" },
  { keyword: "전자레인지 커버", appCategory: "주방템" },
  { keyword: "에어프라이어 용지", appCategory: "주방템" },
  { keyword: "누룽지 냄비", appCategory: "주방템" },
  { keyword: "1인 미니 전기포트", appCategory: "주방템" },
  { keyword: "휴대용 텀블러 보온병", appCategory: "주방템" },
  { keyword: "얼음틀 제빙기", appCategory: "주방템" },
  { keyword: "과일 껍질 필러", appCategory: "주방템" },
  { keyword: "마늘 다지기", appCategory: "주방템" },
  { keyword: "채소 탈수기", appCategory: "주방템" },

  { keyword: "청소기 필터 노즐", appCategory: "청소템" },
  { keyword: "스팀 청소기", appCategory: "청소템" },
  { keyword: "창틀 청소 솔", appCategory: "청소템" },
  { keyword: "블라인드 청소", appCategory: "청소템" },
  { keyword: "변기 청소 솔", appCategory: "청소템" },
  { keyword: "타일 줄눈 청소", appCategory: "청소템" },
  { keyword: "카펫 얼룩 제거", appCategory: "청소템" },
  { keyword: "전자레인지 청소", appCategory: "청소템" },
  { keyword: "가스레인지 기름때", appCategory: "청소템" },
  { keyword: "후드 필터 청소", appCategory: "청소템" },
  { keyword: "정전기 먼지떨이", appCategory: "청소템" },
  { keyword: "돌돌이 테이프 클리너", appCategory: "청소템" },
  { keyword: "매트리스 청소기", appCategory: "청소템" },
  { keyword: "빨래 세탁망", appCategory: "청소템" },
  { keyword: "다림질 보조 도구", appCategory: "청소템" },

  { keyword: "진공 압축팩", appCategory: "수납템" },
  { keyword: "이불 보관함", appCategory: "수납템" },
  { keyword: "속옷 정리함", appCategory: "수납템" },
  { keyword: "화장대 정리", appCategory: "수납템" },
  { keyword: "주방 상부장 수납", appCategory: "수납템" },
  { keyword: "세탁실 선반", appCategory: "수납템" },
  { keyword: "베란다 수납장", appCategory: "수납템" },
  { keyword: "현관 우산 꽂이", appCategory: "수납템" },
  { keyword: "다용도 바구니", appCategory: "수납템" },
  { keyword: "책상 정리 트레이", appCategory: "수납템" },
  { keyword: "리모컨 정리함", appCategory: "수납템" },
  { keyword: "약통 약 정리함", appCategory: "수납템" },
  { keyword: "공구함 정리", appCategory: "수납템" },
  { keyword: "옷걸이 논슬립", appCategory: "수납템" },
  { keyword: "침대 밑 수납", appCategory: "수납템" },

  { keyword: "각도 조절 독서대", appCategory: "생활템" },
  { keyword: "무선 선풍기 탁상용", appCategory: "생활템" },
  { keyword: "저소음 벽시계", appCategory: "생활템" },
  { keyword: "체중계 스마트", appCategory: "생활템" },
  { keyword: "우산 자동 접이식", appCategory: "생활템" },
  { keyword: "안마기 마사지기", appCategory: "생활템" },
  { keyword: "목베개 여행용", appCategory: "생활템" },
  { keyword: "손전등 충전식", appCategory: "생활템" },
  { keyword: "멀티탭 개별 스위치", appCategory: "생활템" },
  { keyword: "usb 허브 확장", appCategory: "생활템" },
  { keyword: "케이블 보호 커버", appCategory: "생활템" },
  { keyword: "노트북 거치대 접이식", appCategory: "생활템" },
  { keyword: "휴대용 재봉틀", appCategory: "생활템" },
  { keyword: "전동 드릴 가정용", appCategory: "생활템" },
  { keyword: "실링팬 서큘레이터", appCategory: "생활템" },
  { keyword: "가정용 소화기", appCategory: "생활템" },
  { keyword: "방충망 보수 테이프", appCategory: "생활템" },
  { keyword: "미끄럼 방지 패드", appCategory: "생활템" },
  { keyword: "도어 스토퍼", appCategory: "생활템" },
  { keyword: "창문 단열 뽁뽁이", appCategory: "생활템" },
  { keyword: "빨래 건조 옷걸이", appCategory: "생활템" },
  { keyword: "신발 건조기", appCategory: "생활템" },
  { keyword: "전기요 온수매트", appCategory: "생활템" },
  { keyword: "가습기 필터", appCategory: "생활템" },
  { keyword: "공기청정기 소형", appCategory: "생활템" },
  { keyword: "탈취제 냄새 제거", appCategory: "생활템" },
  { keyword: "방수 시트 커버", appCategory: "생활템" },
  { keyword: "휴대폰 방수팩", appCategory: "생활템" },
  { keyword: "돋보기 확대경", appCategory: "생활템" },
  { keyword: "손톱깎이 세트", appCategory: "생활템" },
  { keyword: "전동 칫솔", appCategory: "생활템" },
  { keyword: "구강 세정기", appCategory: "생활템" },
  { keyword: "헤어 드라이어 거치대", appCategory: "생활템" },
  { keyword: "수건 걸이 무타공", appCategory: "생활템" },
  { keyword: "욕실 슬리퍼", appCategory: "생활템" },
  { keyword: "샤워 헤드 절수", appCategory: "생활템" },

  { keyword: "차량용 무선 청소기", appCategory: "차량용품" },
  { keyword: "차량용 선바이저", appCategory: "차량용품" },
  { keyword: "차량 햇빛가리개", appCategory: "차량용품" },
  { keyword: "차량용 공기청정기", appCategory: "차량용품" },
  { keyword: "차량 시트 커버", appCategory: "차량용품" },
  { keyword: "차량용 우산 꽂이", appCategory: "차량용품" },
  { keyword: "타이어 공기압 측정기", appCategory: "차량용품" },
  { keyword: "점프 스타터 배터리", appCategory: "차량용품" },
  { keyword: "차량용 방향제 디퓨저", appCategory: "차량용품" },
  { keyword: "블랙박스 메모리", appCategory: "차량용품" },

  { keyword: "캠핑 의자 경량", appCategory: "캠핑" },
  { keyword: "캠핑 조리도구 세트", appCategory: "캠핑" },
  { keyword: "휴대용 버너", appCategory: "캠핑" },
  { keyword: "캠핑 매트 자충", appCategory: "캠핑" },
  { keyword: "차박 커튼", appCategory: "캠핑" },
  { keyword: "캠핑 수납 가방", appCategory: "캠핑" },
  { keyword: "휴대용 그릴", appCategory: "캠핑" },
  { keyword: "캠핑 해먹", appCategory: "캠핑" },

  { keyword: "자취 미니 세탁기", appCategory: "자취템" },
  { keyword: "1인 가구 전기그릴", appCategory: "자취템" },
  { keyword: "원룸 커튼 암막", appCategory: "자취템" },
  { keyword: "자취 미니 냉장고", appCategory: "자취템" },
  { keyword: "접이식 테이블 좌식", appCategory: "자취템" },
  { keyword: "빨래 건조대 소형", appCategory: "자취템" },
];

/** 가격을 "21,990원" 형태로 */
export function priceText(price: number): string {
  return `${price.toLocaleString("ko-KR")}원`;
}
