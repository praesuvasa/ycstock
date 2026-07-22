-- หลักฐานยอดขาย (v1.7) — แนบรูปสลิป/สรุปยอด ให้ Claude vision อ่านยอด+ชื่อผู้รับ เทียบกับที่กรอก
-- QR/Grab/Lineman จับคู่ 1 วัน = 1 รูปตรงตัว (unique ต่อ branch+date+type, upsert เมื่ออัปโหลดซ้ำ)
create table if not exists sales_evidence (
  id               bigint generated always as identity primary key,
  branch_id        text not null references branches(id),
  date             date not null,
  evidence_type    text not null check (evidence_type in ('qr','grab','lineman')),
  image_path       text not null,
  entered_amount   numeric not null,
  ocr_amount       numeric,
  ocr_name_match   boolean,
  match_status     text not null default 'pending' check (match_status in ('ok','mismatch','unclear','pending')),
  uploaded_by      text not null,
  uploaded_by_user_id text not null,
  created_at       timestamptz not null default now(),
  unique (branch_id, date, evidence_type)
);
alter table sales_evidence enable row level security;

-- การโอนเงินสด (v1.7) — แยกจากยอดขายรายวัน เพราะพนักงานอาจรวมเงินสดหลายวันแล้วโอนทีเดียว
create table if not exists cash_remittances (
  id               bigint generated always as identity primary key,
  branch_id        text not null references branches(id),
  transferred_at   date not null,
  declared_amount  numeric not null,
  image_path       text not null,
  ocr_amount       numeric,
  ocr_name_match   boolean,
  match_status     text not null default 'pending' check (match_status in ('ok','mismatch','unclear','pending')),
  uploaded_by      text not null,
  uploaded_by_user_id text not null,
  created_at       timestamptz not null default now()
);
alter table cash_remittances enable row level security;

-- วันไหนของสาขาไหนถูกครอบคลุมโดยการโอนครั้งนี้แล้ว (กันเลือกวันซ้ำ/ลืมโอน)
create table if not exists cash_remittance_days (
  remittance_id    bigint not null references cash_remittances(id) on delete cascade,
  branch_id        text not null references branches(id),
  date             date not null,
  primary key (remittance_id, date)
);
create unique index if not exists cash_remittance_days_branch_date_uq on cash_remittance_days (branch_id, date);
alter table cash_remittance_days enable row level security;
