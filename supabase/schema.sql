-- ─────────────────────────────────────────────────────────────
-- 살림템 메모장 DB 스키마
-- Supabase SQL Editor 에 붙여넣어 실행한다.
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- 1. products: 상품 원본 데이터 (displayNumber 없음 - 번호는 video_items 소유)
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  category text not null default '생활템',
  target_user text,
  pain_point text,
  main_benefit text,
  price_text text,
  coupang_partner_url text not null,
  image_url text,
  source_memo text,
  status text not null default 'candidate' check (status in ('candidate', 'paused')),
  -- 자동 소싱된 상품 영상 캐시 (알리 매칭 등). 같은 상품 재렌더 시 재검색 없이 재사용.
  source_video_url text,
  source_video_origin text,
  source_video_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. video_items: 영상/추천 콘텐츠 번호 단위 데이터
--    같은 product_id 로 여러 개 생성 가능. display_number 는 계속 증가(의도된 동작).
create table if not exists video_items (
  id uuid primary key default gen_random_uuid(),
  display_number integer not null unique,
  product_id uuid not null references products(id) on delete cascade,
  hook_text text,
  script_text text,
  caption_text text,
  template_type text not null default 'A' check (template_type in ('A', 'B', 'C', 'D')),
  video_status text not null default 'pending'
    check (video_status in ('pending', 'generating', 'completed', 'failed')),
  drive_video_url text,
  drive_caption_url text,
  drive_thumbnail_url text,
  -- SNS 자동 업로드 결과. url 이 채워지면 업로드 성공, error 는 실패 사유(재시도 시 초기화).
  youtube_url text,
  youtube_error text,
  instagram_url text,
  instagram_error text,
  facebook_url text,
  facebook_error text,
  landing_visible boolean not null default false,
  -- 텔레그램 "업로드" 등 수동 요청 여부. 수동 항목은 업로드 슬롯 게이트를 우회한다.
  manual boolean not null default false,
  -- 스튜디오(직접 업로드 소재) 모드: Storage 'footage' 버킷의 영상 경로 목록(json 배열).
  -- 값이 있으면 워커가 스톡/자동소싱 대신 이 영상들을 배경으로 쓴다.
  footage_paths jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_items_display_number on video_items (display_number desc);
create index if not exists idx_video_items_product_id on video_items (product_id);
create index if not exists idx_video_items_status on video_items (video_status);

-- 3. click_logs: 클릭 추적 (어떤 "번호"에서 클릭됐는지까지 기록)
create table if not exists click_logs (
  id uuid primary key default gen_random_uuid(),
  video_item_id uuid not null references video_items(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  display_number integer not null,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_click_logs_video_item_id on click_logs (video_item_id);
create index if not exists idx_click_logs_display_number on click_logs (display_number);

-- updated_at 자동 갱신
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

drop trigger if exists trg_video_items_updated_at on video_items;
create trigger trg_video_items_updated_at
  before update on video_items
  for each row execute function set_updated_at();

-- RLS: 모든 접근은 서버(service role)를 통해서만 한다.
-- service role 은 RLS 를 우회하므로 별도 정책 없이 잠근다.
alter table products enable row level security;
alter table video_items enable row level security;
alter table click_logs enable row level security;

-- 4. app_settings: 키-값 설정 저장소
-- 인스타 액세스 토큰(60일 만료 → 자동 갱신본 저장)처럼
-- 코드 배포 없이 갱신돼야 하는 값을 보관한다.
create table if not exists app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

alter table app_settings enable row level security;
