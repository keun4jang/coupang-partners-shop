#!/bin/bash
# Claude Code 대화가 한 턴 끝날 때마다(Stop hook) 대화 기록을
# claude-chat-archive(비공개 저장소)에 자동으로 저장·커밋·푸시한다.
#
# 이 훅은 절대 turn을 막지 않는다(항상 exit 0) — 저장이 실패해도 작업은
# 계속 진행되어야 한다. 실패하면 사장님이 "저장해줘"라고 요청해 수동으로
# 저장할 수 있다 (docs/AGENTS.md 아님, claude-chat-archive/README.md 참고).
#
# 이 스크립트는 archive 저장소 안에서만 git 작업을 한다(git -C 사용, cd 안 함)
# — 그래야 이 저장소(coupang-partners-shop) 작업 트리는 건드리지 않고,
# 기존 stop-hook-git-check.sh(미커밋 변경 시 턴을 막는 훅)와 충돌하지 않는다.

input=$(cat)

stop_hook_active=$(echo "$input" | jq -r '.stop_hook_active // "false"' 2>/dev/null)
[[ "$stop_hook_active" == "true" ]] && exit 0

ARCHIVE_DIR="/home/user/claude-chat-archive"
PROJECT="coupang-partners-shop"
LOG="/tmp/chat-archive-last-run.log"

if [[ ! -d "$ARCHIVE_DIR/.git" ]]; then
  echo "[chat-archive] 아카이브 저장소가 이 세션에 연결되어 있지 않아 자동 저장을 건너뜁니다. '저장해줘'라고 요청하면 수동으로 저장할 수 있습니다." >&2
  exit 0
fi

