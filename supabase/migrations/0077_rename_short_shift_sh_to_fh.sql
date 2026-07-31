-- v1.28 · เปลี่ยนรหัสกะครึ่งวันของ SND จาก SH เป็น FH ให้ตรงกับไฟล์ Roster (แพรแก้ในไฟล์ 2026-07-31)
-- ทีมเขียน "FH" ในไฟล์แทนการใช้สีเหลืองแยกจาก F ส้ม — ระบบใช้รหัสเดียวกันจะได้ไม่ต้องแปลไปมา
update shift_definitions set code='FH' where code='SH';
update schedules set shift_code='FH', updated_at=now() where shift_code='SH';
update schedule_changes set from_shift='FH' where from_shift='SH';
update schedule_changes set to_shift='FH' where to_shift='SH';
