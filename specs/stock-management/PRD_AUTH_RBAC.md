# PRD — Auth + สิทธิ์ (RBAC) + Audit Log · YC Stock

> Feature PRD (ต่อยอดจาก [PRD.md](PRD.md) v1.1) · แอป: `04_Operations/stock-app/` · 📅 2026-07-15
> **สถานะ:** Draft — รอแพร review ก่อนสร้าง
> **เคาะแล้ว:** login = **รหัสต่อคน (PIN เฉพาะ)** · Stock Master = **ข้อมูลหลัก+Par+config และ override ยอดคงเหลือ**

---

## 1. Problem Statement
ตอนนี้ YC Stock **ไม่มีระบบล็อกอิน** — ใครมี URL ก็เข้ากรอก/แก้ข้อมูลได้ทุกหน้า ทุกสาขา และ**ไม่รู้ว่าใครแก้อะไร**. เมื่อร้านให้พนักงานหลายคน/หลายสาขาใช้จริง จึงเสี่ยงต่อการแก้ผิด, แก้ย้อนหลังมั่ว, เห็นข้อมูลสาขาอื่นที่ไม่เกี่ยวข้อง, และตรวจสอบย้อนกลับไม่ได้เวลามีตัวเลขผิด.

## 2. Goals (วัดผลได้)
1. ทุกการเข้าใช้ต้อง **ล็อกอินด้วยรหัสส่วนตัว** — 0 หน้าเปิดได้โดยไม่ล็อกอิน
2. **แยกสิทธิ์ 2 ระดับ** (User / Admin) บังคับที่ฝั่ง server 100% (ไม่ใช่แค่ซ่อน UI)
3. พนักงานเห็น/แก้ได้ **เฉพาะสาขาตัวเอง** (ตามที่ Admin กำหนด) — 0 ครั้งที่เห็นสาขาอื่น
4. **ทุกการแก้ข้อมูลถูกบันทึก Audit Log** (ใคร·เมื่อ·แก้อะไร·สาขา/วันไหน) — ตรวจย้อนได้ 100%
5. User แก้สต็อกย้อนหลังได้ **≤ 2 วัน** เท่านั้น · Admin แก้ได้ทุกวัน + override ยอดได้

## 3. Non-Goals (นอกขอบรอบนี้)
1. **ไม่ทำ email/OTP/2FA/SSO** — ร้านเล็ก ใช้รหัส PIN พอ (ยกไป future ถ้าต้องการ)
2. **ไม่ทำ role ที่ 3+** (เช่น Manager, Viewer) — v1 มีแค่ User/Admin
3. **ไม่ทำ self-service reset password** — Admin รีเซ็ตให้ (ลดความซับซ้อน)
4. **ไม่ทำ permission ระดับหน้าย่อย/field** — สิทธิ์เป็นชุดตาม role (User=Stock+Sales, Admin=ทุกอย่าง)
5. **ไม่ย้ายไป Supabase Auth เต็มรูป** — ใช้ custom passcode + session cookie (เบา, คุม audit เอง)

## 4. Target Users
- **พนักงานหน้าร้าน (User)** — กรอกสต็อก/ยอดขายเฉพาะสาขาตัวเอง, ไม่ยุ่ง config
- **แพร / ผู้จัดการ (Admin)** — เห็นทุกสาขา, สร้าง/จัดการผู้ใช้, ตั้งค่า, แก้/override สต็อกได้, ดู audit
- **(ระบบ)** — Audit Log = ผู้ตรวจสอบย้อนหลัง

## 5. User Stories

**พนักงาน (User)**
- ในฐานะพนักงาน ฉันอยากล็อกอินด้วยรหัสของตัวเอง เพื่อเข้าใช้เฉพาะส่วนที่ฉันต้องทำ
- ในฐานะพนักงาน ฉันอยากเห็นแค่ **หน้า Stock กับ ยอดขาย** ของ **สาขาตัวเอง** เพื่อไม่สับสน/ไม่แตะของสาขาอื่น
- ในฐานะพนักงาน ฉันอยากแก้สต็อกของ **เมื่อวาน/2 วันก่อน** ได้ (เผื่อกรอกตกหล่น) แต่ไม่ต้องแก้ของเก่ากว่านั้น

**Admin (แพร)**
- ในฐานะ Admin ฉันอยาก **สร้างผู้ใช้ใหม่ + ตั้งรหัส + เลือก role + กำหนดสาขา** ที่เขาเห็นได้
- ในฐานะ Admin ฉันอยากเห็น **ทุกหน้า ทุกสาขา** รวมถึง Settings/config
- ในฐานะ Admin ฉันอยาก **เข้าไปแก้/อัปเดตจำนวนสต็อกได้เลย** ทั้งรายวัน (ทุกวัน ไม่จำกัด 2 วัน) และ **Stock Master** (ข้อมูลหลักสินค้า/Par/config + override ยอดคงเหลือ)
- ในฐานะ Admin ฉันอยากดู **Audit Log** ว่าใครแก้อะไรเมื่อไร เพื่อสอบกลับเวลาตัวเลขผิด
- ในฐานะ Admin ฉันอยาก **ปิดการใช้งาน (deactivate)** ผู้ใช้ที่ลาออก เพื่อตัดสิทธิ์ทันที

