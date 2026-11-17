import Link from "next/link";
import { bodyFont, tapeFont, TAPE } from "../../brand";
import { StickyGo } from "./StickyGo";

/*
 * N번 안내 페이지 화면 (2026-11-16 개편 - 사장님 "추천대로 진행", design-taste-frontend 기준).
 * 실측: 11/9~16 이 페이지 방문 25 · 쿠팡 이동 0. 예전 화면은 정사각 사진이 휴대폰 첫 화면을 거의 다 차지해
 * 버튼이 첫 화면 아래로 밀렸고, 그 자리를 하단 고정 바가 대신했다(첫 화면에 같은 버튼이 두 번 보일 때도 있었다).
 * 바꾼 것: 사진을 4:3 로 줄여 고지 → 번호·사진 → 상품 이름 → 버튼이 첫 화면 안에 모두 들어오게,
 * 버튼은 상품 이름 바로 밑 하나. 하단 고정 바는 그 버튼이 화면 밖으로 나간 뒤에만 나타난다(StickyGo).
 * 선(테두리)·그림자는 빼고 바탕 톤 차이로만 나눈다. 고지는 여전히 맨 위, 버튼보다 먼저(공정위 지침).
 * 가격은 보여 주지 않는다 - 쿠팡에서만 확인 (2026-11-04 사장님).
 */

const INK = "#1e1f1c";
const SUB = "#5f635e";
const WELL = "#eef1f0";

export type NumberViewProps = {
  displayNumber: number;
  productName: string;
  imageUrl: string | null;
  isAliexpress: boolean;
  disclosure: string;
  friendlyLine: string | null;
  points: string[];
  buttonLabel: string;
  goHref: string;
  version: string;
  /** 서버 컴포넌트에서만 넣는 조회 기록(미리보기에서는 없음) */
  beacon?: React.ReactNode;
};

export function NumberView(p: NumberViewProps) {
  return (
    <div className={`bg-white min-h-[100svh] ${bodyFont.className}`} style={{ color: INK }}>
      <main className="max-w-[480px] mx-auto pb-24">
        {p.beacon}

        {/* 대가성 고지 - 화면 맨 위, 버튼보다 먼저. 선 대신 바탕 톤으로 구분한다 */}
        <p className="px-5 py-3 text-[13px] leading-[1.55] break-keep" style={{ background: WELL, color: SUB }}>
          {p.disclosure}
          {p.friendlyLine && (
            <span className="block mt-0.5" style={{ color: INK }}>
              {/* 이모지는 화면에서 뺀다(글자만) - 같은 문구를 쓰는 다른 곳은 그대로 */}
              {p.friendlyLine.replace(/\s*\p{Extended_Pictographic}\uFE0F?/gu, "")}
            </span>
          )}
        </p>

        {/* 번호 라벨 + 사진. 첫 화면에 버튼까지 들어오게 4:3 */}
        <div className="relative aspect-[4/3] flex items-center justify-center" style={{ background: WELL }}>
          {p.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.productName} className="w-[78%] h-[86%] object-contain mix-blend-multiply" />
          )}
          <div
            className={`absolute left-4 top-4 -rotate-[4deg] text-white rounded-[3px] px-4 pt-1.5 pb-1 text-[36px] leading-none tracking-[0.04em] ${tapeFont.className}`}
            style={{ background: TAPE }}
          >
            {p.displayNumber}
            <span className="text-[16px] tracking-normal ml-0.5 opacity-85">번</span>
          </div>
          {p.isAliexpress && (
            <span className="absolute right-4 bottom-4 bg-white text-[13px] font-medium rounded px-2 py-1">
              해외직구 · 배송 1~2주
            </span>
          )}
        </div>

        <div className="px-5">
          <h1 className="pt-5 text-[23px] leading-[1.35] font-bold tracking-[-0.02em] break-keep">{p.productName}</h1>

          {/* 첫 화면 안의 유일한 버튼 - 상품 이름 바로 밑 */}
          <a
            id="go-main"
            href={p.goHref}
            rel="nofollow sponsored"
            className="mt-4 flex items-center justify-center gap-2 text-white font-bold text-[18px] rounded-md py-[18px] transition-transform duration-150 active:scale-[0.98] hover:brightness-110 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#f2b705]"
            style={{ background: TAPE }}
          >
            {p.buttonLabel}
            <span aria-hidden="true">→</span>
          </a>
          <p className="mt-2.5 text-[14px] leading-[1.5] break-keep" style={{ color: SUB }}>
            가격과 배송은 쿠팡 화면에서 바로 확인할 수 있어요.
          </p>

          {p.points.length > 0 && (
            <section className="mt-9">
              <h2 className="text-[17px] font-bold leading-[1.4]">영상에서 짚은 내용</h2>
              <ul className="mt-3 rounded-md px-4 py-3" style={{ background: WELL }}>
                {p.points.map((point, i) => (
                  <li key={i} className="py-1.5 text-[16px] leading-[1.6] break-keep">
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-9">
            <Link href="/" className="text-[15px] underline underline-offset-4" style={{ color: SUB }}>
              다른 번호도 보기
            </Link>
          </p>
        </div>

        <footer className="mt-12 px-5 text-[13px] leading-relaxed" style={{ color: SUB }}>
          살림템 메모장
          <span className="block mt-1 opacity-60">{p.version}</span>
        </footer>
      </main>

      <StickyGo targetId="go-main" href={p.goHref} label={p.buttonLabel} />
    </div>
  );
}
