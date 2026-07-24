import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function LoginGate() {
  return (
    <main className="max-w-sm mx-auto px-5 pt-24">
      <div className="bg-card rounded-2xl p-6 shadow-sm border border-accent-soft">
        <h1 className="font-bold text-xl text-center">관리자 로그인</h1>
        <form method="POST" action="/api/admin/login" className="mt-5 flex flex-col gap-3">
          <input
            type="password"
            name="secret"
            placeholder="ADMIN_SECRET"
            autoFocus
            className="rounded-xl border border-accent px-4 py-3 bg-cream focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary hover:bg-primary-dark transition-colors text-white font-bold rounded-xl py-3"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAdminAuthenticated();
  if (!authed) return <LoginGate />;

  return (
    <div className="max-w-3xl mx-auto px-5 pb-16">
      <nav className="flex items-center gap-4 py-4 border-b border-accent-soft text-sm font-semibold flex-wrap">
        <Link href="/admin" className="text-primary-dark">
          대시보드
        </Link>
        <Link href="/admin/products" className="hover:text-primary-dark">
          상품 관리
        </Link>
        <Link href="/admin/videos" className="hover:text-primary-dark">
          영상 목록
        </Link>
        <Link href="/admin/studio" className="hover:text-primary-dark">
          스튜디오
        </Link>
        <Link href="/" className="hover:text-primary-dark">
          사이트 보기
        </Link>
        <form method="POST" action="/api/admin/logout" className="ml-auto">
          <button type="submit" className="text-sub hover:text-ink">
            로그아웃
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
