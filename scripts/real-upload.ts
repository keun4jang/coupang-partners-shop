/**
 * PC 에서 만든 "허락받은 실제 제품 영상"을 유튜브 쇼츠·인스타 릴스에 올린다 (2026-11-25 사장님 "2" - 올릴 길 만들기).
 * 사용: tsx scripts/real-upload.ts 686 <영상 mp4 경로>   (real-upload 워크플로에서만 돈다)
 *
 * 안전장치
 * - docs/real-videos/{번호}.json 의 permission 이 "approved" 로 시작해야 한다(사장님이 "686 허락"이라고 한 뒤 Claude 가 바꾼다).
 *   허락 전 영상은 올리지 않는다(남의 영상 무단 게시 금지).
 * - REAL_PUBLISH=yes 가 아니면 제목·설명·캡션만 출력하고 끝낸다(미리보기).
 * - 제목·설명·캡션은 발행 직전 정책 검사(policy.ts)를 통과해야 한다. 고지 문구는 운영 영상과 같은 함수로 붙인다.
 * - 쿠팡 API 는 부르지 않는다. video_items 는 읽기만 한다(같은 번호의 기존 영상 기록을 덮어쓰지 않는다).
 */
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { supabaseAdmin } from "../src/lib/supabase";
import { isOwnProduct } from "../src/lib/ownProducts";
import { instagramCaption, youtubeShortsDescription } from "../src/lib/publishCopy";
import { checkPublishTexts, describePublishIssues, stripBannedFromProductName } from "../src/lib/policy";
import { dateFolderName, shortenProductName } from "../src/lib/format";
import { hasYoutubeEnv, loadYoutubeCredsFromSettings, setPaidPromotion, suppressAutoCaptions, uploadShortToYoutube } from "../src/lib/youtube";
import { hasInstagramEnv, maybeRefreshInstagramToken, publishReelToInstagram } from "../src/lib/instagram";
import { driveDirectDownloadUrl, ensureDateFolder, makeFilePublic, uploadFileToDrive } from "../src/lib/drive";
import { getSetting } from "../src/lib/settings";
import { sendTelegramMessage } from "../src/lib/telegram";

type Spec = { permission?: string; title?: string; caption?: string };

async function main() {
  const n = Number(process.argv[2]);
  const videoPath = process.argv[3];
  if (!n || !videoPath || !fs.existsSync(videoPath)) throw new Error("사용: real-upload.ts <번호> <영상 경로>");
  const spec = JSON.parse(fs.readFileSync(`docs/real-videos/${n}.json`, "utf8")) as Spec;
  if (!/^approved/.test(spec.permission ?? "")) throw new Error(`${n}번은 아직 허락 기록이 없어 올리지 않습니다 (permission: ${spec.permission ?? "없음"})`);
  if (!spec.title || !spec.caption) throw new Error("설정 파일에 title(제목)·caption(캡션 본문)이 필요합니다");

  const { data, error } = await supabaseAdmin()
    .from("video_items")
    .select("display_number, products(product_name, source_memo)")
    .eq("display_number", n)
    .maybeSingle();
  if (error || !data) throw new Error(`${n}번 영상 기록을 찾지 못했습니다`);
  const product = (data as unknown as { products: { product_name: string; source_memo: string | null } }).products;
  const own = isOwnProduct(product);
  const shortName = shortenProductName(stripBannedFromProductName(product.product_name));
  const title = `${spec.title} #Shorts`;
  const description = youtubeShortsDescription(n, shortName, "classic", { own });
  const caption = instagramCaption(spec.caption, n, { own });

  const issues = checkPublishTexts({ title, caption, description });
  if (issues.length > 0) throw new Error(`정책 검사에 걸려 올리지 않습니다 - ${describePublishIssues(issues)}`);

  console.log(`[제목]\n${title}\n\n[유튜브 설명]\n${description}\n\n[인스타 캡션]\n${caption}\n`);
  if (process.env.REAL_PUBLISH !== "yes") {
    console.log("미리보기만 했습니다 (올리려면 publish=yes).");
    return;
  }

  let youtubeUrl = "";
  let youtubeNote = "";
  await loadYoutubeCredsFromSettings();
  if (hasYoutubeEnv()) {
    try {
      const r = await uploadShortToYoutube({ localPath: videoPath, title, description, tags: ["살림템", "생활템", "정리", "Shorts"] });
      youtubeUrl = r.url;
      await suppressAutoCaptions(r.videoId);
      if (!own) await setPaidPromotion(r.videoId);
    } catch (e) {
      youtubeNote = (e as Error).message.slice(0, 200);
    }
  } else youtubeNote = "유튜브 설정 없음";

  let instagramUrl = "";
  let instagramNote = "";
  if ((await getSetting("instagram_paused")) === "1") instagramNote = "인스타 자동발행 일시중지 중";
  else if (hasInstagramEnv()) {
    try {
      await maybeRefreshInstagramToken();
      const folderId = await ensureDateFolder(dateFolderName());
      const file = await uploadFileToDrive(folderId, `${n}번_실제영상.mp4`, "video/mp4", videoPath);
      await makeFilePublic(file.id);
      instagramUrl = (await publishReelToInstagram({ videoUrl: driveDirectDownloadUrl(file.id), caption })).url;
    } catch (e) {
      instagramNote = (e as Error).message.slice(0, 200);
    }
  } else instagramNote = "인스타 설정 없음";

  const report = [
    `🎬 실제 영상 게시 (${n}번)`,
    `유튜브: ${youtubeUrl || `실패 - ${youtubeNote}`}`,
    `인스타: ${instagramUrl || `실패 - ${instagramNote}`}`,
  ].join("\n");
  console.log(report);
  try {
    await sendTelegramMessage(report);
  } catch (e) {
    console.warn("텔레그램 알림 실패:", (e as Error).message.slice(0, 100));
  }
  // 둘 다 올라갔을 때만 성공(0) - 워크플로가 이때만 올린 파일을 지운다
  if (!youtubeUrl || !instagramUrl) process.exit(2);
}
main().catch((e) => {
  console.error((e as Error).message.slice(0, 300));
  process.exit(1);
});
