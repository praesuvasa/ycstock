# SA Design — ระบบจัดการสต็อก Yogurt Culture

> System design blueprint · ทีม Dev ยึดไฟล์นี้เป็นสัญญา (contract) · v1.0 · 2026-07-15
> คู่กับ [PRD.md](PRD.md) · visual: [SA_DESIGN.html](SA_DESIGN.html)

## 1. Tech Stack
- **Frontend + BFF:** Next.js 14 (App Router) · TypeScript · React 18
- **Styling:** Tailwind CSS — **glassmorphism** (frosted glass cards) · brand palette · Kanit
- **DB:** Supabase (Postgres) — เข้าถึงจาก BFF เท่านั้น (service role, server-side)
- **Deploy:** Vercel (app + BFF) · Supabase managed (DB)
- **Data store abstraction:** `lib/db.ts` สลับ **memory (default, seeded)** ↔ **supabase** ด้วย env `USE_SUPABASE=1` → preview/test รันได้โดยไม่ต้องต่อ DB จริง

## 2. Architecture (BFF)
```
[ Browser · React client components ]  ← mobile iPad/phone, glass UI
              │  fetch  /api/*   (เท่านั้น — client ไม่แตะ Supabase ตรง)
              ▼
[ BFF · Next.js Route Handlers  app/api/*/route.ts ]  ← validate + shape response ให้ตรง UI
              │  call
              ▼
[ lib/db.ts  (data-store facade) ]
        ├── store-memory.ts   (seeded, default)   ← dev/test/preview
        └── supabase.ts       (server client)     ← production (USE_SUPABASE=1)
              ▼
[ Supabase Postgres ]
```
**หลัก BFF:** ทุกหน้าเรียกเฉพาะ `/api/*` ที่ออกแบบมาเพื่อหน้านั้น ๆ (response พร้อมใช้ ไม่ต้อง join ฝั่ง client). Business logic อยู่ `lib/calc.ts` (pure) เรียกได้ทั้ง BFF และ UI (คำนวณสด).

## 3. Folder Structure
```
04_Operations/stock-app/
├── package.json · next.config.mjs · tsconfig.json · tailwind.config.ts
├── postcss.config.mjs · vercel.json · .env.example · README.md
├── supabase/migrations/0001_init.sql · supabase/seed.sql
└── src/
    ├── app/
    │   ├── layout.tsx · globals.css · page.tsx(M5)
    │   ├── stock/page.tsx(M1) · restock/page.tsx(M2)
    │   ├── sales/page.tsx(M3) · cups/page.tsx(M4)
    │   └── api/{stock,restock,sales,cups,dashboard,meta}/route.ts
    ├── lib/ types.ts · db.ts · supabase.ts · store-memory.ts
    │        seed-data.ts · calc.ts · fmt.ts
    └── components/ui/ (glass kit) + module bits
```

## 4. Data Model + ERD
```
branches(id PK, code, name)                         SND, NVP
items(id PK, name, category, unit, is_special,      114 รายการ
      is_cup, has_pack_remainder, sort)
par_levels(item_id FK, branch_id FK, level)         level NULL = "-" (ไม่ stock)
                                                     PK(item_id,branch_id)
stock_daily(id PK, date, branch_id FK, item_id FK,  1 แถว/วัน/สาขา/รายการ
      carry_pack, carry_g, in_pack, in_g,           KEY unique(date,branch_id,item_id)
      used, remain_pack, remain_g, returned, note, variance)
sales_daily(id PK, date, branch_id FK,              1 แถว/วัน/สาขา
      cash, qr, edc, grab, lineman)
cup_reconcile(id PK, date, branch_id FK, size,      size ∈ {P,S,BOWL,14OZ}
      start_qty, in_qty, remain_qty, sold_qty)      PK(date,branch_id,size)
```
**ความสัมพันธ์:** branch 1─N stock_daily/sales_daily/cup_reconcile · item 1─N par_levels/stock_daily · (item,branch) → par_level.
**special items (is_special=true):** Shake (แช่แข็ง), Wake up call (Banana), Energy Sip (Straw+Banana), Yellow Madness, Ready to Glow, R-ACAI Bowl, S-ACAI Cup (mini)
**cup items (is_cup=true):** Cup P (5oz)→P, Cup S (9oz)→S, Small Bowl→BOWL, Cup (14oz)→14OZ

