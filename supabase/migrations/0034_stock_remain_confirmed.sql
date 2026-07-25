-- v1.9.3: แยกสถานะ "พนักงานยืนยันคงเหลือแล้ว" ออกจาก "มีแถวบันทึกอยู่ใน stock_daily"
-- เดิม hasEntry (ฝั่ง client) อิงจากการมีแถวอยู่จริงเท่านั้น พอมี auto-fill จากยืนยันรับของ
-- (v1.9) เขียนแถวใหม่ให้อัตโนมัติ ทำให้ช่อง "คงเหลือ" โชว์เลขที่คำนวณไว้ล่วงหน้าทันที
-- (เหมือนยืนยันแล้ว) ทั้งที่พนักงานยังไม่ได้นับ/กรอกจริง
alter table stock_daily add column if not exists remain_confirmed boolean not null default false;

-- แถวเก่าส่วนใหญ่บันทึกผ่านหน้าสต็อกจริงมาก่อน (ยืนยันคงเหลือแล้ว) ตั้งเป็น true กันย้อนโชว์ว่างทั้งประวัติ
-- ยกเว้นแถวที่ยัง "เข้าข่าย auto-fill ล้วน ๆ ไม่เคยถูกแตะต่อ" (in_auto_pack ยังไม่ถูกล้าง + ไม่มี used/returned
-- + คงเหลือ = ยกมา+รับเข้าเป๊ะ ตรงสูตร auto-fill พอดี) ให้คงเป็น false ไว้ รอพนักงานยืนยันจริงตามที่ควรจะเป็น
update stock_daily
set remain_confirmed = true
where not (
  in_auto_pack is not null
  and used = 0
  and returned = 0
  and remain_pack = carry_pack + in_pack
  and remain_g = carry_g + in_g
);
