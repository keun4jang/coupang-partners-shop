import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * 영상별 직행 주소: /n/71 → 71번 제품이 히어로로 뜬 랜딩.
 *
 * 유튜브 설명란·인스타 캡션에 이 주소를 그대로 넣으면 시청자가
 * "랜딩에서 번호 찾기" 단계를 건너뛴다. (실측: 조회 17,246 에 쿠팡 도달 14건,
 *  CTR 0.08% — 경로가 길수록 여기서 다 샌다)
 *
 * 랜딩을 거치게 두는 이유: 대가성 고지가 랜딩 하단에만 있어서,
 * 쿠팡으로 바로 넘기면 고지 없이 제휴 링크를 태우는 셈이 된다.
 */
export default async function DirectNumber({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const n = parseInt(String(number).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) redirect("/");
  // s=direct: 이 방문이 영상 직행 링크에서 왔음을 클릭 로그에 남긴다
  redirect(`/?q=${n}&s=direct`);
}
