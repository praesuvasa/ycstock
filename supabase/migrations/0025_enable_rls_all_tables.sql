-- ปิดช่องโหว่ที่ Supabase แจ้งเตือน (2026-07-22) — เปิด RLS ทั้ง 13 ตาราง ไม่ใส่ policy
-- เพราะแอปนี้เข้าถึง Supabase จาก server เท่านั้น (service_role key, bypass RLS อยู่แล้ว)
-- ไม่เคยเรียกจาก browser/anon key เลย — เปิด RLS แบบไม่มี policy = ปิดกั้น anon/authenticated
-- ทั้งหมด (default-deny) โดยไม่กระทบการทำงานของแอปแม้แต่น้อย
alter table public.branches enable row level security;
alter table public.items enable row level security;
alter table public.par_levels enable row level security;
alter table public.stock_daily enable row level security;
alter table public.sales_daily enable row level security;
alter table public.cup_reconcile enable row level security;
alter table public.users enable row level security;
alter table public.audit_log enable row level security;
alter table public.requisitions enable row level security;
alter table public.restock_selections enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_items enable row level security;
alter table public.branch_notices enable row level security;
