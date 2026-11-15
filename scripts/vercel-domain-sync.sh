#!/usr/bin/env bash
# vercel-domain-sync 워크플로가 쓰는 도우미 (2026-11-15).
#
# 사장님 11/15: "문제가 있는 거 텔레그램에도 보내면서 해결도 하고 해결된 것까지 텔레그램으로 보내줘."
# 그래서 워크플로는 문제를 만나면 ① 🚨 알림 ② 스스로 고치기 ③ ✅ 해결됨 / ❌ 못 고침 알림 순서로 간다.
#
# 쓰는 법(워크플로 안에서):
#   find SHA        → "상태 주소 ID" 한 줄 (그 커밋의 프로덕션 배포. 없으면 빈 줄, API 일시 오류면 "ERR")
#   head            → 운영 브랜치의 지금 맨 위 커밋
#   wait SHA 초     → 그 커밋 배포가 READY가 될 때까지 기다려 "주소 ID" 출력 (못 기다리면 실패, 이유를 stderr로)
#   link 주소 ID    → 도메인 재연결 + 프로덕션 승격 (일시 오류는 3번까지 다시)
#   tg 글           → 텔레그램 알림 (WORKER_ENV 안의 봇 열쇠. 없으면 조용히 넘어감)
#
# 필요한 환경변수: VERCEL_TOKEN VERCEL_PROJECT_ID VERCEL_TEAM_ID VERCEL_TEAM_SCOPE VERCEL_DOMAIN
#                 GH_TOKEN GITHUB_REPOSITORY BRANCH WORKER_ENV
set -uo pipefail

cmd="${1:-}"; shift || true

find_dep() {
  local sha="$1" resp
  if ! resp=$(curl -sS --max-time 20 -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&target=production&limit=20&teamId=$VERCEL_TEAM_ID"); then
    echo ERR; return 0
  fi
  SHA="$sha" node -e "
    let data; try { data = JSON.parse(require('fs').readFileSync(0, 'utf8')); } catch { console.log('ERR'); process.exit(0); }
    if (!Array.isArray(data.deployments)) { console.log('ERR'); process.exit(0); }
    const deps = data.deployments.filter((d) => d.meta && d.meta.githubCommitSha === process.env.SHA);
    // 같은 커밋에 배포가 여럿이면 READY 를 먼저, 없으면 가장 최근 것
    const dep = deps.find((d) => d.state === 'READY') || deps[0];
    if (dep) console.log([dep.state, dep.url, dep.uid || dep.id || ''].join(' '));
    else console.log('');
  " <<< "$resp"
}

case "$cmd" in
  find) find_dep "$1" ;;

  head)
    curl -sS --max-time 20 -H "Authorization: Bearer $GH_TOKEN" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/commits/$BRANCH" \
      | node -e "try { process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).sha || '') } catch {}"
    ;;

  wait)
    sha="$1"; limit="${2:-600}"; t0=$(date +%s)
    while [ $(( $(date +%s) - t0 )) -lt "$limit" ]; do
      read -r state url id <<< "$(find_dep "$sha")"
      case "${state:-}" in
        READY) echo "$url $id"; exit 0 ;;
        ERROR) echo "build_error" >&2; exit 2 ;;
        CANCELED) echo "canceled" >&2; exit 3 ;;
      esac
      sleep 10
    done
    echo "timeout" >&2; exit 4
    ;;

  link)
    url="$1"; id="$2"
    command -v vercel >/dev/null 2>&1 || npm install -g vercel@latest --no-progress >/dev/null 2>&1
    ok=0
    for k in 1 2 3; do
      if vercel alias set "https://$url" "$VERCEL_DOMAIN" --token="$VERCEL_TOKEN" --scope="$VERCEL_TEAM_SCOPE"; then ok=1; break; fi
      echo "도메인 연결 일시 오류 - 15초 후 다시 ($k/3)"; sleep 15
    done
    [ "$ok" = 1 ] || { echo "::error::도메인 재연결 실패"; exit 1; }
    echo "✅ $VERCEL_DOMAIN → $url 연결 완료"
    # 도메인만 바꾸면 크론이 안 따라온다 - 크론은 '프로젝트의 현재 프로덕션 배포'에서 돈다(2026-08-21 실측).
    for k in 1 2 3; do
      CODE=$(curl -s --max-time 30 -o /tmp/promote.json -w '%{http_code}' -X POST \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/promote/$id?teamId=$VERCEL_TEAM_ID" || echo 000)
      case "$CODE" in 000|5??) echo "승격 일시 오류(HTTP $CODE) - 15초 후 다시 ($k/3)"; sleep 15 ;; *) break ;; esac
    done
    if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
      echo "✅ 프로덕션 승격 완료 ($id) - 크론이 이 코드로 돈다"
    elif [ "$CODE" = "409" ] && grep -q "already the current production deployment" /tmp/promote.json; then
      # 이미 프로덕션인 배포(목표 상태 달성) - 2026-08-23 실측. 이 메시지일 때만 성공으로 본다.
      echo "✅ 이미 프로덕션 배포였다 ($id) - 승격 불필요"
    else
      echo "::error::프로덕션 승격 실패(HTTP $CODE) - 크론이 옛 배포로 돕니다"
      cat /tmp/promote.json || true
      exit 1
    fi
    ;;

  tg)
    BOT=$(printf '%s\n' "${WORKER_ENV:-}" | grep '^TELEGRAM_BOT_TOKEN=' | cut -d= -f2-)
    CHAT=$(printf '%s\n' "${WORKER_ENV:-}" | grep '^TELEGRAM_ALLOWED_CHAT_ID=' | cut -d= -f2-)
    if [ -n "$BOT" ] && [ -n "$CHAT" ]; then
      curl -s -o /dev/null --max-time 20 -X POST "https://api.telegram.org/bot${BOT}/sendMessage" \
        --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=$1" || echo "텔레그램 보내기 실패"
    else
      echo "(텔레그램 열쇠 없음 - 알림 생략)"; printf '%s\n' "$1"
    fi
    ;;

  *) echo "쓸 수 있는 일: find | head | wait | link | tg"; exit 2 ;;
esac
