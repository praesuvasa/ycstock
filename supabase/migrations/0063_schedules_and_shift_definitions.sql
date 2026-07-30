-- v1.26 · ตารางกะ + นิยามกะ (จากไฟล์ BQMP_Schedule_Jul-Aug2569.xlsx ที่แพรส่งมา 2026-07-30)
-- ดูเนื้อหาเต็มที่รันไปแล้วใน Supabase — ไฟล์นี้เก็บไว้ให้ประวัติครบ
-- เก็บ employee_name เป็นข้อความด้วย เพราะยังไม่ได้สร้างบัญชีพนักงาน (ผูก user_id ทีหลังได้)
create table if not exists shift_definitions (
  code text not null, branch_id text not null, label text not null,
  start_time time, end_time time, hours numeric not null default 0,
  ot_after time, ot_min_minutes int not null default 0, note text not null default '',
  primary key (code, branch_id)
);
create table if not exists schedules (
  id bigserial primary key,
  branch_id text not null references branches(id),
  work_date date not null,
  employee_name text not null,
  user_id text references users(id),
  shift_code text not null,
  pt_hours numeric,
  note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_date, employee_name)
);
create index if not exists idx_schedules_branch_date on schedules (branch_id, work_date);
-- ประวัติการสลับกะ — ตารางนี้มีผลต่อเงินเดือน ต้องรู้ว่าใครเปลี่ยนและทำไม
create table if not exists schedule_changes (
  id bigserial primary key,
  schedule_id bigint not null references schedules(id) on delete cascade,
  from_shift text, to_shift text not null, reason text not null,
  changed_by text not null, changed_at timestamptz not null default now()
);
