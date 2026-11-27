#!/usr/bin/env bash
# 실제 사용 영상 게시 대기열 (PC 에서 돈다). 2026-11-27 사장님 "터미널에서 클로드 켜면 자동으로 이어서".
# - 대기 영상: renders/real/wait-<번호>.mp4 (깃에 안 올라가는 자리, PC 가 꺼졌다 켜져도 남는다)
# - 오래된 파일부터 하나씩: real-uploads 브랜치에 올림 → real-upload 워크플로(publish=yes) → 성공하면 대기 파일 삭제
# - 결과는 renders/real/publish-log.txt 에 남긴다(다음 세션의 SessionStart 훅이 읽어 Claude 에게 보여 준다)
# - 실패하면(유튜브 한도 등) 거기서 멈춘다. 대기 파일은 남는다.
# 사용: bash scripts/real-publish-queue.sh [HHMM]   (HHMM = 이 UTC 시각 이후에 시작, 예: 0810 = 17:10 KST)
set -u
cd "$(dirname "$0")/.." || exit 1
REF=claude/coupang-partners-shortform-hinfcb
DIR=renders/real
LOG=$DIR/publish-log.txt
LOCK=$DIR/.queue.pid
NOT_BEFORE=${1:-}

if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK")" 2>/dev/null; then echo "이미 대기열이 돌고 있음(pid $(cat "$LOCK"))"; exit 0; fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT

note() { echo "$(date -u +%Y-%m-%dT%H:%MZ) $*" | tee -a "$LOG"; }
hhmm() { echo $((10#$(date -u +%H%M))); }

if [ -n "$NOT_BEFORE" ]; then
  until [ "$(hhmm)" -ge $((10#$NOT_BEFORE)) ]; do sleep 120; done
fi

while :; do
  f=$(ls -tr $DIR/wait-*.mp4 2>/dev/null | head -1)
  [ -n "$f" ] || { echo "대기 영상 없음"; break; }
  n=$(basename "$f" .mp4); n=${n#wait-}
  case "$n" in ''|*[!0-9]*) note "$f: 번호를 못 읽음 - 건너뜀"; mv "$f" "$f.bad"; continue;; esac
  while [ "$(gh run list --workflow real-upload.yml -L 1 --json status -q '.[0].status')" != "completed" ]; do sleep 30; done
  b=$(git hash-object -w "$f") && t=$(printf '100644 blob %s\t%s.mp4\n' "$b" "$n" | git mktree) && c=$(git commit-tree "$t" -m "실제 영상 ${n}번 (게시 대기)") \
    && git push -q -f origin "$c:refs/heads/real-uploads" \
    && gh workflow run real-upload.yml --ref "$REF" -f number="$n" -f publish=yes >/dev/null \
    || { note "${n}번: 올리기 준비 실패 - 멈춤"; exit 1; }
  sleep 15
  id=$(gh run list --workflow real-upload.yml -L 1 --json databaseId -q '.[0].databaseId')
  gh run watch "$id" --exit-status >/dev/null 2>&1; rc=$?
  links=$(gh run view "$id" --log 2>/dev/null | grep -E "유튜브: |인스타: " | sed 's/^.*Z //' | tr '\n' ' ')
  if [ $rc -eq 0 ]; then
    note "${n}번: 게시 완료 $links"
    rm -f "$f"
  else
    note "${n}번: 게시 실패(run $id) $links - 대기열 멈춤. 한쪽만 올라갔는지 확인할 것"
    exit 1
  fi
  sleep 60
done
