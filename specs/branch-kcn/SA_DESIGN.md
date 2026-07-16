# SA Design — เพิ่มสาขา KCN (Kanchanapisek)

> Author: yc-sa · สถานะ: ready for dev
> Scope: ระบบรองรับ N สาขา (ไม่ hardcode 2 สาขาอีกต่อไป) + เปิดสาขา KCN ตาม requirement ที่ยืนยันแล้ว

## 1. เป้าหมาย

1. เพิ่มสาขา `KCN` (ชื่อเต็ม "Kanchanapisek") เข้าระบบ ควบคู่ SND / NVP
2. รีแฟกเตอร์จุด hardcode "2 สาขา" ทั้งหมด → ขับเคลื่อนด้วย `BRANCHES` array เดียว (แหล่งความจริงเดียว) เพื่อให้เพิ่มสาขาที่ 4, 5, ... ในอนาคตทำได้โดยแก้ไม่กี่จุด
3. คง behavior เดิมของ SND/NVP ทุกจุด 100% — ห้าม regression
4. Business rule ที่ยังไม่ยืนยัน (special day ของ KCN) ต้อง "ปิดไว้ก่อน" ไม่ใช่เดา

**Non-goals (งานนี้ไม่ทำ):**
- ไม่ใส่ตัวเลข Par จริงให้ KCN (รอไฟล์จากแพร)
- ไม่กำหนดวัน special ของ KCN
- ไม่ seed สต็อกตั้งต้นของ KCN (เริ่มที่ 0 อัตโนมัติอยู่แล้วจาก logic carry-forward เดิม — ไม่มี record ก่อนหน้า → carry = 0)
- ไม่แตะ RLS / auth flow อื่นนอกจาก branchScope enum

## 2. การตัดสินใจหลัก: `Branch` type

**ตัดสินใจ: คงเป็น string literal union (ขยายเพิ่ม `"KCN"`) ไม่เปลี่ยนเป็น `string` เปล่า**

```ts
export type Branch = "SND" | "NVP" | "KCN";
export const BRANCHES: Branch[] = ["SND", "NVP", "KCN"];
export type BranchScope = "all" | Branch;   // derive จาก Branch แทนแยก union เอง
```

เหตุผล:
- จำนวนสาขาเปลี่ยนไม่บ่อย (เปิดสาขาใหม่ = ต้องมี deploy + migration + seed par อยู่แล้ว) การเพิ่ม 1 บรรทัดใน `types.ts` ไม่ใช่ friction จริง
- literal union ให้ compile-time safety ทั่วทั้งโค้ด (กัน typo `"SDN"`, กัน `Record<Branch, X>` ไม่ครบ key, กัน exhaustiveness ใน switch) — ถ้าเปลี่ยนเป็น `string` เฉย ๆ จุดเหล่านี้จะเงียบเป็น runtime bug แทน
- request body จาก client ยังไงก็เป็น `string` เสมอ → ต้อง runtime-validate ที่ขอบระบบ (`parseBranch`) อยู่ดี ไม่ว่า type จะเป็นอะไร ดังนั้นไม่ได้ประโยชน์เพิ่มจากการใช้ `string`

สิ่งที่เปลี่ยนคือ**ทุกจุด logic ที่เคย hardcode `"SND"`/`"NVP"` ต้องเปลี่ยนไปวนลูป/ค้นจาก `BRANCHES` แทน** เพื่อให้ "พฤติกรรม" รองรับ N สาขาจริง แม้ "type" จะยังลิสต์สาขาที่รู้จักไว้ชัดเจนก็ตาม

## 3. รายการไฟล์ที่ต้องแก้

### 3.1 `src/lib/types.ts`
- `Branch`: เพิ่ม `"KCN"` → `"SND" | "NVP" | "KCN"`
- `BRANCHES`: เพิ่ม `"KCN"`
- `BranchScope`: เปลี่ยนจาก `"all" | "SND" | "NVP"` → `"all" | Branch` (derive อัตโนมัติ ไม่ต้องแก้ทุกครั้งที่เพิ่มสาขา)
- `ParMap`: เปลี่ยนจาก shape ตายตัว `{ SND: number|null; NVP: number|null }` → `{ [itemId: string]: Partial<Record<Branch, number | null>> }`
  ```ts
  export interface ParMap {
    [itemId: string]: Partial<Record<Branch, number | null>>;
  }
  ```
  (ใช้ `Partial<Record<...>>` เพราะจุดสร้างข้อมูลบางจุดอาจยังไม่ fill ครบทุกสาขาในหน่วยความจำชั่วคราว — จุดใช้งานจริงเข้าถึงผ่าน `par[id]?.[branch] ?? null` อยู่แล้วทุกที่ ปลอดภัย)

