-- ประกาศพิเศษ (v1.6) — admin ตั้งข้อความแจ้งเตือนชั่วคราวต่อสาขา (เช่น รอบส่งของเลื่อนเพราะวันหยุด)
-- branch_id null = ทุกสาขา — ไม่ผูก FK เพราะต้องรองรับค่า null แทน "ALL"
create table if not exists branch_notices (
  id           bigint generated always as identity primary key,
  branch_id    text,
  message      text not null,
  created_by   text not null,
  created_at   timestamptz not null default now()
);
alter table branch_notices disable row level security;
