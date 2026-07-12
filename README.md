# 살림템 메모장 📝

아이 둘 키우는 30~40대 엄마 감성의 **번호 기반 추천템 링크 사이트 + 쿠팡파트너스 숏폼 자동화 시스템**.

> 🟢 **라이브**: https://coupang-partners-shop.vercel.app · 봇 @Coupang1bot · 배포·운영은 [DEPLOY.md](./DEPLOY.md) 참고
> (이 브랜치에 `git push` 하면 Vercel이 자동 재배포됨)

텔레그램에 `영상` 이라고 보내면:

1. 후보 상품 중 하나를 자동 선택
2. 새 **영상 번호**(displayNumber) 부여 — 같은 상품도 후킹을 바꿔 여러 번호로 테스트 가능
3. AI가 후킹/스크립트/캡션 생성 (엄마의 살림노트 톤)
4. 링크 웹사이트에 해당 번호 자동 노출
5. 렌더 워커가 8~12초 세로형(1080x1920) 숏폼 생성 (B-roll + 제품 오버레이 + 자막 + 번호 CTA)
6. mp4 / caption txt / thumbnail png 를 구글드라이브에 업로드
7. 텔레그램으로 완료 알림

사용자는 드라이브에서 영상을 확인해 TikTok / Reels / Shorts 에 **직접 업로드**한다 (자동 업로드는 MVP 범위 밖).
시청자는 영상 속 번호를 보고 사이트에서 검색 → "쿠팡에서 보기" 클릭 → 클릭 로그 저장 후 쿠팡파트너스 링크로 이동.

## 아키텍처

```
텔레그램 "영상"
   │
   ▼
Vercel (Next.js App Router)
 ├ /                        공개 링크페이지 (번호 검색 + 최근 추천템)
 ├ /api/click               클릭 로그 + 쿠팡 redirect
 ├ /api/telegram            봇 webhook (영상/상품목록/최근영상/상태)
 ├ /admin                   관리자 (ADMIN_SECRET) - 상품/영상/클릭 통계
 └ /api/admin/*             상품 CRUD, 수동 영상 생성
   │
   ▼
Supabase (products / video_items / click_logs)
   │
   ▼
렌더 워커 (로컬 PC 또는 아무 Node 서버: npm run worker)
 ├ Remotion 템플릿 A/B/C 렌더링
 ├ Google Drive 업로드 (coupang-shorts/YYYY-MM-DD/)
 └ 텔레그램 완료 알림
```

핵심 규칙:

- **번호는 상품이 아니라 영상 콘텐츠의 번호다.** 같은 productId 로 17번, 18번, 19번 영상을 만들어 후킹별 클릭을 비교한다. 번호는 만들 때마다 +1 (계속 증가하는 것이 의도된 동작).
- 번호 표기는 항상 `17번` — `017번` 같은 0 채움 금지 (`src/lib/format.ts`).
- 허위 후기 표현 금지 — AI 프롬프트에 금지어가 걸려 있고, 생성 결과에 금지어가 있으면 안전한 기본 문구로 폴백 (`src/lib/ai.ts`).

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. Supabase

