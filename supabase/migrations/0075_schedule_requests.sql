-- v1.27 · คำขอเปลี่ยนตาราง (ขอลา / ขอสลับวันหยุด) — ขั้นที่ 2 ของเมนูตารางงาน
-- ขอ AL/PL/SL → มีผลทันทีถ้ายังมีวันเหลือ (สถานะ auto) · ขอสลับ → รออนุมัติ (pending)
-- ทุกกรณีเข้าคิวแจ้งแอดมินตามกติกาที่แพรกำหนด
create table if not exists schedule_requests (
  id bigserial primary key,
  branch_id text not null references branches(id),
  work_date date not null,
  employee_name text not null,
  requested_by text not null,
  kind text not null check (kind in ('leave','swap')),
  leave_code text, swap_with text, from_shift text,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','auto')),
  decided_by text, decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_schedule_requests_open on schedule_requests (branch_id, status, work_date);