## 5. lib API (สัญญาให้ Dev เรียก — อย่าเปลี่ยน signature)
`lib/types.ts` (สรุป):
```ts
type Branch = 'SND'|'NVP';
type Weekday = 'wed'|'sat';
type Item = { id:string; name:string; category:string; unit:string; isSpecial:boolean; isCup:boolean; hasRemainder:boolean; };
type StockRow = { itemId:string; carryPack:number; carryG:number; inPack:number; inG:number; used:number; remainPack:number; remainG:number; returned:number; note:string; variance:number; };
type SalesRow = { cash:number; qr:number; edc:number; grab:number; lineman:number; };
type CupRow = { size:'P'|'S'|'BOWL'|'14OZ'; start:number; in:number; remain:number; sold:number; };
```
`lib/calc.ts` (pure — คำนวณสด, ใช้ทั้ง BFF/UI):
```ts
remainPieces(carry,inQty,used): number            // carry+in-used (>=0)
remainGrams(carryG,inG,used): number              // MAX(carryG+inG-used,0)
variance(carry,inQty,used,returned,remain): number// carry+in-used-returned-remain
restockNeed(par,remain): number                   // MAX(par-remain,0), par null→null
isSpecialActive(branch,weekday): boolean          // SND+sat | NVP+wed
cupReconcile(rows:CupRow[]): {perSize:{size,used,sold,diff}[], totalUsed,totalSold,totalDiff, swapLikely:boolean}
```
`lib/db.ts` (async facade — memory หรือ supabase):
```ts
getMeta(): {branches:Branch[], items:Item[], par:Record<string,{SND:number|null,NVP:number|null}>}
getStock(branch,date): StockRow[]                 // เติม carry จากวันก่อนหน้าล่าสุดให้อัตโนมัติ
saveStock(branch,date,rows): {ok,updated,inserted}
getRestock(branch,weekday): {itemId,name,category,par,remain,need,isSpecial}[]  // กรอง special ตามวัน
getSales(branch,date): SalesRow
saveSales(branch,date,row): {ok}
getCups(branch,date): CupRow[]
saveCups(branch,date,rows): {ok}
getDashboard(date): {lowStock:{branch,item,remain,par}[], salesToday:{branch,total}[], varianceAlerts:{branch,count}[]}
```

## 6. BFF API Contracts (Route Handlers)
| Method · Route | Body / Query | Response |
|---|---|---|
| GET `/api/meta` | — | `{branches, items, par}` |
| GET `/api/stock?branch=NVP&date=2026-07-15` | — | `{rows: StockRow[]}` |
| POST `/api/stock` | `{branch,date,rows}` | `{ok,updated,inserted}` |
| GET `/api/restock?branch=NVP&day=wed` | — | `{rows:[...], specialActive}` |
| GET `/api/sales?branch=NVP&date=...` | — | `{row: SalesRow, inStore, delivery, total}` |
| POST `/api/sales` | `{branch,date,row}` | `{ok}` |
| GET `/api/cups?branch=NVP&date=...` | — | `{rows:CupRow[], summary}` |
| POST `/api/cups` | `{branch,date,rows}` | `{ok}` |
| GET `/api/dashboard?date=...` | — | `{lowStock, salesToday, varianceAlerts}` |

ทุก route: `try/catch` → error `{error}` + status 400/500 · validate branch/date.

