import { supabaseAdmin } from "@/lib/supabase";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { formatDisplayNumber } from "@/lib/format";
import type { Product, VideoItemWithProduct } from "@/types/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  generating: "생성 중",
  rendered: "업로드 예약", // 렌더 완료 - 정해진 시간에 자동 발행 (미리보기 가능)
  completed: "완료",
  failed: "실패",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-gray-100 text-sub",
  generating: "bg-amber-100 text-amber-700",
  rendered: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-600",
};

export default async function AdminVideos() {
  // layout과 page는 독립적으로 렌더링되므로 이 페이지에서도 인증을 확인한다.
  if (!(await isAdminAuthenticated())) return null;

  const db = supabaseAdmin();

  const [{ data: videos }, { data: clicks }, { data: candidates }] =
    await Promise.all([
      db
        .from("video_items")
        .select("*, products(*)")
        .order("display_number", { ascending: false }),
      db.from("click_logs").select("video_item_id"),
      db
        .from("products")
        .select("*")
        .eq("status", "candidate")
        .order("created_at", { ascending: false }),
    ]);

  const clickCount = new Map<string, number>();
  for (const row of clicks ?? []) {
    clickCount.set(
      row.video_item_id,
      (clickCount.get(row.video_item_id) ?? 0) + 1
    );
  }

  const items = (videos as VideoItemWithProduct[] | null) ?? [];

  // 같은 productId 로 생성된 영상 개수 (여러 후킹 테스트 비교용)
  const videosPerProduct = new Map<string, number>();
  for (const v of items) {
    videosPerProduct.set(
      v.product_id,
      (videosPerProduct.get(v.product_id) ?? 0) + 1
    );
  }

  return (
    <main className="pt-6">
      <h1 className="font-bold text-2xl">영상 목록</h1>
      <p className="text-sub text-sm mt-1">
        같은 상품이라도 번호(후킹)별 클릭 수를 비교할 수 있어요.
      </p>

      {/* 수동 영상 생성 요청 */}
      <section className="bg-card rounded-2xl p-4 border border-accent-soft mt-5">
        <h2 className="font-bold">영상 생성 요청</h2>
        <form
          method="POST"
          action="/api/admin/videos"
          className="flex gap-2 mt-3 flex-wrap"
        >
          <select
            name="productId"
            className="flex-1 min-w-48 rounded-xl border border-accent px-3 py-2.5 bg-cream text-sm"
          >
            <option value="">자동 선택 (추천 기준)</option>
            {((candidates as Product[] | null) ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>
          <select
            name="templateType"
            className="rounded-xl border border-accent px-3 py-2.5 bg-cream text-sm"
          >
            <option value="">템플릿 자동</option>
            <option value="A">A 문제해결형</option>
            <option value="B">B 아이엄마 공감형</option>
            <option value="C">C 살림 메모형</option>
          </select>
          <button
            type="submit"
            className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl px-4 py-2.5 text-sm"
          >
            새 번호로 생성
          </button>
        </form>
        <p className="text-xs text-sub mt-2">
          문구는 바로 생성되고, 영상 렌더링은 워커(npm run worker)가 처리해요.
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-3">
        {items.map((v) => (
          <div
            key={v.id}
            className="bg-card rounded-2xl p-4 border border-accent-soft"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-primary-dark text-lg">
                {formatDisplayNumber(v.display_number)}
              </span>
              <span className="font-semibold truncate">
                {v.products.product_name}
              </span>
              {(videosPerProduct.get(v.product_id) ?? 0) > 1 && (
                <span className="text-xs bg-accent-soft text-primary-dark rounded-full px-2 py-0.5">
                  이 상품 영상 {videosPerProduct.get(v.product_id)}개
                </span>
              )}
              <span
                className={`ml-auto text-xs font-bold rounded-full px-2.5 py-0.5 ${
                  STATUS_COLOR[v.video_status] ?? ""
                }`}
              >
                {STATUS_LABEL[v.video_status] ?? v.video_status}
              </span>
            </div>

            {v.hook_text && (
              <p className="text-sm mt-2">
                <span className="text-sub">후킹:</span> {v.hook_text}
              </p>
            )}

            <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
              <span className="font-bold">
                클릭 {clickCount.get(v.id) ?? 0}회
              </span>
              <span className="text-sub">템플릿 {v.template_type}</span>
              {v.drive_video_url && (
                <a
                  href={v.drive_video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-dark font-semibold"
                >
                  영상 ↗
                </a>
              )}
              {v.drive_caption_url && (
                <a
                  href={v.drive_caption_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-dark font-semibold"
                >
                  캡션 ↗
                </a>
              )}
              {v.drive_thumbnail_url && (
                <a
                  href={v.drive_thumbnail_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-dark font-semibold"
                >
                  썸네일 ↗
                </a>
              )}
              {v.youtube_url && (
                <a
                  href={v.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-dark font-semibold"
                >
                  유튜브 ↗
                </a>
              )}
              {v.instagram_url && (
                <a
                  href={v.instagram_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-dark font-semibold"
                >
                  인스타 ↗
                </a>
              )}
            </div>

            {v.video_status === "failed" && v.error_message && (
              <p className="text-xs text-red-600 mt-2">{v.error_message}</p>
            )}
            {v.video_status === "completed" && v.youtube_error && (
              <p className="text-xs text-red-600 mt-2">유튜브 업로드 실패: {v.youtube_error}</p>
            )}
            {v.video_status === "completed" && v.instagram_error && (
              <p className="text-xs text-red-600 mt-2">인스타 업로드 실패: {v.instagram_error}</p>
            )}
            {v.video_status === "failed" && (
              <form method="POST" action="/api/admin/videos" className="mt-2">
                <input type="hidden" name="retryVideoItemId" value={v.id} />
                <button
                  type="submit"
                  className="text-xs bg-accent-soft text-primary-dark font-bold rounded-lg px-3 py-1.5"
                >
                  다시 시도
                </button>
              </form>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sub text-sm mt-4">아직 생성된 영상이 없어요.</p>
        )}
      </div>
    </main>
  );
}