## 6. Requirements

### P0 — Must-Have

| # | ความสามารถ | Acceptance Criteria |
|---|---|---|
| A-1 | **หน้า Login (รหัสต่อคน)** | Given ยังไม่ล็อกอิน, When เปิด URL ใด ๆ, Then เด้งไปหน้า Login; กรอกรหัสถูก → เข้าระบบ (เซ็ต session), รหัสผิด → ข้อความ error, ไม่บอกว่า user ไหน |
| A-2 | **Session + บังคับล็อกอินทุกหน้า** | ทุก route (หน้า+`/api/*`) ตรวจ session; ไม่มี session → 401/redirect login; session ผ่าน httpOnly cookie (เซ็นชื่อ), หมดอายุ (เช่น 12 ชม.) |
| A-3 | **2 Role: User / Admin (บังคับที่ server)** | BFF ตรวจ role ก่อนทำงานทุกครั้ง; User เรียก API/หน้าของ Admin → 403; ซ่อนเมนูฝั่ง UI ด้วย แต่**ด่านจริงอยู่ที่ server** |
| A-4 | **User เห็นเฉพาะ Stock + ยอดขาย** | User login → เห็นเมนูแค่ `/stock`, `/sales`; เข้า `/restock` `/cups` `/settings` `/users` `/audit` → 403/ซ่อน |
| A-5 | **สิทธิ์สาขาต่อคน (branch scope)** | Admin กำหนด user เห็น: ทุกสาขา / SND / NVP; User ที่ผูก NVP → หน้า Stock/Sales ล็อกสาขาที่ NVP, ดึง/บันทึกได้แค่ NVP; ขอ branch อื่นผ่าน API → 403 |
| A-6 | **Admin สร้าง/จัดการผู้ใช้** (`/users`) | Admin สร้าง user: ชื่อ + รหัส + role + สาขา; แก้ไข/รีเซ็ตรหัส/deactivate ได้; รหัสเก็บแบบ hash (ไม่โชว์รหัสจริง) |
| A-7 | **Audit Log — บันทึกทุกการแก้** | ทุก mutation (บันทึกสต็อก/ยอดขาย/ถ้วย/แก้ config/สร้าง-แก้ user/override) → เขียน 1 แถว: เวลา · user · action · สาขา · วันที่/entity · สรุปสิ่งที่เปลี่ยน |
| A-8 | **Audit Log — หน้าดู (Admin)** (`/audit`) | Admin เปิดดูรายการล่าสุด, กรองตาม user/สาขา/วันที่/ประเภท action |
| A-9 | **User แก้สต็อกย้อนหลัง ≤ 2 วัน** | User บันทึก/แก้สต็อกได้เฉพาะวันที่ ∈ [วันนี้−2, วันนี้]; เลือกวันเก่ากว่านั้น → อ่านอย่างเดียว + บันทึกถูกปฏิเสธที่ server (403/422) |
| A-10 | **Admin แก้สต็อกได้ทุกวัน (ไม่จำกัด)** | Admin เปิดหน้า Stock เลือกวันไหน/สาขาไหนก็ได้ แล้วแก้+บันทึก; ไม่ติดกฎ 2 วัน |

### P1 — Nice-to-Have (fast follow)

| # | ความสามารถ | Acceptance Criteria |
|---|---|---|
| A-11 | **Stock Master — ข้อมูลหลัก + Par (Admin)** | หน้าเดียวแก้: ชื่อ/หมวด/หน่วย/โหมดขาย/จำนวนต่อ UOM/กลุ่มเศษรวม + **Par ต่อสาขา**; บันทึก → Supabase + audit |
| A-12 | **Stock Master — override ยอดคงเหลือ (Admin)** | Admin ตั้งจำนวนคงเหลือของ item (แพ็ค+เศษ) ณ วันที่หนึ่งได้ตรง ๆ (adjustment) โดยไม่ต้องผ่านฟอร์มรายวัน; บันทึกเป็น stock_daily + audit (action=override) |
| A-13 | **Audit Log — ดู diff ก่อน/หลัง** | แต่ละรายการกดดูค่าที่เปลี่ยน (เก่า → ใหม่) รายฟิลด์ |
| A-14 | **แสดงชื่อผู้ใช้ที่ล็อกอิน + ปุ่ม Logout** | ทุกหน้าเห็นว่าใครล็อกอินอยู่ + ออกจากระบบได้ |

### P2 — Future (ออกแบบเผื่อ)
- รีเซ็ตรหัสเอง / ลืมรหัส · lockout เมื่อกรอกผิดหลายครั้ง (rate-limit)
- role เพิ่ม (Manager/Viewer) · permission ละเอียดระดับหน้า/field
- Audit Log export (CSV) + retention policy · แจ้งเตือนเมื่อมี override
- ผูก Supabase Auth / SSO ถ้าขยายทีม

