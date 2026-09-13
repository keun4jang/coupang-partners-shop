-- ─────────────────────────────────────────────────────────────────────
-- 링크 클릭률 개선 3차: 자동 요청(봇·미리보기·프리페치) 집계 제외
--
-- 적용 방법: Supabase SQL Editor 에 이 파일 내용을 붙여넣어 실행한다.
-- 성격: additive 전용 + 직전 마이그레이션의 CHECK 누락 복구.
--       기존 테이블/컬럼/데이터를 지우지 않는다.
--
-- 배경 (2026-09-13 실측):
--   우리 자체 집계는 최근 7일 롱폼 이동 230건인데 쿠팡파트너스 공식 클릭수는
--   이번 달 통틀어 25건이었다. /go/[번호] 가 "GET 이 오면 무조건 +1"이라
--   검색 크롤러·메신저 링크 미리보기·브라우저 프리페치까지 클릭으로 세고
--   있었기 때문이다. 앱(src/lib/requestFilter.ts)에서 이런 요청을 걸러
--   집계에서 빼되, 얼마나 걸러냈는지 사유별로 여기에 남긴다.
--   (걸러낸 양을 못 보면 과하게 걸렀는지 덜 걸렀는지 판단할 수가 없다.)
-- ─────────────────────────────────────────────────────────────────────

-- 1. [복구] product_event_daily.source CHECK 에서 빠졌던 'site' 되돌리기
--
--    20260913_click_rate_priorities.sql 에서 페이스북을 추가하며 목록을 다시
--    적을 때 'site' 가 빠졌다. 그런데 increment_product_event_daily 함수의
--    화이트리스트에는 'site' 가 그대로 있어서, /n/[번호] 를 유입경로 없이
--    직접 연 방문(page.tsx 가 source='site' 로 기록)이 CHECK 위반으로 조용히
--    버려지고 있었다(앱은 집계 실패를 무시하도록 설계돼 있어 티가 안 났다).
--    → 랜딩 방문수가 실제보다 적게 잡혔다. 목록을 함수 쪽과 일치시킨다.
alter table product_event_daily drop constraint if exists product_event_daily_source_check;
alter table product_event_daily add constraint product_event_daily_source_check
  check (source in (
    'youtube_shorts', 'instagram_reels', 'youtube_longform', 'facebook_reels', 'site', 'unknown'
  ));

-- 2. 집계에서 제외한 자동 요청의 사유별 일일 카운터
--
--    product_event_daily 에 섞지 않는 이유: 저기 들어간 값은 전부 "사람의
--    행동"이어야 클릭률 계산이 성립한다. 봇 건수는 성격이 다른 운영 지표라
--    profile_hub_view_daily 처럼 옆에 가벼운 테이블로 둔다.
create table if not exists blocked_outbound_daily (
  event_date date not null,
  -- 제외 사유. 앱이 만드는 짧은 고정 어휘: 'repeat', 'ua:googlebot',
  -- 'prefetch:sec-purpose', 'method:head' 등
  reason text not null,
  event_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_date, reason)
);

create index if not exists idx_blocked_outbound_daily_date
  on blocked_outbound_daily (event_date desc);

drop trigger if exists trg_blocked_outbound_daily_updated_at on blocked_outbound_daily;
create trigger trg_blocked_outbound_daily_updated_at
  before update on blocked_outbound_daily
  for each row execute function set_updated_at();

-- RLS: 다른 집계 테이블과 같은 방침. 서버(service role)로만 접근한다.
alter table blocked_outbound_daily enable row level security;

-- 3. 카운터 증가 함수
--
--    사유는 앱이 만드는 값이지만 목록을 고정하지 않는다(봇 UA 목록이 늘 때마다
--    마이그레이션을 다시 걸어야 하는 건 과하다). 대신 안전한 문자만 남기고
--    길이를 잘라 테이블이 더러워지지 않게 한다.
create or replace function increment_blocked_outbound_daily(p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := left(
    regexp_replace(lower(coalesce(p_reason, '')), '[^a-z0-9:._/+-]', '', 'g'),
    40
  );
  if v_reason = '' then
    v_reason := 'unknown';
  end if;

  insert into blocked_outbound_daily (event_date, reason, event_count)
  values ((now() at time zone 'Asia/Seoul')::date, v_reason, 1)
  on conflict (event_date, reason)
  do update set
    event_count = blocked_outbound_daily.event_count + 1,
    updated_at = now();
end;
$$;

-- security definer 함수는 RLS 를 우회한다. 공개된 anon 키로 아무나 카운터를
-- 부풀리지 못하게 PUBLIC 권한을 회수한다(다른 집계 함수와 같은 규칙).
revoke all on function increment_blocked_outbound_daily(text) from public;
