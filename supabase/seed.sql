-- Seed branches. items + par_levels ให้ generate จาก src/lib/seed-data.ts
-- วิธี generate: `node scripts/gen-seed.mjs > supabase/seed-items.sql` แล้วรันไฟล์นั้น
-- (ไฟล์นี้ seed เฉพาะ branches; items/par มาจาก seed-data.ts = single source of truth)
insert into branches (id, name) values
  ('SND', 'SND'),
  ('NVP', 'NVP'),
  ('KCN', 'Kanchanapisek')
on conflict (id) do nothing;
