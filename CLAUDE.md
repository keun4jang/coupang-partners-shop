# 살림템 메모장 (쿠팡파트너스 숏폼 자동화) - Claude 작업 안내

이 파일은 어느 Claude 계정·세션이든 이 저장소를 열면 먼저 읽는다. 사장님이 Claude 계정을
바꿔도 운영 규칙과 진행 상황이 이어지도록 여기에 둔다(2026-10-07 작성).
최신 전략·실측 기록은 `docs/growth-plan.md` 상단 블록을 먼저 읽는다.

## 사업과 파이프라인
- 쿠팡파트너스 제휴 수익 + 사장님(쿠팡 판매자 '근사장') 본인 상품 판매. 목표 월 1,000만원.
- 흐름: 스카우트(상품 수집) → 큐잉(하루 6편) → 렌더(Remotion, 포맷 D/E) → 유튜브 쇼츠 '살림템'
  (UC1qy3ODOkWehfjAADaqdQ8g) + 인스타 @momitemmom 업로드 → 랜딩 /n/{번호} → /go/{번호} → 쿠팡.
- 실행 위치: GitHub Actions(render·scout·metrics·diag·settings), Vercel(momitemmom.vercel.app),
  Supabase(DB·app_settings). **Claude 구독과 무관하게 계속 돈다.** 비밀값은 GitHub Secrets·
  Vercel 환경변수·Supabase app_settings 에 있다(이 저장소에는 없다 - `.env*` 는 gitignore).
- 저장소는 **공개(public)** 다. 비밀값·개인정보를 커밋하지 않는다.

## 브랜치·커밋 규칙
- 모든 변경은 두 브랜치에 push: `claude/blissful-noether-ofm9ww` 와
  `claude/coupang-partners-shortform-hinfcb`(운영 - Vercel·Actions 가 이걸 쓴다).
- 커밋 메시지는 한국어. 사장님 보고도 한국어.
- push 전 `npm run marketer:gate`(tsc + 안전장치·정책·본인상품 등 자가 점검) 통과 필수.

## 절대 규칙 (계정 정지·법적 위험)
- 쿠팡 API 위반이 이미 2회 - 3회째는 영구 정지. 모든 쿠팡 API 호출은 `src/lib/coupang.ts`
  request() → 장부(`coupangLedger.ts`, 60분 35회 상한)를 거친다. 다른 파일에서 쿠팡 API 직접 호출 금지.
  스카우트 키워드는 실행당 20개 이하.
- 본인 클릭 금지: 파트너스 링크를 직접 눌러 테스트하지 않는다(/go 는 `?dry=1` 로 점검).
- 고지: 파트너스 상품은 "이 게시물은 쿠팡파트너스 활동의 일환으로…" 문장을 캡션·설명에 1회 +
  영상 하단에 상시. "[광고]" 표기는 2026-10-07 사장님 결정으로 쓰지 않는다.
  본인 상품은 파트너스 문구 대신 "근사장이 직접 판매하는 제품"(src/lib/ownProducts.ts).
- 효능·의학 표현(살균·항균·99.9%·숙면·통증 등)과 클릭 재촉·과장 표현 금지(src/lib/policy.ts).
- 비밀값은 출력하지 않는다(필요하면 끝 4자리만).
- OAuth 동의·로그인·본인인증·약관 동의·결제는 사장님이 직접 한다. 크롬 확장은 읽기 위주,
  운영 DB 변경 SQL 은 사장님이 직접 실행.
- 한 번에 한 가지만 바꾼다(여러 개 동시 변경으로 원인을 못 가려 한 달을 잃은 적이 있다).
- 스스로 코드를 고쳐 배포하는 완전 자율 루틴은 만들지 않는다(승인은 사장님이 한다).

## 본인 상품 (2026-10-07)
- 목록: `src/lib/ownProducts.ts` OWN_PRODUCTS (쿠팡 윙에서 읽음). 큐잉 때 자동으로 DB 반영.
- 하루 `own_product_daily`(기본 1)편. 링크는 상품 페이지 직행(파트너스 링크·subId 없음).

## 사장님 대기 항목 (2026-10-07 기준)
- 파트너스 홍보 채널 승인 결과, 쿠팡 1:1 문의 답변(API 결과 저장·이미지 사용·Threads 등).
- 답변 전까지 Threads 게시 보류. 9/3~9/6 본인 시험 클릭 여부 미답.

## 계정이 바뀌었을 때 다시 만들 루틴 (예약 작업은 계정에 묶여 사라진다)
1. **주간 판정표** - 매주 월 09:47 KST:
   "새 전략 주간 판정표. docs/growth-plan.md 기준. metrics 워크플로(days 7, views true) 결과로
   사람 /go 이동·랜딩 방문·쇼츠 조회·계속 시청 비율을 보고, 시험 A(선반)·B(스레드)·C(실사용)·
   D(새 채널)·E(쇼츠 형식) 진행과 중단 기준 해당 여부를 한국어 판정표로 보고. 승인 필요한 변경은
   제안만 한다. 쿠팡 공식 수치는 사장님이 직접 본 값만."
2. **11/1 사업 방식 판정** - 2026-11-01 09:30 KST 1회: 30일 결과로 통과한 시험만 확대, 아니면
   (가) 사장님 실사용 리뷰 전환 (나) 최소 비용 유지 (다) 멈추기 선택지를 숫자와 함께 보고.

## 이어가기 규칙 (계정이 바뀌어도 대화가 끊기지 않게)
- 세션 시작 시 `docs/handoff/CURRENT.md` 가 훅으로 자동 주입된다(.claude/settings.json SessionStart).
- **작업 한 덩어리를 마칠 때마다** CURRENT.md 를 최신으로 고친다: 최근에 한 것 / 진행 중·다음 할 일 /
  사장님 답 대기 / 예약 루틴. 1페이지를 넘기지 않게 오래된 줄은 지우고, 오래 남길 결정은
  docs/growth-plan.md 나 이 파일(CLAUDE.md)로 옮긴다. 고친 뒤 두 브랜치에 커밋·push.
- 사장님 결정(승인·거절·방향 변경)은 날짜와 함께 그 자리에서 문서에 적는다 - 대화 기록은 계정과 함께 사라진다.
- 대화 원문 자동 저장: Stop 훅이 `claude-chat-archive` 저장소(keun4jang/claude-chat-archive)가
  있으면 거기 저장한다. 위치는 CHAT_ARCHIVE_DIR, 없으면 이 저장소 옆 폴더(../claude-chat-archive).

## 새 계정에서 시작하는 법
1. claude.ai 설정 → 커넥터에서 GitHub 연결(저장소 keun4jang/coupang-partners-shop 권한).
2. PC 터미널: 이 폴더에서 `claude` 실행 → CLAUDE.md 와 이어가기 메모가 자동으로 읽힌다.
   "이어서 해줘"라고만 하면 된다. 웹(claude.ai/code)에서 이 저장소로 세션을 열어도 같다.
3. 위 루틴 2개를 다시 만든다.
4. (선택) 대화 원문 저장을 PC 에서도 쓰려면 `C:\Projects` 에서
   `git clone https://github.com/keun4jang/claude-chat-archive.git` 한 번.
