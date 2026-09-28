/**
 * 구글 API 키 점검 - 어떤 키가 어느 API 에 쓰이고, 지금 작동하는지.
 *
 * 왜 필요한가 (2026-09-28): 구글 클라우드 콘솔에 "제한 없는 API 키가 있으니 제한을
 * 걸라"는 경고가 떠 있다. 키가 새면 요금이 나올 수 있어 제한을 거는 게 맞는데, 이
 * 프로젝트는 서버(GitHub Actions·Vercel)에서 키를 쓰므로 IP·리퍼러 제한은 못 걸고
 * "이 키로는 이 API 만" 제한만 걸 수 있다. 문구 생성(Gemini)과 나레이션(TTS)이 같은
 * 키를 쓰는데 한쪽 API 만 허용하면 영상 제작이 멈춘다. 그래서 제한을 걸기 전에
 * 두 키가 같은 키인지, 각각 지금 작동하는지 확인하고, 제한을 건 뒤에도 다시 돌려
 * 둘 다 살아 있는지 확인한다.
 *
 * 키 값은 절대 출력하지 않는다. 콘솔 목록과 맞춰 보도록 끝 4자리만 찍는다.
 * API 호출은 과금이 없는 조회(모델 목록·음성 목록)만 한다.
 *
 * 한계: WORKER_ENV(GitHub)와 app_settings 값만 본다. Vercel 환경변수는 읽을 수 없다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { getSetting } from "../src/lib/settings";

const tail = (k: string) => `…${k.slice(-4)}`;

async function probeGemini(key: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${key}`);
  return describe(res);
}

async function probeTts(key: string): Promise<string> {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=ko-KR&key=${key}`);
  return describe(res);
}

async function describe(res: Response): Promise<string> {
  if (res.ok) return "작동함";
  const body = (await res.json().catch(() => ({}))) as {
    error?: { status?: string; message?: string; details?: { reason?: string }[] };
  };
  const reason = body.error?.details?.find((d) => d.reason)?.reason ?? body.error?.status ?? "";
  // 키 값이 메시지에 섞여 나오는 경우를 막는다
  const msg = (body.error?.message ?? "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "(키)").slice(0, 120);
  return `안 됨 (${res.status} ${reason}) ${msg}`;
}

async function main(): Promise<void> {
  const geminiEnv = process.env.GEMINI_API_KEY ?? "";
  const geminiDb = (await getSetting("GEMINI_API_KEY")) ?? "";
  const gemini = geminiEnv || geminiDb;
  const tts = process.env.GOOGLE_TTS_API_KEY ?? "";

  console.log("① 어떤 키가 있나");
  console.log(`  GEMINI_API_KEY      ${gemini ? tail(gemini) : "(없음)"}  출처: ${geminiEnv ? "WORKER_ENV" : geminiDb ? "app_settings" : "-"}`);
  if (geminiEnv && geminiDb && geminiEnv !== geminiDb) {
    console.log(`  (app_settings 에도 다른 Gemini 키가 있음: ${tail(geminiDb)} - 코드는 WORKER_ENV 값을 먼저 쓴다)`);
  }
  console.log(`  GOOGLE_TTS_API_KEY  ${tts ? tail(tts) : "(없음 - 나레이션은 Edge 무료 음성으로 폴백 중)"}`);
  if (gemini && tts) {
    console.log(`  → 두 키가 ${gemini === tts ? "같은 키다 (한 키에 두 API 를 모두 허용해야 함)" : "서로 다른 키다 (키마다 자기 API 하나씩만 허용하면 됨)"}`);
  }

  console.log("\n② 지금 작동하나 (과금 없는 조회 호출)");
  if (gemini) console.log(`  Gemini 키 → Generative Language API: ${await probeGemini(gemini)}`);
  if (tts) console.log(`  TTS 키    → Text-to-Speech API:      ${await probeTts(tts)}`);
  if (gemini && tts && gemini !== tts) {
    // 서로 다른 키면, 상대 API 로도 열리는지 본다 - 열리면 아직 제한이 안 걸린 것
    console.log(`  (참고) Gemini 키 → TTS API:           ${await probeTts(gemini)}`);
    console.log(`  (참고) TTS 키    → Gemini API:        ${await probeGemini(tts)}`);
  }
}

main().catch((e) => {
  console.error("점검 실패:", (e as Error).message);
  process.exit(1);
});
