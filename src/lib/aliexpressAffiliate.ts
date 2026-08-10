import { optionalEnv } from "./env";
import {
  AFFILIATE_APP,
  authUrl,
  currentToken,
  exchangeCode,
  hasAppEnv,
  loadAppCredsFromSettings,
  maybeRefresh,
  topCall,
} from "./aliexpressCore";

/**
 * 알리익스프레스 어필리에이트 API - 제휴 링크 생성 / 수익 리포트.
 *
 * DS(영상 소싱)와는 **다른 앱**이다. 같은 키로는 안 된다
 * (실측 2026-08: DS 키로 affiliate.* 호출 시 전부 InsufficientPermission).
 *
 * 준비 순서:
 *   1) portals.aliexpress.com 어필리에이트 가입 → 승인 시 Tracking ID 발급
 *   2) openservice.aliexpress.com 에서 "Affiliate API" 타입 앱을 **새로** 생성
 *   3) 아래 세 값을 환경변수(또는 app_settings)에 넣는다
 *      ALIEXPRESS_AFFILIATE_APP_KEY / ALIEXPRESS_AFFILIATE_APP_SECRET
 *      ALIEXPRESS_TRACKING_ID
 *   4) scripts/aliexpress-oauth.mjs 로 어필리에이트 앱 OAuth 동의 → 토큰 저장
 *
 * 값이 하나라도 없으면 모든 함수가 조용히 null/빈 배열을 돌려준다.
 * (쿠팡 파이프라인이 알리 미설정 때문에 멈추면 안 된다)
 */

/** 실제 발급받지 않은 자리표시자. 이 값으로 링크를 만들면 수수료가 안 붙는다 */
const PLACEHOLDER_TRACKING_IDS = new Set(["", "default", "your_tracking_id", "changeme"]);

export function hasAffiliateEnv(): boolean {
  const tid = (optionalEnv("ALIEXPRESS_TRACKING_ID") ?? "").trim();
  return hasAppEnv(AFFILIATE_APP) && !PLACEHOLDER_TRACKING_IDS.has(tid.toLowerCase());
}

/**
 * 왜 자리표시자를 막는가: `.env` 에 ALIEXPRESS_TRACKING_ID=default 가 들어 있으면
 * API 는 200 을 주지만 그 링크에는 수수료가 붙지 않는다. 조용히 돈이 새는 종류의
 * 실패라, 아예 미설정으로 취급해 링크를 만들지 않는 편이 낫다.
 */
function trackingId(): string | null {
  const tid = (optionalEnv("ALIEXPRESS_TRACKING_ID") ?? "").trim();
  if (PLACEHOLDER_TRACKING_IDS.has(tid.toLowerCase())) {
    console.warn(
      "알리 TRACKING_ID 가 자리표시자입니다(어필리에이트 승인 후 실제 값으로 교체 필요) - 제휴 링크 생성을 건너뜁니다"
    );
    return null;
  }
  return tid;
}

export async function loadAffiliateCredsFromSettings(): Promise<void> {
  await loadAppCredsFromSettings(AFFILIATE_APP);
  if (!optionalEnv("ALIEXPRESS_TRACKING_ID")) {
    try {
      const { getSetting } = await import("./settings");
      const tid = await getSetting("ALIEXPRESS_TRACKING_ID");
      if (tid) process.env.ALIEXPRESS_TRACKING_ID = tid;
    } catch {
      /* 설정 조회 실패는 무시 - 미설정으로 취급된다 */
    }
  }
}

/** 어필리에이트 앱 OAuth 동의 URL */
export function affiliateAuthUrl(): string {
  return authUrl(AFFILIATE_APP);
}

/** 인증 code → 토큰 발급·저장 (어필리에이트 앱 전용 키에 저장) */
export async function exchangeAffiliateCode(code: string) {
  return exchangeCode(AFFILIATE_APP, code);
}

/** 워커 시작 시 호출 - 토큰 만료 방지 */
export async function maybeRefreshAffiliateToken(): Promise<void> {
  return maybeRefresh(AFFILIATE_APP);
}

/** 준비가 안 됐으면 null. 됐으면 access_token */
async function readyToken(): Promise<string | null> {
  if (!hasAffiliateEnv()) return null;
  const token = await currentToken(AFFILIATE_APP);
  if (!token) {
    console.warn("알리 어필리에이트 토큰이 없습니다 (OAuth 동의 필요)");
    return null;
  }
  return token;
}

/** 응답 구조가 자주 바뀌어, 중첩 어디에 있든 원하는 키를 긁어온다 */
function harvest(obj: unknown, keys: string[], out: string[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const el of obj) harvest(el, keys, out);
    return;
  }
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) out.push(v);
  }
  for (const v of Object.values(rec)) harvest(v, keys, out);
}

/**
 * 알리 상품 URL → 수수료가 붙는 제휴 링크.
 * 준비 안 됐거나 실패하면 null (호출부는 원본 URL 을 그대로 쓰면 된다).
 */