### 3.2 `src/lib/seed-data.ts`
- เปลี่ยน `Row` tuple จาก fixed 5-tuple → variadic ท้ายแถวยาวเท่าจำนวนสาขา:
  ```ts
  // tuple: [name, category, unit, ...parPerBranch]  ยาว = 3 + BRANCHES.length
  // ลำดับ par คอลัมน์ท้าย = ตามลำดับ BRANCHES ("SND"→"NVP"→"KCN")
  type Row = [string, string, string, ...Array<number | null>];
  ```
- **ทุกแถวใน `RAW` (~140 แถว) ต้องเติม `null` ต่อท้าย 1 ค่า** (คอลัมน์ KCN) เช่น
  ```ts
  ["Greek Yogurt 1kg", "Yogurt 1kg/Box", "1kg/Box", 6, 6],       // เดิม
  ["Greek Yogurt 1kg", "Yogurt 1kg/Box", "1kg/Box", 6, 6, null], // ใหม่
  ```
  เป็นการแก้เชิงกลไก (mechanical) ล้วน ๆ — เติม `, null` ก่อน `]` ปิดท้ายทุกแถว ไม่ต้องคิดตัวเลข ไม่เสี่ยง regression เพราะ SND/NVP สองค่าหน้ายังอยู่ตำแหน่งเดิม
- แก้ตัวสร้าง `PAR`:
  ```ts
  export const PAR: ParMap = Object.fromEntries(
    RAW.map((row, i) => {
      const [, , , ...pars] = row;
      const byBranch = Object.fromEntries(
        BRANCHES.map((b, bi) => [b, pars[bi] ?? null])
      ) as Record<Branch, number | null>;
      return [slug(i), byBranch];
    })
  );
  ```
  ต้อง `import { BRANCHES } from "./types"` เพิ่ม
- `ITEMS` mapper (`RAW.map(([name, category, unit], i) => ...)`) — **ไม่ต้องแก้** (ใช้ destructure แค่ 3 ตัวแรก อยู่แล้ว ปลอดภัยกับ tuple ที่ยาวขึ้น)

### 3.3 `src/lib/calc.ts` — `isSpecialActive`
เปลี่ยนจาก hardcode 2 เงื่อนไข → lookup table ที่ default เป็น "ไม่มีรอบ" (false เสมอ) สำหรับสาขาที่ยังไม่กำหนด:
```ts
// รอบ special ต่อสาขา — สาขาที่ไม่อยู่ใน map นี้ = ยังไม่เปิดรับ special (isSpecialActive คืน false เสมอ)
const SPECIAL_DAY: Partial<Record<Branch, Weekday>> = { SND: "sat", NVP: "wed" };
const WEEKDAY_LABEL_TH: Record<Weekday, string> = { wed: "พุธ", sat: "เสาร์" };

export function isSpecialActive(branch: Branch, weekday: Weekday): boolean {
  const day = SPECIAL_DAY[branch];
  return day != null && day === weekday;
}

/** ป้ายวันรอบ special ของสาขา (Thai) — null = สาขานี้ยังไม่มีรอบ special กำหนด (เช่น KCN ตอนนี้) */
export function specialDayLabel(branch: Branch): string | null {
  const day = SPECIAL_DAY[branch];
  return day ? WEEKDAY_LABEL_TH[day] : null;
}
```
`KCN` ไม่อยู่ใน `SPECIAL_DAY` → `isSpecialActive("KCN", "wed"|"sat")` คืน `false` เสมอ ตรง requirement ข้อ 2 เป๊ะ — และเมื่อรู้วันจริงในอนาคต แก้แค่เติม 1 key ในนี้

### 3.4 `src/lib/authz.ts`
- ไม่ต้องแก้โค้ด (ใช้ `Branch`/`Session["branchScope"]` ผ่าน type import อยู่แล้ว, logic `resolveBranch`/`assertCanEditDate` เป็น branch-agnostic ตั้งแต่แรก) — แต่ยืนยันว่า type เปลี่ยนตาม 3.1 อัตโนมัติ ไม่ต้อง touch ไฟล์นี้

