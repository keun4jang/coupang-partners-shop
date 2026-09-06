-- ─────────────────────────────────────────────────────────────────────
-- 링크 클릭률 개선 1차: 상품별 일일 성과 집계 + 템플릿 변형 기록
--
-- 적용 방법: Supabase SQL Editor 에 이 파일 내용을 붙여넣어 실행한다.
-- 성격: additive 전용. 기존 테이블/컬럼/데이터를 지우거나 바꾸지 않는다.
--       (click_logs 는 그대로 두고 새 집계 테이블을 옆에 붙인다)
--
-- 왜 raw 로그가 아니라 일일 집계인가:
--   click_logs 는 방문 1건 = 행 1개라 무료 티어에서 계속 부풀고, referrer /
--   user_agent 를 그대로 담아 개인정보 측면에서도 최소 수집 원칙에 어긋난다.
--   여기서는 "날짜 × 번호 × 이벤트 × 유입경로" 조합의 카운터만 올린다.
--   행이 하루에 조합 수만큼만 늘어나므로 몇 년을 돌려도 가볍다.
-- ─────────────────────────────────────────────────────────────────────

-- 1. 일일 집계 테이블
create table if not exists product_event_daily (
  event_date date not null,
  display_number integer not null,
  -- landing_view: N번 랜딩을 열었다 / outbound_click: 제휴 링크로 나갔다
  event_type text not null check (event_type in ('landing_view', 'outbound_click')),
  -- 어느 영상에서 왔나: youtube_shorts / instagram_reels / youtube_longform / site / unknown
  source text not null default 'unknown',
  -- 어느 채널인가: youtube / instagram / site / unknown
  channel text not null default 'unknown',
  -- 영상 식별자(있으면). 유튜브 videoId 등
  video_id text not null default '',
  -- 어떤 템플릿으로 만든 영상인가: classic / usecase / top10 / unknown
  template_variant text not null default '',
  -- 롱폼 TOP10 에서 몇 위 칸의 링크였나 (숏폼은 0)
  rank_in_video integer not null default 0,
  event_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    event_date,
    display_number,
    event_type,
    source,
    channel,
    video_id,
    template_variant,
    rank_in_video
  )
);

create index if not exists idx_product_event_daily_date
  on product_event_daily (event_date desc);
create index if not exists idx_product_event_daily_number
  on product_event_daily (display_number, event_date desc);

drop trigger if exists trg_product_event_daily_updated_at on product_event_daily;
create trigger trg_product_event_daily_updated_at
  before update on product_event_daily
  for each row execute function set_updated_at();

-- RLS: 다른 테이블과 같은 방침. 서버(service role)로만 접근한다.
-- 정책을 하나도 만들지 않으므로 anon/authenticated 는 select 도 insert 도 못 한다.
alter table product_event_daily enable row level security;

-- 2. 카운터 증가 함수
--
-- 라우트에서 직접 insert 하지 않고 이 함수만 호출한다. 이유:
--   · 허용값 검증을 DB 한 곳에 모아둔다 (앱 코드가 늘어도 규칙이 갈라지지 않음)
--   · 길이 제한으로 쿼리스트링에 아무 문자열이나 담아 보내도 테이블이 안 더러워짐
--   · 나중에 anon 에게 이 함수만 열어주는 선택지를 남겨둔다
--     (지금은 service role 로만 부르므로 grant 를 따로 하지 않는다)
create or replace function increment_product_event_daily(
  p_display_number integer,
  p_event_type text,
  p_source text default 'unknown',
  p_channel text default 'unknown',
  p_video_id text default '',
  p_template_variant text default '',
  p_rank_in_video integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text;
  v_channel text;
  v_video_id text;
  v_variant text;
  v_rank integer;
begin
  -- 번호는 양수만. 0/음수는 잘못된 호출이라 조용히 버린다.
  if p_display_number is null or p_display_number <= 0 then
    return;
  end if;

  -- 허용된 이벤트 종류가 아니면 기록하지 않는다.
  if p_event_type is null or p_event_type not in ('landing_view', 'outbound_click') then
    return;
  end if;

  -- 자유 입력값은 화이트리스트 + 길이 제한으로 정리한다.
  -- (쿼리스트링은 누구나 조작할 수 있으므로 값 자체를 믿지 않는다)
  v_source := coalesce(nullif(trim(p_source), ''), 'unknown');
  if v_source not in ('youtube_shorts', 'instagram_reels', 'youtube_longform', 'site', 'unknown') then
    v_source := 'unknown';
  end if;

  v_channel := coalesce(nullif(trim(p_channel), ''), 'unknown');
  if v_channel not in ('youtube', 'instagram', 'site', 'unknown') then
    v_channel := 'unknown';
  end if;

  v_variant := coalesce(nullif(trim(p_template_variant), ''), '');
  if v_variant not in ('classic', 'usecase', 'top10', '') then
    v_variant := 'unknown';
  end if;

  -- video_id 는 값 목록을 못 정하므로 안전한 문자만 남기고 길이를 자른다.
  v_video_id := left(regexp_replace(coalesce(p_video_id, ''), '[^A-Za-z0-9_-]', '', 'g'), 32);

  -- 순위는 TOP10 범위 밖이면 0(해당 없음)으로 본다.
  v_rank := coalesce(p_rank_in_video, 0);
  if v_rank < 0 or v_rank > 10 then
    v_rank := 0;
  end if;

  insert into product_event_daily (
    event_date, display_number, event_type, source, channel,
    video_id, template_variant, rank_in_video, event_count
  )
  values (
    -- 운영일 기준이 KST 라 날짜도 KST 로 끊는다 (UTC 로 세면 아침 발행분이
    -- 전날로 잡혀 하루 성과가 두 날에 걸쳐 보인다)
    (now() at time zone 'Asia/Seoul')::date,
    p_display_number, p_event_type, v_source, v_channel,
    v_video_id, v_variant, v_rank, 1
  )
  on conflict (
    event_date, display_number, event_type, source, channel,
    video_id, template_variant, rank_in_video
  )
  do update set
    event_count = product_event_daily.event_count + 1,
    updated_at = now();
end;
$$;

-- 3. video_items: 어떤 숏폼 템플릿 변형으로 만들었는지 기록
--
-- display_number 체계와 무관한 별도 컬럼이다. 기존 행은 전부 'classic' 으로
-- 채워지므로(default) 지금까지 발행분의 성과가 classic 쪽에 잡힌다.
alter table video_items
  add column if not exists template_variant text not null default 'classic';

alter table video_items drop constraint if exists video_items_template_variant_check;
alter table video_items add constraint video_items_template_variant_check
  check (template_variant in ('classic', 'usecase'));

create index if not exists idx_video_items_template_variant
  on video_items (template_variant);
