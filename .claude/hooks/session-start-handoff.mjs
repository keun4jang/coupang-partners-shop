// SessionStart 훅: 이어가기 메모(docs/handoff/CURRENT.md)를 세션 맥락에 넣는다.
// 계정이 바뀌어도 저장소만 있으면 지난 상황을 이어받게 하려는 장치다(2026-10-07).
// 2026-11-24 사장님 "대화 다 남게 해주고, 터미널에서 이어서 혹은 이 채팅과 동일하게 진행되도록":
//  - 대화 보관소(claude-chat-archive)가 있으면 이 프로젝트의 가장 최근 대화 끝부분(사장님·Claude 말만)을 함께 넣는다.
//  - 보관소가 없으면 Claude 에게 연결하라고 알린다(연결돼야 Stop 훅이 대화를 자동 저장한다).
// node 로 돌려 윈도우·맥·리눅스 어디서나 같다. 실패해도 세션을 막지 않는다(항상 exit 0).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT = "coupang-partners-shop";
const TAIL_CHARS = 6000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** chat-archive-stop.sh 와 같은 순서로 보관소를 찾는다: 환경변수 → /home/user → 이 저장소 옆 폴더 */
function archiveDir() {
  const cands = [process.env.CHAT_ARCHIVE_DIR, "/home/user/claude-chat-archive", resolve(root, "..", "claude-chat-archive")];
  return cands.find((d) => d && existsSync(join(d, "tools", "export.mjs"))) ?? null;
}

/** 가장 최근에 저장된 대화의 마지막 사장님·Claude 말 몇 개 (도구 기록·하위 작업은 뺀다) */
function lastConversationTail(dir) {
  const base = join(dir, "sessions", PROJECT);
  if (!existsSync(base)) return null;
  let best = null;
  for (const name of readdirSync(base)) {
    const f = join(base, name, "conversation.md");
    if (!existsSync(f)) continue;
    const t = statSync(f).mtimeMs;
    if (!best || t > best.t) best = { f, t, name };
  }
  if (!best) return null;
  let md = readFileSync(best.f, "utf8");
  const cut = md.indexOf("\n## 하위 작업");
  if (cut > 0) md = md.slice(0, cut);
  // <details> 로 접힌 도구 기록은 뺀다
  md = md.replace(/<details>[\s\S]*?<\/details>/g, "").replace(/\n{3,}/g, "\n\n");
  const parts = md.split(/\n(?=### (?:🙋 사용자|🤖 Claude))/);
  const picked = [];
  let size = 0;
  for (let i = parts.length - 1; i >= 0 && size < TAIL_CHARS; i--) {
    const p = parts[i].trim();
    if (!/^### (?:🙋 사용자|🤖 Claude)/.test(p)) continue;
    // 작업 완료 알림 같은 시스템 메시지는 사장님 말이 아니다
    if (/<task-notification>|SYSTEM NOTIFICATION|<system-reminder>/.test(p)) continue;
    picked.unshift(p);
    size += p.length;
  }
  let text = picked.join("\n\n");
  if (text.length > TAIL_CHARS) text = "…" + text.slice(text.length - TAIL_CHARS);
  return { session: best.name, saved: new Date(best.t).toISOString().slice(0, 16).replace("T", " "), text };
}

try {
  let ctx = "";
  try {
    const memo = readFileSync(join(root, "docs", "handoff", "CURRENT.md"), "utf8");
    ctx += "[이어가기 메모 - docs/handoff/CURRENT.md]\n" + memo +
      "\n\n작업을 마칠 때 이 파일을 최신 상황으로 고쳐 커밋·push 한다(CLAUDE.md '이어가기 규칙').";
  } catch {
    // 메모가 없으면 넘어간다
  }
  const dir = archiveDir();
  if (dir) {
    try {
      const tail = lastConversationTail(dir);
      if (tail?.text) {
        ctx += `\n\n[지난 대화 끝부분 - claude-chat-archive sessions/${PROJECT}/${tail.session} (저장 ${tail.saved} UTC)]\n` +
          "사장님과 바로 앞 대화의 흐름이다. 이어서 진행하되, 결정 사항은 위 메모(CURRENT.md)가 기준이다.\n\n" + tail.text;
      }
    } catch {
      // 대화 끝부분을 못 읽어도 메모만으로 진행
    }
  } else {
    ctx += "\n\n[대화 보관소 미연결] claude-chat-archive 가 이 세션에 없어 대화 자동 저장이 꺼져 있다. " +
      "클라우드 세션이면 첫 작업 전에 add_repo(keun4jang/claude-chat-archive, push)로 붙이고 /home/user/claude-chat-archive 에 clone 한다. " +
      "PC 터미널이면 사장님께 이 저장소 옆 폴더(C:\\Projects)에서 git clone https://github.com/keun4jang/claude-chat-archive.git 을 한 번 해 달라고 안내한다.";
  }
  if (ctx) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
  }
} catch {
  // 어떤 경우에도 세션을 막지 않는다
}
process.exit(0);
