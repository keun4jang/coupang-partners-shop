/**
 * 영상 후보 목록을 사장님 텔레그램으로 보낸다 (2026-11-24 사장님 "영상 후보 링크는 텔레그램에도 줘").
 * docs/research/video-candidates-latest.txt 를 그대로 보낸다. DB·쿠팡·SNS 호출 없음.
 */
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { sendTelegramMessage } from "../src/lib/telegram";

async function main() {
  const text = fs.readFileSync("docs/research/video-candidates-latest.txt", "utf8").trim();
  if (text.length > 4000) throw new Error("텔레그램 한 통 길이(4096자)를 넘습니다");
  await sendTelegramMessage(text);
  console.log(`텔레그램 전송 완료 (${text.length}자)`);
}
main().catch((e) => {
  console.error((e as Error).message.slice(0, 200));
  process.exit(1);
});
