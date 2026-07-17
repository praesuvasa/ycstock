-- เพิ่มไอเทมใหม่ "Cranberry Cookies" — หมวด Cereals หน่วย "กระปุก" เหมือน Choc Chip Cookies (ยังไม่ตั้ง Par)
insert into items (id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort) values
('it-113','Cranberry Cookies','Cereals','กระปุก',false,false,null,false,0,null,112)
on conflict (id) do nothing;

insert into par_levels (item_id,branch_id,level) values
('it-113','SND',null),
('it-113','NVP',null),
('it-113','KCN',null)
on conflict (item_id,branch_id) do nothing;

notify pgrst, 'reload schema';