### 3.5 `src/lib/db.ts` — `parseBranch`
เปลี่ยนจาก hardcode equality → validate จาก `BRANCHES`:
```ts
import { BRANCHES, type Branch } from "./types";
...
export function parseBranch(v: string | null): Branch | null {
  return v != null && (BRANCHES as string[]).includes(v) ? (v as Branch) : null;
}
```

### 3.6 `src/components/ui/index.tsx` — `BranchPicker`
เปลี่ยนจาก hardcode array 2 ปุ่มในตัว component → generate จาก `BRANCHES`:
```tsx
import { BRANCHES } from "@/lib/types";
...
export function BranchPicker<T extends string>({ value, onChange, locked, options }: {
  options?: { value: T; label: string }[]; value: T; onChange: (v: T) => void; locked?: boolean;
}) {
  const opts = options ?? BRANCHES.map((b) => ({ value: b as unknown as T, label: `สาขา ${b}` }));
  if (locked) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white/70 px-3 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-ink text-[11px] font-bold text-white">{value}</span>
        <span className="text-sm font-medium">สาขา {value}</span>
        <span className="ml-auto text-[11px] text-brand-ink/40">🔒 สิทธิ์สาขานี้</span>
      </div>
    );
  }
  return <Segmented options={opts} value={value} onChange={onChange} />;
}
```
- component ต้อง generic รองรับ N ปุ่ม (Segmented ที่ใช้ข้างในเป็น flex — 3 ปุ่มขึ้นไปยังพอดี layout เดิม ไม่ต้องแก้ CSS)
- คง `options` prop ไว้เป็น optional override (เผื่ออนาคตมีหน้าไหนอยาก custom label) — ปัจจุบันไม่มีที่ใดส่ง `options` เข้ามาจริง (ทุกหน้าโหมด default) ตรวจสอบแล้ว → behavior เดิมไม่เปลี่ยน แค่ label เดิม `สาขา SND` / `สาขา NVP` มาจากสูตร `สาขา ${b}` เดียวกัน เพิ่ม `สาขา KCN` ให้ฟรี

### 3.7 หน้า UI ที่ต้องแก้ hardcode SND/NVP (grep ครบแล้ว)

| ไฟล์ | บรรทัด (เดิม) | แก้อย่างไร |
|---|---|---|
| `src/components/nav.tsx` | `export type Me = { ...; branchScope: "all" \| "SND" \| "NVP" }` | เปลี่ยนเป็น `import type { Role, BranchScope } from "@/lib/types"; export type Me = { id: string; name: string; role: Role; branchScope: BranchScope };` |
| `src/app/users/page.tsx` | `SCOPE_OPTS` hardcode `{value:"SND",...}, {value:"NVP",...}` | `const SCOPE_OPTS = [{ value: "all" as BranchScope, label: "ทุกสาขา" }, ...BRANCHES.map((b) => ({ value: b as BranchScope, label: b }))];` (import `BRANCHES` จาก `@/lib/types`) |
| `src/app/audit/page.tsx` | `BRANCH_OPTS` hardcode `{value:"SND",...}, {value:"NVP",...}` | `const BRANCH_OPTS = [{ value: "", label: "ทุกสาขา" }, ...BRANCHES.map((b) => ({ value: b, label: b }))];` |
| `src/app/api/users/route.ts` | `const SCOPES: BranchScope[] = ["all", "SND", "NVP"];` + error text `"สาขาไม่ถูกต้อง (all\|SND\|NVP)"` (2 จุด) | `const SCOPES: BranchScope[] = ["all", ...BRANCHES];` + error text ประกอบ dynamic: `` `สาขาไม่ถูกต้อง (${SCOPES.join("|")})` `` |
| `src/app/api/restock/route.ts` | error text `"branch ต้องเป็น SND หรือ NVP"` | `` `branch ต้องเป็น ${BRANCHES.join(" หรือ ")}` `` (import `BRANCHES`) |
| `src/app/api/cups/route.ts` | error text `"branch ต้องเป็น SND หรือ NVP"` (2 จุด: GET, POST) | เหมือนข้างบน |
| `src/app/restock/page.tsx` | บรรทัด 56: `const ownSpecialDay = branch === "SND" ? "เสาร์" : "พุธ";` และบรรทัด 118-120 ข้อความเมื่อ `!specialActive` | ดูรายละเอียด 3.7.1 ด้านล่าง — **จุดนี้เป็น bug ที่พลาดถ้าไม่แก้: KCN จะโชว์ข้อความผิดว่า "รับ special เฉพาะวันพุธ" ทั้งที่ยังไม่มีรอบเลย** |

