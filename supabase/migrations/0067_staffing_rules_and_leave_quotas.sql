-- v1.26 · กติกาจัดกะรายสาขา + สิทธิ์วันลา (แพรกำหนด 2026-07-30)
-- เก็บในฐานข้อมูลให้หน้าจัดตารางเช็คอัตโนมัติ ไม่ใช่ให้คนจำเอง
create table if not exists branch_staffing_rules (
  branch_id text primary key references branches(id),
  patterns text[] not null, min_staff int not null default 1, note text not null default ''
);
insert into branch_staffing_rules (branch_id, patterns, min_staff, note) values
  ('NVP', array['F+A','M+A+A','F+A+A'], 2, 'เปิดทุกวัน · ห้ามอยู่คนเดียว · senior ปรับตารางเองได้ถ้ายังเข้าเงื่อนไข'),
  ('SND', array['F','F+F','F+PT'], 1, 'ปิดอาทิตย์ · เสาร์/นักขัตฤกษ์เปิดครึ่งวัน 1 คน · ไม่มีหัวหน้า · FT ลาให้ PT เข้าแทน'),
  ('KCN', array['F'], 1, 'ดาวอยู่คนเดียวได้ · หยุดพุธ')
on conflict (branch_id) do update set patterns=excluded.patterns, min_staff=excluded.min_staff, note=excluded.note;

create table if not exists leave_quotas (
  code text primary key, label text not null, days_per_year numeric not null,
  requires_proof boolean not null default false, note text not null default ''
);
insert into leave_quotas (code, label, days_per_year, requires_proof, note) values
  ('SL','ลาป่วย',30,true,'ลาติดกัน 2 วันขึ้นไปต้องแนบหลักฐาน'),
  ('AL','ลาพักร้อน',6,false,'ตัดเป็นรอบปี'),
  ('PL','ลากิจ',3,false,'ตัดเป็นรอบปี'),
  ('LWP','ลาไม่รับค่าจ้าง',0,false,'ใช้เมื่อ AL/PL หมด — ลำดับตัด AL > PL > LWP')
on conflict (code) do update set label=excluded.label, days_per_year=excluded.days_per_year,
  requires_proof=excluded.requires_proof, note=excluded.note;
