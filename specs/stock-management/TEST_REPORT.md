# Test Report — YC Stock v1.0

> โดย Tester (ทีมพัฒนา) · 2026-07-15 · แอป: `04_Operations/stock-app`
> สรุป: **ผ่านทั้งหมด — พร้อม Deploy** ✅

## 1. ระดับการทดสอบ
| ชั้น | เครื่องมือ | ผล |
|---|---|---|
| Static typecheck | `tsc --noEmit` (strict) | ✅ 0 error |
| Unit (business logic) | `node --test` (lib/calc) | ✅ 8/8 pass |
| Production build | `next build` | ✅ 8 routes compiled |
| E2E (browser, mobile 375px) | Manual drive ทุกหน้า | ✅ ผ่าน |
| Console errors | ทุกหน้า | ✅ ไม่มี |

## 2. Unit tests (lib/calc) — 8/8 ผ่าน
remainPieces · remainGrams · variance · restockNeed (รวม par=null→null) · isSpecialActive (SND=เสาร์/NVP=พุธ) · cupReconcile (balanced / swapLikely / totalDiff≠0)

## 3. E2E ต่อ module
| Module | ทดสอบ | ผล |
|---|---|---|
| **M5 Dashboard** `/` | โหลด, ของใกล้หมด SND 65/NVP 69, ยอดขายวันนี้, variance | ✅ |
| **M1 Stock** `/stock` | ยกมา carry-forward=6 (จากเมื่อวาน), เต็ม(แพ็ค)+เศษ(g), กรอก รับเข้า4+ขาย2 → คงเหลือ **8** auto, Variance **เขียว "ยอดตรง"**, counter 1/104 | ✅ |
| **M2 Restock** `/restock` | NVP+พุธ = **104 รายการ** (มี special), NVP+เสาร์ = **97 รายการ** (special ถูกกรอง), need +1/+2/✓ ถูก | ✅ |
| **M3 Sales** `/sales` | In-store (เงินสด/QR/EDC) + Delivery (Grab/Lineman), รวมสด, บาทฟอร์แมต | ✅ |
| **M4 Cups** `/cups` | ใช้จริง auto, เคสสลับขนาด (P −3, S +3) → ต่างรวม **0** + badge **"⚠️ น่าจะสลับขนาด (ยอดรวมตรง)"** | ✅ |

## 4. ยืนยัน Acceptance Criteria (PRD)
P0-1 เลือกสาขา+วันที่ ✅ · P0-2 114 รายการจัดหมวด accordion ✅ · P0-3 carry-forward ✅ · P0-4 คำนวณ 2 หน่วย ✅ · P0-5 variance ✅ · P0-6 upsert (BFF) ✅ · P0-7 mobile-responsive ✅ · P0-8 Par/ต้องเติม ✅ · P0-9 ยอดขายแยกช่องทาง ✅ · P0-10 special แยกวัน/สาขา ✅ · P0-11 เต็ม+เศษ ✅ · P0-12 reconcile ถ้วย + สลับขนาด ✅

## 5. Bug ที่เจอ + แก้แล้ว
| # | อาการ | แก้ |
|---|---|---|
| 1 | `api/cups/route.ts` TS2783 `{ok,...res}` ซ้ำ key | เอา `ok` ซ้ำออก → build ผ่าน |
| 2 | `/cups` แสดงชื่อสาขาที่ agent เดา ("สนามบินน้ำ/นวมินทร์") ผิด guardrail ห้ามแต่งข้อมูล | เปลี่ยนเป็น "สาขา SND/NVP" · seed.sql name = code |

## 6. หมายเหตุก่อน Deploy
- รันบน **memory store (seeded)** สำหรับ demo/preview — ข้อมูลจริงจาก BackOffice
- Production: ตั้ง `USE_SUPABASE=1` + env + รัน migrations/seed (README) → ใช้ Supabase
- Supabase adapter (`lib/supabase.ts`) เขียนตรง schema แล้ว แต่ยัง **ไม่ได้ smoke test กับ DB จริง** → ควรทดสอบ 1 รอบหลังตั้ง Supabase (insert/read 1 วัน)
- ยังไม่ผูก auth (ใครเปิด URL ก็กรอกได้) — v1 ใช้ในร้าน; ถ้าต้องการล็อกอินเพิ่มใน Phase 2

## 7. Verdict
**พร้อม Deploy** — P0 ครบ, build/test/typecheck เขียว, E2E ผ่านทุก module. เหลือ smoke test Supabase หลังตั้ง env จริง.
