-- v1.26 · แก้เวลากะ SND ตามที่แพรยืนยัน 2026-07-30
-- ไฟล์ Excel เขียน 10:00–18:00 (8 ชม.) แต่ของจริงคือ 08:00–18:00 (10 ชม.)
-- และมีกะสั้น เสาร์ + วันหยุดนักขัตฤกษ์ 09:00–15:00 (6 ชม.) ซึ่งไฟล์ไม่ได้แยกไว้
update shift_definitions
   set start_time='08:00', end_time='18:00', hours=10,
       note='SND วันธรรมดา 08:00–18:00 — OT นับถ้าเกิน 15 นาทีหลัง 18:00 (แพรยืนยัน 2026-07-30)'
 where code='F' and branch_id='SND';

insert into shift_definitions (code, branch_id, label, start_time, end_time, hours, ot_after, ot_min_minutes, note)
values ('SH','SND','เสาร์/นักขัตฤกษ์','09:00','15:00',6,'15:00',15,
        'เสาร์และวันหยุดนักขัตฤกษ์ · OT นับถ้าเกิน 15 นาทีหลัง 15:00 (ตั้งตามหลักเดียวกับวันธรรมดา รอยืนยัน)')
on conflict (code, branch_id) do update
  set start_time=excluded.start_time, end_time=excluded.end_time, hours=excluded.hours,
      ot_after=excluded.ot_after, ot_min_minutes=excluded.ot_min_minutes, note=excluded.note;

-- เสาร์ที่ SND เปิดในรอบนี้ (1 และ 15 ส.ค.) เปลี่ยนจากกะเต็มเป็นกะสั้น
update schedules set shift_code='SH', updated_at=now()
 where branch_id='SND' and shift_code='F' and extract(dow from work_date)=6;