**3.7.1 `src/app/restock/page.tsx` — แก้ให้ตรง requirement ข้อ 2**

```tsx
import { specialDayLabel } from "@/lib/calc"; // เพิ่ม import

// เดิม: const ownSpecialDay = branch === "SND" ? "เสาร์" : "พุธ";
const ownSpecialDay = specialDayLabel(branch); // string | null — null = สาขานี้ยังไม่มีรอบ special

...
{specialActive
  ? `รอบนี้มี 7 รายการ special (รวมในตารางแล้ว)`   // ข้อความเดิม — คงไว้ตามของจริงในไฟล์
  : ownSpecialDay
    ? `รอบนี้ไม่มี 7 รายการ special — ${branch} รับ special เฉพาะวัน${ownSpecialDay}`
    : `สาขา ${branch} ยังไม่เปิดรับ 7 รายการ special (รอกำหนดรอบเติมของ)`}
```
(ข้อความบรรทัด `specialActive` true ให้ยึดข้อความจริงในไฟล์ปัจจุบัน — ตัวอย่างข้างบนสมมติไว้ ไม่ต้องเปลี่ยน)

### 3.8 `src/lib/store-memory.ts` และ `src/lib/supabase.ts`
**ไม่ต้องแก้ logic ใด ๆ** — ทั้งสองไฟล์วนลูปด้วย `BRANCHES` อยู่แล้ว (`for (const b of BRANCHES)`) และเข้าถึง par ด้วย `PAR[it.id]?.[b]` / `par[it.id]?.[branch]` ซึ่งเป็น dynamic key lookup ที่รองรับ `Branch` ใหม่โดยอัตโนมัติเมื่อ `ParMap`/`BRANCHES` อัปเดตตาม 3.1–3.2

จุดเดียวที่ต้องแก้ใน `src/lib/supabase.ts`: บรรทัด 35 และ 37
```ts
// เดิม
for (const it of mapped) par[it.id] = { SND: null, NVP: null };
if (!par[p.item_id]) par[p.item_id] = { SND: null, NVP: null };
// ใหม่
for (const it of mapped) par[it.id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
if (!par[p.item_id]) par[p.item_id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
```
(เพราะ shape เดิม hardcode 2 key ตรง ๆ — ต้อง generate จาก `BRANCHES` แทน)

`store-memory.ts` ไม่มีจุดสร้าง `{SND:.., NVP:..}` ตรง ๆ (import `PAR` มาใช้เลย) → ไม่ต้องแก้

### 3.9 หน้า UI อื่น (stock/restock/sales/cups/dashboard)
`src/app/stock/page.tsx`, `src/app/sales/page.tsx`, `src/app/cups/page.tsx`, `src/app/restock/page.tsx`: บรรทัด `useState<Branch>("NVP")` — เป็นแค่ค่าเริ่มต้นตอนโหลดหน้า (UI default selection) **ไม่ต้องแก้** ไม่ใช่ business-rule hardcode ผู้ใช้ที่ scope เดียวจะถูก override เป็นสาขาตัวเองทันทีผ่าน `useEffect` เดิมอยู่แล้ว (`if (scoped) setBranch(me!.branchScope as Branch)`), และ admin (scope="all") จะเห็น 3 ปุ่มจาก `BranchPicker` ที่แก้ตาม 3.6 แล้วเลือกเองได้ ไม่กระทบ

`src/app/page.tsx` (dashboard): ใช้ `BRANCHES.map(...)` อยู่แล้วทุกจุด — **ไม่ต้องแก้**

## 4. Supabase Migration (พร้อมใช้)

ไฟล์ใหม่: `supabase/migrations/0008_branch_kcn.sql`

