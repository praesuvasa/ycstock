-- เพิ่ม "Black Bag 24x28 / ถุงขยะ" ต่อจาก "Black Bag 30x40 / ถุงขยะ" (sort 88) — NVP สาขาเดียว Par=1 (แพรยืนยัน 2026-07-24)
update items set sort = sort + 1 where sort >= 89;

insert into items (id, name, category, unit, is_special, is_cup, has_remainder, grams_per_uom, sort, check_frequency, show_remainder, variable_yield)
values ('it-116', 'Black Bag 24x28 / ถุงขยะ', 'ของใช้', 'Roll', false, false, false, 0, 89, 'monThu', false, false);

insert into par_levels (item_id, branch_id, level) values
  ('it-116', 'SND', null),
  ('it-116', 'NVP', 1),
  ('it-116', 'KCN', null);
