import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { shortenProductName } from "@/lib/format";
import { parseTrackingParams, shortsVariantOf, trackingQuery } from "@/lib/tracking";
import { findPolicyIssues, FRIENDLY_DISCLOSURE_LINE } from "@/lib/policy";
import { isOwnProduct, OWN_DISCLOSURE_LINE } from "@/lib/ownProducts";
import { APP_VERSION } from "@/lib/appVersion";
import type { VideoItemWithProduct } from "@/types/db";
import { ViewBeacon } from "./ViewBeacon";
import { NumberView } from "./NumberView";
import { bodyFont, tapeFont, TAPE } from "../../brand";

/*
 * 2026-10-17 디자인 개편 (사장님 "적용해" - frontend-design 스킬 기준). 공통 규칙은 src/app/brand.ts.
 * 예전 화면(크림 바탕·테라코타·둥근 카드+그림자)은 AI 생성 디자인의 대표 패턴이라 "AI 가 만든 것 같다"는
 * 인상을 줬다. 고지 문구는 화면 맨 위 그대로(공정위 지침 - '더보기' 없이 보이는 위치).
 */

export const dynamic = "force-dynamic";

/**
 * 영상에서 넘어온 방문자를 위한 N번 전용 페이지.
 *   /n/65?src=youtube_shorts&channel=youtube&tpl=usecase
 *
 * 예전에는 이 주소가 /?q=65&s=direct 로 리다이렉트만 했다. 그러다 보니
 *  · 리다이렉트 한 번을 더 타고
 *  · 도착한 화면 맨 위엔 "번호로 찾기" 검색창이 있고(이미 번호로 온 사람에겐 군더더기)
 *  · 대가성 고지는 스크롤 맨 아래 푸터에만 있어서, 카드 전체가 링크인 히어로를
 *    바로 누른 사람은 고지를 못 본 채 제휴 링크를 타게 됐다.
 * 공정위 지침(고지는 "더보기" 없이 보이는 곳)과 실측 CTR 0.08% 를 함께 보면
 * 이 경로는 그대로 둘 이유가 없어서, 첫 화면에서 끝나는 전용 페이지로 바꿨다.
 *
 * 화면 순서는 고정이다: 대가성 고지 → N번/상품 → 버튼 → 영상에서 짚은 내용 (2026-11-16 개편, NumberView.tsx).
 * 광고 고지가 항상 버튼보다 위에 온다.
 */

async function findByNumber(n: number): Promise<VideoItemWithProduct | null> {
  const { data } = await supabaseAdmin()
    .from("video_items")
    .select("*, products(*)")
    .eq("display_number", n)
    .eq("landing_visible", true)
    .maybeSingle();
  return (data as VideoItemWithProduct | null) ?? null;
}

/**
 * 대본에서 영상이 짚었던 내용 2~3줄을 뽑는다.
 *
 * 줄 위치가 변형·대본 버전마다 다르므로 그대로 [2][3][4] 를 쓰면 안 된다
 * (렌더 워커 buildProps 와 같은 규칙을 여기서도 지켜야 한다):
 *   · usecase 7줄: 2=용도 3=구조 4=확인할 점 5=맞는 집
 *   · classic 7줄: 2=장점1 3=장점2 4=사용팁 5=확인할 점
 *   · 구버전 6줄: 2=장점1 3=장점2 4=옛 후기줄 5=CTA
 *
 * 특히 구버전 6줄의 4번째 줄은 이번에 걷어낸 "재구매 후기가 많다" 류 문구다.
 * 그 줄을 그대로 제휴 버튼 위에 띄우면 근거 없는 사회적 증거를 게시하는 셈이라
 * 아예 후보에서 뺀다. 남는 줄도 발행 경로와 같은 잣대(findPolicyIssues)로 거른다.
 */