```sql
-- 0008_branch_kcn.sql — เปิดสาขา KCN (Kanchanapisek)
-- Opening stock = 0 ทุกไอเทม (ไม่มี stock_daily/sales_daily/cup_reconcile row ก่อนหน้า → carry-forward
-- logic ใน getStock คืน carryPack=0/carryG=0 โดยอัตโนมัติ ไม่ต้อง insert อะไรเพิ่มสำหรับตารางเหล่านั้น)

-- 1) สาขาใหม่
insert into branches (id, name) values
  ('KCN', 'Kanchanapisek')
on conflict (id) do nothing;

-- 2) par_levels: เติมแถว KCN ให้ทุก item ที่มีอยู่ (level = null = "ยังไม่กำหนด/ไม่ stock" — รอไฟล์ par จริงจากแพร)
insert into par_levels (item_id, branch_id, level)
select id, 'KCN', null
from items
on conflict (item_id, branch_id) do nothing;

notify pgrst, 'reload schema';
```

หมายเหตุ migration:
- `branch_scope` ใน `users` table (0006_auth.sql) เป็น `text` เฉย ๆ ไม่มี CHECK constraint → **ไม่ต้อง migrate schema เพิ่ม** รองรับค่า `'KCN'` ได้ทันทีที่ app-level validation (`SCOPES` ใน `api/users/route.ts`) อัปเดตตาม 3.7
- ไม่มี CHECK constraint บน `branches.id` หรือ `stock_daily.branch_id` ฯลฯ (ใช้ FK ไป `branches(id)` แทน) → insert branch ใหม่แล้วทุกตารางลูกอ้างอิงได้ทันที ไม่ต้องแก้ schema อื่น
- รันหลัง deploy โค้ดที่แก้ตามข้อ 3 แล้วเท่านั้น (หรือรันคู่กันได้ เพราะ migration ไม่พึ่งโค้ด — แต่ถ้ารัน migration ก่อนโค้ด deploy, `parseBranch`/`BRANCHES` เดิม (ยังไม่มี KCN) จะปฏิเสธ request ที่ขอ branch=KCN ไปก่อน ซึ่งปลอดภัย ไม่ error)

## 5. ความเสี่ยง / จุดที่ต้องระวัง (regression checklist)

1. **`ParMap` shape เปลี่ยนจาก fixed object → `Partial<Record<Branch,...>>`** — ทุกจุดที่เข้าถึงต้องผ่าน optional chaining `par[id]?.[branch]` (ทุกจุดที่มีอยู่แล้วทำแบบนี้อยู่แล้ว ✅ ตรวจสอบแล้วไม่มีจุดไหน access แบบ `par[id].SND` ตรง ๆ ที่จะพังจาก type change)
2. **`seed-data.ts` RAW ~140 แถว ต้องเติม `null` ครบทุกแถว** — ถ้าพลาดแม้แถวเดียว จำนวนคอลัมน์จะไม่ตรงกับ `BRANCHES.length` แต่ไม่ error (TS variadic tuple ไม่บังคับความยาวขั้นต่ำของ rest element) เพียงแค่ `pars[2]` จะเป็น `undefined` → `?? null` ช่วยกันไว้อยู่ดี **แต่ต้อง grep นับให้ครบ 140 แถวหลังแก้เพื่อความชัวร์** (ดู checklist ข้อ 4)
3. **`isSpecialActive("KCN", ...)` ต้อง return `false` ทั้ง `wed` และ `sat`** — เขียน unit test/manual check ทั้งสองวันหลังแก้
4. **`BranchPicker` แสดง 3 ปุ่ม** — เช็ค layout มือถือ (คอมโพเนนต์ `Segmented` เป็น `flex gap-1.5` แบบยืดเท่ากัน `flex-1` — 3 ปุ่มบนจอแคบอาจแน่นกว่าเดิม ให้ QA เช็คบนความกว้าง ~375px)
5. **`resolveBranch` (authz.ts) ไม่เปลี่ยนโค้ด** แต่พฤติกรรมขึ้นกับ type ใหม่โดยอัตโนมัติ — ต้องเช็คว่า user ที่ `branchScope="KCN"` แล้วขอ branch อื่นถูก 403 ตามเดิม (logic เดิมรองรับอยู่แล้วเพราะเทียบ `!==` ตรง ๆ ไม่ hardcode)
6. **`getDashboard`/`getRestock` ใน supabase.ts วน `for (const b of BRANCHES)`** — เมื่อ KCN เข้ามาจะมี query เพิ่ม 1 รอบต่อ branch ทุกจุดที่วนอยู่แล้ว (ไม่ error แต่ N+1 query โตขึ้นตามสาขา — เป็น known cost ที่ยอมรับได้ในสเกลนี้ ไม่ใช่ regression แต่ flag ไว้เผื่ออนาคตสาขาเยอะขึ้นมากต้อง optimize)
7. **ห้ามลืม 3.7.1 (restock/page.tsx ownSpecialDay)** — เป็นจุดเดียวที่ "ดูเผิน ๆ เหมือน UI text" แต่จริง ๆ คือ business-rule hardcode ที่จะโชว์ข้อมูลผิดให้ผู้ใช้สาขา KCN ถ้าไม่แก้
8. **`SPECIAL_PREFIX`/`CUP_MAP`/`UOM1_QTY`/`REMAINDER_GROUP` ใน seed-data.ts ไม่เกี่ยวกับสาขา** (เป็น per-item config ใช้ร่วมทุกสาขา) — ยืนยันว่าไม่ต้องแตะ ป้องกัน dev แก้เกินสโคป

