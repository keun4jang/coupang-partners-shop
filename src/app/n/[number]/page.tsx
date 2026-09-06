import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatDisplayNumber, shortenProductName } from "@/lib/format";
import { parseTrackingParams, trackingQuery } from "@/lib/tracking";
import { APP_VERSION } from "@/lib/appVersion";
import type { VideoItemWithProduct } from "@/types/db";
import { ViewBeacon } from "./ViewBeacon";

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
 * 화면 순서는 고정이다: 대가성 고지 → N번/상품 → 확인할 점 → 링크 버튼.
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
 * 대본에서 "확인할 점" 2~3줄을 뽑는다.
 * 대본 7줄 구조: 후킹 · 공감 · (용도/장점1) · (구조/장점2) · (확인할 점) · … · CTA
 * 실질 정보가 담긴 3·4·5번째 줄만 쓴다. CTA 줄은 링크 안내라 정보가 아니다.
 */
function checkPoints(item: VideoItemWithProduct): string[] {
  const lines = (item.script_text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const picked = [lines[2], lines[3], lines[4]].filter(
    (l): l is string => Boolean(l) && l.length > 1
  );
  if (picked.length > 0) return picked.slice(0, 3);

  // 대본이 없으면 상품 등록 정보로 대체 (그것도 없으면 빈 배열 → 섹션 자체를 숨김)
  const fallback = [item.products.main_benefit, item.products.pain_point].filter(
    (l): l is string => Boolean(l)
  );
  return fallback.slice(0, 3);
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
    return (
      <main className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-5xl font-extrabold text-primary">{n}번</p>
        <p className="font-semibold mt-4">
          {dbReady
            ? "이 번호는 아직 정리해두지 않았어요."
            : "잠시 후 다시 들러주세요."}
        </p>
        <p className="text-sub text-sm mt-2">
          다른 번호는 아래에서 찾아보실 수 있어요.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 bg-primary text-white font-bold rounded-xl px-6 py-3"
        >
          전체 목록 보기
        </Link>
      </main>
    );
  }

  const product = item.products;
  const points = checkPoints(item);
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

  return (
    <main className="max-w-lg mx-auto px-5 pb-32">
      <ViewBeacon
        displayNumber={n}
        src={tracking.source}
        channel={tracking.channel}
        tpl={tracking.templateVariant}
        vid={tracking.videoId || undefined}
        rank={tracking.rank || undefined}
      />

      {/*
        대가성 고지 - 화면 맨 위. 버튼보다 항상 먼저 나온다.
        공정위 「추천·보증 등에 관한 표시·광고 심사지침」은 표시문구가
        "더보기"를 눌러야 보이는 위치에 있으면 안 된다고 본다.
      */}
      <p className="mt-4 mb-5 bg-accent-soft text-ink/80 text-[13px] leading-relaxed rounded-xl px-4 py-3">
        이 게시물은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를
        제공받습니다.
      </p>

      <div className="bg-card rounded-3xl border border-accent-soft shadow-sm overflow-hidden">
        <div className="px-5 pt-5 flex items-center gap-2">
          <span className="bg-primary text-white font-extrabold rounded-full px-3.5 py-1.5 text-lg">
            {formatDisplayNumber(item.display_number)}
          </span>
          {product.source === "aliexpress" && (
            <span className="bg-[#FFE8D6] text-[#8A4B1F] text-xs font-semibold rounded-full px-2.5 py-1">
              해외직구 · 배송 1~2주
            </span>
          )}
        </div>

        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-full aspect-square object-contain bg-white mt-4"
          />
        )}

        <div className="px-5 pt-4 pb-5">
          <h1 className="font-extrabold text-lg leading-snug break-keep">
            {shortenProductName(product.product_name, 44)}
          </h1>
          {product.price_text && (
            <p className="mt-2 text-primary-dark font-extrabold text-xl">
              {product.price_text}
            </p>
          )}
          {/* 가격은 상품 수집 시점 스냅샷이라 지금과 다를 수 있다. 오인 소지를 없앤다. */}
          <p className="text-sub text-xs mt-1">
            영상 제작 시점 기준 가격이에요. 현재 가격은 판매 페이지에서 확인해
            주세요.
          </p>

          {points.length > 0 && (
            <section className="mt-5">
              <h2 className="font-bold text-sm mb-2">확인해 보면 좋은 점</h2>
              <ul className="flex flex-col gap-2">
                {points.map((point, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[15px] leading-relaxed text-ink/85 break-keep"
                  >
                    <span className="text-primary shrink-0">·</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 첫 화면 안 버튼 - 스크롤 없이 바로 닿게 카드 안에 하나 둔다 */}
          <a
            href={goHref}
            rel="nofollow sponsored"
            className="mt-6 block bg-primary hover:bg-primary-dark transition-colors text-white font-extrabold rounded-xl py-4 text-center text-base"
          >
            {buttonLabel}
          </a>
        </div>
      </div>

      <p className="text-center mt-6">
        <Link href="/" className="text-sub text-sm underline">
          다른 번호도 보기
        </Link>
      </p>

      <footer className="mt-10 text-center text-sub text-xs leading-relaxed">
        살림템 메모장
        <span className="block mt-2 text-sub/50">{APP_VERSION}</span>
      </footer>

      {/*
        하단 고정 버튼 - 사진·설명을 다 읽고 내려온 사람이 다시 위로 올라가지
        않아도 되게. 문구는 위 버튼과 같은 중립 표현을 쓴다.
      */}
      <div className="fixed bottom-0 left-0 right-0 bg-cream/95 backdrop-blur border-t border-accent-soft px-5 py-3">
        <a
          href={goHref}
          rel="nofollow sponsored"
          className="block max-w-lg mx-auto bg-primary hover:bg-primary-dark transition-colors text-white font-extrabold rounded-xl py-3.5 text-center"
        >
          {buttonLabel}
        </a>
      </div>
    </main>
  );
}
