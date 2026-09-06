"use client";

import { useEffect, useRef } from "react";

/**
 * 랜딩 방문 1건을 서버에 알린다 (fire-and-forget).
 *
 * 화면에 아무것도 그리지 않고, 실패해도 조용히 넘어간다. 방문 집계 때문에
 * 페이지가 느려지거나 오류 화면이 뜨는 일은 없어야 한다.
 *
 * keepalive 를 쓰는 이유: 사용자가 곧바로 쿠팡 버튼을 눌러 페이지를 떠나면
 * 일반 fetch 는 중간에 끊겨 방문이 누락된다. 그러면 클릭 수가 방문 수보다
 * 많아지는 이상한 CTR 이 나온다.
 *
 * StrictMode 개발 환경에서 effect 가 두 번 도는 것도 막는다(중복 집계 방지).
 */
export function ViewBeacon({
  displayNumber,
  src,
  channel,
  tpl,
  vid,
  rank,
}: {
  displayNumber: number;
  src: string;
  channel: string;
  tpl: string;
  vid?: string;
  rank?: number;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    void fetch("/api/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayNumber, src, channel, tpl, vid, rank }),
      keepalive: true,
    }).catch(() => {
      // 집계 실패는 사용자에게 보일 이유가 없다
    });
  }, [displayNumber, src, channel, tpl, vid, rank]);

  return null;
}