## 7. Data Model (เพิ่มจากเดิม)
```
users        : id, name, role('user'|'admin'), branch_scope('all'|'SND'|'NVP'),
               passcode_hash, active(bool), created_at, created_by
audit_log    : id, ts, user_id, user_name, action, entity, entity_key,
               branch, date, detail(jsonb: {before, after} หรือสรุป)
Session      : httpOnly cookie (เซ็นด้วย SESSION_SECRET) → {userId, role, branchScope, exp}
               ตรวจ users.active ทุก request (ตัดสิทธิ์ทันทีเมื่อ deactivate)
```
- action ที่ log: `login` · `save_stock` · `save_sales` · `save_cups` · `update_item` · `set_par` · `override_stock` · `create_user` · `update_user` · `reset_passcode` · `deactivate_user`
- **ทุก BFF mutation** ต้องแนบ userId จาก session → เขียน audit อัตโนมัติใน layer เดียว (middleware/helper)

## 8. เทคนิค / ผลกระทบระบบเดิม (Next.js + Supabase + BFF)
- **Auth = custom passcode:** login route hash-compare (bcrypt) กับ `users.passcode_hash` → เซ็ต signed cookie · เพิ่ม `middleware.ts` กันทุก route + helper `requireAuth(role?, branch?)` ใน BFF
- **RBAC ที่ BFF:** ทุก `/api/*` ดึง session → เช็ก role + branch ก่อนทำงาน (เป็นด่านจริง) · frontend ซ่อนเมนูตาม role/scope
- **Branch scope:** inject branch จาก session เข้า getStock/getSales/save… — User ส่ง branch อื่นมาถูก override/ปฏิเสธ
- **Backdate guard:** helper เช็ก `role==='user' && date < today-2` → reject ที่ save route
- **Audit:** wrap ทุก mutation ด้วย `writeAudit(...)` (เขียน 1 แถวหลังสำเร็จ)
- **Env ใหม่:** `SESSION_SECRET` (เซ็น cookie) · migration ใหม่: `users`, `audit_log` + seed Admin คนแรก (แพร)
- **หมายเหตุความปลอดภัย:** รหัส PIN สั้น = เดาง่าย → แนะนำรหัส ≥6 ตัว + lockout (P2) · เดิม RLS ปิด (BFF service role) — auth ทำที่ BFF layer

## 9. Success Metrics
**Leading:** % หน้าที่เปิดได้โดยไม่ล็อกอิน (เป้า 0) · % mutation ที่มี audit (เป้า 100%) · จำนวนครั้ง User เห็น/แก้สาขาอื่น (เป้า 0)
**Lagging:** เวลาในการสอบกลับ "ใครแก้ตัวเลขนี้" (จาก "หาไม่ได้" → นาที) · ข้อผิดพลาดจากแก้ย้อนหลังมั่ว ↓ · ความมั่นใจของแพรในการมอบงานให้พนักงานกรอกเอง ↑

## 10. Open Questions
- **[แพร]** จำนวนพนักงาน/คนที่จะมีบัญชี? แต่ละสาขากี่คน? (กระทบหน้า manage users)
- **[แพร]** รหัส PIN ยาวกี่ตัว/เป็นตัวเลขล้วนหรือผสม? ต้องมี lockout กันเดาไหม (P2)?
- **[แพร]** อายุ session (ให้ค้างล็อกอินนานแค่ไหนก่อนต้องกรอกใหม่ — 12 ชม.? ทั้งวัน?)
- **[แพร]** "แก้ย้อนหลัง ≤ 2 วัน" นับเป็นวันปฏิทิน (วันนี้/เมื่อวาน/2 วันก่อน) ใช่ไหม
- **[แพร]** Admin override ยอด — ต้องใส่เหตุผล (comment) บังคับไหม (แนะนำบังคับ เพื่อ audit)
- **[eng]** revoke session ทันทีเมื่อ deactivate — เช็ก users.active ทุก request (เลือกวิธีนี้) พอไหม

## 11. Timeline / Phasing
- **Phase 1 (P0):** Login PIN + session + middleware + 2 role (server-enforced) + branch scope + backdate 2 วัน + Audit Log (เขียน+ดู) + จัดการผู้ใช้ + Admin แก้สต็อกทุกวัน → **ของหลักที่ล็อกระบบได้จริง**
- **Phase 2 (P1):** Stock Master (ข้อมูลหลัก+Par+override) + audit diff + header user/logout
- **Phase 3 (P2):** reset/ลืมรหัส + lockout + export audit + role เพิ่ม
- **Dependency:** ต้องเคาะ Open Questions (จำนวนคน, รูปแบบ PIN, อายุ session) ก่อนเริ่ม Phase 1

## 12. ทำอะไรต่อ
| # | งาน | เจ้าของ |
|---|---|---|
| 1 | review PRD นี้ + ตอบ Open Questions (ข้อ 10) | **แพร** |
| 2 | ยืนยันรายชื่อพนักงาน + สาขา + role เริ่มต้น | **แพร** |
| 3 | design (schema users/audit + middleware/BFF guard + หน้า login/users/audit) | **yc-sa** |
| 4 | build Phase 1 | **yc-dev** |
| 5 | test (สิทธิ์รั่วไหม · backdate · audit ครบ) | **yc-tester** |
