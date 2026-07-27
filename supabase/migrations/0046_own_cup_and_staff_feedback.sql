-- v1.18 · 2 เรื่องที่แพรขอ 2026-07-27

-- 1) ลูกค้าเอาแก้วมาเอง — POS ยังนับว่าขาย 1 แต่ถ้วยในร้านไม่ได้หายไป
--    ระบบเทียบ "ถ้วยที่หายจากสต็อก" กับ "จำนวนที่ขายจาก POS" จึงขึ้นว่าถ้วยขาดทั้งที่ไม่มีใครทำหาย
--    เก็บเป็นจำนวนต่อ (สาขา, วัน, ขนาดแก้ว) แล้วหักออกจากฝั่ง "ขายจริง" ตอนเทียบ
--    ** POS ไม่มีปุ่มแยกเคสนี้ (แพรยืนยัน) ** จึงต้องให้พนักงานกรอกเอง ดึงอัตโนมัติไม่ได้
alter table cup_reconcile add column if not exists own_cup numeric not null default 0;

-- 2) ช่องความคิดเห็น/ข้อเสนอแนะของพนักงาน
--    เจตนาของแพร: ให้พนักงานพูดได้ทุกเรื่องโดยไม่ต้องกังวล — ระบบ เพื่อนร่วมงาน ปัญหางาน
--    จึงต้องมีตัวเลือก "ไม่ระบุชื่อ" ให้จริง ไม่ใช่แค่เขียนว่าปลอดภัย
--    anonymous = true → ไม่เก็บ user_id/user_name เลย (ไม่ใช่แค่ซ่อนตอนแสดงผล)
--    เพราะถ้าเก็บไว้แล้วบอกว่าไม่ระบุชื่อ = หลอกกัน และวันหนึ่งจะมีคนเปิดดูได้
create table if not exists staff_feedback (
  id               bigint generated always as identity primary key,
  user_id          text,
  user_name        text,
  branch_id        text,
  anonymous        boolean not null default false,
  topic            text not null default 'other',
  message          text not null,
  wanted_action    text not null default '',   -- "อยากให้บริษัททำอะไรต่อ"
  seen_at          timestamptz,
  seen_by          text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_staff_feedback_created on staff_feedback (created_at desc);
alter table staff_feedback enable row level security;
