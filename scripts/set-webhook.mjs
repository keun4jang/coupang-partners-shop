/**
 * 텔레그램 webhook 등록 스크립트 (반복 실행 안전).
 *
 * 사용:
 *   node scripts/set-webhook.mjs            # .env.local 의 NEXT_PUBLIC_SITE_URL 사용
 *   node scripts/set-webhook.mjs <URL>      # 명시적으로 사이트 URL 지정
 *   npm run webhook:set
 *
 * 필요한 .env.local 값: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, NEXT_PUBLIC_SITE_URL
 */
import fs from "node:fs";

function parseEnv(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...parseEnv(".env.local"), ...parseEnv(".env"), ...process.env };
const token = env.TELEGRAM_BOT_TOKEN;
const secret = env.TELEGRAM_WEBHOOK_SECRET;
const site = (process.argv[2] || env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

if (!token || !secret || !site) {
  console.error(
    "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / NEXT_PUBLIC_SITE_URL 이 필요합니다."
  );
  process.exit(1);
}

const url = `${site}/api/telegram`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: secret,
    allowed_updates: ["message"],
  }),
});
const json = await res.json();
if (!json.ok) {
  console.error("webhook 등록 실패:", JSON.stringify(json));
  process.exit(1);
}
console.log("webhook 등록 완료:", url);

const info = await (
  await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
).json();
console.log("현재 webhook:", info.result?.url);
console.log("대기중 업데이트:", info.result?.pending_update_count);
console.log("마지막 에러:", info.result?.last_error_message || "(없음)");
