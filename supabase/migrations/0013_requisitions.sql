-- ขอเบิกสินค้า (v1.3) — พนักงานสาขาขอของเกิน Par หรือของนอกลิสต์ ไม่มีสถานะติดตาม แค่ log ให้ restock/admin กวาดดู
create table if not exists requisitions (
  id                   bigint generated always as identity primary key,
  branch_id            text not null references branches(id),
  item_id              text references items(id),
  item_name            text not null,
  qty                  numeric not null,
  unit                 text,
  note                 text,
  requested_by         text not null,
  requested_by_user_id text not null,
  created_at           timestamptz not null default now()
);
alter table requisitions disable row level security;
