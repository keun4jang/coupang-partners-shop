# 배포 / 운영 가이드 (살림템 메모장)

이 프로젝트는 **한 번 세팅한 뒤로는 자동으로 굴러가도록** 구성돼 있다.

## 🟢 현재 라이브 상태

| 구분 | 값 |
|---|---|
| 공개 사이트 | https://coupang-partners-shop.vercel.app |
| 관리자 | https://coupang-partners-shop.vercel.app/admin (ADMIN_SECRET 로그인) |
| 텔레그램 봇 | @Coupang1bot (webhook 등록됨) |
| 호스팅 | Vercel (프로젝트: coupang-partners-shop) |
| DB | Supabase (프로젝트 ref: lqlqlinngvtvtuphixzq) |

## ♻️ 자동 배포 (핵심)

Vercel 프로젝트가 GitHub 저장소 `keun4jang/coupang-partners-shop` 에 연결돼 있고,
**프로덕션 브랜치 = `claude/coupang-partners-shortform-hinfcb`** 로 설정돼 있다.

> 즉, 이 브랜치에 `git push` 하면 **Vercel이 자동으로 다시 빌드·배포**한다.
> 코드 수정 후 별도의 배포 명령은 필요 없다. push 만 하면 된다.

수동 배포가 필요하면 (Vercel 로그인 상태에서):

```bash
npm run deploy       # = vercel deploy --prod --yes
```

## 🔑 환경변수

- **로컬/워커용**: `.env.local` (git에 안 올라감). `.env.example` 참고해서 채운다.
- **Vercel(웹)용**: Vercel 프로젝트 Settings → Environment Variables 에 등록돼 있다.
  - 등록된 값: `NEXT_PUBLIC_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`,
    `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET`
  - **Google Drive 관련 키(`GOOGLE_*`)와 `AI_API_KEY`는 Vercel에 넣지 않는다.**
    영상 렌더링·드라이브 업로드는 웹(Vercel)이 아니라 로컬 워커가 하기 때문.

환경변수를 바꿨으면 반영 위해 재배포(push 또는 `npm run deploy`)해야 한다.
`NEXT_PUBLIC_` 접두 변수는 빌드 타임에 박히므로 반드시 재배포 필요.

## 🤖 텔레그램 webhook

배포 URL이 바뀌거나 webhook을 다시 걸어야 하면:

```bash
npm run webhook:set                 # .env.local 의 NEXT_PUBLIC_SITE_URL 사용
node scripts/set-webhook.mjs https://다른도메인.com   # URL 직접 지정
```

봇 명령: `영상` `상품목록` `최근영상` `상태`
(TELEGRAM_ALLOWED_CHAT_ID 에서 온 메시지 + secret 헤더 일치할 때만 처리)

## 🎬 렌더 워커 — 클라우드(GitHub Actions, PC 불필요) ✨

영상 렌더링은 Vercel(서버리스)에서 불가하지만, **GitHub Actions 가 클라우드 PC 역할**을 한다.
public 저장소라 사용량 **무료**. `.github/workflows/render.yml` 이 아래처럼 동작:

- **15분마다** 자동으로 켜져서 대기중(pending) 영상이 있으면 렌더 → 드라이브 업로드 → 텔레그램 알림 → 종료
- 동시 실행 방지(concurrency) 내장 → 워커 인스턴스는 항상 하나
- (선택) Vercel 에 `GH_DISPATCH_TOKEN`/`GH_REPOSITORY` 를 넣으면 텔레그램 "영상" 승인 **즉시** 렌더 시작

### 켜려면 (한 번만): GitHub 시크릿 `WORKER_ENV` 등록

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** → Name: `WORKER_ENV`
3. Value 에 워커용 환경변수 전체를 `.env.local` 형식으로 붙여넣기 (필요 키:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_ALLOWED_CHAT_ID`, `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `NEXT_PUBLIC_SITE_URL`,
   `GOOGLE_TTS_API_KEY`(자연스러운 나레이션), `PEXELS_API_KEY`(포맷 D 스톡영상),
   `FORCE_TEMPLATE=D`(모든 렌더를 포맷 D 로 고정),
   `INSTAGRAM_BUSINESS_ACCOUNT_ID`/`INSTAGRAM_ACCESS_TOKEN`(인스타 릴스 자동 게시 - 메타 앱 심사
   통과 후), (선택)`AI_API_KEY`)
4. Actions 탭에서 `render-worker` → **Run workflow** 로 수동 테스트 가능

> 🎬 **포맷 D 고정**: `FORCE_TEMPLATE=D` 를 넣으면 DB template_type 과 무관하게
> 모든 영상을 포맷 D(실사용 스톡영상 배경)로 렌더한다. 빼면 저장된 A/B/C 로 렌더됨.

> 📺 **유튜브 쇼츠 자동 업로드**: 별도 키가 필요 없다 - 이미 있는
> `GOOGLE_OAUTH_*`(드라이브용) 를 그대로 재사용한다. 단, 그 refresh token 이
> `youtube.upload` 스코프로 발급된 것이어야 한다(구버전 토큰이면 유튜브만 조용히
> 건너뛴다). 재발급: `node scripts/google-oauth.mjs url` → 동의 → `exchange` →
> 나온 `GOOGLE_OAUTH_REFRESH_TOKEN` 으로 교체. 같은 구글 클라우드 프로젝트에서
> **YouTube Data API v3** 도 활성화해야 한다.
>
> 📸 **인스타 릴스 자동 게시**: 메타 쪽 사전 절차가 필요하다(코드로 대신할 수 없음) -
> ① 인스타를 비즈니스 계정으로 전환 ② 페이스북 페이지 연결 ③ developers.facebook.com
> 에서 비즈니스 앱 생성 + Instagram Graph API 추가 ④ `instagram_business_content_publish`
> 권한 앱 심사 제출(보통 2~4주) ⑤ 통과 후 장기 액세스 토큰 + 비즈니스 계정 ID 발급받아
> `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_BUSINESS_ACCOUNT_ID` 에 등록. 자세한 절차는
> `src/lib/instagram.ts` 상단 주석 참고. 미설정 시 인스타 업로드만 조용히 건너뛴다.

