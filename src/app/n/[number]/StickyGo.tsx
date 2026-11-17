"use client";

import { useEffect, useState } from "react";
import { TAPE } from "../../brand";

/**
 * 하단 고정 버튼 - 본문 버튼(targetId)이 화면 밖으로 나갔을 때만 나타난다 (2026-11-16 개편).
 * 첫 화면에 같은 버튼이 두 개 보이지 않게. 스크립트가 안 돌면 나타나지 않는다(본문 버튼은 그대로 있음).
 * 떠 있는 바라 그림자를 허용한다(설계 규칙: 떠 있는 것만 그림자).
 */
export function StickyGo({ targetId, href, label }: { targetId: string; href: string; label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  return (
    <div
      aria-hidden={!show}
      style={{ boxShadow: "0 -6px 20px rgba(0,0,0,0.08)" }} // taste-skill-ignore: 떠 있는 하단 바만 그림자
      className={`fixed bottom-0 left-0 right-0 bg-white px-5 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] transition-transform duration-200 motion-reduce:transition-none ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <a
        href={href}
        rel="nofollow sponsored"
        tabIndex={show ? 0 : -1}
        className="block max-w-[440px] mx-auto text-white font-bold text-[17px] rounded-md py-3.5 text-center active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#f2b705]"
        style={{ background: TAPE }}
      >
        {label}
      </a>
    </div>
  );
}