function scriptHighlights(item: VideoItemWithProduct): string[] {
  const lines = (item.script_text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const usable = (l: string | undefined | null): l is string =>
    typeof l === "string" && l.trim().length > 1 && findPolicyIssues(l).length === 0;

  let candidates: (string | undefined)[];
  if (lines.length >= 7) {
    candidates =
      shortsVariantOf(item) === "usecase"
        ? [lines[2], lines[3], lines[4]] // 용도 · 구조 · 확인할 점
        : [lines[2], lines[3], lines[5]]; // 장점1 · 장점2 · 확인할 점
  } else {
    // 구버전 6줄 - 장점 두 줄만 쓴다(4번째 옛 후기줄은 제외)
    candidates = [lines[2], lines[3]];
  }

  const picked = candidates.filter(usable);
  if (picked.length > 0) return picked.slice(0, 3);

  // 대본이 없거나 전부 걸러졌으면 상품 등록 정보로 대체
  // (그것도 없으면 빈 배열 → 섹션 자체가 사라진다)
  return [item.products.main_benefit, item.products.pain_point]
    .filter(usable)
    .slice(0, 3);
}

/** 제휴처 이름 - 버튼 문구에 어디로 가는지 정직하게 밝힌다 */
function shopName(source: string): string {
  return source === "aliexpress" ? "알리익스프레스" : "쿠팡";
}

export default async function NumberPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { number } = await params;
  const rawSearch = await searchParams;

  // 숫자만 이어붙이면 "1.5" → 15, "-3" → 3 처럼 엉뚱한 번호가 된다.
  const raw = String(number).trim();
  if (!/^\d{1,5}$/.test(raw)) redirect("/");
  const n = Number.parseInt(raw, 10);
  if (n <= 0) redirect("/");

  // 추적 파라미터는 화이트리스트를 통과한 값만 쓴다(쿼리스트링은 조작 가능).
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearch)) {
    if (typeof value === "string") search.set(key, value);
  }
  const tracking = parseTrackingParams(search);

  let item: VideoItemWithProduct | null = null;
  let dbReady = true;
  try {
    item = await findByNumber(n);
  } catch {
    dbReady = false;
  }

  // 아직 정리되지 않은 번호 - 막다른 404 대신 다음 행동을 안내한다
  if (!item) {
    // 10/17 개편과 같은 말투: 아직 아무것도 안 넣은 서랍처럼 '빈 라벨'(점선 테이프)에 번호만 적어 둔다
    return (
      <div className={`bg-white min-h-[100svh] text-[#1e1f1c] ${bodyFont.className}`}>
        <main className="max-w-[480px] mx-auto px-5 pt-16 pb-16">
          <div
            className={`inline-block -rotate-[4deg] rounded-[3px] border-2 border-dashed px-4 pt-1.5 pb-1 text-[34px] tracking-[0.06em] ${tapeFont.className}`}
            style={{ borderColor: TAPE, color: TAPE }}
          >
            {n}
            <span className="text-[15px] tracking-normal ml-0.5 opacity-85">번</span>
          </div>
          <h1 className="mt-7 text-[22px] leading-[1.4] font-bold tracking-[-0.01em] break-keep">
            {dbReady ? "이 번호는 아직 정리하지 않았어요." : "잠시 후 다시 들러 주세요."}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#676b66] break-keep">
            {dbReady
              ? "영상이 막 올라온 번호라면 조금 뒤에 채워져요. 다른 번호는 전체 목록에서 찾을 수 있어요."
              : "목록을 불러오지 못했어요. 새로고침하거나 전체 목록에서 다시 찾아 주세요."}
          </p>
          <Link
            href="/"
            className="mt-8 block text-white font-bold text-[16.5px] rounded-md py-[17px] text-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#f2b705]"
            style={{ background: TAPE }}
          >
            전체 목록 보기
          </Link>
        </main>
      </div>
    );
  }

  const product = item.products;
  const points = scriptHighlights(item);
  const shop = shopName(product.source);
  // 버튼 문구는 "정보를 보러 간다"는 사실만 말한다. 구매 재촉·최저가 단정은 쓰지 않는다.
  const buttonLabel = `${shop}에서 상품 정보 보기`;
  const goHref = `/go/${n}?${trackingQuery({
    source: tracking.source === "unknown" ? "site" : tracking.source,
    channel: tracking.channel === "unknown" ? "site" : tracking.channel,
    templateVariant: tracking.templateVariant,
    videoId: tracking.videoId || undefined,
    rank: tracking.rank || undefined,
  })}`;

  const own = isOwnProduct(product);
  return (
    <NumberView
      displayNumber={item.display_number}
      // 두 줄 안에 들어가게 (23px · 폭 350px ≈ 한 줄 15자)
      productName={shortenProductName(product.product_name, 30)}
      imageUrl={product.image_url}
      isAliexpress={product.source === "aliexpress"}
      // 사장님 본인 상품은 수수료가 아니라 판매자 직접 판매라 고지가 다르다 (lib/ownProducts.ts)
      disclosure={own ? OWN_DISCLOSURE_LINE : "이 게시물은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."}
      friendlyLine={own ? null : FRIENDLY_DISCLOSURE_LINE}
      points={points}
      buttonLabel={buttonLabel}
      goHref={goHref}
      version={APP_VERSION}
      beacon={
        <ViewBeacon
          displayNumber={n}
          src={tracking.source}
          channel={tracking.channel}
          tpl={tracking.templateVariant}
          vid={tracking.videoId || undefined}
          rank={tracking.rank || undefined}
        />
      }
    />
  );
}