TRANSCRIPT_PATH=$(echo "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
SESSION_ID=$(echo "$input" | jq -r '.session_id // empty' 2>/dev/null)
CWD=$(echo "$input" | jq -r '.cwd // empty' 2>/dev/null)

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" || -z "$SESSION_ID" ]]; then
  exit 0
fi

BRANCH=$(git -C "${CWD:-.}" branch --show-current 2>/dev/null)
[[ -z "$BRANCH" ]] && BRANCH="unknown"

# 여러 프로젝트(MysteryCut/modeun-motors/trading-bot 등)가 같은 archive
# 저장소에 동시에 커밋·푸시한다 — 실측(2026-09-12, MysteryCut 에 이 훅을
# 연결한 세션)으로 non-fast-forward 거절이 실제로 발생함을 확인했다. 각
# 프로젝트는 sessions/<프로젝트명>/ 아래 서로 다른 경로에만 쓰므로 파일
# 충돌은 사실상 없고, 그냥 origin 위로 rebase 후 재푸시하면 된다.
push_with_retry() {
  local max_attempts=5
  local attempt=1
  local archive_branch
  archive_branch=$(git -C "$ARCHIVE_DIR" branch --show-current 2>/dev/null)
  if [[ -z "$archive_branch" ]]; then
    echo "[chat-archive] archive 저장소 브랜치 확인 실패 — 재시도 중단" >> "$LOG"
    return 1
  fi

  # remote.origin.fetch refspec 이 비어 있으면 origin/<브랜치> 원격 추적 참조가
  # 아예 안 생긴다. 2026-09-13 에 실제로 이 상태여서 rebase 가
  # "fatal: invalid upstream 'origin/main'" 로 죽었고, 그 바람에 푸시 못 한
  # 커밋이 59개까지 쌓였다(사장님이 "대화 저장해줘" 하기 전까지 아무도 몰랐다).
  # 아래 rebase 는 FETCH_HEAD 를 쓰므로 refspec 없이도 동작하지만, 참조가
  # 있어야 다른 git 명령도 정상이라 여기서 한 번 채워 준다.
  if [[ -z "$(git -C "$ARCHIVE_DIR" config --get-all remote.origin.fetch)" ]]; then
    git -C "$ARCHIVE_DIR" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' >> "$LOG" 2>&1
    echo "[chat-archive] remote.origin.fetch refspec 이 비어 있어 채웠습니다" >> "$LOG"
  fi

  while (( attempt <= max_attempts )); do
    if git -C "$ARCHIVE_DIR" push -q origin "HEAD:$archive_branch" >> "$LOG" 2>&1; then
      return 0
    fi
    echo "[chat-archive] push 실패 (${attempt}/${max_attempts}) — origin 위로 rebase 후 재시도" >> "$LOG"

    if ! git -C "$ARCHIVE_DIR" fetch -q origin "$archive_branch" >> "$LOG" 2>&1; then
      echo "[chat-archive] fetch 실패 — 다음 턴에 재시도" >> "$LOG"
      return 1
    fi

    # origin/<브랜치> 대신 FETCH_HEAD 를 쓴다. 방금 fetch 한 대상이라 refspec
    # 설정과 무관하게 항상 유효하다.
    if ! git -C "$ARCHIVE_DIR" rebase -q FETCH_HEAD >> "$LOG" 2>&1; then
      # 세션 파일은 프로젝트별로 경로가 갈려 충돌하지 않지만, sessions/README.md
      # 같은 목록(인덱스) 파일은 모든 프로젝트가 같이 쓴다 — 여기서만 충돌한다.
      # 인덱스는 export.mjs 가 파일시스템을 훑어 통째로 다시 만드는 파생물이라
      # 어느 쪽을 골라도 다음 저장 때 올바르게 덮인다. 그래서 상대 것을 받고
      # 계속 진행한다. 그 외 파일이 충돌하면 진짜 이상한 상황이니 멈춘다.
      local conflicted non_index
      conflicted=$(git -C "$ARCHIVE_DIR" diff --name-only --diff-filter=U 2>/dev/null)
      non_index=$(echo "$conflicted" | grep -v 'README\.md$' || true)
      if [[ -n "$conflicted" && -z "$non_index" ]]; then
        echo "[chat-archive] 인덱스 파일만 충돌 — 원격 것을 받고 계속합니다" >> "$LOG"
        echo "$conflicted" | while read -r f; do
          [[ -n "$f" ]] && git -C "$ARCHIVE_DIR" checkout --theirs -- "$f" >> "$LOG" 2>&1
          [[ -n "$f" ]] && git -C "$ARCHIVE_DIR" add -- "$f" >> "$LOG" 2>&1
        done
        if ! GIT_EDITOR=true git -C "$ARCHIVE_DIR" rebase --continue >> "$LOG" 2>&1; then
          git -C "$ARCHIVE_DIR" rebase --abort >> "$LOG" 2>&1
          echo "[chat-archive] rebase --continue 실패 — 로컬 커밋은 유지" >> "$LOG"
          return 1
        fi
      else
        # 자동으로 억지 병합하다 다른 프로젝트의 대화 기록을 깨뜨리지 않도록
        # 로컬 커밋은 그대로 두고(다음 턴에 다시 시도) 여기서 멈춘다.
        git -C "$ARCHIVE_DIR" rebase --abort >> "$LOG" 2>&1
        echo "[chat-archive] rebase 충돌 — 자동 해소 불가(로컬 커밋은 유지, 다음 턴에 재시도됨)" >> "$LOG"
        return 1
      fi
    fi
    sleep "$attempt"
    (( attempt++ ))
  done
  return 1
}

# 안 올라간 커밋이 몇 개나 쌓였는지 — 푸시가 조용히 실패해 온 기간의 척도.
unpushed_count() {
  local branch
  branch=$(git -C "$ARCHIVE_DIR" branch --show-current 2>/dev/null)
  [[ -z "$branch" ]] && { echo "?"; return; }
  git -C "$ARCHIVE_DIR" rev-list --count "origin/${branch}..HEAD" 2>/dev/null || echo "?"
}

if node "$ARCHIVE_DIR/tools/export.mjs" \
    --transcript "$TRANSCRIPT_PATH" \
    --project "$PROJECT" \
    --session-id "$SESSION_ID" \
    --source-repo "keun4jang/${PROJECT}" \
    --source-branch "$BRANCH" \
    --archive-dir "$ARCHIVE_DIR" > "$LOG" 2>&1
then
  if [[ -n "$(git -C "$ARCHIVE_DIR" status --porcelain)" ]]; then
    git -C "$ARCHIVE_DIR" add -A
    git -C "$ARCHIVE_DIR" commit -q \
      -m "chat-archive: ${PROJECT} 자동 저장 (${SESSION_ID:0:8})" \
      -m "Automated by .claude/hooks/chat-archive-stop.sh (Stop hook)"
    if ! push_with_retry; then
      # 이 메시지가 사장님 화면에 보이는 유일한 신호다. 밀린 커밋 수를 같이
      # 적는다 — 2026-09-13 에 59개가 쌓이도록 아무도 몰랐던 게 진짜 문제였다
      # (로그 파일은 아무도 안 본다).
      echo "[chat-archive] 저장은 됐지만 업로드(push)에 실패했습니다 — 안 올라간 커밋 $(unpushed_count)개. '대화 저장해줘'라고 하시면 손으로 복구합니다. 로그: $LOG" >&2
    fi
  fi
else
  echo "[chat-archive] 대화 변환에 실패했습니다 — 로그: $LOG" >&2
fi

exit 0
