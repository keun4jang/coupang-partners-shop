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

## ⚠️ 구글 드라이브 자동 업로드 (미완 — 조치 필요)

현재 방식(서비스 계정)은 **일반 Gmail 계정에서는 파일 업로드가 안 된다**
(`Service Accounts do not have storage quota` 에러 — 서비스계정은 자체 저장공간이 없음).

해결 방법 (택1):
1. **OAuth 사용자 위임**: 내 구글 계정으로 OAuth 동의 → refresh token 발급 →
   업로드가 내 드라이브(15GB) 소유로 저장됨. (일반 Gmail 권장 방식, `src/lib/drive.ts` 수정 필요)
2. **공용 드라이브(Shared Drive)**: Google Workspace(유료) 계정에서 공용 드라이브 생성 후
   서비스계정을 멤버로 추가 → 폴더 ID만 그쪽으로 교체.

이 조치 전까지 워커는 영상을 **로컬 `renders/` 에 저장**하고 완료 처리한다
(드라이브 업로드 단계만 건너뜀).

## 📦 Vercel 프로젝트 참고

- Framework: **Next.js** (must be set; null이면 라우트가 전부 404남)
- 프로덕션 브랜치: `claude/coupang-partners-shortform-hinfcb`
- 배포 보호(Vercel Authentication): **꺼짐** (공개 사이트 + webhook 도달 위해 필수)
