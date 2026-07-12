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
