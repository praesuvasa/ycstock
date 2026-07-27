-- ค่าตั้งต้นระบบวันหมดอายุ ตามตารางที่แพรกรอกมา (2026-07-27)
-- เพิ่ม 2 เรื่องที่รอบแรกยังไม่มี: (1) ล็อกปลายทางรายตัว (2) แกะแล้วแปลงเข้ารายการอื่น

-- 1) ล็อกปลายทางรายตัว — บางตัวส่งคืนอย่างเดียว บางตัวแกะได้อย่างเดียว
--    หน้าตรวจจะโชว์เฉพาะปุ่มที่อนุญาต พนักงานจึงเลือกผิดไม่ได้ตั้งแต่แรก
alter table items add column if not exists expiry_allow_sell_front boolean not null default true;
alter table items add column if not exists expiry_allow_return     boolean not null default true;

-- 2) แกะแล้วไม่ได้ขายเป็นตัวมันเอง แต่ไปรวมกับอีกรายการ (เช่น Greek Yogurt 500g → ตักจาก Greek Yogurt 1kg)
--    expiry_convert_g = กรัมที่เข้าไปเพิ่มให้ปลายทาง ต่อ 1 หน่วยต้นทาง
--    ระบบทดเป็นแพ็ค+เศษให้เองจาก grams_per_uom ของปลายทาง (500g × 2 = 1000g = 1 แพ็ค 1kg)
alter table items add column if not exists expiry_convert_to_item_id text references items(id);
alter table items add column if not exists expiry_convert_g          numeric;

-- 3) ปลายทางที่ 3: convert (แกะไปรวมกับรายการอื่น) — ต้นทางลง used ปลายทางลง in
alter table expiry_checks drop constraint if exists expiry_checks_disposition_check;
alter table expiry_checks add constraint expiry_checks_disposition_check
  check (disposition in ('sell_front', 'return', 'convert'));

-- 4) คอลัมน์ติดตามฝั่งปลายทาง — แพทเทิร์นเดียวกับ expiry_returned/expiry_used
--    เพื่อให้บันทึกผลตรวจซ้ำได้โดยไม่บวกทบ และไม่ทับยอดรับเข้าที่มาจากรถส่งของจริง
--    เก็บเป็น "กรัมรวม" ค่าเดียว ไม่แยกแพ็ค/เศษ เพราะตอนเขียนกลับต้องทดแพ็คใหม่ทั้งก้อนอยู่ดี
--    (base = in_pack×gpu + in_g − expiry_in_g → บวกของใหม่ → ทดเป็นแพ็ค+เศษ) ถ้าแยก 2 คอลัมน์
--    ตัวทดจะย้ายข้ามคอลัมน์แล้วถอนของเก่าไม่ตรง
alter table stock_daily add column if not exists expiry_in_g numeric not null default 0;

-- 5) จำนวนวันเตือนตามที่แพรกรอก
--    หมายเหตุ: ฝั่งโค้ดจะยกขั้นต่ำให้เท่ากับ "ระยะถึงรอบตรวจถัดไป" เสมอ
--    (อังคาร→ศุกร์ = 3 วัน · ศุกร์→อังคาร = 4 วัน) ไม่งั้นของที่หมดอายุระหว่างรอบจะหลุด
update items set expiry_warn_days = 3
where id in ('it-010','it-011','it-020','it-021','it-022','it-023','it-024','it-025');
update items set expiry_warn_days = 10
where id in ('it-026','it-027','it-028','it-113');

-- 6) ปลายทางที่อนุญาต
--    Yogurt 500g — แกะไปรวมกับตัว 1kg ได้ และส่งคืนได้ด้วย
--    (แพรแก้ 2026-07-27: เดิมตั้งไว้แกะอย่างเดียว แต่มีเคสเหลือเยอะเกินกว่าหน้าร้านจะขายทัน)
update items set expiry_allow_sell_front = true, expiry_allow_return = true
where id in ('it-010','it-011');
--    โยเกิร์ตถุง + Cornflakes + คุกกี้ 2 ตัว — ส่งคืนอย่างเดียว
update items set expiry_allow_sell_front = false, expiry_allow_return = true
where id in ('it-020','it-021','it-022','it-023','it-024','it-025','it-026','it-028','it-113');
--    Granola (M) — ได้ทั้งแกะไปรวมกับ Granola (Topping) และส่งคืน
update items set expiry_allow_sell_front = true, expiry_allow_return = true
where id = 'it-027';

-- 7) กฎการแปลง (grams_per_uom ปลายทาง: it-001/it-009 = 1000g · it-033 = 2000g)
update items set expiry_convert_to_item_id = 'it-001', expiry_convert_g = 500 where id = 'it-010';
update items set expiry_convert_to_item_id = 'it-009', expiry_convert_g = 500 where id = 'it-011';
-- Granola (M) 1 กระปุก = 250g (แพรยืนยัน 2026-07-27) → แกะ 8 กระปุก = 1 แพ็ค Granola (Topping) 2,000g
update items set expiry_convert_to_item_id = 'it-033', expiry_convert_g = 250 where id = 'it-027';
