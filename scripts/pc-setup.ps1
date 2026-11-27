# 새 PC 준비 (2026-11-27 사장님 "조만간 매일 켜 놓는 컴퓨터로 옮길 거라 대비해야 해")
# 사용: 이 저장소 폴더에서  powershell -ExecutionPolicy Bypass -File scripts\pc-setup.ps1
# 하는 일: 필요한 무료 도구 확인(없으면 winget 으로 설치) → 글꼴 복사 → npm ci → 대화 보관소 받기 → 게시 대기열 예약 작업 등록.
# 로그인·동의가 필요한 것(GitHub 로그인, Claude 로그인, 크롬 확장, 1688·윙·도매꾹 로그인)은 하지 않고 마지막에 목록으로 알려 준다.
# 여러 번 돌려도 된다. 비밀값은 다루지 않는다.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$todo = @()

function Test-Tool($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }
function Install-Tool($name, $wingetId) {
  if (Test-Tool $name) { Write-Host "[있음] $name"; return }
  if (Test-Tool "winget") {
    Write-Host "[설치] $name ($wingetId)"
    winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements | Out-Null
  }
  if (-not (Test-Tool $name)) { $script:todo += "$name 설치가 안 됐거나 터미널을 새로 열어야 보입니다 (winget install --id $wingetId)" }
}

Install-Tool "git" "Git.Git"
Install-Tool "gh" "GitHub.cli"
Install-Tool "node" "OpenJS.NodeJS.LTS"
Install-Tool "python" "Python.Python.3.13"
Install-Tool "ffmpeg" "Gyan.FFmpeg"

# 영상 편집 글꼴: 맑은 고딕 굵게(윈도우 기본 글꼴)를 renders/real/font.ttf 로
New-Item -ItemType Directory -Force "renders\real" | Out-Null
if (-not (Test-Path "renders\real\font.ttf")) {
  if (Test-Path "C:\Windows\Fonts\malgunbd.ttf") { Copy-Item "C:\Windows\Fonts\malgunbd.ttf" "renders\real\font.ttf"; Write-Host "[복사] 글꼴" }
  else { $todo += "C:\Windows\Fonts\malgunbd.ttf 가 없습니다 - 굵은 한글 글꼴을 renders\real\font.ttf 로 복사" }
} else { Write-Host "[있음] 글꼴" }

if (Test-Tool "python") { python -m pip install --quiet numpy; Write-Host "[확인] python numpy" }
if (Test-Tool "npm") {
  if (-not (Test-Path "node_modules")) { Write-Host "[설치] npm ci (몇 분 걸림)"; npm ci --no-audit --no-fund | Out-Null }
  node scripts/gen-version.mjs | Out-Null
  Write-Host "[확인] node_modules"
}

# GitHub 로그인(사장님이 직접) - 되어 있으면 대화 보관소를 옆 폴더에 받는다
$ghOk = $false
if (Test-Tool "gh") { gh auth status *> $null; $ghOk = ($LASTEXITCODE -eq 0) }
if ($ghOk) {
  Write-Host "[있음] GitHub 로그인"
  $arch = Join-Path (Split-Path -Parent $root) "claude-chat-archive"
  if (-not (Test-Path $arch)) { gh repo clone keun4jang/claude-chat-archive $arch | Out-Null; Write-Host "[받음] 대화 보관소" } else { Write-Host "[있음] 대화 보관소" }
} else { $todo += "GitHub 로그인: 터미널에서  gh auth login --web  (끝나면 이 스크립트를 한 번 더)" }

if (-not (Test-Tool "claude")) { $todo += "Claude Code 설치와 로그인 (설치 뒤 이 폴더에서 claude)" }

# 게시 대기열 예약 작업: 매일 17:15 와 로그인할 때 renders/real/wait-번호.mp4 를 차례로 게시(Claude 가 꺼져 있어도 돈다)
$bash = $null
foreach ($p in @("C:\Program Files\Git\bin\bash.exe", "C:\Program Files (x86)\Git\bin\bash.exe")) { if (Test-Path $p) { $bash = $p; break } }
if (-not $bash) { $c = Get-Command bash -ErrorAction SilentlyContinue; if ($c) { $bash = $c.Source } }
if ($bash) {
  $posix = "/" + $root.Substring(0,1).ToLower() + ($root.Substring(2) -replace "\\", "/")
  $run = "`"$bash`" -lc `"cd '$posix' && bash scripts/real-publish-queue.sh`""
  schtasks /Create /F /TN "Salimtem-PublishQueue-Daily" /SC DAILY /ST 17:15 /TR $run | Out-Null
  schtasks /Create /F /TN "Salimtem-PublishQueue-Logon" /SC ONLOGON /DELAY 0003:00 /TR $run | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "[등록] 게시 대기열 예약 작업(매일 17:15, 로그인 3분 뒤)" }
  else { $todo += "예약 작업 등록 실패 - 관리자 권한 터미널에서 이 스크립트를 다시 실행(로그인 때 실행 작업은 관리자 권한이 필요할 수 있음)" }
} else { $todo += "Git Bash(bash.exe)를 못 찾아 게시 대기열 예약 작업을 등록하지 못했습니다" }

Write-Host ""
Write-Host "=== 사장님이 직접 하실 일 ==="
$todo += "크롬 설치 → Claude 확장 설치·로그인 → 1688, 쿠팡 윙, 도매꾹 로그인 (Claude 는 로그인하지 않습니다)"
$todo += "크롬 설정 → 다운로드 → '다운로드 전에 각 파일의 저장 위치 확인' 끄기 (영상을 소리 없이 자동으로 받으려면)"
$todo += "예전 PC 의 renders\real\wait-*.mp4 와 incoming-videos 폴더가 남아 있으면 같은 자리로 복사(없으면 생략)"
$todo += "윈도우 전원 설정에서 절전 모드 끄기(매일 켜 두는 PC)"
$i = 1; foreach ($t in $todo) { Write-Host "$i. $t"; $i++ }
Write-Host ""
Write-Host "끝나면 이어하기.cmd 를 두 번 누르거나, 이 폴더에서 claude 를 켜고 '쿠팡 시작' 이라고 하세요."
