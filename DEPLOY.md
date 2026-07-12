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

## 🎬 렌더 워커 (로컬에서 실행)

영상 렌더링은 Vercel(서버리스)에서 불가 → **내 PC나 상시 켜둔 서버**에서 실행.

```bash
npm run worker        # 상시: pending 영상 감시(30초 간격) → 렌더 → 업로드 → 텔레그램 알림
npm run worker:once   # 대기중인 것만 처리하고 종료
```

- `.env.local` 에 Supabase/텔레그램/(드라이브) 값이 있어야 한다.
- 워커 인스턴스는 **하나만** 실행 (동시 실행 시 드라이브 폴더 중복 가능).

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

## 📦 Vercel 프로젝트 참고

- Framework: **Next.js** (must be set; null이면 라우트가 전부 404남)
- 프로덕션 브랜치: `claude/coupang-partners-shortform-hinfcb`
- 배포 보호(Vercel Authentication): **꺼짐** (공개 사이트 + webhook 도달 위해 필수)
