-- v1.26 · senior staff + แยกวันหยุดไทยออกจากวันหยุดบริษัท (แพรระบุ 2026-07-30)
alter table users add column if not exists is_senior boolean not null default false;
comment on column users.is_senior is 'senior staff — แก้ตารางกะของสาขาตัวเองได้ (ทุกการแก้แจ้งแอดมิน)';

-- วันหยุดไทยบางวันไม่อยู่ในรายการบริษัท แต่สินธรยังเป็นกะครึ่งวัน เข้าคนเดียวได้
-- company = ได้วันหยุดเพิ่มในเดือนนั้น · thai = ไม่ได้วันหยุดเพิ่ม แต่มีผลกับเวลาเปิดของ SND
alter table public_holidays add column if not exists holiday_type text not null default 'company';
alter table public_holidays drop constraint if exists public_holidays_type_check;
alter table public_holidays add constraint public_holidays_type_check check (holiday_type in ('company','thai'));

insert into public_holidays (holiday_date, name, store_closed, holiday_type, note) values
  ('2026-07-30','วันเข้าพรรษา', false, 'thai', 'วันหยุดไทย ไม่อยู่ในรายการบริษัท — SND ครึ่งวัน 1 คน · รอยืนยัน'),
  ('2026-08-12','วันแม่แห่งชาติ', false, 'thai', 'วันหยุดไทย ไม่อยู่ในรายการบริษัท — SND ครึ่งวัน 1 คน · รอยืนยัน')
on conflict (holiday_date) do nothing;

update schedules s set shift_code='SH', updated_at=now()
  from public_holidays h
 where s.work_date=h.holiday_date and s.branch_id='SND' and s.shift_code='F';

update shift_definitions set note = note || ' · ระวัง: รหัส F ใช้ทุกสาขาแต่เวลาเลิกไม่เท่ากัน ต้องอ่านนิยามของสาขานั้นเสมอ'
 where code='F';
