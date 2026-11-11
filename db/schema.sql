-- BEMESTATE. Supabase SQL Editor에 통째로 붙여넣고 실행.
-- 다시 실행해도 안전하다 (if not exists). 먼저 만든 표에는 새 칸만 더해진다.
-- BEMTRIP과 같은 프로젝트에 넣어도 된다 — 표 이름이 전부 estate_ 로 시작한다.
--
-- 모든 테이블은 RLS를 켜되 정책을 두지 않는다. 서버(service_role)만 읽고 쓴다.

-- 관심 하나 = 단지 × 평형 × 거래. id는 "zigbang-단지-평형-거래".
-- 단지와 평형은 직방의 번호로 잡고, 네이버 부동산은 단지 번호(naver_id)와 면적으로 맞춘다.
create table if not exists estate_watches (
  id            text primary key,
  source        text not null default 'zigbang',
  complex_id    text not null,
  complex_name  text not null default '',
  address       text not null default '',
  room_type_id  text not null,
  room_label    text not null default '',      -- "84㎡ · 25평"
  trade         text not null default 'trade', -- trade(매매) · charter(전세)
  ord           bigint not null default 0,
  created_at    timestamptz not null default now()
);

alter table estate_watches add column if not exists naver_id     text not null default '';  -- 네이버 단지 번호
alter table estate_watches add column if not exists supply_m2    numeric;                   -- 공급 면적
alter table estate_watches add column if not exists exclusive_m2 numeric;                   -- 전용 면적
alter table estate_watches add column if not exists lawd_cd      text not null default '';  -- 시군구 5자리 (실거래가 조회)
alter table estate_watches add column if not exists dong_name    text not null default '';  -- 법정동
alter table estate_watches add column if not exists jibun        text not null default '';  -- 지번
-- 실거래: [{ id, date:"2026-10-03", price, floor, canceled }] 최근 것이 앞
alter table estate_watches add column if not exists deals        jsonb not null default '[]'::jsonb;
alter table estate_watches add column if not exists deals_at     timestamptz;

-- 하루의 기록. slot은 한국 날짜 "2026-11-11". 가격은 전부 만원.
-- listings: [{ src, id, item, price, dong, floor, title, n }]
--   src = zigbang · naver,  n = 같은 집을 올린 중개사 수
-- sources: { zigbang: "ok"|"fail", naver: "ok"|"fail" } 그날 어느 출처가 받아졌는지
create table if not exists estate_snapshots (
  watch_id   text not null references estate_watches(id) on delete cascade,
  slot       text not null,
  taken_at   timestamptz not null default now(),
  count      integer not null default 0,
  min_price  integer,
  med_price  integer,
  max_price  integer,
  listings   jsonb not null default '[]'::jsonb,
  primary key (watch_id, slot)
);

alter table estate_snapshots add column if not exists sources jsonb not null default '{}'::jsonb;

-- 예전에는 하루 두 번(…T00 · …T12) 기록했다. 이제 낮 12시 한 번뿐이다:
-- 00시 기록은 지우고, 12시 기록은 그날의 기록("2026-11-11")으로 삼는다.
delete from estate_snapshots where slot like '%T00';
delete from estate_snapshots a
 where a.slot like '%T12'
   and exists (select 1 from estate_snapshots b where b.watch_id = a.watch_id and b.slot = left(a.slot, 10));
update estate_snapshots set slot = left(slot, 10) where slot like '%T12';

create index if not exists estate_snapshots_slot_idx on estate_snapshots(slot desc);

alter table estate_watches   enable row level security;
alter table estate_snapshots enable row level security;
