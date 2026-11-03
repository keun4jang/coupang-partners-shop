/**
 * 유튜브 채널 소개 바꾸기 (2026-11-03 사장님 "유튜브 채널 소개도 바꿔줘").
 * 기본은 보기만(지금 소개·새 소개 출력). APPLY=1 일 때만 바꾼다. 소개(description)만 바꾸고 나머지 채널 설정(키워드 등)은 그대로 다시 보낸다.
 * 사용: channel-desc 워크플로 (apply on/off)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { google } from "googleapis";
import { loadYoutubeCredsFromSettings } from "../src/lib/youtube";
import { findPolicyIssues } from "../src/lib/policy";

export const CHANNEL_DESCRIPTION = [
  "매일 하나씩, 바로 써먹는 살림 꿀팁을 30초로 정리하는 채널이에요.",
  "주방·청소·수납·캠핑·겨울 대비까지, 알아 두면 덜 고생하는 생활 요령을 올려요.",
  "",
  "📌 영상 끝에 나오는 번호는 채널 상단 링크에서 찾을 수 있어요.",
  "🔔 매일 새 꿀팁이 올라와요.",
  "",
  "이 채널의 일부 영상은 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",
].join("\n");

async function main() {
  const issues = findPolicyIssues(CHANNEL_DESCRIPTION);
  if (issues.length) throw new Error(`정책 검사 탈락: ${issues.join(", ")}`);
  await loadYoutubeCredsFromSettings();
  const oauth2 = new google.auth.OAuth2(process.env.YOUTUBE_OAUTH_CLIENT_ID!, process.env.YOUTUBE_OAUTH_CLIENT_SECRET!);
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN! });
  const yt = google.youtube({ version: "v3", auth: oauth2 });
  const { data } = await yt.channels.list({ part: ["brandingSettings", "snippet"], mine: true });
  const ch = data.items?.[0];
  if (!ch?.id) throw new Error("채널을 찾지 못했습니다");
  console.log(`채널: ${ch.snippet?.title} (${ch.id})`);
  console.log(`\n── 지금 소개 ──\n${ch.brandingSettings?.channel?.description ?? "(없음)"}`);
  console.log(`\n── 새 소개 (${[...CHANNEL_DESCRIPTION].length}자) ──\n${CHANNEL_DESCRIPTION}`);
  if (process.env.APPLY !== "1") {
    console.log("\n(보기만 - 바꾸려면 apply=on 으로 다시 실행)");
    return;
  }
  const channel = { ...(ch.brandingSettings?.channel ?? {}), description: CHANNEL_DESCRIPTION };
  await yt.channels.update({ part: ["brandingSettings"], requestBody: { id: ch.id, brandingSettings: { ...ch.brandingSettings, channel } } });
  const { data: after } = await yt.channels.list({ part: ["brandingSettings"], id: [ch.id] });
  const ok = after.items?.[0]?.brandingSettings?.channel?.description === CHANNEL_DESCRIPTION;
  console.log(ok ? "\n✅ 채널 소개를 바꿨습니다" : "\n⚠️ 바꾼 뒤 다시 읽은 소개가 다릅니다 - 확인 필요");
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
