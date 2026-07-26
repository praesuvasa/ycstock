-- เคส "รับเงินไม่ตรงบิล" (แพรยืนยัน 2026-07-26) — เกิดกับ QR ↔ เงินสด เป็นหลัก
--
-- ปัญหาเดิม: POS บอกยอดตามบิล แต่เงินที่เข้าจริงต่างออกไป พนักงานเดาเองว่าจะกรอกตัวไหน
-- แต่ละคนกรอกไม่เหมือนกัน แล้วตอนอัปโหลดสลิปก็ขึ้นเตือน "ยอดไม่ตรง" ทั้งที่ไม่ได้ผิด
--
-- วิธีใหม่: กรอกยอดจาก POS ตามปกติเหมือนเดิม แล้วบันทึก "เคส" แยกต่างหาก
-- ระบบคำนวณยอดเงินเข้าจริงให้เอง (POS + ผลรวมการปรับ) → เอาไปเทียบสลิป
--
-- สูตรปรับยอด (diff = actual_amount − bill_amount):
--   over_no_change    โอนเกิน ไม่ได้ทอน  → QR +diff · เงินสดไม่เปลี่ยน · ส่วนเกินนับเป็นรายได้ร้าน
--   over_cash_change  โอนเกิน ทอนเป็นสด  → QR +diff · เงินสด −diff (ยอดรวมตรงบิล)
--   under_cash_topup  โอนขาด จ่ายสดเพิ่ม → QR +diff (diff ติดลบ) · เงินสด −diff (ยอดรวมตรงบิล)
create table if not exists sales_payment_incidents (
  id                  bigint generated always as identity primary key,
  branch_id           text not null references branches(id),
  date                date not null,
  kind                text not null check (kind in ('over_no_change', 'over_cash_change', 'under_cash_topup')),
  bill_amount         numeric not null default 0,   -- ยอดตามบิล/POS
  actual_amount       numeric not null default 0,   -- ยอดที่โอนเข้าจริง
  note                text not null default '',
  created_by_user_id  text,
  created_by_name     text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sales_incidents_branch_date on sales_payment_incidents (branch_id, date);
create index if not exists idx_sales_incidents_date on sales_payment_incidents (date desc);

alter table sales_payment_incidents enable row level security;
