-- BEMSTATE. Supabase SQL Editor에 통째로 붙여넣고 실행.
-- 다시 실행해도 안전하다 (if not exists). BEMTRIP과 같은 프로젝트에 넣어도 된다 —
-- members 표는 같이 쓰고, 나머지는 estate_ 로 시작한다.
--
-- 모든 테이블은 RLS를 켜되 정책을 두지 않는다. 서버(service_role)만 읽고 쓴다.

-- 로그인한 사람 (BEMTRIP과 같은 표)
create table if not exists members (
  kakao_id   text primary key,
  name       text        not null default '',
  avatar     text        not null default '',
  can_edit   boolean     not null default false,
  is_owner   boolean     not null default false,
  joined_at  timestamptz not null default now(),
  seen_at    timestamptz not null default now()
);

-- 관심 단지의 평형 하나. id는 "출처-단지-평형-거래" (예: zigbang-38487-161660-trade)
create table if not exists estate_watches (
  id            text primary key,
  source        text not null,                 -- zigbang
  complex_id    text not null,
  complex_name  text not null default '',
  address       text not null default '',
  room_type_id  text not null,
  room_label    text not null default '',      -- "84㎡ · 25평"
  trade         text not null default 'trade', -- trade(매매) · charter(전세)
  ord           bigint not null default 0,
  created_at    timestamptz not null default now()
);

-- 한 번의 기록. slot은 한국 시간의 반나절: "2026-11-11T00" · "2026-11-11T12"
-- 가격은 전부 만원. listings는 그때의 호가 목록:
--   [{ id, price, dong, floor, title, n }]   (n = 같은 집을 올린 중개사 수)
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

create index if not exists estate_snapshots_slot_idx on estate_snapshots(slot desc);

alter table members          enable row level security;
alter table estate_watches   enable row level security;
alter table estate_snapshots enable row level security;