> 시크릿이 없으면 워크플로는 아무것도 안 하고 조용히 종료한다(안전).
> ⚠️ public 저장소이므로 시크릿은 반드시 GitHub Secrets 에만 — 코드/커밋에 절대 금지.

### 로컬 실행 (백업/개발용)

```bash
npm run worker        # 상시: pending 영상 감시(30초 간격) → 렌더 → 업로드 → 텔레그램 알림
npm run worker:once   # 대기중인 것만 처리하고 종료
```

- `.env.local` 에 Supabase/텔레그램/(드라이브) 값이 있어야 한다.
- 클라우드 워커와 로컬 워커를 **동시에 돌리지 말 것** (드라이브 폴더 중복 가능).

## 구글 드라이브 자동 업로드 (OAuth 방식)

일반 Gmail(trussvideo1@gmail.com)에서는 서비스계정으로 업로드가 안 되므로
(`Service Accounts do not have storage quota`) **OAuth 사용자 위임**을 쓴다.
`src/lib/drive.ts` 는 `GOOGLE_OAUTH_*` 가 있으면 OAuth, 없으면 서비스계정으로 폴백한다.

### refresh token 발급 (일회성)

1. Google Cloud Console → **APIs & Services → OAuth consent screen**
   - User type: **External** → 앱 이름/이메일 입력
   - **PUBLISH APP** (게시 상태를 "In production"으로) — 안 하면 refresh token 이 7일마다 만료됨
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app** → 생성 → `client_id`, `client_secret` 복사
3. `.env.local` 에 `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` 넣기
4. 동의 URL 발급 & refresh token 교환:
   ```bash
   node scripts/google-oauth.mjs url          # 출력 URL 을 브라우저에서 열어 동의
   #  → "localhost 연결 실패" 페이지의 주소창에서 code=... 복사
   node scripts/google-oauth.mjs exchange "<code 또는 전체 URL>"
   #  → GOOGLE_OAUTH_REFRESH_TOKEN 값을 .env.local 에 추가
   ```
   동의 시 "확인되지 않은 앱" 경고 → 고급 → 계속 진행 (본인 앱이라 안전).
   **반드시 드라이브 폴더 소유 계정(trussvideo1@gmail.com)으로 로그인**해서 동의할 것.

업로드가 실패해도 렌더된 영상은 로컬 `renders/` 에 남고 **완료 처리**된다
(텔레그램 알림에 실패 사유 표시). 즉 드라이브가 잠깐 안 돼도 영상 생성은 안 멈춘다.

## 🤖 매일 자동화 (스카우트 + 성과 리포트) — Vercel Cron

`vercel.json` 에 cron 두 개가 등록돼 있다(코드/스케줄은 배포 완료):

| 경로 | 스케줄(UTC) | KST | 하는 일 |
|---|---|---|---|
| `/api/cron/scout` | `0 23 * * *` | 아침 08:00 | ① 쿠팡에서 주부 인기 상품 후보 자동 등록 → ② 카테고리가 겹치지 않는 상품으로 **하루 3개 영상 자동 큐잉**(pending) + 텔레그램 알림 |
| `/api/cron/report` | `0 11 * * *` | 저녁 20:00 | click_logs 집계 → 오늘/이번주 클릭·인기 번호 리포트 |

> 🔁 **완전 자동 흐름**: 매일 아침 scout 이 상품을 찾아 **영상 3개를 pending 으로** 만든다
> → 15분마다 도는 렌더 워커(GitHub Actions)가 포맷 D 로 렌더 → 드라이브 업로드.
> 사람은 드라이브에서 완성 영상을 받아 Reels/TikTok/Shorts 에 올리기만 하면 된다.
> 멱등 처리: 하루에 3개를 넘겨 만들지 않는다(수동으로 몇 개 만든 날은 3개까지만 채움).

### 켜려면 — Vercel 환경변수 3개 필요 (한 번만)

Vercel 프로젝트 → **Settings → Environment Variables** 에서 아래 3개를 추가하고
(Environments: **Production** 체크) 저장 후 **재배포**:

| Key | Value |
|---|---|
| `COUPANG_ACCESS_KEY` | 쿠팡파트너스 오픈API 액세스 키 |
| `COUPANG_SECRET_KEY` | 쿠팡파트너스 오픈API 시크릿 키 |
| `CRON_SECRET` | 아무 랜덤 문자열(직접 정함). cron 인증용 |

- `CRON_SECRET` 은 Vercel Cron 이 `Authorization: Bearer` 헤더로 자동 전송 → 라우트가 검증.
- 없으면 라우트가 401 로 거부(공개 남용 방지).
- 수동 실행/테스트: `https://<도메인>/api/cron/scout?key=<CRON_SECRET>`

### 로컬에서 수동 실행 (선택)

```bash
npm run scout           # 후보 수집 + 텔레그램 (즉시)
npm run scout -- --dry  # 저장/알림 없이 수집만 출력
```

## 📦 Vercel 프로젝트 참고

- Framework: **Next.js** (must be set; null이면 라우트가 전부 404남)
- 프로덕션 브랜치: `claude/coupang-partners-shortform-hinfcb`
- 배포 보호(Vercel Authentication): **꺼짐** (공개 사이트 + webhook 도달 위해 필수)
