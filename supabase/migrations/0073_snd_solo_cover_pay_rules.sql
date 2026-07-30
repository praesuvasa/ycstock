-- v1.26 · ค่าตอบแทนกรณีแยมอยู่คนเดียวที่ SND (แพรระบุ 2026-07-30)
-- ** คิดจากเวลาสแกนจริง (TA) เป็นหลัก ไม่ใช่จากตาราง ** เพราะเคสนี้เกิดตอน Prince ลงตารางไว้แต่ไม่มา
create table if not exists pay_adjustment_rules (
  key text primary key, value numeric not null, unit text not null, scope text not null, note text not null default ''
);
insert into pay_adjustment_rules (key, value, unit, scope, note) values
  ('snd_solo_cover_rate', 50, 'บาท/ชั่วโมง', 'SND · แยม',
   'ช่วง จ–ศ 11:00–13:00 ที่ Prince ลงตารางไว้แต่ยังไม่มา แยมอยู่คนเดียว → จ่ายตามเวลาที่ครอบจริง คิดเศษเป็นนาที'),
  ('snd_solo_all_day_bonus', 200, 'บาท/วัน', 'SND · แยม',
   'แยมอยู่คนเดียวทั้งวัน (Prince ไม่มาเลย) → เหมา 200 บาท · ยึดเวลาสแกนจริงเป็นหลัก'),
  ('pt_rate_per_hour', 50, 'บาท/ชั่วโมง', 'SND · Prince (PT)',
   'จ่ายตามเวลาสแกนจริง คิดเศษเป็นนาที · ตาราง F ของ PT = วันที่นัดให้มา ไม่ใช่ฐานคำนวณเงิน')
on conflict (key) do update set value=excluded.value, unit=excluded.unit, scope=excluded.scope, note=excluded.note;

-- แพรยืนยันเพิ่ม 2026-07-30: 2 กฎนี้ไม่บวกกัน (มาสาย = รายชั่วโมง · ไม่มาเลย = เหมา 200)
-- และไม่ใช้กับเสาร์/วันหยุดที่ SND ครึ่งวันเข้าคนเดียวตามปกติอยู่แล้ว
update pay_adjustment_rules set note = note || ' · ไม่บวกกับกฎเหมา 200 · ไม่ใช้กับเสาร์/วันหยุดที่เข้าคนเดียวอยู่แล้ว'
 where key='snd_solo_cover_rate';
update pay_adjustment_rules set note = note || ' · ใช้แทนกฎรายชั่วโมง ไม่บวกกัน · ไม่ใช้กับเสาร์/วันหยุด'
 where key='snd_solo_all_day_bonus';

-- แพรเพิ่ม 2026-07-30: PT อยู่คนเดียวและทำครบ 10 ชม. (เต็มกะ 08:00–18:00) → เพิ่ม 100 บาท
-- เป็นเงินเพิ่มจากค่าจ้างรายชั่วโมง ไม่ใช่แทนกัน · ยึดเวลาสแกนจริง
insert into pay_adjustment_rules (key, value, unit, scope, note) values
  ('snd_pt_solo_full_day_bonus', 100, 'บาท/วัน', 'SND · Prince (PT)',
   'PT อยู่คนเดียวและทำครบ 10 ชม. → เพิ่ม 100 บาท · เพิ่มจากค่าจ้างรายชั่วโมง 50 บาท/ชม. ไม่ใช่แทนกัน · ยึดเวลาสแกนจริง')
on conflict (key) do update set value=excluded.value, unit=excluded.unit, scope=excluded.scope, note=excluded.note;
