-- v1.26 · แก้เวลากะ NVP ตาม Roster2026.xlsx (ตารางที่ใช้งานจริง — แพรส่งมา 2026-07-30)
-- ไฟล์ BQMP_Schedule เขียนไว้คนละชุด: F 09:00-19:00 · M 09:00-14:00 · A 14:00-19:00 (ไม่ตรงของจริง)
update shift_definitions set start_time='09:00', end_time='21:30', hours=12.5,
       note='เต็มวัน 09:00-21:30 ตาม Roster2026 · ร้านเปิด 10:00-20:30 · OT ไม่จ่ายอัตโนมัติ · ระวัง: รหัส F ใช้ทุกสาขาแต่เวลาเลิกไม่เท่ากัน'
 where code='F' and branch_id='NVP';
update shift_definitions set start_time='09:00', end_time='19:00', hours=10, note='กะเช้า 09:00-19:00 ตาม Roster2026'
 where code='M' and branch_id='NVP';
update shift_definitions set start_time='11:30', end_time='21:30', hours=10, note='กะบ่าย 11:30-21:30 ตาม Roster2026'
 where code='A' and branch_id='NVP';