1. [supabase.com](https://supabase.com) 프로젝트 생성
2. SQL Editor 에 `supabase/schema.sql` 붙여넣고 실행
3. Project Settings → API 에서 URL / anon key / service_role key 복사

### 3. 환경변수

```bash
cp .env.example .env.local
# .env.local 에 실제 값 입력
```

`.env`, `.env.local`, `.env.production` 은 `.gitignore` 에 포함되어 있다. **절대 커밋 금지.**

### 4. 로컬 실행

```bash
npm run dev            # http://localhost:3000 (사이트 + /admin)
npm run remotion:studio # 영상 템플릿 미리보기/디자인 수정
npm run worker         # 렌더 워커 (pending 영상 감시)
npm run worker:once    # 대기 중인 영상만 처리하고 종료
```

**렌더 워커는 항상 인스턴스 하나만 실행한다.** `video_items` 점유는
`video_status='pending'` 조건이 걸린 원자적 UPDATE로 이루어져 같은 항목을
두 프로세스가 동시에 처리하는 것은 막아주지만, 구글드라이브 날짜 폴더
생성은 Drive API 특성상 완전한 동시성 보장이 어렵다. 여러 대의 PC/서버에서
동시에 `npm run worker` 를 띄우지 말 것.

### 5. 텔레그램 봇 연결

1. `@BotFather` 에서 봇 생성 → 토큰 발급
2. 본인 chat id 확인 (`@userinfobot` 등)
3. 배포 후 webhook 등록:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<도메인>/api/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET 값>"
```

명령: `영상` `상품목록` `최근영상` `상태`

### 6. Google Drive

1. Google Cloud 서비스 계정 생성 + Drive API 활성화
2. 드라이브에 `coupang-shorts` 폴더를 만들고 **서비스 계정 이메일과 공유** (편집자)
3. 폴더 ID를 `GOOGLE_DRIVE_FOLDER_ID` 에 설정
4. 서비스 계정 키의 `client_email`, `private_key` 를 환경변수에 설정 (private_key 는 줄바꿈을 `\n` 으로)

### 7. Vercel 배포

- 저장소 연결 후 `.env.example` 의 변수를 Vercel 환경변수로 등록
- 렌더 워커는 Vercel 에서 돌지 않는다 — 로컬 PC/서버에서 `npm run worker` 실행

## 영상 디자인 수정

디자인 관련 값은 전부 `remotion/config/videoConfig.ts` 에 모여 있다:

- 색상(COLORS), 폰트 크기(FONT_SIZES), 장면 타이밍(TIMING), 모션 속도(MOTION)
- CTA 문구 템플릿, 대가성 문구, 카테고리별 B-roll 매핑, 템플릿 배지

템플릿 구조는 `remotion/templates/TemplateA|B|C.tsx`:

- **A 생활 문제 해결형**: 문제 → 공감 → 제품 → 장점 → 번호 CTA
- **B 아이엄마 공감형**: 상단 배지 + 말풍선 자막, 따뜻한 톤
- **C 살림 메모형**: 메모 카드에 체크리스트가 하나씩 적히는 구성

`npm run remotion:studio` 로 브라우저에서 실시간 미리보기하며 수정한다.
B-roll 은 `public/assets/broll/` 에 mp4 를 넣으면 자동 사용 (없으면 그라디언트 모션 배경).

## 어디서든 수정하기 (Claude Code 워크플로)

이 저장소가 시스템의 단일 소스다. 로컬 상태에 의존하는 것이 없으므로:

- **PC / 다른 PC**: `git clone` 후 `.env.local` 만 채우면 동일하게 동작
- **Claude Code (웹/모바일/CLI)**: 이 저장소를 열고 자연어로 수정 요청
  - "디자인 수정" → `remotion/config/videoConfig.ts` 와 템플릿 중심으로 수정
  - 새 기능/문구/톤 조정 → 해당 lib/페이지 수정 후 커밋 & 푸시
- 민감정보는 코드에 없고 전부 환경변수 → 어떤 기기에서도 저장소만 있으면 작업 가능

## 폴더 구조

```
├ src/
│ ├ app/                # Next.js App Router (공개 페이지, admin, API)
│ ├ lib/                # supabase, ai, telegram, drive, 상품선택, 번호할당
│ └ types/db.ts         # DB 타입
├ remotion/             # 영상 템플릿 (A/B/C) + config
├ worker/render-worker.ts # 렌더/업로드/알림 워커
├ supabase/schema.sql   # DB 스키마
└ public/assets/broll/  # 카테고리별 B-roll (선택)
```

## 대가성 고지

사이트 하단, 영상 하단, 캡션에 모두 포함된다:

> 쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.