## 7. Design System (glass) — ให้ Dev ใช้ให้เหมือนกัน
- **พื้นหลัง:** warm cream gradient + soft blobs (แดง/ฟ้า/ส้ม เบา ๆ)
- **Glass card:** `bg-white/60 backdrop-blur-xl border border-white/70 rounded-2xl shadow-[0_8px_32px_rgba(20,15,10,.08)]`
- **สีแบรนด์ (tailwind.config):** red #F2565C · blue #84D7FF · orange #FF8C33 · ink #2A2A2E · cream #FBF7F0
- **ฟอนต์:** Kanit (ผ่าน next/font หรือ link)
- **Components (components/ui):** `AppShell`, `TopBar`, `GlassCard`, `Segmented`, `Accordion`, `NumberField`, `PackRemainderField`, `Stat`, `Badge`, `Button`, `SaveBar`
- **Mobile-first:** ปุ่ม/ช่องแตะง่าย ≥40px · ช่องตัวเลข `inputMode="numeric"` · sticky SaveBar ล่างจอ · nav ล่าง (bottom tab) บนมือถือ

## 8. Deployment
1. สร้าง Supabase project → รัน `supabase/migrations/0001_init.sql` + `seed.sql`
2. ตั้ง env บน Vercel: `USE_SUPABASE=1`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. `vercel deploy` (หรือ push GitHub → Vercel auto)
4. ไม่ตั้ง env → รันบน memory store (seeded) ทันที — สำหรับ preview/demo/test

## 9. งานแบ่ง (Dev fan-out)
- **M0 Foundation** (SA/PM ทำเอง): scaffold + config + lib ทั้งหมด + UI kit + layout/nav + seed + supabase adapter
- **M1–M5** (spawn Dev agents, parallel): แต่ละ agent สร้าง `app/<route>/page.tsx` + `app/api/<name>/route.ts` ของ module ตัวเอง — เรียก lib/db + lib/calc + UI kit ที่ M0 วางไว้ · **ห้ามแก้ไฟล์ร่วม** (lib/*, components/ui/*, config)

---

## 10. Auth + RBAC + Audit (v1.2 — จาก PRD_AUTH_RBAC.md)

### สถาปัตยกรรม
```
[Login page] --PIN--> POST /api/login --verify hash--> เซ็ต signed session cookie (httpOnly)
[middleware.ts] ตรวจ session ทุก route (Edge, Web Crypto HMAC) → ไม่มี = redirect /login (page) / 401 (api)
                + coarse gate: User เข้าได้แค่ /stock,/sales ; admin-only path → redirect/403
[BFF /api/*] requireSession()/requireAdmin() + resolveBranch(scope) + assertCanEditDate() + writeAudit()
```

### Data (migration 0006_auth.sql)
- `users(id, name, role, branch_scope, passcode_hash, active, created_at, created_by)` · seed admin (แพร)
- `audit_log(id, ts, user_id, user_name, action, entity, entity_key, branch, date, detail jsonb)`
- disable RLS ทั้งสอง (BFF service role)

### lib contracts (ให้ Dev ยึด)
- `lib/session.ts` : `Session={userId,name,role,branchScope,exp}` · `signSession()/verifySession()` (Web Crypto HMAC, Edge+Node)
- `lib/auth.ts` (Node): `hashPasscode(pin)` / `verifyPasscode(pin,stored)` (node:crypto scrypt, salt:hash)
- `lib/authz.ts` : `getSession()/requireSession()/requireAdmin()` (อ่าน cookie via next/headers) · `resolveBranch(session,req)` · `assertCanEditDate(session,date)` (user ≤2 วัน) · `AuthError`(status)
- `lib/audit.ts` : `writeAudit(session, action, {branch,date,entity,detail})`
- `db` เพิ่ม: `getUserByPasscode` · `listUsers` · `createUser` · `updateUser` · `listAudit` · `writeAudit`

### RBAC map
| Role | หน้า/สิทธิ์ | สาขา | แก้ย้อนหลัง |
|---|---|---|---|
| **user** | `/stock`, `/sales` เท่านั้น | เฉพาะ branch_scope | ≤ 2 วัน |
| **admin** | ทุกหน้า + `/settings` `/users` `/audit` + แก้สต็อกทุกวัน | ทุกสาขา | ไม่จำกัด |

### Env
`SESSION_SECRET` (เซ็น cookie) — dev fallback มี default + warning · production ต้องตั้ง
