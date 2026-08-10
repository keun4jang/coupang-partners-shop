import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { formatDisplayNumber } from "@/lib/format";
import { getEarnings, won } from "@/lib/earnings";
import { getPayoutStatus } from "@/lib/payout";
import type { VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  generating: "생성 중",
  rendered: "업로드 예약", // 렌더 완료 - 정해진 슬롯 시간에 자동 발행
  completed: "완료",
  failed: "실패",
};

export default async function AdminDashboard() {
  // Next.js는 layout과 page를 독립적으로 렌더링하므로, layout의 로그인 게이트와
  // 별개로 이 페이지에서도 인증을 확인해야 미인증 요청이 DB를 조회하지 않는다.
  if (!(await isAdminAuthenticated())) return null;

  const db = supabaseAdmin();

  const [
    { count: productCount },
    { count: candidateCount },
    { count: videoCount },
    { count: clickCount },
    { data: recentVideos },
    earnings,
    payout,
  ] = await Promise.all([
    db.from("products").select("*", { count: "exact", head: true }),
    db
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("status", "candidate"),
    db.from("video_items").select("*", { count: "exact", head: true }),
    db.from("click_logs").select("*", { count: "exact", head: true }),
    db
      .from("video_items")
      .select("*, products(*)")
      .order("display_number", { ascending: false })
      .limit(5),
    getEarnings(),
    getPayoutStatus(),
  ]);

  // 출금 진행률 바 (기준 10,000원 대비)
  const payoutPct = payout.ok
    ? Math.min(100, Math.round((payout.unpaidBalance / payout.threshold) * 100))
    : 0;

  const stats = [
    { label: "전체 상품", value: productCount ?? 0 },
    { label: "후보 상품", value: candidateCount ?? 0 },
    { label: "생성된 영상", value: videoCount ?? 0 },
    { label: "누적 클릭", value: clickCount ?? 0 },
  ];

  return (
    <main className="pt-6">
      <h1 className="font-bold text-2xl">대시보드</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-card rounded-2xl p-4 border border-accent-soft text-center"
          >
            <div className="text-2xl font-extrabold text-primary-dark">
              {s.value}
            </div>
            <div className="text-sub text-sm mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="font-bold text-lg">💰 쿠팡파트너스 수익</h2>
        {earnings.ok ? (
          <>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { label: "오늘", b: earnings.today },
                { label: "최근 7일", b: earnings.week },
                { label: `이번달 (${earnings.monthLabel})`, b: earnings.month },
              ].map((e) => (
                <div
                  key={e.label}
                  className="bg-card rounded-2xl p-4 border border-accent-soft"
                >
                  <div className="text-sub text-xs">{e.label}</div>
                  <div className="text-xl font-extrabold text-primary-dark mt-1">
                    {won(e.b.commission)}
                  </div>
                  <div className="text-sub text-xs mt-1">클릭 {e.b.clicks}</div>
                </div>
              ))}
            </div>
            <p className="text-sub text-xs mt-2">
              ※ 커미션은 정산 확정 전 예상치예요.
            </p>
          </>
        ) : (
          <p className="text-sub text-sm mt-3">
            수익 정보를 불러오지 못했어요. {earnings.error}
          </p>
        )}
      </section>

      {/* 출금(지급) 현황 - 쿠팡파트너스는 월 마감 시 1만원 이상이면 자동 입금 */}
      <section className="mt-8">
        <h2 className="font-bold text-lg">🏦 출금까지</h2>
        {payout.ok ? (
          <div className="bg-card rounded-2xl p-4 border border-accent-soft mt-3">
            <div className="flex items-baseline justify-between flex-wrap gap-1">
              <span className="text-2xl font-extrabold text-primary-dark">
                {won(payout.unpaidBalance)}
              </span>
              <span className="text-sub text-sm">
                지급 기준 {won(payout.threshold)}
              </span>
            </div>

            <div className="mt-3 h-2.5 w-full rounded-full bg-accent-soft overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  payout.reachedThreshold ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: `${payoutPct}%` }}
              />
            </div>

            {payout.reachedThreshold ? (
              <p className="text-sm mt-3 font-semibold text-emerald-700">
                🎉 지급 기준을 넘었어요! {payout.expectedPayoutDate}에 등록 계좌로
                자동 입금될 예정이에요.
              </p>
            ) : (
              <p className="text-sm mt-3">
                <span className="font-bold text-primary-dark">
                  {won(payout.shortfall)}
                </span>{" "}
                더 모이면 지급 대상이에요.
                <span className="text-sub">
                  {" "}
                  이번달에 못 넘으면 다음 달로 이월돼요.
                </span>
              </p>
            )}

            <p className="text-sub text-xs mt-2">
              ※ 쿠팡파트너스는 별도 출금 신청이 없어요. 월 마감 기준 1만원을 넘으면
              발생월의 다다음 달 15일에 원천징수 3.3%를 뺀 금액이 자동 입금돼요.
            </p>
          </div>
        ) : (
          <p className="text-sub text-sm mt-3">
            출금 현황을 불러오지 못했어요. {payout.error}
          </p>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">최근 생성 상태</h2>
          <Link href="/admin/videos" className="text-sm text-primary-dark font-semibold">
            전체 보기 →
          </Link>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {(recentVideos as VideoItemWithProduct[] | null)?.map((v) => (
            <div
              key={v.id}
              className="bg-card rounded-xl px-4 py-3 border border-accent-soft flex items-center gap-3 text-sm"
            >
              <span className="font-bold text-primary-dark shrink-0">
                {formatDisplayNumber(v.display_number)}
              </span>
              <span className="truncate">{v.products.product_name}</span>
              <span className="ml-auto shrink-0 text-sub">
                {STATUS_LABEL[v.video_status] ?? v.video_status}
              </span>
            </div>
          ))}
          {(!recentVideos || recentVideos.length === 0) && (
            <p className="text-sub text-sm">아직 생성된 영상이 없어요.</p>
          )}
        </div>
      </section>

      <section className="mt-8 flex gap-3">
        <Link
          href="/admin/products/new"
          className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl px-5 py-3"
        >
          + 상품 등록
        </Link>
        <Link
          href="/admin/videos"
          className="bg-card border border-accent text-primary-dark font-bold rounded-xl px-5 py-3"
        >
          영상 생성 요청
        </Link>
        <Link
          href="/admin/ali"
          className="bg-card border border-accent text-primary-dark font-bold rounded-xl px-5 py-3"
        >
          알리 상품
        </Link>
      </section>
    </main>
  );
}
