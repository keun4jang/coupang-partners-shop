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
  -- rendered: 렌더+드라이브 업로드 완료, SNS 발행은 예약 시간 대기 (스튜디오 예약 모드)
  video_status text not null default 'pending'
    check (video_status in ('pending', 'generating', 'rendered', 'completed', 'failed')),
  -- auto: 자동 파이프라인(슬롯 시간에 렌더+발행) / immediate: 텔레그램 수동(즉시 발행)
  -- scheduled: 스튜디오(즉시 렌더 → 슬롯 시간에 발행)
  publish_mode text not null default 'auto'
    check (publish_mode in ('auto', 'immediate', 'scheduled')),
  drive_video_url text,
  -- 예약 발행 시 드라이브에서 영상을 다시 받아 유튜브에 올리기 위한 파일 id
  drive_video_file_id text,
  drive_caption_url text,
  drive_thumbnail_url text,
  -- SNS 자동 업로드 결과. url 이 채워지면 업로드 성공, error 는 실패 사유(재시도 시 초기화).
  youtube_url text,
  youtube_error text,
  instagram_url text,
  instagram_error text,
  facebook_url text,
  facebook_error text,
  -- 실제로 쓰인 배경 자료화면 기록 (사후 검증용)
  -- broll_origin: "실사용 스톡(Pexels)" / "직접 업로드 소재" / "배경 없음(블러 사진)" 등
  broll_origin text,
  broll_files jsonb,
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
  -- 랜딩에서 어느 자리를 눌렀는지: hero(원탭 히어로) / list(아래 목록) / search(번호검색)
  -- 히어로가 실제로 전환에 기여하는지 판단하는 근거
  slot text,
  created_at timestamptz not null default now()
);

-- 기존 배포에 컬럼 추가 (재실행해도 안전)
alter table click_logs add column if not exists slot text;
-- 발행(SNS 업로드) 완료 시각. 업로드 슬롯 게이트가 "오늘 몇 개 발행했나"를 이걸로
-- 센다 (updated_at 은 무관한 갱신에도 움직여서 슬롯 오인 소진이 났다).
alter table video_items add column if not exists published_at timestamptz;
alter table video_items add column if not exists broll_origin text;
alter table video_items add column if not exists broll_files jsonb;

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

-- 4. studio_ideas: 스튜디오 소재 목록 (도우인 소재 추천/직접 추가)
--    active: 목록에 노출 / hidden: "그만 보기" / used: 영상 제작에 사용됨
create table if not exists studio_ideas (
  id uuid primary key default gen_random_uuid(),
  coupang_product_id bigint unique, -- 쿠팡 productId (중복 추천 방지 키)
  product_name text not null,
  category text not null default '생활템',
  price_text text,
  image_url text,
  coupang_url text not null,
  douyin_keywords jsonb not null default '[]',
  reason text,
  status text not null default 'active' check (status in ('active', 'hidden', 'used')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table studio_ideas enable row level security;

drop trigger if exists trg_studio_ideas_updated_at on studio_ideas;
create trigger trg_studio_ideas_updated_at
  before update on studio_ideas
  for each row execute function set_updated_at();

-- 5. app_settings: 키-값 설정 저장소
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


-- ─────────────────────────────────────────────────────────────────────
-- 상품 출처 (쿠팡 / 알리익스프레스)
--
-- 영상 1개 = 상품 1개라는 구조는 그대로 두고, 그 상품이 어느 제휴처인지만
-- products 에 붙인다. 알리를 별도 테이블로 뺐다가 되돌린 이유는,
-- 영상에서 넘어온 방문자가 보는 건 히어로 카드 하나라서 "곁다리 목록"에는
-- 클릭이 생기지 않기 때문이다. 본류에 섞여야 의미가 있다.
-- ─────────────────────────────────────────────────────────────────────
alter table products add column if not exists source text not null default 'coupang';
alter table products drop constraint if exists products_source_check;
alter table products add constraint products_source_check
  check (source in ('coupang', 'aliexpress'));
-- 알리 제휴 링크 (승인 전이면 비어 있고 원본 상품 URL 로 나간다)
alter table products add column if not exists affiliate_url text;
-- 알리 상품에는 쿠팡 링크가 없다
alter table products alter column coupang_partner_url drop not null;
create index if not exists idx_products_source on products (source, status);
