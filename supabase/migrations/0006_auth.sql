-- Auth + RBAC + Audit (v1.2)
create table if not exists users (
  id            text primary key,
  name          text not null,
  role          text not null default 'user',       -- 'user' | 'admin'
  branch_scope  text not null default 'all',         -- 'all' | 'SND' | 'NVP'
  passcode_hash text not null,                        -- scrypt "salt:hash"
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text
);

create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  user_id    text,
  user_name  text,
  action     text not null,
  branch     text,
  date       text,
  entity     text,
  detail     text
);
create index if not exists idx_audit_ts on audit_log (ts desc);

alter table users     disable row level security;
alter table audit_log disable row level security;

-- seed admin คนแรก (แพร) · PIN เริ่มต้น = 2538 (⚠️ เปลี่ยนหลัง login ครั้งแรก)
insert into users (id, name, role, branch_scope, passcode_hash, active, created_by) values
  ('u-admin', 'แพร (Admin)', 'admin', 'all',
   'e5a917c2ddfbda72c4473e37bb1fc5b9:69412f814f7f4838e05f09fa2ba1e4cd02a51be249c2efc25f50f0289afb37f8',
   true, 'seed')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
