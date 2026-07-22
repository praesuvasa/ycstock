-- แพรเจอเคสที่ยอดตรงเป๊ะแต่ระบบขึ้น "ไม่ตรง" — สาเหตุจริงคือชื่อผู้รับเงินไม่ตรง ไม่ใช่ยอด
-- แต่ป้ายเดิมโชว์แค่ "(อ่านได้ ฿X)" ทำให้เข้าใจผิดว่ายอดผิด เพิ่มคอลัมน์เก็บสาเหตุจริงไว้โชว์ตรงๆ
alter table sales_evidence add column if not exists mismatch_note text;
alter table cash_remittances add column if not exists mismatch_note text;
