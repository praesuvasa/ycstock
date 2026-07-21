-- ผลผลิตไม่แน่นอน อาจได้ไม่เต็มแพ็ค (คนละเรื่องกับ show_remainder ที่มีอยู่แล้ว — นั่นคือ "เศษที่เปิดใช้แล้วเหลือ")
-- คุมว่ารายการไหนต้องมีช่อง "+g" ตอนกรอกจำนวนสั่ง/สั่งผลิต — เฉพาะ 6 รายการที่แพรยืนยัน ไม่ใช่ทุกรายการที่ show_remainder=true
alter table items add column if not exists variable_yield boolean not null default false;
update items set variable_yield = true
where name in ('Yuzu', 'Kyoho', 'Mint', 'Vanilla', 'Pineapple', 'Biscoff');
