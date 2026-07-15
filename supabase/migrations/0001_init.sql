-- YC Stock — schema (Supabase / Postgres)
-- branch_id / item_id ใช้ค่า text (code / slug) เป็น PK เพื่อเลี่ยง join

create table if not exists branches (
  id   text primary key,          -- 'SND' | 'NVP'
  name text not null
);

create table if not exists items (
  id             text primary key,   -- 'it-001'
  name           text not null,
  category       text not null,
  unit           text not null,
  is_special     boolean not null default false,
  is_cup         boolean not null default false,
  cup_size       text,               -- 'P'|'S'|'BOWL'|'14OZ'
  has_remainder  boolean not null default false,  -- true = ขายแบบแกะ (นับเศษ g)
  grams_per_uom  numeric not null default 0,      -- กรัม/แพ็ค (แกะ) หรือ กรัม/กล่อง (กลุ่มเศษรวม)
  remainder_group text,                            -- กลุ่มเศษรวม (Strawberry/Blueberry)
  sort           int not null default 0
);

create table if not exists par_levels (
  item_id   text not null references items(id) on delete cascade,
  branch_id text not null references branches(id) on delete cascade,
  level     int,                     -- null = '-' (ไม่ stock)
  primary key (item_id, branch_id)
);

create table if not exists stock_daily (
  id          bigint generated always as identity primary key,
  date        date not null,
  branch_id   text not null references branches(id),
  item_id     text not null references items(id),
  carry_pack  numeric not null default 0,
  carry_g     numeric not null default 0,
  in_pack     numeric not null default 0,
  in_g        numeric not null default 0,
  used        numeric not null default 0,
  remain_pack numeric not null default 0,
  remain_g    numeric not null default 0,
  returned    numeric not null default 0,
  note        text default '',
  variance    numeric not null default 0,
  unique (date, branch_id, item_id)
);
create index if not exists idx_stock_branch_item_date on stock_daily (branch_id, item_id, date);

create table if not exists sales_daily (
  id        bigint generated always as identity primary key,
  date      date not null,
  branch_id text not null references branches(id),
  cash      numeric not null default 0,
  qr        numeric not null default 0,
  edc       numeric not null default 0,
  grab      numeric not null default 0,
  lineman   numeric not null default 0,
  unique (date, branch_id)
);

create table if not exists cup_reconcile (
  id         bigint generated always as identity primary key,
  date       date not null,
  branch_id  text not null references branches(id),
  size       text not null,          -- 'P'|'S'|'BOWL'|'14OZ'
  start_qty  numeric not null default 0,
  in_qty     numeric not null default 0,
  remain_qty numeric not null default 0,
  sold_qty   numeric not null default 0,
  unique (date, branch_id, size)
);

-- ปิด RLS: แอปเข้าถึงผ่าน BFF (server) ด้วย service role เท่านั้น client ไม่แตะ DB ตรง
alter table branches      disable row level security;
alter table items         disable row level security;
alter table par_levels    disable row level security;
alter table stock_daily   disable row level security;
alter table sales_daily   disable row level security;
alter table cup_reconcile disable row level security;
