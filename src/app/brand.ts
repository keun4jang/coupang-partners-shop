/**
 * 공개 화면 공통 디자인 (2026-10-17 사장님 "적용해" - frontend-design 스킬 기준).
 * '살림템 메모장 = 번호로 정리' → 번호를 서랍 라벨 테이프처럼 보여 주는 것 하나만 눈에 띄게,
 * 나머지는 흰 바탕·회색 사진 칸·왼쪽 정렬·남색 한 가지로 조용하게. 홈(/)과 안내 페이지(/n)가 같이 쓴다.
 */
import { Black_Han_Sans, IBM_Plex_Sans_KR } from "next/font/google";

export const tapeFont = Black_Han_Sans({ weight: "400", subsets: ["latin"], preload: false });
export const bodyFont = IBM_Plex_Sans_KR({ weight: ["400", "500", "700"], subsets: ["latin"], preload: false });

/** 라벨 테이프·버튼·강조선 색 (이 색 하나만 강조에 쓴다) */
export const TAPE = "#1d3f8c";

/** 남색 버튼 공통 클래스 (배경색은 style={{ background: TAPE }}) */
export const BUTTON =
  "block text-white font-bold rounded-md text-center focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#f2b705]";
