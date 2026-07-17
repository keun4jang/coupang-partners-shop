import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { formatDisplayNumber } from "@/lib/format";
import { getEarnings, won } from "@/lib/earnings";
import type { VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  generating: "생성 중",
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
  ]);

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
      </section>
    </main>
  );
}
