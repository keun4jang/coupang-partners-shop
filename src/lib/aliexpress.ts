import crypto from "crypto";
import { optionalEnv } from "./env";
import {
  dhashFromUrl,
  hammingDistance,
  MATCH_THRESHOLD,
} from "./imageHash";

/**
 * 알리익스프레스 어필리에이트 API - "같은 제품" 판매자 데모 영상 자동 소싱.
 *
 * 흐름: 쿠팡 상품명으로 알리 상품 검색 → 후보들의 대표 이미지를 우리 상품
 * 사진과 이미지 지문(dHash) 대조 → 임계치 이하로 일치하는 상품의
 * product_video_url 을 돌려준다. 일치 후보가 없으면 null (호출부가 Pexels 폴백).
 *
 * 필요 환경변수 (portals.aliexpress.com 가입 → openservice.aliexpress.com 앱 생성):
 *   ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET
 *   ALIEXPRESS_TRACKING_ID (선택, 기본 "default")
 */

const GATEWAY = "https://api-sg.aliexpress.com/sync";

export function hasAliexpressEnv(): boolean {
  return Boolean(
    optionalEnv("ALIEXPRESS_APP_KEY") && optionalEnv("ALIEXPRESS_APP_SECRET")
  );
}

/** TOP 프로토콜 서명: 파라미터 키 정렬 → key+value 연결 → HMAC-SHA256(secret) 대문자 hex */
function sign(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto
    .createHmac("sha256", secret)
    .update(base)
    .digest("hex")
    .toUpperCase();
}

async function apiCall(
  method: string,
  bizParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const appKey = optionalEnv("ALIEXPRESS_APP_KEY");
  const appSecret = optionalEnv("ALIEXPRESS_APP_SECRET");
  if (!appKey || !appSecret) throw new Error("알리 API 환경변수 미설정");

  const params: Record<string, string> = {
    ...bizParams,
    method,
    app_key: appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    format: "json",
    v: "2.0",
  };
  params.sign = sign(params, appSecret);

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`알리 API HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const err = data.error_response as { code?: unknown; msg?: unknown } | undefined;
  if (err) {
    throw new Error(`알리 API 오류: ${err.code} ${err.msg}`);
  }
  return data;
}

export interface AliProduct {
  productId: string;
  title: string;
  imageUrl: string;
  videoUrl: string | null;
}

/**
 * 상품명에서 검색 키워드 추출.
 * 쿠팡 상품명은 "브랜드 + 핵심명사들 + 옵션(수량/색상)" 구조라
 * 옵션·수량·괄호를 걷어내고 앞쪽 핵심 토큰만 쓴다.
 */
export function keywordsFromProductName(name: string): string {
  const cleaned = name
    .replace(/\(.*?\)|\[.*?\]/g, " ") // 괄호 제거
    .replace(/,.*$/, " ") // 첫 콤마 뒤(옵션)는 버림
    .replace(/\d+(\.\d+)?\s*(개입|개|매|장|ml|l|리터|kg|g|cm|mm|인치|단|팩|세트|p|P)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((t) => t.length >= 2);
  // 브랜드(첫 토큰)가 영문/한글 고유명이어도 검색엔 무해 - 최대 4토큰
  return tokens.slice(0, 4).join(" ") || cleaned || name;
}

/** 키워드로 알리 상품 검색 (영상 있는 상품 위주로 정리해 반환) */
export async function searchAliProducts(keywords: string): Promise<AliProduct[]> {
  const data = await apiCall("aliexpress.affiliate.product.query", {
    keywords,
    target_currency: "KRW",
    target_language: "KO",
    ship_to_country: "KR",
    page_size: "30",
    sort: "LAST_VOLUME_DESC", // 많이 팔린 순 = 정품 대표 이미지를 쓸 확률 높음
    tracking_id: optionalEnv("ALIEXPRESS_TRACKING_ID") ?? "default",
  });

  // 응답 경로: aliexpress_affiliate_product_query_response.resp_result.result.products.product[]
  const root = data["aliexpress_affiliate_product_query_response"] as
    | Record<string, unknown>
    | undefined;
  const respResult = root?.["resp_result"] as Record<string, unknown> | undefined;
  const result = respResult?.["result"] as Record<string, unknown> | undefined;
  const products = (result?.["products"] as Record<string, unknown> | undefined)?.[
    "product"
  ] as Array<Record<string, unknown>> | undefined;

  return (products ?? []).map((p) => ({
    productId: String(p["product_id"] ?? ""),
    title: String(p["product_title"] ?? ""),
    imageUrl: String(p["product_main_image_url"] ?? ""),
    videoUrl: p["product_video_url"] ? String(p["product_video_url"]) : null,
  }));
}

export interface AliVideoMatch {
  videoUrl: string;
  matchedTitle: string;
  /** dHash 해밍 거리 (작을수록 확실한 매칭) */
  distance: number;
}

/**
 * 쿠팡 상품과 "같은 제품"인 알리 상품의 데모 영상을 찾는다.
 * 이미지 지문이 임계치(MATCH_THRESHOLD) 이하로 일치할 때만 돌려준다 → 오매칭 차단.
 * 못 찾으면 null (호출부가 Pexels 폴백).
 */
export async function findMatchingAliVideo(
  productName: string,
  productImageUrl: string
): Promise<AliVideoMatch | null> {
  if (!hasAliexpressEnv()) return null;

  const ourHash = await dhashFromUrl(productImageUrl);
  if (ourHash === null) {
    console.warn("알리 매칭: 우리 상품 이미지 해시 실패");
    return null;
  }

  const keywords = keywordsFromProductName(productName);
  let candidates: AliProduct[];
  try {
    candidates = await searchAliProducts(keywords);
  } catch (e) {
    console.warn(`알리 검색 실패("${keywords}"): ${(e as Error).message.slice(0, 150)}`);
    return null;
  }

  const withVideo = candidates.filter((c) => c.videoUrl && c.imageUrl);
  console.log(
    `알리 검색 "${keywords}": 후보 ${candidates.length}개 (영상 있는 것 ${withVideo.length}개)`
  );

  let best: AliVideoMatch | null = null;
  for (const c of withVideo.slice(0, 12)) {
    const hash = await dhashFromUrl(c.imageUrl);
    if (hash === null) continue;
    const distance = hammingDistance(ourHash, hash);
    if (distance <= MATCH_THRESHOLD && (!best || distance < best.distance)) {
      best = { videoUrl: c.videoUrl!, matchedTitle: c.title, distance };
      if (distance <= 2) break; // 사실상 동일 이미지 - 더 볼 필요 없음
    }
  }

  if (best) {
    console.log(
      `알리 매칭 성공 (거리 ${best.distance}): ${best.matchedTitle.slice(0, 60)}`
    );
  } else {
    console.log("알리 매칭: 임계치 이하 일치 없음 → 스톡 폴백");
  }
  return best;
}
