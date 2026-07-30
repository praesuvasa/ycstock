-- v1.26 · วันหยุดนักขัตฤกษ์ = ร้านเปิด · SND ใช้กะสั้น 09:00–15:00 (แพรยืนยัน 2026-07-30)
update public_holidays set store_closed = false where store_closed is null;
update schedules s set shift_code='SH', updated_at=now()
  from public_holidays h
 where s.work_date=h.holiday_date and s.branch_id='SND' and s.shift_code='F';

-- นโยบาย OT: ไม่จ่ายอัตโนมัติ จ่ายเฉพาะเคสพิเศษที่สั่งให้ทำ
-- ot_after/ot_min_minutes = เกณฑ์ "เลยเวลากะไปเท่าไหร่" ไว้แสดงผล/ตรวจสอบ ไม่ใช่สัญญาณให้จ่ายเงิน
update shift_definitions set note = note || ' · OT ไม่จ่ายอัตโนมัติ จ่ายเฉพาะเคสที่อนุมัติให้ทำ'
 where ot_after is not null;
