-- สิทธิ์ซื้อของในร้านของพนักงาน (v1.13) — แพรกำหนดสเปก 2026-07-27
--
-- กติกา: วงเงินส่วนลด 400 บาท/คน/เดือน คิดที่ราคาขายหน้าร้านเต็ม · ไม่ทบ รีเซ็ตทุกวันที่ 1
-- แบ่งใช้หลายบิลได้ ตัดทีละนิด (เหลือ 50 ซื้อ 200 → ลด 50 จ่ายเอง 150 → สิทธิ์เหลือ 0)
-- ใช้ครบแล้ว ซื้อได้ในราคาลด 30% แต่ "ไม่ต้องบันทึกเข้าระบบ" เพราะไม่ได้ตัดสิทธิ์
-- (สำคัญ: ถ้าเผลอถ่ายบิลลด 30% เข้ามา จะไปตัดสิทธิ์ผิด → ฝั่งหน้าจอปิดปุ่มเมื่อสิทธิ์เหลือ 0)

-- 1) เปิดสิทธิ์รายคน — default false เพราะพนักงานบางคนยังไม่ได้รับสิทธิ์
--    คนที่ยังไม่เปิดจะไม่เห็นเมนูนี้เลย (ไม่ใช่เห็นแล้วกดไม่ได้) กันคำถาม "ทำไมหนูไม่มี"
--    allowance_monthly แยกรายคนเผื่ออนาคตให้ระดับหัวหน้ามากกว่า 400 โดยไม่ต้องแก้โค้ด
alter table users add column if not exists allowance_enabled boolean not null default false;
alter table users add column if not exists allowance_monthly numeric not null default 400;

-- 2) ประวัติการใช้สิทธิ์ — 1 แถว = 1 บิล
--    เก็บ 3 ตัวเลขจากบิล (เต็ม/ส่วนลด/จ่ายจริง) เพื่อให้ระบบเช็คเองได้ว่า เต็ม − ส่วนลด = จ่ายจริง
--    ยอดที่ตัดสิทธิ์คือ discount_amount เท่านั้น
create table if not exists staff_allowance_uses (
  id               bigint generated always as identity primary key,
  user_id          text not null references users(id),
  branch_id        text references branches(id),
  use_date         date not null,
  bill_total       numeric not null default 0,
  discount_amount  numeric not null default 0,   -- ยอดที่ตัดจากสิทธิ์
  paid_amount      numeric not null default 0,
  image_path       text,                          -- รูปบิล (bucket sales-evidence, prefix allowance/)
  ocr_discount     numeric,                       -- ยอดที่ OCR อ่านได้ (เฟส 2) — ต่างจากที่กรอก = ต้องตรวจ
  -- เข้าคิวตรวจเมื่อ: ส่วนลดเกินสิทธิ์ที่เหลือ · ตัวเลข 3 ตัวไม่สัมพันธ์กัน · OCR อ่านได้ไม่ตรงที่กรอก
  -- ไม่บล็อกการบันทึก เพราะของออกจากร้านไปแล้ว ปฏิเสธไม่ให้บันทึก = ซ่อนปัญหา
  needs_review     boolean not null default false,
  review_note      text not null default '',
  reviewed_at      timestamptz,
  reviewed_by      text,
  note             text not null default '',
  created_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_allowance_user_date on staff_allowance_uses (user_id, use_date desc);
create index if not exists idx_allowance_date on staff_allowance_uses (use_date desc);
alter table staff_allowance_uses enable row level security;

-- 3) เฟสแรกเปิดให้แอดมินทดสอบคนเดียวก่อน (แพรยืนยัน — ยังไม่เริ่มให้พนักงานใช้)
update users set allowance_enabled = true where id = 'u-admin';
