-- v1.26 · วันหยุดประจำตัวของแต่ละคน (ฐานสร้างตารางเดือนถัดไป)
-- ** 2 หน้าต่างเวลาที่ต่างกัน ** จัดตาราง = เต็มเดือนปฏิทิน · คิดเงินเดือน = รอบ 26–25
create table if not exists staff_defaults (
  employee_name text primary key,
  branch_id text not null references branches(id),
  weekly_off_dow int,                              -- 0=อา ... 6=ส · null = ไม่มีวันหยุดตายตัว (PT)
  default_shift text not null default 'F',
  alternating_sat boolean not null default false,  -- เสาร์เว้นเสาร์
  is_pt boolean not null default false,
  note text not null default ''
);
insert into staff_defaults (employee_name, branch_id, weekly_off_dow, default_shift, alternating_sat, is_pt, note) values
  ('กิ๊ก Kukkik','NVP',2,'F',false,false,'senior staff — แก้ตารางสาขาตัวเองได้ · หยุดอังคาร'),
  ('หนูนา Rattana','NVP',4,'F',false,false,'หยุดพฤหัส'),
  ('ฝ้าย Kanokorn','NVP',3,'F',false,false,'หยุดพุธ'),
  ('แยม Kamonnet','SND',0,'F',true,false,'อาทิตย์ร้านปิด · เสาร์เว้นเสาร์ (เสาร์ที่เข้า = กะสั้น)'),
  ('Prince','SND',null,'PT',false,true,'PT เข้าไม่เป็นเวลา — จ่ายตามเวลาที่สแกนจริง'),
  ('ดาว','KCN',3,'F',false,false,'หยุดพุธ · อยู่คนเดียวได้')
on conflict (employee_name) do update set branch_id=excluded.branch_id, weekly_off_dow=excluded.weekly_off_dow,
  default_shift=excluded.default_shift, alternating_sat=excluded.alternating_sat, is_pt=excluded.is_pt, note=excluded.note;
