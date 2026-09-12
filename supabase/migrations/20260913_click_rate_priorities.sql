-- ─────────────────────────────────────────────────────────────────────
-- 링크 클릭률 개선 2차: 프로필 허브(플랫폼별 최근 상품 모음) + 페이스북 추적
--
-- 적용 방법: Supabase SQL Editor 에 이 파일 내용을 붙여넣어 실행한다.
-- 성격: additive 전용. 기존 테이블/컬럼/데이터를 지우거나 바꾸지 않는다.
--
-- 배경: /from/instagram, /from/youtube-shorts, /from/facebook 세 개의
-- "프로필 링크 허브" 페이지를 새로 만든다(인스타/유튜브/페이스북 프로필
-- 링크가 사이트 루트 대신 이 페이지를 가리키게 될 예정). 이 페이지 자체의
-- 방문(= 프로필 링크를 눌러 들어온 사람 수)은 특정 상품 번호에 속하지
-- 않으므로 product_event_daily(번호 단위 카운터)에는 넣지 않고, 별도의
-- 가벼운 일일 카운터 테이블을 둔다.
--
-- 더불어 페이스북도 다른 플랫폼과 같은 방식으로 유입 경로를 구분할 수 있게
-- product_event_daily 의 source/channel 허용값에 페이스북을 추가한다
-- (지금까지는 유튜브/인스타/사이트만 있었다).
-- ─────────────────────────────────────────────────────────────────────

-- 1. product_event_daily: source/channel 허용값에 페이스북 추가
alter table product_event_daily drop constraint if exists product_event_daily_source_check;
alter table product_event_daily add constraint product_event_daily_source_check
  check (source in ('youtube_shorts', 'instagram_reels', 'youtube_longform', 'facebook_reels', 'unknown'));

alter table product_event_daily drop constraint if exists product_event_daily_channel_check;
alter table product_event_daily add constraint product_event_daily_channel_check
  check (channel in ('youtube', 'instagram', 'facebook', 'site', 'unknown'));

-- 2. increment_product_event_daily 함수: 위 허용값 확장을 반영해 재정의
--    (기존 함수 본문과 동일하되 화이트리스트 두 줄만 늘렸다)
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
  if p_display_number is null or p_display_number <= 0 then
    return;
  end if;

  if p_event_type is null or p_event_type not in ('landing_view', 'outbound_click') then
    return;
  end if;

  v_source := coalesce(nullif(trim(p_source), ''), 'unknown');
  if v_source not in (
    'youtube_shorts', 'instagram_reels', 'youtube_longform', 'facebook_reels', 'site', 'unknown'
  ) then
    v_source := 'unknown';
  end if;

  v_channel := coalesce(nullif(trim(p_channel), ''), 'unknown');
  if v_channel not in ('youtube', 'instagram', 'facebook', 'site', 'unknown') then
    v_channel := 'unknown';
  end if;

  v_variant := coalesce(nullif(trim(p_template_variant), ''), '');
  if v_variant not in ('classic', 'usecase', 'top10', '') then
    v_variant := 'unknown';
  end if;

  v_video_id := left(regexp_replace(coalesce(p_video_id, ''), '[^A-Za-z0-9_-]', '', 'g'), 32);

  v_rank := coalesce(p_rank_in_video, 0);
  if v_rank < 0 or v_rank > 10 then
    v_rank := 0;
  end if;

  insert into product_event_daily (
    event_date, display_number, event_type, source, channel,
    video_id, template_variant, rank_in_video, event_count
  )
  values (
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

revoke all on function increment_product_event_daily(
  integer, text, text, text, text, text, integer
) from public;

-- 3. 프로필 허브 방문 일일 카운터 (번호와 무관한 상위 퍼널 지표)
create table if not exists profile_hub_view_daily (
  event_date date not null,
  -- 어느 허브 페이지인지: /from/instagram, /from/youtube-shorts, /from/facebook
  platform text not null check (platform in ('instagram', 'youtube_shorts', 'facebook')),
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_date, platform)
);

create index if not exists idx_profile_hub_view_daily_date
  on profile_hub_view_daily (event_date desc);

drop trigger if exists trg_profile_hub_view_daily_updated_at on profile_hub_view_daily;
create trigger trg_profile_hub_view_daily_updated_at
  before update on profile_hub_view_daily
  for each row execute function set_updated_at();

alter table profile_hub_view_daily enable row level security;

create or replace function increment_profile_hub_view_daily(p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform text;
begin
  v_platform := coalesce(nullif(trim(p_platform), ''), '');
  if v_platform not in ('instagram', 'youtube_shorts', 'facebook') then
    return;
  end if;

  insert into profile_hub_view_daily (event_date, platform, view_count)
  values ((now() at time zone 'Asia/Seoul')::date, v_platform, 1)
  on conflict (event_date, platform)
  do update set
    view_count = profile_hub_view_daily.view_count + 1,
    updated_at = now();
end;
$$;

revoke all on function increment_profile_hub_view_daily(text) from public;