## 6. Checklist ให้ yc-dev ทำตาม (เรียงลำดับ)

- [ ] `src/lib/types.ts` — ขยาย `Branch`, `BRANCHES`, เปลี่ยน `BranchScope` เป็น `"all" | Branch`, เปลี่ยน `ParMap` เป็น `Partial<Record<Branch, number|null>>`
- [ ] `src/lib/seed-data.ts` — เปลี่ยน `Row` type เป็น variadic, เติม `, null` ท้ายทุกแถวใน `RAW` (นับให้ครบทุกแถว), แก้ตัวสร้าง `PAR` ใช้ `BRANCHES`
- [ ] `src/lib/calc.ts` — เปลี่ยน `isSpecialActive` เป็น lookup table `SPECIAL_DAY`, เพิ่ม export `specialDayLabel`
- [ ] `src/lib/db.ts` — แก้ `parseBranch` ให้ validate จาก `BRANCHES`
- [ ] `src/lib/supabase.ts` — แก้ 2 จุดสร้าง par default object (บรรทัด ~35, ~37) ให้ generate จาก `BRANCHES`
- [ ] `src/components/ui/index.tsx` — แก้ `BranchPicker` ให้ generate ปุ่มจาก `BRANCHES`
- [ ] `src/components/nav.tsx` — แก้ `Me.branchScope` type ให้ import จาก `@/lib/types`
- [ ] `src/app/users/page.tsx` — แก้ `SCOPE_OPTS` ให้ generate จาก `BRANCHES`
- [ ] `src/app/audit/page.tsx` — แก้ `BRANCH_OPTS` ให้ generate จาก `BRANCHES`
- [ ] `src/app/api/users/route.ts` — แก้ `SCOPES` + error message ให้ dynamic
- [ ] `src/app/api/restock/route.ts` — แก้ error message ให้ dynamic
- [ ] `src/app/api/cups/route.ts` — แก้ error message ให้ dynamic (2 จุด)
- [ ] `src/app/restock/page.tsx` — แก้ `ownSpecialDay` ใช้ `specialDayLabel()` แทน ternary hardcode (ดู 3.7.1)
- [ ] `supabase/migrations/0008_branch_kcn.sql` — สร้างไฟล์ตามข้อ 4 (รันจริงทีหลัง โดย yc-dev/PM ผ่าน Supabase MCP หรือ CLI)
- [ ] `npm run build` (หรือ `tsc --noEmit`) ผ่านไม่มี type error
- [ ] Manual/QA smoke: เข้า `/stock`, `/restock`, `/sales`, `/cups`, `/`, `/users`, `/audit` ด้วย role admin → เห็นปุ่ม/ตัวเลือก 3 สาขา (SND/NVP/KCN) ครบทุกหน้า, เลือก KCN แล้วค่าเริ่มต้น par/stock = ว่าง/0/null ไม่ error, restock ของ KCN ไม่มีวันไหนโชว์ special active เลย และข้อความอธิบายไม่ใช่ "พุธ" ผิด ๆ

## 7. สิ่งที่ยืนยันแล้ว ไม่ต้องถามซ้ำ

- KCN opening stock = 0 ทุกไอเทม (ไม่ seed ตัวเลข)
- 7 รายการ special ปิดสำหรับ KCN จนกว่าจะแจ้งวันจริง
- Par KCN = null ทั้งหมดในงานนี้ (รอไฟล์จากแพร)
- Label ในระบบ = "KCN" เท่านั้น (ปุ่ม/badge/error message) — "Kanchanapisek" อยู่ใน DB (`branches.name`) เพียงจุดเดียว ไม่โผล่ UI
