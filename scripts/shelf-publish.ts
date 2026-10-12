/**
 * 사장님이 검수·승인한 선반 롱폼을 공개로 전환한다 (2026-10-12).
 *
 * 왜 목록을 코드에 두나: 공개 전환은 되돌리기 어려운 바깥 행동이라, 사장님이 "공개"라고
 * 승인한 영상만 커밋으로 남겨 두고 그것만 바꾼다. 새 선반을 공개할 때는 승인 날짜와 함께
 * 아래 목록에 ID 를 추가하고 diag(shelf-publish)를 돌린다. 이미 공개된 영상은 건너뛴다.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
import { loadYoutubeCredsFromSettings, setYoutubePrivacy } from "../src/lib/youtube";

const APPROVED: Array<{ id: string; note: string }> = [
  { id: "XIyMLyJ6ADQ", note: "선반 1호 세탁세제 추천 TOP10 - 2026-10-12 사장님 '공개해'" },
];

async function main(): Promise<void> {
  await loadYoutubeCredsFromSettings();
  for (const v of APPROVED) {
    const { before, title } = await setYoutubePrivacy(v.id, "public");
    console.log(
      before === "public"
        ? `이미 공개: ${v.id} ${title}`
        : `공개 전환: ${v.id} (${before} → public) ${title} - ${v.note}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
