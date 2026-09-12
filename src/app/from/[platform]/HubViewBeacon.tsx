"use client";

import { useEffect, useRef } from "react";
import type { HubPlatform } from "@/lib/tracking";

/**
 * 프로필 허브 방문 1건을 서버에 알린다 (fire-and-forget).
 * ViewBeacon(/n/[number])과 같은 원칙: 화면에 아무것도 안 그리고, 실패해도
 * 조용히 넘어간다. keepalive 로 바로 상품을 눌러 페이지를 떠나도 누락되지 않게 한다.
 */
export function HubViewBeacon({ platform }: { platform: HubPlatform }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    void fetch("/api/hub-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
      keepalive: true,
    }).catch(() => {
      // 집계 실패는 사용자에게 보일 이유가 없다
    });
  }, [platform]);

  return null;
}
