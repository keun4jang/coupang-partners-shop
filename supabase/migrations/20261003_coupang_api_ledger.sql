-- ─────────────────────────────────────────────────────────────────────
-- 쿠팡 API 호출 장부 (최근 60분 합계 상한)
--
-- 적용 방법: Supabase SQL Editor 에 이 파일 내용을 붙여넣어 실행한다.
-- 성격: additive 전용. 기존 테이블/컬럼/데이터를 지우지 않는다.
--
-- 배경 (2026-10-02 전략 재점검): 쿠팡 API 시간당 한도 위반이 이미 3회 중 2회다
--   (커밋 e1a165e·a9f0856). 3번째는 파트너스 이용 제한이고 되돌릴 수 없다.
--   위반은 403 이 오기 "전에" 한도를 처음 넘는 호출에서 기록되므로, 오류를 보고
--   멈추는 건 늦다. 그래서 모든 쿠팡 호출(src/lib/coupang.ts request())이 호출
--   직전에 이 장부에서 "자리"를 받아야 한다. 최근 60분 합계가 상한(코드에서 35)을
--   넘으면 자리를 주지 않는다. 장부를 못 쓰면 코드는 호출하지 않는다(안전한 쪽).
--   정각 단위가 아니라 "최근 60분"으로 세는 이유: 쿠팡 한도가 어느 쪽인지 모르고,
--   정각 단위로 세면 정각을 사이에 둔 60분 안에 두 배까지 부를 수 있다.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists coupang_api_calls (
  id bigserial primary key,
  called_at timestamptz not null default now(),
  source text,
  path text
);
create index if not exists coupang_api_calls_called_at_idx on coupang_api_calls (called_at);

-- 자리 받기: 상한 이내면 기록하고 "이번 호출 포함 최근 60분 합계"를 돌려준다.
-- 상한이면 기록하지 않고 -1. 여러 실행 환경(Vercel·GitHub Actions)이 동시에
-- 불러도 세는 순간과 기록 사이에 끼어들지 못하게 트랜잭션 잠금을 건다.
create or replace function coupang_api_acquire(p_cap int, p_source text, p_path text)
returns int
language plpgsql
security definer
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(731100);
  select count(*) into n from coupang_api_calls where called_at > now() - interval '60 minutes';
  if n >= p_cap then
    return -1;
  end if;
  insert into coupang_api_calls (source, path) values (left(p_source, 60), left(p_path, 120));
  delete from coupang_api_calls where called_at < now() - interval '3 days';
  return n + 1;
end;
$$;

-- 리포트용: 최근 60분 합계와 지난 3일 중 60분 창 최대치를 본다.
create or replace function coupang_api_recent_count()
returns int
language sql
stable
as $$
  select count(*)::int from coupang_api_calls where called_at > now() - interval '60 minutes';
$$;
