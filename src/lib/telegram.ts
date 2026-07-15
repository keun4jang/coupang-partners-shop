import { requireEnv } from "./env";

/** 텔레그램 메시지 전송 (기본: 허용된 chat 으로 전송) */
export async function sendTelegramMessage(
  text: string,
  chatId?: string | number
): Promise<void> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const target = chatId ?? requireEnv("TELEGRAM_ALLOWED_CHAT_ID");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: target,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`텔레그램 전송 실패 (${res.status}): ${body}`);
  }
}

/**
 * file_id → 실제 다운로드 URL. (봇 API getFile 은 최대 20MB 파일까지 지원)
 * 반환 URL 에는 봇 토큰이 포함되므로 로그/DB에 남기지 않는다.
 */
export async function telegramFileDownloadUrl(fileId: string): Promise<string | null> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = data.result?.file_path;
  if (!filePath) return null;
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}
