-- v1.26 · วันหยุดไทยไม่ได้เป็นครึ่งวันเสมอไป — ต้องถามแพรก่อนทุกครั้ง (แพรสั่ง 2026-07-30)
-- true = ครึ่งวัน · false = เต็มวัน · null = ยังไม่ได้ถาม ห้ามให้ระบบเดาเอง
alter table public_holidays add column if not exists snd_half_day boolean;
comment on column public_holidays.snd_half_day is
  'SND ครึ่งวันไหมในวันหยุดนี้ · null = ยังไม่ได้ถามแพร ห้ามให้ระบบเดาเอง';

update public_holidays set snd_half_day = true where holiday_type = 'company';
update public_holidays set snd_half_day = null,
       note = 'วันหยุดไทย ไม่อยู่ในรายการบริษัท — ยังไม่ได้ถามว่า SND ครึ่งวันไหม'
 where holiday_type = 'thai';

-- คืนวันที่ยังไม่ได้ถามกลับเป็นกะเต็ม (เสาร์ไม่เกี่ยว ครึ่งวันตามปกติอยู่แล้ว)
update schedules s set shift_code='F', updated_at=now()
  from public_holidays h
 where s.work_date=h.holiday_date and s.branch_id='SND' and s.shift_code='SH'
   and h.snd_half_day is null and extract(dow from s.work_date) <> 6;