export async function generateAffiliateLink(
  productUrl: string
): Promise<string | null> {
  const token = await readyToken();
  if (!token) return null;
  const tid = trackingId();
  if (!tid) return null;
  try {
    const data = await topCall(
      AFFILIATE_APP,
      "aliexpress.affiliate.link.generate",
      {
        promotion_link_type: "0", // 0=일반 제휴 링크
        source_values: productUrl,
        tracking_id: tid,
      },
      token
    );
    const found: string[] = [];
    harvest(data, ["promotion_link", "promotionLink"], found);
    return found[0] ?? null;
  } catch (e) {
    console.warn("알리 제휴 링크 생성 실패:", (e as Error).message.slice(0, 160));
    return null;
  }
}

export interface AffiliateProduct {
  productId: string;
  title: string;
  imageUrl: string;
  /** 원화 환산 판매가 문자열 (알리가 주는 그대로) */
  price: string;
  /** 수수료율(%) 문자열 */
  commissionRate: string;
  promotionLink: string | null;
}

/** 키워드로 제휴 가능 상품 검색 (수수료율·제휴링크 포함) */
export async function searchAffiliateProducts(
  keywords: string,
  pageSize = 20
): Promise<AffiliateProduct[]> {
  const token = await readyToken();
  if (!token) return [];
  const tid = trackingId();
  if (!tid) return [];
  try {
    const data = await topCall(
      AFFILIATE_APP,
      "aliexpress.affiliate.product.query",
      {
        keywords,
        page_no: "1",
        page_size: String(pageSize),
        target_currency: "KRW",
        target_language: "KO",
        ship_to_country: "KR",
        tracking_id: tid,
      },
      token
    );
    const items: AffiliateProduct[] = [];
    const walk = (o: unknown) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      const r = o as Record<string, unknown>;
      const pid = r["product_id"] ?? r["productId"];
      const img = r["product_main_image_url"] ?? r["productMainImageUrl"];
      if (pid && typeof img === "string") {
        items.push({
          productId: String(pid),
          title: String(r["product_title"] ?? r["productTitle"] ?? ""),
          imageUrl: img,
          price: String(
            r["target_sale_price"] ?? r["targetSalePrice"] ?? r["sale_price"] ?? ""
          ),
          commissionRate: String(
            r["commission_rate"] ?? r["commissionRate"] ?? ""
          ),
          promotionLink:
            (r["promotion_link"] as string | undefined) ??
            (r["promotionLink"] as string | undefined) ??
            null,
        });
        return;
      }
      Object.values(r).forEach(walk);
    };
    walk(data);
    return items;
  } catch (e) {
    console.warn("알리 제휴 상품 검색 실패:", (e as Error).message.slice(0, 160));
    return [];
  }
}

export interface AffiliateOrderSummary {
  orders: number;
  /** 정산 예정 수수료 합계 (알리 응답 통화 기준) */
  commission: number;
  currency: string;
}

/**
 * 기간별 제휴 주문·수수료 집계.
 * 날짜는 "YYYY-MM-DD HH:mm:ss" (알리 요구 포맷).
 */
export async function fetchAffiliateOrders(
  startTime: string,
  endTime: string
): Promise<AffiliateOrderSummary | null> {
  const token = await readyToken();
  if (!token) return null;
  try {
    const data = await topCall(
      AFFILIATE_APP,
      "aliexpress.affiliate.order.list",
      {
        start_time: startTime,
        end_time: endTime,
        page_no: "1",
        page_size: "50",
        fields: "commission_rate,estimated_paid_commission,order_status",
      },
      token
    );
    let orders = 0;
    let commission = 0;
    let currency = "USD";
    const walk = (o: unknown) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      const r = o as Record<string, unknown>;
      const paid =
        r["estimated_paid_commission"] ?? r["estimatedPaidCommission"];
      if (paid !== undefined) {
        orders++;
        commission += Number(paid) || 0;
        const cur = r["currency"] ?? r["commission_currency"];
        if (typeof cur === "string" && cur) currency = cur;
        return;
      }
      Object.values(r).forEach(walk);
    };
    walk(data);
    return { orders, commission, currency };
  } catch (e) {
    console.warn("알리 제휴 주문 조회 실패:", (e as Error).message.slice(0, 160));
    return null;
  }
}

/** 설정 상태 한 줄 요약 (관리자 화면·텔레그램 상태 확인용) */
export async function affiliateStatus(): Promise<string> {
  if (!hasAppEnv(AFFILIATE_APP)) return "미설정 (어필리에이트 앱 키 없음)";
  const tid = (optionalEnv("ALIEXPRESS_TRACKING_ID") ?? "").trim();
  if (PLACEHOLDER_TRACKING_IDS.has(tid.toLowerCase()))
    return "미설정 (Tracking ID 가 자리표시자)";
  const token = await currentToken(AFFILIATE_APP);
  if (!token) return "키는 있으나 OAuth 미완료";
  return `준비됨 (tracking_id=${tid})`;
}
