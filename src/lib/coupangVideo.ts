import { ProxyAgent } from "undici";
import { optionalEnv } from "./env";

/**
 * 쿠팡 상세페이지 판매자 영상 자동 추출.
 *
 * 그 상품 페이지에 판매자가 올린 시연/홍보 영상을 그대로 가져온다 - 정확도 100%
 * (같은 상품이라 매칭 검증도 불필요). 소싱 파이프라인의 최우선 소스.
 *
 * 쿠팡은 데이터센터 IP를 차단하므로(직접 확인: 403) 가정용 회선을 경유하는
 * 프록시가 필요하다. SCRAPER_PROXY_URL(예: http://user:pass@host:port) 이
 * 설정된 경우에만 동작하고, 없으면 조용히 건너뛴다(알리/스톡 폴백).
 *
 * 파트너스 링크를 따라가지 않고 상품 페이지 URL 을 직접 조립한다
 * (제휴 링크를 서버가 밟으면 셀프 클릭이 기록되므로).
 */

export function hasCoupangScraperEnv(): boolean {
  return Boolean(optionalEnv("SCRAPER_PROXY_URL"));
}

/** 파트너스 링크(AFFSDP)의 쿼리에서 상품 페이지 URL 을 직접 조립 */
export function productPageUrlFromPartnerUrl(partnerUrl: string): string | null {
  try {
    const u = new URL(partnerUrl);
    const pageKey = u.searchParams.get("pageKey");
    if (!pageKey) return null;
    const itemId = u.searchParams.get("itemId");
    const vendorItemId = u.searchParams.get("vendorItemId");
    const qs = new URLSearchParams();
    if (itemId) qs.set("itemId", itemId);
    if (vendorItemId) qs.set("vendorItemId", vendorItemId);
    const tail = qs.toString();
    return `https://www.coupang.com/vp/products/${pageKey}${tail ? `?${tail}` : ""}`;
  } catch {
    return null;
  }
}

/** 페이지 HTML 에서 상품 영상(mp4) URL 후보를 찾는다 */
export function extractVideoUrls(html: string): string[] {
  // JSON 내 이스케이프(/, \/) 복원 후 mp4 URL 스캔
  const unescaped = html
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/");
  const re = /https?:\/\/[^"'\s\\<>]+\.mp4[^"'\s\\<>]*/g;
  const found = new Set<string>();
  for (const m of unescaped.matchAll(re)) {
    found.add(m[0]);
  }
  // 쿠팡 CDN(vod/video 계열) 우선 정렬
  return [...found].sort((a, b) => {
    const score = (s: string) =>
      (/coupang/i.test(s) ? 2 : 0) + (/vod|video/i.test(s) ? 1 : 0);
    return score(b) - score(a);
  });
}

/**
 * 상품의 쿠팡 상세페이지에서 판매자 영상 URL 을 찾는다.
 * 프록시 미설정/차단/영상 없음 → null (호출부가 다음 소스로 폴백).
 */
export async function findCoupangProductVideo(
  partnerUrl: string
): Promise<string | null> {
  const proxyUrl = optionalEnv("SCRAPER_PROXY_URL");
  if (!proxyUrl) return null;

  const pageUrl = productPageUrlFromPartnerUrl(partnerUrl);
  if (!pageUrl) {
    console.warn("쿠팡 영상: 파트너스 링크에서 상품 페이지를 못 만듦");
    return null;
  }

  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    const res = await fetch(pageUrl, {
      // Node fetch(undici)의 dispatcher 옵션 - 표준 타입엔 없어 캐스팅
      dispatcher,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
      },
      signal: AbortSignal.timeout(30_000),
    } as RequestInit & { dispatcher: ProxyAgent });
    if (!res.ok) {
      console.warn(`쿠팡 상세페이지 ${res.status} (프록시 경유) - 폴백`);
      return null;
    }
    const html = await res.text();
    const urls = extractVideoUrls(html);
    if (urls.length === 0) {
      console.log("쿠팡 상세페이지에 영상 없음 - 다음 소스로");
      return null;
    }
    console.log(`쿠팡 상세영상 발견: ${urls[0].slice(0, 90)}...`);
    return urls[0];
  } catch (e) {
    console.warn(`쿠팡 영상 추출 실패: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}
