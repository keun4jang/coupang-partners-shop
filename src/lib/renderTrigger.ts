import { optionalEnv } from "./env";

/**
 * GitHub Actions 렌더 워크플로를 즉시 깨운다 (선택 기능).
 * GH_DISPATCH_TOKEN(actions:write 권한 PAT)과 GH_REPOSITORY(owner/repo)가
 * 설정된 경우에만 동작하며, 실패해도 15분 주기 스케줄이 처리하므로 무시한다.
 */
export async function triggerRenderWorkflow(): Promise<void> {
  const token = optionalEnv("GH_DISPATCH_TOKEN");
  const repo = optionalEnv("GH_REPOSITORY");
  if (!token || !repo) return;
  const ref = optionalEnv("GH_BRANCH") ?? "claude/coupang-partners-shortform-hinfcb";
  try {
    await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/render.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref }),
      }
    );
  } catch {
    // best-effort: 스케줄 실행이 결국 처리한다
  }
}
