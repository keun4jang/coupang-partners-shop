// SessionStart 훅: 이어가기 메모(docs/handoff/CURRENT.md)를 세션 맥락에 넣는다.
// 계정이 바뀌어도 저장소만 있으면 지난 상황을 이어받게 하려는 장치다(2026-10-07).
// node 로 돌려 윈도우·맥·리눅스 어디서나 같다. 실패해도 세션을 막지 않는다(항상 exit 0).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const memo = readFileSync(join(root, "docs", "handoff", "CURRENT.md"), "utf8");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "[이어가기 메모 - docs/handoff/CURRENT.md]\n" +
          memo +
          "\n\n작업을 마칠 때 이 파일을 최신 상황으로 고쳐 커밋·push 한다(CLAUDE.md '이어가기 규칙').",
      },
    })
  );
} catch {
  // 메모가 없으면 조용히 넘어간다
}
process.exit(0);
