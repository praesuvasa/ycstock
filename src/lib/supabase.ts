// Supabase-backed store (production path, USE_SUPABASE=1). เข้าถึงจาก BFF เท่านั้น
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleRequest, ScheduleRow, ItemBrand, Branch, StockRow, SalesRow, CupRow, RestockRow, Meta, CupSize, Item, ParMap, User, Role, BranchScope, AuditEntry, Weekday, Requisition, RestockSelectionEntry, RestockExtraItem, ReturnHistoryRow, PaymentIncident, ExpiryCheckRow, ProductionOrder, ProductionOrderSummary, ProductionOrderItem, ProductionOrderItemInput, BranchNotice, SalesEvidence, EvidenceType, MatchStatus, CashRemittance, RestockReceiptStatus, RestockSheetSummary, AdminFlag, AdminFlagReason, PendingReturnRow, TimeClockEntry, TimeClockSettings, StaffAllowanceUse, AllowanceSummary, StaffFeedback } from "./types";
import { BRANCHES } from "./types";
import { variance, restockNeed, isSpecialActive, monthRange, ALLOWANCE_DEFAULT_MONTHLY } from "./calc";
import { hashPasscode, verifyPasscode, generateSetupCode, SETUP_CODE_TTL_HOURS, passcodeLookupHash } from "./auth";
import { todayBangkok } from "./fmt";

// สร้าง client สดทุกครั้ง (แบบเดียวกับ /api/debug ที่พิสูจน์แล้วว่าอ่านได้ครบ) — เลี่ยง singleton ที่อาจถูก init ตอน env ยังไม่พร้อม
function sb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

const sizes: CupSize[] = ["P", "S", "BOWL", "14OZ"];

// ดึง "แถวสต็อกล่าสุดก่อน/ถึงวันที่กำหนด" ต่อ item เป็น Map
//
// ⚠️ ต้องเรียง date DESC + เอาตัวแรกที่เจอ (first wins) เท่านั้น ห้ามเรียง ASC แล้ว last-wins
// เพราะ PostgREST จำกัดผลลัพธ์ไว้ ~1000 แถวโดย default (ไม่ error ไม่เตือน ตัดทิ้งเงียบ ๆ)
// ถ้าเรียง ASC แล้วโดนตัด = ตัดแถว "ใหม่สุด" ทิ้ง ซึ่งคือแถวที่ต้องใช้จริง → ยกมาเพี้ยนไปเป็นค่าของวันเก่า
// (เคสจริง: NVP มี 1,056 แถว ทำให้ยกมา 25/07 ไปหยิบค่าของ 23/07 มาแทน 24/07 ทั้ง 55 รายการ)
// เรียง DESC แล้วถ้าโดนตัดจะตัดแถว "เก่าสุด" ทิ้งแทน ซึ่งไม่กระทบผลลัพธ์
async function latestStockMapBefore(
  branch: Branch, date: string, opts?: { inclusive?: boolean; select?: string }
): Promise<Map<string, any>> {
  const select = opts?.select ?? "item_id,remain_pack,remain_g,date";
  let q = sb().from("stock_daily").select(select).eq("branch_id", branch);
  q = opts?.inclusive ? q.lte("date", date) : q.lt("date", date);
  const { data } = await q.order("date", { ascending: false }).limit(50000);
  const map = new Map<string, any>();
  for (const r of (data ?? []) as any[]) {
    if (!map.has(r.item_id)) map.set(r.item_id, r); // first wins (เรียง DESC = ใหม่สุดมาก่อน)
  }
  return map;
}

// คำนวณ auto-fill ของ "รับเข้า" ใหม่จากศูนย์ทุกครั้ง โดยรวมยอดจากทุก receipt (ทุกใบ) ที่ยืนยันในวันจริงเดียวกัน (todayStr)
// กันเคสมีหลายใบของ item เดียวกันมายืนยันวันเดียวกัน (ต้องบวกรวม ไม่ใช่ทับ)
async function recomputeAutoFillForToday(branch: Branch, itemId: string, todayStr: string): Promise<void> {
  const startIso = `${todayStr}T00:00:00.000Z`;
  const dayAfter = new Date(startIso);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const endIso = dayAfter.toISOString();

  const { data: receipts } = await sb().from("restock_receipts")
    .select("received_qty,received_qty_g,not_received")
    .eq("branch_id", branch).eq("item_id", itemId)
    .gte("confirmed_at", startIso).lt("confirmed_at", endIso);

  let sumPack = 0;
  let sumG = 0;
  for (const r of receipts ?? []) {
    if (r.not_received) continue;
    sumPack += Number(r.received_qty);
    sumG += Number(r.received_qty_g);
  }

  const { data: existing } = await sb().from("stock_daily")
    .select("carry_pack,carry_g,in_pack,in_g,in_auto_pack,remain_confirmed,used,returned,remain_pack,remain_g,transfer_in_g,transfer_out,pack_adjust")
    .eq("branch_id", branch).eq("date", todayStr).eq("item_id", itemId).maybeSingle();

  if (existing) {
    // แถวนี้พนักงานกรอก "รับเข้า" เองที่หน้าสต็อก (หรือแก้ทับค่าที่ระบบเติมไว้) → ไม่แตะต่อ
    //
    // แต่ถ้ายอดที่เพิ่งยืนยันไม่ตรงกับที่กรอกไว้ ต้องบอกให้คนรู้ (v1.20 — แพรถามเคสนี้เอง)
    // ระบบไม่รู้ว่าอันไหนถูก จะไปทับให้ก็ไม่ได้ · ถ้าเงียบไว้ ของที่หายไปจะไม่มีใครเห็นเลย
    if (existing.in_auto_pack === null || existing.in_auto_pack === undefined) {
      const manualPack = Number(existing.in_pack ?? 0);
      const manualG = Number(existing.in_g ?? 0);
      if (manualPack !== sumPack || manualG !== sumG) {
        const { data: itRow } = await sb().from("items").select("name").eq("id", itemId).maybeSingle();
        await sb().from("stock_admin_flags").insert({
          branch_id: branch, date: todayStr, item_id: itemId,
          item_name: itRow?.name ?? itemId,
          reason: "receipt_vs_manual",
          detail:
            `กรอกเองที่หน้าสต็อก ${manualPack}${manualG ? ` +${manualG}g` : ""}` +
            ` · ยืนยันรับของ ${sumPack}${sumG ? ` +${sumG}g` : ""}` +
            ` — ระบบคงยอดที่กรอกเองไว้ ไม่ได้แก้ให้`,
        });
      }
      return;
    }
    // "รับเข้า" = ของจากรถส่งอย่างเดียวแล้ว (v1.17) — ของที่แกะจากรายการอื่นย้ายไปอยู่ transfer_in_g
    // จึงเขียนทับด้วย sumPack ได้ตรง ๆ ไม่ต้องกลัวไปล้างส่วนที่มาจากการแกะเหมือนเดิม
    const changed = Number(existing.in_pack ?? 0) !== sumPack || Number(existing.in_g ?? 0) !== sumG;

    // ยังไม่มีใครนับยืนยันคงเหลือของวันนี้ → ปลอดภัยที่จะบวกส่วนต่างที่รับเข้าเพิ่มเข้าคงเหลือให้เลย
    // (ไม่มีของจริงจะไปทับ) กันไม่ให้ของที่มาเพิ่มดูเหมือนหายไปเป็น "ใช้ไป" จนกว่าจะมีคนแก้คงเหลือเอง (v1.27 — แพรถามเคสนี้)
    // ถ้ามีคนนับยืนยันไปแล้วจริง (remain_confirmed) ยังคงห้ามแตะ remain_pack/remain_g เหมือนเดิม แค่แจ้งเตือนแอดมิน
    let newRemainPack = Number(existing.remain_pack ?? 0);
    let newRemainG = Number(existing.remain_g ?? 0);
    if (changed && !existing.remain_confirmed) {
      newRemainPack += sumPack - Number(existing.in_pack ?? 0);
      newRemainG += sumG - Number(existing.in_g ?? 0);
    }

    // ยืนยันรับของ "หลัง" มีคนนับ+ยืนยันคงเหลือของวันนั้นไปแล้ว (แพรถามเคสนี้ 2026-07-29)
    // เกิดได้จาก: เคลียร์ใบเก่าค้าง · ของมาไม่พร้อมกันแล้วนับก่อน · เพิ่มรายการนอกใบ · แก้/ยกเลิกติ๊ก
    //
    // ยอดรับเข้าที่เติมใหม่ถูกต้อง (ของมาจริง) แต่คงเหลือยังเป็นเลขที่นับไว้ตอนของยังไม่มา
    // ผลต่างจึงเปลี่ยนไปเงียบ ๆ หลังคนนับปิดงานไปแล้ว — คนนับอาจดูเหมือนนับขาดทั้งที่ไม่ได้ทำอะไรผิด
    if (changed && existing.remain_confirmed) {
      const { data: itRow } = await sb().from("items").select("name").eq("id", itemId).maybeSingle();
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date: todayStr, item_id: itemId,
        item_name: itRow?.name ?? itemId,
        reason: "receipt_after_count",
        detail:
          `นับสต็อกไปแล้ว (คงเหลือ ${existing.remain_pack})` +
          ` · ยืนยันรับของทีหลัง รับเข้า ${existing.in_pack} → ${sumPack}` +
          ` — ระบบอัปเดตรับเข้าให้แล้ว แต่คงเหลือยังเป็นยอดที่นับก่อนของมา`,
      });
    }

    // คิดผลต่างใหม่ด้วย — ไม่งั้นเลขผลต่างที่เก็บไว้จะเป็นของยอดรับเข้าชุดเก่า (ค้างผิดในฐานข้อมูล
    // แม้หน้าเว็บจะคิดสดให้ถูกก็ตาม — รายงาน/ตรวจย้อนหลังอ่านจากคอลัมน์นี้)
    const { data: gpuRow } = await sb().from("items").select("grams_per_uom").eq("id", itemId).maybeSingle();
    const gpu = Number(gpuRow?.grams_per_uom) || 0;
    const newVariance = variance(
      existing.carry_pack, sumPack, existing.used, existing.returned, newRemainPack,
      gramsToPacks(existing.transfer_in_g, gpu), existing.transfer_out ?? 0,
      gramsToPacks(existing.pack_adjust ?? 0, gpu)
    );

    const { error: updErr } = await sb().from("stock_daily").update({
      in_pack: sumPack, in_g: sumG, in_auto_pack: sumPack, in_auto_g: sumG,
      remain_pack: newRemainPack, remain_g: newRemainG, variance: newVariance,
    }).eq("branch_id", branch).eq("date", todayStr).eq("item_id", itemId);
    if (updErr) throw updErr;
  } else {
    const { data: prev } = await sb().from("stock_daily")
      .select("remain_pack,remain_g").eq("branch_id", branch).eq("item_id", itemId).lt("date", todayStr)
      .order("date", { ascending: false }).limit(1).maybeSingle();
    const carryPack = prev?.remain_pack ?? 0;
    const carryG = prev?.remain_g ?? 0;
    // แถวใหม่จาก auto-fill ล้วน ๆ ยังไม่มีใครนับ/ยืนยันคงเหลือจริง — remain_confirmed: false
    // ให้หน้าสต็อกโชว์ช่องคงเหลือเป็นค่าว่างรอพนักงานกรอกเอง ไม่ใช่โชว์เลขที่คำนวณไว้ล่วงหน้า
    const { error: insErr } = await sb().from("stock_daily").insert({
      date: todayStr, branch_id: branch, item_id: itemId,
      carry_pack: carryPack, carry_g: carryG, in_pack: sumPack, in_g: sumG, used: 0,
      remain_pack: carryPack + sumPack, remain_g: carryG + sumG, returned: 0, returned_g: 0,
      note: "", variance: 0, in_auto_pack: sumPack, in_auto_g: sumG, remain_confirmed: false,
    });
    if (insErr) throw insErr;
  }
}

// แปลงกรัมที่โอนเข้ามาเป็น "แพ็ค" เพื่อเอาไปเข้าสมการ variance ที่คิดเป็นแพ็ค
// ปัดลง — เศษที่ไม่ครบแพ็คไปโผล่ในช่องเศษกรัมของแถวนั้นอยู่แล้ว
const gramsToPacks = (g: unknown, gpu: number): number =>
  gpu > 0 ? Math.floor(Number(g ?? 0) / gpu) : 0;

const userRow = (r: any): User => ({
  id: r.id, name: r.name, role: r.role, branchScope: r.branch_scope, active: r.active,
  isSenior: !!r.is_senior,
  mustSetPasscode: !!r.must_set_passcode,
  allowanceEnabled: r.allowance_enabled ?? false,
  allowanceMonthly: Number(r.allowance_monthly ?? ALLOWANCE_DEFAULT_MONTHLY),
  workUnit: (r.work_unit ?? "store") as User["workUnit"],
});

const allowanceRow = (r: any): StaffAllowanceUse => ({
  id: r.id, userId: r.user_id, branch: r.branch_id ?? null, useDate: r.use_date,
  billTotal: Number(r.bill_total), discountAmount: Number(r.discount_amount), paidAmount: Number(r.paid_amount),
  imagePath: r.image_path ?? null, ocrDiscount: r.ocr_discount == null ? null : Number(r.ocr_discount),
  needsReview: !!r.needs_review, reviewNote: r.review_note ?? "",
  note: r.note ?? "", userName: r.created_by_name ?? undefined, createdAt: r.created_at,
});

export const supabaseStore = {
  async getMeta(): Promise<Meta> {
    const itemsRes = await sb()
      .from("items")
      .select("id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort,check_frequency,show_remainder,variable_yield,expiry_check,expiry_warn_days,expiry_allow_sell_front,expiry_allow_return,expiry_convert_to_item_id,expiry_convert_g,brand");
    if (itemsRes.error) throw new Error("query items: " + itemsRes.error.message);
    const parsRes = await sb().from("par_levels").select("item_id,branch_id,level");
    if (parsRes.error) throw new Error("query par_levels: " + parsRes.error.message);
    const items = (itemsRes.data ?? []).slice().sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
    const pars = parsRes.data;
    const mapped: Item[] = items.map((r: any) => ({
      id: r.id, name: r.name, category: r.category, unit: r.unit,
      isSpecial: r.is_special, isCup: r.is_cup, cupSize: r.cup_size ?? undefined,
      hasRemainder: r.has_remainder, gramsPerUOM: Number(r.grams_per_uom ?? 0),
      remainderGroup: r.remainder_group ?? undefined, sort: r.sort,
      checkFrequency: r.check_frequency ?? "daily", showRemainderOnRestock: r.show_remainder ?? false,
      variableYield: r.variable_yield ?? false,
      expiryCheck: r.expiry_check ?? false,
      expiryWarnDays: Number(r.expiry_warn_days ?? 5),
      expiryAllowSellFront: r.expiry_allow_sell_front ?? true,
      expiryAllowReturn: r.expiry_allow_return ?? true,
      expiryConvertToItemId: r.expiry_convert_to_item_id ?? null,
      expiryConvertG: r.expiry_convert_g == null ? null : Number(r.expiry_convert_g),
      brand: (r.brand ?? "yc") as Item["brand"],
    }));
    const par: ParMap = {};
    for (const it of mapped) par[it.id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
    for (const p of pars ?? []) {
      if (!par[p.item_id]) par[p.item_id] = Object.fromEntries(BRANCHES.map((b) => [b, null]));
      (par[p.item_id] as any)[p.branch_id] = p.level;
    }
    return { branches: BRANCHES, items: mapped, par };
  },

  // แท็กแบรนด์รายสินค้า (v1.25) — แยกจาก setItemConfig เพราะเป็นคนละเรื่องกัน
  // (อันนั้นคือวิธีนับ/แกะ · อันนี้คือ "ของใคร") และหน้าตั้งค่าจะได้บันทึกทีละอย่างไม่ทับกัน
  // ── ตารางกะ (v1.26) ──
  // join นิยามกะให้ในตัว: หา def ของสาขานั้นก่อน ไม่เจอค่อยใช้ def กลาง ('*' = ลา/หยุด/ปิดร้าน)
  async listSchedules(branch: Branch, date: string): Promise<ScheduleRow[]> {
    const { data, error } = await sb().from("schedules")
      .select("employee_name,shift_code,pt_hours,note")
      .eq("branch_id", branch).eq("work_date", date)
      .order("employee_name");
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const { data: defs } = await sb().from("shift_definitions")
      .select("code,branch_id,label,start_time,end_time,hours")
      .in("code", [...new Set(rows.map((r: any) => r.shift_code))]);
    const defOf = (code: string) =>
      (defs ?? []).find((d: any) => d.code === code && d.branch_id === branch)
      ?? (defs ?? []).find((d: any) => d.code === code && d.branch_id === "*");

    return rows.map((r: any) => {
      const d: any = defOf(r.shift_code);
      return {
        employeeName: r.employee_name,
        shiftCode: r.shift_code,
        shiftLabel: d?.label ?? r.shift_code,
        startTime: d?.start_time ? String(d.start_time).slice(0, 5) : null,
        endTime: d?.end_time ? String(d.end_time).slice(0, 5) : null,
        hours: Number(d?.hours ?? 0),
        ptHours: r.pt_hours == null ? null : Number(r.pt_hours),
        note: r.note ?? "",
      };
    });
  },

  // ตารางทั้งเดือนของสาขา (v1.27) — หน้าตารางงานใช้ · join นิยามกะให้เหมือน listSchedules
  async listSchedulesMonth(branch: Branch, month: string): Promise<(ScheduleRow & { workDate: string })[]> {
    const from = `${month}-01`;
    const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString().slice(0, 10); // วันสุดท้ายของเดือน
    const { data, error } = await sb().from("schedules")
      .select("work_date,employee_name,shift_code,pt_hours,note")
      .eq("branch_id", branch).gte("work_date", from).lte("work_date", to)
      .order("work_date").order("employee_name");
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const { data: defs } = await sb().from("shift_definitions")
      .select("code,branch_id,label,start_time,end_time,hours")
      .in("code", [...new Set(rows.map((r: any) => r.shift_code))]);
    const defOf = (code: string) =>
      (defs ?? []).find((d: any) => d.code === code && d.branch_id === branch)
      ?? (defs ?? []).find((d: any) => d.code === code && d.branch_id === "*");
    return rows.map((r: any) => {
      const d: any = defOf(r.shift_code);
      return {
        workDate: r.work_date,
        employeeName: r.employee_name,
        shiftCode: r.shift_code,
        shiftLabel: d?.label ?? r.shift_code,
        startTime: d?.start_time ? String(d.start_time).slice(0, 5) : null,
        endTime: d?.end_time ? String(d.end_time).slice(0, 5) : null,
        hours: Number(d?.hours ?? 0),
        ptHours: r.pt_hours == null ? null : Number(r.pt_hours),
        note: r.note ?? "",
      };
    });
  },

  // ── คำขอเปลี่ยนตาราง (v1.27) ──
  async listScheduleRequests(branch: Branch): Promise<ScheduleRequest[]> {
    const { data, error } = await sb().from("schedule_requests")
      .select("*").eq("branch_id", branch)
      .order("status").order("work_date", { ascending: false }).limit(60);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, branch: r.branch_id, workDate: r.work_date, employeeName: r.employee_name,
      requestedBy: r.requested_by, kind: r.kind, leaveCode: r.leave_code, swapWith: r.swap_with,
      fromShift: r.from_shift, reason: r.reason, status: r.status,
      decidedBy: r.decided_by, decidedAt: r.decided_at, createdAt: r.created_at,
    }));
  },

  async createScheduleRequest(input: {
    branch: Branch; workDate: string; employeeName: string; requestedBy: string;
    kind: "leave" | "swap"; swapWith?: string; leaveCode?: string; reason: string;
    status?: string; fromShift?: string | null;
  }): Promise<ScheduleRequest> {
    const { data, error } = await sb().from("schedule_requests").insert({
      branch_id: input.branch, work_date: input.workDate, employee_name: input.employeeName,
      requested_by: input.requestedBy, kind: input.kind, swap_with: input.swapWith ?? null,
      leave_code: input.leaveCode ?? null, reason: input.reason,
      status: input.status ?? "pending", from_shift: input.fromShift ?? null,
    }).select().single();
    if (error) throw error;
    await this.flagScheduleChange(input.branch, input.workDate, input.employeeName,
      input.kind === "swap"
        ? `${input.requestedBy} ขอสลับกะ ${input.employeeName} ↔ ${input.swapWith} — รออนุมัติ`
        : `${input.requestedBy} ขอลา ${input.leaveCode} ให้ ${input.employeeName}`);
    return {
      id: data.id, branch: data.branch_id, workDate: data.work_date, employeeName: data.employee_name,
      requestedBy: data.requested_by, kind: data.kind, leaveCode: data.leave_code, swapWith: data.swap_with,
      fromShift: data.from_shift, reason: data.reason, status: data.status,
      decidedBy: data.decided_by, decidedAt: data.decided_at, createdAt: data.created_at,
    };
  },

  /** แจ้งแอดมินทุกครั้งที่ตารางเปลี่ยน — แพรกำหนดไว้เป็นกติกาข้อหนึ่ง */
  async flagScheduleChange(branch: Branch, date: string, employeeName: string, detail: string) {
    await sb().from("stock_admin_flags").insert({
      branch_id: branch, date, item_id: null, item_name: employeeName,
      reason: "schedule_changed", detail,
    });
  },

  // ลา AL/PL/SL — มีผลทันทีถ้าสิทธิ์ปีนี้ยังเหลือ · สิทธิ์หมดแล้วแปลงเป็น LWP ให้เอง (ไม่ปฏิเสธ)
  async applyLeaveRequest(input: {
    branch: Branch; workDate: string; employeeName: string; requestedBy: string;
    leaveCode: string; reason: string;
  }): Promise<{ appliedCode: string; downgraded: boolean; used: number; quota: number; remaining: number }> {
    // ลาแล้วกะต้องไม่ขาดคน (แพรกำหนดไว้ตั้งแต่ต้น: "ต้องไม่กระทบเงื่อนไขกติกากะ")
    // เช็คก่อนแตะข้อมูลใด ๆ — ไม่ผ่านคือไม่บันทึก และบอกว่าต้องแก้อะไรก่อน
    const pattern = await this.checkStaffingPattern(input.branch, input.workDate, input.employeeName, input.leaveCode);
    if (!pattern.ok) throw new Error(pattern.error);

    const year = input.workDate.slice(0, 4);
    const { data: quotaRow } = await sb().from("leave_quotas")
      .select("days_per_year").eq("code", input.leaveCode).maybeSingle();
    const quota = Number(quotaRow?.days_per_year ?? 0);

    const { count } = await sb().from("schedules")
      .select("id", { count: "exact", head: true })
      .eq("employee_name", input.employeeName).eq("shift_code", input.leaveCode)
      .gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`);
    const used = count ?? 0;

    // LWP ไม่มีโควตา ใช้ได้เสมอ · ประเภทอื่นถ้าเต็มแล้วให้ตกไปเป็น LWP
    const outOfQuota = input.leaveCode !== "LWP" && used >= quota;
    const appliedCode = outOfQuota ? "LWP" : input.leaveCode;

    const { data: cur } = await sb().from("schedules")
      .select("id,shift_code").eq("branch_id", input.branch)
      .eq("work_date", input.workDate).eq("employee_name", input.employeeName).maybeSingle();

    if (cur) {
      await sb().from("schedules").update({ shift_code: appliedCode, updated_at: new Date().toISOString() }).eq("id", cur.id);
      await sb().from("schedule_changes").insert({
        schedule_id: cur.id, from_shift: cur.shift_code, to_shift: appliedCode,
        reason: input.reason, changed_by: input.requestedBy,
      });
    } else {
      await sb().from("schedules").insert({
        branch_id: input.branch, work_date: input.workDate, employee_name: input.employeeName,
        shift_code: appliedCode, note: input.reason, created_by: input.requestedBy,
      });
    }

    await this.createScheduleRequest({
      branch: input.branch, workDate: input.workDate, employeeName: input.employeeName,
      requestedBy: input.requestedBy, kind: "leave", leaveCode: appliedCode,
      reason: input.reason, status: "auto", fromShift: cur?.shift_code ?? null,
    });

    return {
      appliedCode, downgraded: outOfQuota, used, quota,
      remaining: Math.max(quota - used - (outOfQuota ? 0 : 1), 0),
    };
  },

  /** ด่านเช็ครูปแบบคนเข้ากะของวันนั้น — ใช้ร่วมกันทั้ง "แก้ตาราง" และ "ขอลา"
   *  (v1.27.1 เดิมมีเฉพาะเส้นทางแก้ตาราง ทำให้ขอลาแล้วกะขาดคนได้โดยไม่มีอะไรเตือน — แพรเจอ 2026-07-30) */
  async checkStaffingPattern(branch: Branch, workDate: string, employeeName: string, newCode: string) {
    const { data: sameDay } = await sb().from("schedules")
      .select("employee_name,shift_code").eq("branch_id", branch).eq("work_date", workDate);
    const WORKING = ["F", "M", "A", "FH", "PT"];
    const after = (sameDay ?? []).map((r: any) =>
      r.employee_name === employeeName ? { ...r, shift_code: newCode } : r);
    const codes = after.filter((r: any) => WORKING.includes(r.shift_code)).map((r: any) => r.shift_code).sort();

    const { data: rule } = await sb().from("branch_staffing_rules")
      .select("patterns").eq("branch_id", branch).maybeSingle();
    const allowed: string[] = rule?.patterns ?? [];
    if (allowed.length === 0) return { ok: true as const };

    const normalized = allowed.map((p) => p.split("+").sort().join("+"));
    const key = codes.join("+");
    // FH (ครึ่งวันของ SND) นับเป็น F ตอนเทียบรูปแบบ — เป็นกะของวันนั้นอยู่ดี แค่เวลาสั้นลง
    const keyAsFull = codes.map((c: string) => (c === "FH" ? "F" : c)).sort().join("+");
    if (normalized.includes(key) || normalized.includes(keyAsFull)) return { ok: true as const };

    // บอกให้ครบว่าเหลือใครอยู่บ้าง และต้องแก้อะไรถึงจะผ่าน — ไม่ใช่แค่ "ไม่ได้"
    const who = after.filter((r: any) => WORKING.includes(r.shift_code))
      .map((r: any) => `${r.employee_name} (${r.shift_code})`).join(" · ");
    return {
      ok: false as const,
      error: `วันนั้นจะเหลือคนเข้ากะแบบ "${key || "ไม่มีใครเลย"}" ซึ่งไม่เข้าเงื่อนไขของสาขา (${allowed.join(" / ")})`
        + (who ? ` — ตอนนี้เหลือ ${who} · ต้องให้คนที่อยู่เปลี่ยนกะ หรือหาคนเข้าเพิ่มก่อน` : ""),
    };
  },

  // แก้กะรายวัน (v1.27) — senior staff / แอดมิน · ผ่านด่านเช็คกติกาก่อนเสมอ
  //
  // 2 ด่านตามที่แพรกำหนด:
  //   1. คนเข้ากะวันนั้นต้องตรงรูปแบบของสาขา (NVP: F+A / M+A+A / F+A+A · SND: F / F+F / F+PT)
  //   2. วันหยุดรวมของคนนั้นในเดือนต้องไม่เกินโควตา (วันหยุดประจำตัว + วันหยุดบริษัทในเดือนนั้น)
  // ไม่ผ่าน = ไม่บันทึก และบอกว่าติดข้อไหน (ไม่ใช่แค่ "บันทึกไม่สำเร็จ")
  async setScheduleShift(input: {
    branch: Branch; workDate: string; employeeName: string; shiftCode: string;
    reason: string; changedBy: string;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const month = input.workDate.slice(0, 7);
    const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
      .toISOString().slice(0, 10);

    // ── ด่าน 1: รูปแบบคนเข้ากะของวันนั้น ──
    const pattern = await this.checkStaffingPattern(input.branch, input.workDate, input.employeeName, input.shiftCode);
    if (!pattern.ok) return { ok: false, error: pattern.error };
    const { data: sameDay } = await sb().from("schedules")
      .select("id,employee_name,shift_code")
      .eq("branch_id", input.branch).eq("work_date", input.workDate);

    // ── ด่าน 2: โควตาวันหยุดของเดือนนั้น ──
    if (input.shiftCode === "OFF") {
      const { data: def } = await sb().from("staff_defaults")
        .select("weekly_off_dow").eq("employee_name", input.employeeName).maybeSingle();
      if (def?.weekly_off_dow != null) {
        // วันหยุดประจำตัวที่ตกในเดือนนั้น + วันหยุดบริษัทในเดือนนั้น
        const { data: hol } = await sb().from("public_holidays")
          .select("holiday_date").eq("holiday_type", "company")
          .gte("holiday_date", `${month}-01`).lte("holiday_date", monthEnd);
        let base = 0;
        const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
        for (let d = 1; d <= Number(monthEnd.slice(8)); d++) {
          if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === Number(def.weekly_off_dow)) base += 1;
        }
        const quota = base + (hol ?? []).length;

        const { data: offs } = await sb().from("schedules")
          .select("work_date").eq("employee_name", input.employeeName).eq("shift_code", "OFF")
          .gte("work_date", `${month}-01`).lte("work_date", monthEnd);
        const used = (offs ?? []).filter((r: any) => r.work_date !== input.workDate).length;
        if (used + 1 > quota) {
          return {
            ok: false,
            error: `${input.employeeName} หยุดครบ ${quota} วันของเดือนนี้แล้ว (วันหยุดประจำตัว ${base} + วันหยุดบริษัท ${(hol ?? []).length}) — ถ้าจะหยุดเพิ่มต้องใช้สิทธิ์ลา AL/PL แทน`,
          };
        }
      }
    }

    const cur = (sameDay ?? []).find((r: any) => r.employee_name === input.employeeName);
    if (cur) {
      await sb().from("schedules").update({ shift_code: input.shiftCode, updated_at: new Date().toISOString() }).eq("id", cur.id);
      await sb().from("schedule_changes").insert({
        schedule_id: cur.id, from_shift: cur.shift_code, to_shift: input.shiftCode,
        reason: input.reason, changed_by: input.changedBy,
      });
    } else {
      await sb().from("schedules").insert({
        branch_id: input.branch, work_date: input.workDate, employee_name: input.employeeName,
        shift_code: input.shiftCode, note: input.reason, created_by: input.changedBy,
      });
    }
    await this.flagScheduleChange(input.branch, input.workDate, input.employeeName,
      `${input.changedBy} แก้กะ ${cur?.shift_code ?? "-"} → ${input.shiftCode}: ${input.reason}`);
    return { ok: true };
  },

  // อนุมัติ/ปฏิเสธคำขอสลับ — อนุมัติแล้วสลับกะให้ทั้งคู่ในวันเดียวกัน
  async decideScheduleRequest(id: number, approve: boolean, decidedBy: string, note: string) {
    const { data: req } = await sb().from("schedule_requests").select("*").eq("id", id).maybeSingle();
    if (!req) return { ok: false as const, error: "ไม่พบคำขอนี้" };
    if (req.status !== "pending") return { ok: false as const, error: "คำขอนี้ถูกตัดสินไปแล้ว" };

    if (approve && req.kind === "swap") {
      const { data: rows } = await sb().from("schedules")
        .select("id,employee_name,shift_code")
        .eq("branch_id", req.branch_id).eq("work_date", req.work_date)
        .in("employee_name", [req.employee_name, req.swap_with]);
      const a = (rows ?? []).find((r: any) => r.employee_name === req.employee_name);
      const b = (rows ?? []).find((r: any) => r.employee_name === req.swap_with);
      if (!a || !b) return { ok: false as const, error: "วันนั้นไม่มีตารางของคนใดคนหนึ่ง สลับไม่ได้" };
      await sb().from("schedules").update({ shift_code: b.shift_code, updated_at: new Date().toISOString() }).eq("id", a.id);
      await sb().from("schedules").update({ shift_code: a.shift_code, updated_at: new Date().toISOString() }).eq("id", b.id);
      await sb().from("schedule_changes").insert([
        { schedule_id: a.id, from_shift: a.shift_code, to_shift: b.shift_code, reason: `สลับกับ ${b.employee_name}: ${req.reason}`, changed_by: decidedBy },
        { schedule_id: b.id, from_shift: b.shift_code, to_shift: a.shift_code, reason: `สลับกับ ${a.employee_name}: ${req.reason}`, changed_by: decidedBy },
      ]);
      await this.flagScheduleChange(req.branch_id, req.work_date, req.employee_name,
        `${decidedBy} อนุมัติสลับกะ ${a.employee_name} ↔ ${b.employee_name}`);
    }

    await sb().from("schedule_requests").update({
      status: approve ? "approved" : "rejected",
      decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note,
    }).eq("id", id);
    return { ok: true as const };
  },

  async setItemBrand(itemId: string, brand: ItemBrand) {
    const { error } = await sb().from("items").update({ brand }).eq("id", itemId);
    if (error) throw error;
    return { ok: true };
  },

  async setItemConfig(itemId: string, cfg: { hasRemainder: boolean; gramsPerUOM: number; remainderGroup?: string }) {
    const { error } = await sb()
      .from("items")
      .update({
        has_remainder: cfg.hasRemainder,
        grams_per_uom: cfg.gramsPerUOM,
        remainder_group: cfg.remainderGroup && cfg.remainderGroup.trim() ? cfg.remainderGroup.trim() : null,
      })
      .eq("id", itemId);
    if (error) throw error;
    return { ok: true };
  },

  async getStock(branch: Branch, date: string): Promise<StockRow[]> {
    const { items, par } = await this.getMeta();
    const { data: saved } = await sb().from("stock_daily")
      .select("*").eq("branch_id", branch).eq("date", date);
    const savedMap = new Map((saved ?? []).map((r: any) => [r.item_id, r]));
    // previous day remains (latest before date) per item
    const prevMap = await latestStockMapBefore(branch, date);
    return items.map((it) => {
      // ยกมา = คงเหลือของวันก่อนหน้าล่าสุดเสมอ คำนวณสดทุกครั้ง (ไม่ใช่ carry_pack ที่ freeze ไว้ตอนบันทึกแถวนี้ครั้งแรก)
      // กันเคสแก้ไขคงเหลือของวันก่อนหน้าย้อนหลัง แล้วยกมาของวันถัดไปไม่อัปเดตตาม
      const p = prevMap.get(it.id);
      const carryPack = p?.remain_pack ?? 0, carryG = p?.remain_g ?? 0;
      const s = savedMap.get(it.id) as any;
      if (s) return { ...rowFromDb(s), carryPack, carryG };
      return { itemId: it.id, carryPack, carryG, inPack: 0, inG: 0, used: 0,
        remainPack: carryPack, remainG: carryG, returned: 0, note: "", variance: 0, hasEntry: false };
    });
  },

  // "ใครบันทึกล่าสุด เมื่อไหร่" ของสาขา+วันนั้น — ใช้เทียบกันบันทึกทับกัน (v1.14)
  async getStockSavedAt(branch: Branch, date: string): Promise<{ savedAt: string | null; savedBy: string | null }> {
    const { data, error } = await sb().from("stock_daily")
      .select("updated_at,updated_by_name")
      .eq("branch_id", branch).eq("date", date)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { savedAt: data?.updated_at ?? null, savedBy: data?.updated_by_name ?? null };
  },

  async saveStock(branch: Branch, date: string, rows: StockRow[], userName?: string) {
    // เช็คว่ามีค่าที่เคย auto-fill จากการยืนยันรับของไหม — ถ้าพนักงานแก้ทับ ให้เตือนแอดมินครั้งเดียวแล้วเลิกติดตาม
    const { data: existingRows } = await sb().from("stock_daily")
      .select("item_id,in_auto_pack,in_auto_g,in_pack,in_g,used,returned,returned_g,remain_pack,remain_g,remain_confirmed,transfer_out,transfer_in_g,pack_adjust")
      .eq("branch_id", branch).eq("date", date);
    const autoMap = new Map((existingRows ?? []).map((r: any) => [r.item_id, { pack: r.in_auto_pack, g: r.in_auto_g }]));
    // แถวเดิมของวันนี้ ไว้เทียบว่า "แก้ย้อนหลัง" เปลี่ยนค่าอะไรไปบ้าง
    const prevRowMap = new Map((existingRows ?? []).map((r: any) => [r.item_id, r]));
    // แก้ของวันก่อนหน้า = ไม่ใช่วันนี้ (เทียบวันที่ฝั่งเซิร์ฟเวอร์ ไม่เชื่อเครื่อง client)
    const isBackdated = date !== new Date().toISOString().slice(0, 10);
    // ยกมาคำนวณสดจาก DB ตอนบันทึกเสมอ — ห้ามเชื่อ carryPack ที่ client ส่งมา เพราะอาจเป็นค่าเก่าที่ค้างอยู่ในหน้าเว็บ
    // ตั้งแต่ก่อนมีการแก้ไขคงเหลือของวันก่อนหน้าไปแล้ว (กันเซฟทับค่าที่แก้ไปแล้วกลับเป็นค่าผิดเดิม)
    const prevMap = await latestStockMapBefore(branch, date);
    // ต้องใช้แปลง "กรัมที่โอนเข้า" เป็นแพ็คตอนคิด variance
    const { data: itemGpu } = await sb().from("items").select("id,grams_per_uom");
    const gramsPerUomOf = new Map<string, number>((itemGpu ?? []).map((i: any) => [i.id, Number(i.grams_per_uom) || 0]));
    const flags: any[] = [];
    let itemNameMap: Map<string, string> | null = null;
    const payload = [];
    for (const r of rows) {
      const p = prevMap.get(r.itemId);
      const carryPack = p?.remain_pack ?? 0, carryG = p?.remain_g ?? 0;
      const auto = autoMap.get(r.itemId);
      let inAutoPack: number | null = auto?.pack != null ? Number(auto.pack) : null;
      let inAutoG: number | null = auto?.g != null ? Number(auto.g) : null;
      if (inAutoPack != null && (r.inPack !== inAutoPack || r.inG !== (inAutoG ?? 0))) {
        if (!itemNameMap) {
          const { data: items } = await sb().from("items").select("id,name");
          itemNameMap = new Map((items ?? []).map((it: any) => [it.id, it.name]));
        }
        flags.push({
          branch_id: branch, date, item_id: r.itemId, item_name: itemNameMap.get(r.itemId) ?? r.itemId,
          reason: "stock_override", detail: `ระบบเติมให้ ${inAutoPack} → พนักงานแก้เป็น ${r.inPack}`,
        });
        inAutoPack = null; inAutoG = null;
      }

      // ── แจ้งเตือนแอดมินเพิ่ม 2 เคส (แพรขอ 2026-07-26) ──
      const nameOf = async () => {
        if (!itemNameMap) {
          const { data: items } = await sb().from("items").select("id,name");
          itemNameMap = new Map((items ?? []).map((it: any) => [it.id, it.name]));
        }
        return itemNameMap.get(r.itemId) ?? r.itemId;
      };

      // 1) คงเหลือ > ของที่มี (ยกมา+รับเข้า) — เป็นไปไม่ได้ เพราะขาย/ส่งคืนมีแต่ทำให้ลดลง
      //    เช็คเฉพาะ "แพ็ค" ไม่เช็คกรัม เพราะเศษกรัมเกินยกมาได้ตามปกติ (แกะกล่องใหม่มาใช้)
      if (r.remainPack > carryPack + r.inPack) {
        flags.push({
          branch_id: branch, date, item_id: r.itemId, item_name: await nameOf(),
          reason: "stock_impossible",
          detail: `คงเหลือ ${r.remainPack} เกินของที่มี ${carryPack + r.inPack} (ยกมา ${carryPack} + รับเข้า ${r.inPack})`,
        });
      }

      // 3) แพคมีของไม่ตรงจำนวน (แพรขอ 2026-07-29) — ของส่วนเกินเก็บเป็นของร้านใช้ได้เลย
      //    แต่แอดมินต้องรู้ เพราะถ้าเกิดบ่อยกับซัพพลายเออร์เจ้าเดิม ต้องไปคุยกับต้นทาง
      //    เตือนเฉพาะตอนค่าเปลี่ยน ไม่ใช่ทุกครั้งที่กดบันทึกซ้ำ
      const prevAdjust = Number((prevRowMap.get(r.itemId) as any)?.pack_adjust ?? 0);
      const nowAdjust = Number(r.packAdjust ?? 0);
      if (nowAdjust !== 0 && nowAdjust !== prevAdjust) {
        flags.push({
          branch_id: branch, date, item_id: r.itemId, item_name: await nameOf(),
          reason: "cup_pack_mismatch",
          detail: `เปิดแพคแล้วนับได้ ${nowAdjust > 0 ? "เกิน" : "ขาด"} ${Math.abs(nowAdjust)} หน่วย (บันทึก ${nowAdjust > 0 ? "+" : ""}${nowAdjust})`,
        });
      }

      // 2) แก้ยอดหลังจากที่นับ+ยืนยันคงเหลือไปแล้วรอบหนึ่ง — ไม่ว่าช่องไหนก็ตาม และไม่ว่าจะเป็นวันนี้
      //    หรือย้อนหลัง (แพรขอ 2026-08-05 ขยายจากเดิมที่เช็คแค่กรณีย้อนหลัง) — เฉพาะตอนค่าเปลี่ยนจริง
      //    (กดบันทึกซ้ำด้วยตัวเลขเดิมเฉย ๆ ไม่ต้องเตือน)
      const before: any = prevRowMap.get(r.itemId);
      if (before && before.remain_confirmed) {
        const changes: string[] = [];
        if (Number(before.remain_pack) !== r.remainPack) changes.push(`คงเหลือ ${before.remain_pack}→${r.remainPack}`);
        if (Number(before.remain_g) !== r.remainG) changes.push(`คงเหลือเศษ ${before.remain_g}→${r.remainG}g`);
        if (Number(before.in_pack) !== r.inPack) changes.push(`รับเข้า ${before.in_pack}→${r.inPack}`);
        if (Number(before.in_g) !== r.inG) changes.push(`รับเข้าเศษ ${before.in_g}→${r.inG}g`);
        if (Number(before.used ?? 0) !== r.used) changes.push(`ขาย/ใช้ ${before.used ?? 0}→${r.used}`);
        if (Number(before.returned ?? 0) !== r.returned) changes.push(`ส่งคืน ${before.returned ?? 0}→${r.returned}`);
        if (Number(before.returned_g ?? 0) !== (r.returnedG ?? 0)) changes.push(`ส่งคืนเศษ ${before.returned_g ?? 0}→${r.returnedG ?? 0}g`);
        if (changes.length) {
          flags.push({
            branch_id: branch, date, item_id: r.itemId, item_name: await nameOf(),
            reason: isBackdated ? "stock_backdated_edit" : "stock_same_day_edit",
            detail: `${isBackdated ? "แก้ย้อนหลัง" : "แก้ไขซ้ำ (วันนี้)"} · ${changes.join(" · ")}`,
          });
        }
      }

      payload.push({
        date, branch_id: branch, item_id: r.itemId,
        carry_pack: carryPack, carry_g: carryG, in_pack: r.inPack, in_g: r.inG,
        used: r.used, remain_pack: r.remainPack, remain_g: r.remainG, returned: r.returned,
        returned_g: r.returnedG ?? 0,
        pack_adjust: r.packAdjust ?? 0,
        note: r.note,
        // ไม่เขียน transfer_out/transfer_in_g ที่นี่ — ระบบตรวจวันหมดอายุเป็นเจ้าของ 2 ช่องนี้
        // (หน้าสต็อกไม่มีช่องให้กรอก ถ้าเขียนทับจะล้างยอดที่การแกะบันทึกไว้)
        // แต่ต้องเอาค่าที่มีอยู่มาคิด variance ด้วย ไม่งั้นวันที่แกะจะขึ้นผลต่างค้างทั้งที่ไม่มีใครผิด
        variance: variance(
          carryPack, r.inPack, r.used, r.returned, r.remainPack,
          gramsToPacks(prevRowMap.get(r.itemId)?.transfer_in_g, gramsPerUomOf.get(r.itemId) ?? 0),
          prevRowMap.get(r.itemId)?.transfer_out ?? 0,
          // ส่วนต่างจากแพคไม่ครบเป็นหน่วยย่อย (ชิ้น/กรัม) ต้องแปลงเป็นแพ็คก่อนเข้าสมการเดียวกัน
          gramsToPacks(r.packAdjust ?? 0, gramsPerUomOf.get(r.itemId) ?? 0)
        ),
        in_auto_pack: inAutoPack, in_auto_g: inAutoG, remain_confirmed: true,
      });
    }
    const stamped = payload.map((r: any) => ({ ...r, updated_at: new Date().toISOString(), updated_by_name: userName ?? null }));
    const { error } = await sb().from("stock_daily").upsert(stamped, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    if (flags.length) {
      const { error: flagErr } = await sb().from("stock_admin_flags").insert(flags);
      if (flagErr) throw flagErr;
    }
    return { ok: true, updated: 0, inserted: payload.length };
  },

  async getRestock(branch: Branch, weekday: Weekday) {
    const { items, par } = await this.getMeta();
    const active = isSpecialActive(branch, weekday);
    // ดึงคงเหลือปัจจุบันจาก getStock (carry-forward ให้แล้ว) — ใช้ตรรกะเดียวกับหน้ากรอกสต็อก
    const today = new Date().toISOString().slice(0, 10);
    const stock = await this.getStock(branch, today);
    const remainMap = new Map<string, number>(stock.map((s) => [s.itemId, s.remainPack]));
    const remainGMap = new Map<string, number>(stock.map((s) => [s.itemId, s.remainG]));
    const rows: RestockRow[] = [];
    for (const it of items) {
      const p = par[it.id]?.[branch] ?? null;
      if (p == null) continue;
      // ไม่ตัด special ที่ไม่ถึงรอบออกอีกต่อไป — ส่งกลับมาให้หน้า UI แยกไปโชว์ในส่วน "สั่งฉุกเฉินนอกรอบ" แทน
      // (ใช้ active/specialActive ตัดสินใจแยกส่วนที่ฝั่ง frontend, ดู restock/page.tsx RestockByBranch)
      const remain = remainMap.get(it.id) ?? 0;
      rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit,
        par: p, remain, need: restockNeed(p, remain), isSpecial: it.isSpecial,
        remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
        isCup: it.isCup || undefined, hasVariableYield: it.variableYield || undefined });
    }
    return { rows, specialActive: active };
  },

  // สรุปรายการที่ "รับเข้า" (in_pack/in_g > 0) ของวันนั้น — ใช้หน้าประวัติสินค้าเข้า
  async getStockIn(branch: Branch, date: string) {
    const { items } = await this.getMeta();
    const itemById = new Map(items.map((it) => [it.id, it]));
    const { data, error } = await sb().from("stock_daily")
      .select("item_id,in_pack,in_g")
      .eq("branch_id", branch).eq("date", date)
      .or("in_pack.gt.0,in_g.gt.0");
    if (error) throw error;
    const rows = (data ?? [])
      .map((r: any) => {
        const it = itemById.get(r.item_id);
        if (!it) return null;
        return { itemId: it.id, name: it.name, category: it.category, unit: it.unit, inPack: r.in_pack, inG: r.in_g, sort: it.sort };
      })
      .filter((r): r is { itemId: string; name: string; category: string; unit: string; inPack: number; inG: number; sort: number } => r !== null)
      .sort((a, b) => a.sort - b.sort)
      .map(({ sort, ...rest }) => rest);
    return rows;
  },

  // ประวัติส่งคืน/ของเสีย (v1.10) — อ่านจากช่อง returned/returned_g ที่พนักงานกรอกอยู่แล้วในหน้าสต็อก
  // branch = null → ทุกสาขา (admin เท่านั้น) · เรียงวันใหม่สุดก่อน
  // ⚠️ order DESC + limit ชัดเจน (บทเรียนจากบั๊ก PostgREST ตัด 1000 แถวเงียบ ๆ) — ถ้าโดนตัดจะตัดของเก่าทิ้ง ไม่ใช่ของใหม่
  async getReturnHistory(
    branch: Branch | null, from: string, to: string, limit = 500
  ): Promise<ReturnHistoryRow[]> {
    const { items } = await this.getMeta();
    const itemById = new Map(items.map((it) => [it.id, it]));
    let q = sb().from("stock_daily")
      .select("date,branch_id,item_id,returned,returned_g,note")
      .gte("date", from).lte("date", to)
      .or("returned.gt.0,returned_g.gt.0");
    if (branch) q = q.eq("branch_id", branch);
    const { data, error } = await q.order("date", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? [])
      .map((r: any) => {
        const it = itemById.get(r.item_id);
        if (!it) return null;
        return {
          date: r.date, branch: r.branch_id as Branch, itemId: it.id, itemName: it.name, unit: it.unit,
          returned: Number(r.returned) || 0, returnedG: Number(r.returned_g) || 0, note: r.note ?? "",
        };
      })
      .filter((r): r is ReturnHistoryRow => r !== null);
  },

  // N วันล่าสุด (รวมวันนี้) + จำนวนรายการที่มีของเข้าวันนั้น — ใช้เป็น quick-list ในหน้าประวัติสินค้าเข้า
  async getRecentStockInDays(branch: Branch, days: number) {
    // ใช้ todayBangkok() เป็นจุดตั้งต้นเสมอ — ห้ามใช้ new Date() ดิบ ๆ ฝั่งเซิร์ฟเวอร์ (Vercel รันเป็น UTC)
    // ช่วง 00:00–07:00 เวลาไทย new Date() จะได้ "เมื่อวาน" ทำให้ quick-list เพี้ยนไป 1 วันทั้งแถบ
    // และวันนี้จริง (ที่ stock_daily.date เป็น Bangkok date) จะหายไปจากลิสต์ — เทียบ todayBangkok() ที่ getPendingReceiptCount ใช้อยู่แล้ว
    const [ty, tm, td] = todayBangkok().split("-").map(Number);
    const todayUtcMs = Date.UTC(ty, tm - 1, td); // ยึดเป็นวันปฏิทิน ไม่สนโซนเวลาเครื่อง แล้วขยับวันด้วย setUTCDate เท่านั้น
    const since = new Date(todayUtcMs);
    since.setUTCDate(since.getUTCDate() - (days - 1));
    const sinceIso = since.toISOString().slice(0, 10);
    const { data, error } = await sb().from("stock_daily")
      .select("date,in_pack,in_g")
      .eq("branch_id", branch).gte("date", sinceIso)
      .or("in_pack.gt.0,in_g.gt.0");
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of data ?? []) counts.set(r.date, (counts.get(r.date) ?? 0) + 1);
    const out: { date: string; count: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(todayUtcMs);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, count: counts.get(iso) ?? 0 });
    }
    return out;
  },

  async getSales(branch: Branch, date: string): Promise<SalesRow> {
    const { data } = await sb().from("sales_daily").select("*").eq("branch_id", branch).eq("date", date).maybeSingle();
    if (!data) return { cash: 0, qr: 0, edc: 0, grab: 0, lineman: 0, posTotal: null };
    return {
      cash: data.cash, qr: data.qr, edc: data.edc, grab: data.grab, lineman: data.lineman,
      posTotal: data.pos_total === null || data.pos_total === undefined ? null : Number(data.pos_total),
    };
  },

  async saveSales(branch: Branch, date: string, row: SalesRow) {
    // posTotal เป็นชื่อฝั่งแอป ต้องแปลงเป็นชื่อคอลัมน์เอง ไม่งั้น spread จะยิงคีย์ที่ไม่มีในตาราง
    const { posTotal, ...cols } = row;
    const { error } = await sb().from("sales_daily")
      .upsert({ date, branch_id: branch, ...cols, pos_total: posTotal ?? null }, { onConflict: "date,branch_id" });
    if (error) throw error;
    return { ok: true };
  },

  async getCups(branch: Branch, date: string): Promise<CupRow[]> {
    // ตั้งต้น/รับเข้า/คงเหลือ ดึงจากยอดถ้วยในหน้าสต็อก · sold กรอกเองที่หน้า reconcile
    const meta = await this.getMeta();
    const stockById = new Map((await this.getStock(branch, date)).map((s) => [s.itemId, s]));
    const { data } = await sb().from("cup_reconcile").select("size,sold_qty,own_cup").eq("branch_id", branch).eq("date", date);
    const soldMap = new Map((data ?? []).map((r: any) => [r.size as CupSize, Number(r.sold_qty)]));
    const ownMap = new Map((data ?? []).map((r: any) => [r.size as CupSize, Number(r.own_cup ?? 0)]));
    return sizes.map((size) => {
      const it = meta.items.find((i) => i.isCup && i.cupSize === size);
      const s = it ? stockById.get(it.id) : undefined;
      const conv = it?.gramsPerUOM || 50;
      const start = s ? s.carryPack * conv + s.carryG : 0;
      // แพคไม่ครบ/เกิน นับเป็นของที่เข้ามาจริง (แพรสั่ง 2026-07-29: บวกลบตามจำนวนที่ขาดเกิน)
      // ไม่งั้นหน้าเทียบยอดถ้วยจะฟ้อง "ใช้เกินที่ขาย" ทุกครั้งที่เจอแพคไม่ครบ
      const inQ = s ? s.inPack * conv + s.inG + (s.packAdjust ?? 0) : 0;
      const remain = s ? s.remainPack * conv + s.remainG : 0;
      return { size, start, in: inQ, remain, sold: soldMap.get(size) ?? 0, ownCup: ownMap.get(size) ?? 0 };
    });
  },

  async saveCups(branch: Branch, date: string, rows: CupRow[]) {
    const payload = rows.map((r) => ({
      date, branch_id: branch, size: r.size,
      start_qty: r.start, in_qty: r.in, remain_qty: r.remain, sold_qty: r.sold,
      own_cup: r.ownCup ?? 0,
    }));
    const { error } = await sb().from("cup_reconcile").upsert(payload, { onConflict: "date,branch_id,size" });
    if (error) throw error;
    return { ok: true };
  },

  async getDashboard(date: string) {
    const { items, par } = await this.getMeta();
    const lowStock: { branch: Branch; item: string; remain: number; par: number }[] = [];
    const salesToday: { branch: Branch; total: number }[] = [];
    const varianceAlerts: { branch: Branch; count: number }[] = [];
    for (const b of BRANCHES) {
      const latestMap = await latestStockMapBefore(b, date, {
        inclusive: true, select: "item_id,remain_pack,variance,date",
      });
      const remainMap = new Map<string, number>();
      for (const [itemId, r] of latestMap) remainMap.set(itemId, r.remain_pack);
      for (const it of items) {
        const p = par[it.id]?.[b] ?? null;
        if (p == null) continue;
        const remain = remainMap.get(it.id) ?? 0;
        if (remain < p) lowStock.push({ branch: b, item: it.name, remain, par: p });
      }
      const { data: s } = await sb().from("sales_daily").select("*").eq("branch_id", b).eq("date", date).maybeSingle();
      const total = s ? s.cash + s.qr + s.edc + s.grab + s.lineman : 0;
      salesToday.push({ branch: b, total });
      const { data: vrows } = await sb().from("stock_daily")
        .select("variance").eq("branch_id", b).eq("date", date).neq("variance", 0);
      varianceAlerts.push({ branch: b, count: (vrows ?? []).length });
    }
    return { lowStock, salesToday, varianceAlerts };
  },

  // ── auth / users ──
  // คืน mustSetPasscode = true เมื่อเข้าด้วย "รหัสตั้งค่าครั้งแรก" (ยังไม่มี PIN ของตัวเอง)
  // ตรวจ PIN จริงก่อนเสมอ — คนที่ตั้ง PIN แล้วจะไม่มีทางหลุดไปเข้าทางรหัสตั้งค่าเก่า
  async getUserByPasscode(pin: string): Promise<{ user: User; mustSetPasscode: boolean } | { expiredSetupCode: true } | null> {
    const { data } = await sb().from("users").select("*").eq("active", true);
    for (const r of data ?? []) {
      if (verifyPasscode(pin, r.passcode_hash)) return { user: userRow(r), mustSetPasscode: false };
    }
    const now = Date.now();
    let expiredMatch = false;
    for (const r of data ?? []) {
      if (!r.setup_code_hash || !verifyPasscode(pin, r.setup_code_hash)) continue;
      const notExpired = r.setup_code_expires_at && Date.parse(r.setup_code_expires_at) > now;
      if (notExpired) return { user: userRow(r), mustSetPasscode: true };
      expiredMatch = true; // ตรงกับรหัสตั้งค่าของใครสักคน แต่หมดอายุไปแล้ว — บอกให้รู้ตัว ไม่ใช่ "รหัสไม่ถูกต้อง" เฉยๆ
    }
    if (expiredMatch) return { expiredSetupCode: true };
    return null;
  },

  // ── ตั้ง/ออกรหัสเอง (v1.15) ──
  // ออกรหัสตั้งค่าใหม่ = ล้าง PIN เดิมทิ้งด้วย ไม่งั้นคนที่รู้ PIN เก่ายังเข้าได้อยู่
  // (เคสใช้จริงคือ "ลืมรหัส" หรือ "สงสัยว่ารหัสรั่ว" — ทั้งสองอย่างต้องตัดของเก่าทันที)
  async issueSetupCode(userId: string): Promise<string | null> {
    const code = generateSetupCode();
    const { data, error } = await sb().from("users").update({
      setup_code_hash: hashPasscode(code),
      setup_code_expires_at: new Date(Date.now() + SETUP_CODE_TTL_HOURS * 3600_000).toISOString(),
      must_set_passcode: true,
      passcode_hash: null,
    }).eq("id", userId).select("id").maybeSingle();
    if (error) throw error;
    return data ? code : null;
  },

  // PIN ซ้ำกันไม่ได้ เพราะระบบใช้ PIN อย่างเดียวเป็นตัวระบุตัวตน (ไม่มีชื่อผู้ใช้)
  // ถ้าปล่อยให้ซ้ำ คนสองคนจะกลายเป็นคนเดียวกันในสายตาระบบ
  async setOwnPasscode(userId: string, newPin: string): Promise<{ ok: boolean; reason?: "duplicate" }> {
    // เช็คซ้ำกับ "รหัสตั้งค่า" ของคนอื่นที่ยังไม่หมดอายุ — ยังเป็น select-then-verify แบบเดิม
    // (มีช่องว่างแข่งกันทางทฤษฎี แต่ผลกระทบแคบกว่ามาก — รหัสตั้งค่าใช้ครั้งเดียวแล้วหาย ไม่ใช่ของที่ 2 คนแย่งกันเข้าซ้ำได้ต่อเนื่อง)
    const { data } = await sb().from("users").select("id,setup_code_hash,setup_code_expires_at").neq("id", userId);
    const now = Date.now();
    for (const r of data ?? []) {
      const live = r.setup_code_expires_at && Date.parse(r.setup_code_expires_at) > now;
      if (live && verifyPasscode(newPin, r.setup_code_hash)) return { ok: false, reason: "duplicate" };
    }
    // เช็คซ้ำกับ PIN จริงของคนอื่น — ให้ DB บังคับแบบ atomic ผ่าน unique index บน passcode_lookup_hash แทน
    // (แพรขอ 2026-08-04) กัน 2 คนตั้งเลขเดียวกันพร้อมกันเป๊ะแล้วหลุดผ่านทั้งคู่ — select-then-verify แบบเดิมมีช่องว่างตรงนี้จริง
    // ⚠️ บัญชีที่ตั้ง PIN ไปแล้วก่อน migration นี้จะยังไม่มีค่าในคอลัมน์นี้ (backfill ย้อนหลังไม่ได้ เพราะไม่เก็บ PIN ตัวจริง)
    const { error } = await sb().from("users").update({
      passcode_hash: hashPasscode(newPin),
      passcode_lookup_hash: passcodeLookupHash(newPin),
      passcode_set_at: new Date().toISOString(),
      must_set_passcode: false,
      setup_code_hash: null,
      setup_code_expires_at: null,
    }).eq("id", userId);
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "duplicate" };
      throw error;
    }
    return { ok: true };
  },

  // ── หน่วงเวลาเมื่อกรอกรหัสผิดซ้ำ ๆ ──
  async recordLoginAttempt(ip: string, ok: boolean): Promise<void> {
    await sb().from("login_attempts").insert({ ip, ok });
  },
  async countRecentFailedLogins(ip: string, minutes: number): Promise<number> {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { count } = await sb().from("login_attempts")
      .select("ip", { count: "exact", head: true })
      .eq("ip", ip).eq("ok", false).gte("attempted_at", since);
    return count ?? 0;
  },
  // อ่านผู้ใช้รายคน — ใช้ตอนเช็ค session ทุก request จึงต้องเบา (แถวเดียว ไม่ใช่ทั้งตาราง)
  async getUserById(id: string): Promise<User | null> {
    const { data } = await sb().from("users")
      .select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly,must_set_passcode,work_unit,is_senior")
      .eq("id", id).maybeSingle();
    return data ? userRow(data) : null;
  },

  async listUsers(): Promise<User[]> {
    const { data } = await sb().from("users").select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly,must_set_passcode,work_unit,is_senior").order("created_at");
    return (data ?? []).map(userRow);
  },
  // ไม่รับ PIN จากแอดมินอีกต่อไป (v1.15) — สร้างบัญชีพร้อม "รหัสตั้งค่า" แล้วให้เจ้าตัวไปตั้ง PIN เอง
  // คืน setupCode ให้แอดมินเห็นครั้งเดียวตอนสร้าง (ใน DB เก็บแค่ hash เปิดดูย้อนหลังไม่ได้)
  async createUser(input: { name: string; role: Role; branchScope: BranchScope; createdBy: string }): Promise<User & { setupCode: string }> {
    const id = "u-" + Math.abs(Date.now() % 1_000_000).toString(36);
    const setupCode = generateSetupCode();
    const { error } = await sb().from("users").insert({
      id, name: input.name, role: input.role, branch_scope: input.branchScope,
      passcode_hash: null, active: true, created_by: input.createdBy,
      setup_code_hash: hashPasscode(setupCode),
      setup_code_expires_at: new Date(Date.now() + SETUP_CODE_TTL_HOURS * 3600_000).toISOString(),
      must_set_passcode: true,
    });
    if (error) throw error;
    return { id, name: input.name, role: input.role, branchScope: input.branchScope, active: true, setupCode };
  },
  async updateUser(id: string, patch: { name?: string; role?: Role; branchScope?: BranchScope; active?: boolean; allowanceEnabled?: boolean; allowanceMonthly?: number; workUnit?: User["workUnit"]; isSenior?: boolean }): Promise<User | null> {
    const upd: any = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.role !== undefined) upd.role = patch.role;
    if (patch.branchScope !== undefined) upd.branch_scope = patch.branchScope;
    if (patch.active !== undefined) upd.active = patch.active;
    if (patch.allowanceEnabled !== undefined) upd.allowance_enabled = patch.allowanceEnabled;
    if (patch.allowanceMonthly !== undefined) upd.allowance_monthly = patch.allowanceMonthly;
    if (patch.workUnit !== undefined) upd.work_unit = patch.workUnit;
    if (patch.isSenior !== undefined) upd.is_senior = patch.isSenior;
    const { data, error } = await sb().from("users").update(upd).eq("id", id).select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly,work_unit,is_senior").maybeSingle();
    if (error) throw error;
    return data ? userRow(data) : null;
  },

  // ── ลูกค้าเอาแก้วมาเอง (v1.18) — พนักงานกรอกที่หน้าสต็อก ตอนนับถ้วยสิ้นวัน ──
  // เก็บใน cup_reconcile ตารางเดียวกับยอดขายถ้วย เพราะเป็นข้อมูลชุดเดียวกัน (สาขา,วัน,ขนาด)
  async getOwnCups(branch: Branch, date: string): Promise<{ size: CupSize; ownCup: number }[]> {
    const { data } = await sb().from("cup_reconcile").select("size,own_cup")
      .eq("branch_id", branch).eq("date", date);
    return (data ?? []).map((r: any) => ({ size: r.size as CupSize, ownCup: Number(r.own_cup ?? 0) }));
  },

  // upsert เฉพาะคอลัมน์ own_cup — คอลัมน์อื่นมี default ครบ แถวใหม่จึงเกิดได้เอง
  // และตอนชนคีย์เดิมจะไม่ไปแตะ sold_qty ที่แอดมินกรอกไว้ที่หน้าสรุปจำนวน
  async saveOwnCups(branch: Branch, date: string, rows: { size: CupSize; ownCup: number }[]) {
    if (rows.length === 0) return { ok: true };
    const payload = rows.map((r) => ({ date, branch_id: branch, size: r.size, own_cup: r.ownCup }));
    const { error } = await sb().from("cup_reconcile").upsert(payload, { onConflict: "date,branch_id,size" });
    if (error) throw error;
    return { ok: true };
  },

  // ── ความคิดเห็น/ข้อเสนอแนะจากพนักงาน (v1.18) ──
  // anonymous = true → ไม่เก็บ user_id/user_name ลงฐานเลย ไม่ใช่แค่ซ่อนตอนแสดงผล
  // ถ้าเก็บไว้แล้วบอกว่าไม่ระบุชื่อ = หลอกกัน และวันหนึ่งจะมีคนเปิดดูได้
  async createFeedback(input: {
    userId: string; userName: string; branch: Branch | null;
    anonymous: boolean; topic: string; message: string; wantedAction: string;
  }): Promise<void> {
    const { error } = await sb().from("staff_feedback").insert({
      user_id: input.anonymous ? null : input.userId,
      user_name: input.anonymous ? null : input.userName,
      // สาขาเก็บไว้แม้ไม่ระบุชื่อ เพราะจำเป็นต่อการแก้ปัญหา และสาขามี 3-5 คน ยังไม่ชี้ตัวใคร
      branch_id: input.branch,
      anonymous: input.anonymous, topic: input.topic,
      message: input.message, wanted_action: input.wantedAction,
    });
    if (error) throw error;
  },

  async listFeedback(limit = 200): Promise<StaffFeedback[]> {
    const { data, error } = await sb().from("staff_feedback")
      .select("id,user_name,branch_id,anonymous,topic,message,wanted_action,seen_at,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, userName: r.user_name, branch: r.branch_id ?? null,
      anonymous: !!r.anonymous, topic: r.topic, message: r.message,
      wantedAction: r.wanted_action ?? "", seenAt: r.seen_at, createdAt: r.created_at,
    }));
  },

  async countUnseenFeedback(): Promise<number> {
    const { count } = await sb().from("staff_feedback")
      .select("id", { count: "exact", head: true }).is("seen_at", null);
    return count ?? 0;
  },

  async markAllFeedbackSeen(byName: string): Promise<void> {
    await sb().from("staff_feedback")
      .update({ seen_at: new Date().toISOString(), seen_by: byName }).is("seen_at", null);
  },

  // ── ลบผู้ใช้ (v1.15) ──
  // นับร่องรอยของบัญชีก่อนลบ เพื่อให้แอดมินตัดสินใจบนข้อมูลจริง ไม่ใช่กดลบมั่ว
  // staff_allowance_uses มี FK จริง → ถ้ามีรายการ ลบไม่ได้ทางเทคนิคอยู่แล้ว บอกล่วงหน้าดีกว่าให้ error ดิบเด้ง
  async getUserActivity(userId: string): Promise<{ allowanceUses: number; auditRows: number; workRows: number }> {
    const n = async (table: string, col: string) => {
      const { count } = await sb().from(table).select(col, { count: "exact", head: true }).eq(col, userId);
      return count ?? 0;
    };
    const [allowanceUses, auditRows, ...work] = await Promise.all([
      n("staff_allowance_uses", "user_id"),
      n("audit_log", "user_id"),
      n("requisitions", "requested_by_user_id"),
      n("restock_receipts", "confirmed_by_user_id"),
      n("sales_evidence", "uploaded_by_user_id"),
      n("cash_remittances", "uploaded_by_user_id"),
      n("expiry_checks", "created_by_user_id"),
      n("sales_payment_incidents", "created_by_user_id"),
    ]);
    return { allowanceUses, auditRows, workRows: work.reduce((a, b) => a + b, 0) };
  },

  async deleteUser(userId: string): Promise<{ ok: boolean; reason?: string }> {
    const { error } = await sb().from("users").delete().eq("id", userId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },

  // ── สิทธิ์ซื้อของในร้าน (v1.13) ──
  // ยอดที่ตัดสิทธิ์คือ discount_amount เท่านั้น (ส่วนลดบนบิล) ไม่ใช่ยอดที่จ่ายจริง
  async listAllowanceUses(userId: string, month: string): Promise<StaffAllowanceUse[]> {
    const { from, to } = monthRange(month);
    const { data, error } = await sb().from("staff_allowance_uses")
      .select("id,user_id,branch_id,use_date,bill_total,discount_amount,paid_amount,image_path,ocr_discount,needs_review,review_note,note,created_by_name,created_at")
      .eq("user_id", userId).gte("use_date", from).lt("use_date", to)
      .order("use_date", { ascending: false }).order("id", { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(allowanceRow);
  },

  // ภาพรวมทุกคนที่เปิดสิทธิ์ + บิลที่ต้องตรวจของเดือนนั้น (แอดมิน)
  async getAllowanceOverview(month: string): Promise<{ summaries: AllowanceSummary[]; needsReview: StaffAllowanceUse[] }> {
    const { from, to } = monthRange(month);
    const { data: users, error: uErr } = await sb().from("users")
      .select("id,name,role,branch_scope,active,allowance_enabled,allowance_monthly,work_unit,is_senior").eq("allowance_enabled", true).eq("active", true).order("created_at");
    if (uErr) throw uErr;
    const { data: uses, error: rErr } = await sb().from("staff_allowance_uses")
      .select("id,user_id,branch_id,use_date,bill_total,discount_amount,paid_amount,image_path,ocr_discount,needs_review,review_note,note,created_by_name,created_at")
      .gte("use_date", from).lt("use_date", to)
      .order("use_date", { ascending: false }).limit(2000);
    if (rErr) throw rErr;

    const usedBy = new Map<string, number>();
    for (const r of uses ?? []) usedBy.set(r.user_id, (usedBy.get(r.user_id) ?? 0) + Number(r.discount_amount));
    const nameBy = new Map((users ?? []).map((u: any) => [u.id, u.name as string]));

    const summaries: AllowanceSummary[] = (users ?? []).map((u: any) => {
      const monthly = Number(u.allowance_monthly ?? ALLOWANCE_DEFAULT_MONTHLY);
      const used = usedBy.get(u.id) ?? 0;
      return { userId: u.id, userName: u.name, branchScope: u.branch_scope, monthly, used, remaining: Math.max(monthly - used, 0) };
    });
    const needsReview = (uses ?? []).filter((r: any) => r.needs_review)
      .map((r: any) => ({ ...allowanceRow(r), userName: nameBy.get(r.user_id) ?? r.user_id }));
    return { summaries, needsReview };
  },

  async addAllowanceUse(row: StaffAllowanceUse): Promise<void> {
    const { error } = await sb().from("staff_allowance_uses").insert({
      user_id: row.userId, branch_id: row.branch ?? null, use_date: row.useDate,
      bill_total: row.billTotal, discount_amount: row.discountAmount, paid_amount: row.paidAmount,
      image_path: row.imagePath ?? null, ocr_discount: row.ocrDiscount ?? null,
      needs_review: row.needsReview, review_note: row.reviewNote,
      note: row.note, created_by_name: row.userName ?? null,
    });
    if (error) throw error;
  },

  // ── ขอเบิกสินค้า (ไม่มีสถานะ แค่ log ให้ restock/admin กวาดดู) ──
  async createRequisition(input: Omit<Requisition, "id" | "createdAt">): Promise<Requisition> {
    const { data, error } = await sb().from("requisitions").insert({
      branch_id: input.branch, item_id: input.itemId ?? null, item_name: input.itemName,
      qty: input.qty, unit: input.unit ?? null, note: input.note,
      requested_by: input.requestedBy, requested_by_user_id: input.requestedByUserId,
    }).select().single();
    if (error) throw error;
    return rowFromReqDb(data);
  },
  async listRequisitions(filter: { userId?: string; branch?: string; limit?: number }): Promise<Requisition[]> {
    let q = sb().from("requisitions").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 100);
    if (filter.userId) q = q.eq("requested_by_user_id", filter.userId);
    if (filter.branch) q = q.eq("branch_id", filter.branch);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowFromReqDb);
  },
  async countUnseenRequisitions(): Promise<number> {
    const { count, error } = await sb().from("requisitions").select("id", { count: "exact", head: true }).is("seen_at", null);
    if (error) throw error;
    return count ?? 0;
  },
  async markAllRequisitionsSeen(): Promise<void> {
    const { error } = await sb().from("requisitions").update({ seen_at: new Date().toISOString() }).is("seen_at", null);
    if (error) throw error;
  },

  // ── ประกาศพิเศษ (v1.6) ──
  async listActiveNotices(branch: Branch): Promise<BranchNotice[]> {
    const { data, error } = await sb().from("branch_notices").select("*")
      .or(`branch_id.is.null,branch_id.eq.${branch}`).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowFromNoticeDb);
  },
  async listAllNotices(): Promise<BranchNotice[]> {
    const { data, error } = await sb().from("branch_notices").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowFromNoticeDb);
  },
  async createNotice(input: { branch: Branch | null; message: string }, userName: string): Promise<BranchNotice> {
    const { data, error } = await sb().from("branch_notices").insert({
      branch_id: input.branch, message: input.message, created_by: userName,
    }).select().single();
    if (error) throw error;
    return rowFromNoticeDb(data);
  },
  async deleteNotice(id: string): Promise<void> {
    const { error } = await sb().from("branch_notices").delete().eq("id", id);
    if (error) throw error;
  },

  // ── หลักฐานยอดขาย (v1.7) ──
  async uploadEvidenceImage(path: string, bytes: Buffer, contentType: string): Promise<void> {
    const { error } = await sb().storage.from("sales-evidence").upload(path, bytes, { contentType, upsert: true });
    if (error) throw error;
  },
  async getEvidenceSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await sb().storage.from("sales-evidence").createSignedUrl(path, 900);
    if (error) return null;
    return data?.signedUrl ?? null;
  },
  async upsertSalesEvidence(input: {
    branch: Branch; date: string; type: EvidenceType; imagePath: string; enteredAmount: number;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<SalesEvidence> {
    const { data, error } = await sb().from("sales_evidence").upsert({
      branch_id: input.branch, date: input.date, evidence_type: input.type, image_path: input.imagePath,
      entered_amount: input.enteredAmount, ocr_amount: input.ocrAmount, ocr_name_match: input.ocrNameMatch,
      match_status: input.matchStatus, ocr_txn_ref: input.ocrTxnRef, ocr_txn_time: input.ocrTxnTime,
      duplicate_note: input.duplicateNote, mismatch_note: input.mismatchNote,
      uploaded_by: input.userName, uploaded_by_user_id: input.userId,
      created_at: new Date().toISOString(),
    }, { onConflict: "branch_id,date,evidence_type" }).select().single();
    if (error) throw error;
    return rowFromEvidenceDb(data);
  },
  async listSalesEvidence(branch: Branch, date: string): Promise<SalesEvidence[]> {
    const { data, error } = await sb().from("sales_evidence").select("*").eq("branch_id", branch).eq("date", date);
    if (error) throw error;
    return (data ?? []).map(rowFromEvidenceDb);
  },
  // หาว่าเลขอ้างอิงนี้เคยถูกใช้ในหลักฐานอื่น (ต่างวัน/ต่างสาขา/ต่างช่องทาง) มาก่อนหรือไม่ — กันอัปโหลดเอกสารเดิมซ้ำ
  async findDuplicateEvidence(
    txnRef: string, excludeBranch: Branch, excludeDate: string, excludeType: EvidenceType
  ): Promise<{ branch: Branch; date: string; type: EvidenceType } | null> {
    const { data, error } = await sb().from("sales_evidence").select("branch_id,date,evidence_type")
      .eq("ocr_txn_ref", txnRef).limit(5);
    if (error) throw error;
    const hit = (data ?? []).find((r: any) => !(r.branch_id === excludeBranch && r.date === excludeDate && r.evidence_type === excludeType));
    return hit ? { branch: hit.branch_id, date: hit.date, type: hit.evidence_type } : null;
  },

  // ── การโอนเงินสด (v1.7) ──
  // ยอดเงินสดที่ยังไม่ได้โอน — ต้องเป็น "เงินในลิ้นชักจริง" ไม่ใช่ยอดเงินสดที่ POS สรุป
  //
  // แพรเจอ 2026-07-31: NVP 28 ก.ค. หน้าเงินสดขึ้น 1,130 แต่สลิปโอนจริง 1,120
  // เพราะวันนั้นมีเคสคืนเงินสดให้ลูกค้า 10 บาท (void บิล เปลี่ยนเมนู) — เงินออกจากลิ้นชักไปแล้ว
  // POS ยังนับเป็นยอดขายเงินสดเต็ม 1,130 อยู่ · ถ้าไม่หักเคสออก ยอดที่ให้โอนจะไม่มีวันตรงกับสลิป
  async listUnremittedCashDays(branch: Branch): Promise<{ date: string; cash: number }[]> {
    // ⚠️ ห้ามกรอง .gt("cash", 0) ตรงนี้ — POS cash ดิบวันนั้นอาจเป็น 0 ได้ทั้งที่ยังมีเงินสดค้างโอนจริง
    // เช่นเคส under_cash_topup (ลูกค้าจ่ายสดเพิ่มเพราะโอนขาด) ซึ่งเงินสดมาจากเคส ไม่ใช่ยอด POS
    // ถ้ากรองดิบก่อน วันนั้นจะไม่โผล่ในรายการค้างโอนเลย ทั้งที่มีเงินสดจริงในลิ้นชัก
    // กรอง cash > 0 หลังบวกผลเคสแล้วแทน (บรรทัดล่าง)
    const { data: sales, error: e2 } = await sb().from("sales_daily").select("date,cash").eq("branch_id", branch);
    if (e2) throw e2;
    const { data: covered, error: e3 } = await sb().from("cash_remittance_days").select("date").eq("branch_id", branch);
    if (e3) throw e3;
    const { data: incidents } = await sb().from("sales_payment_incidents")
      .select("date,kind,bill_amount,actual_amount").eq("branch_id", branch);

    // ผลกับเงินสดของแต่ละวัน (สูตรเดียวกับ incidentAdjustment ใน calc.ts)
    const cashAdj = new Map<string, number>();
    for (const it of incidents ?? []) {
      if (it.kind === "over_no_change") continue;  // เงินเข้า QR อย่างเดียว ไม่แตะลิ้นชัก
      const bill = it.kind === "void_full_refund" ? 0 : Number(it.bill_amount ?? 0);
      const diff = Number(it.actual_amount ?? 0) - bill;
      cashAdj.set(it.date, (cashAdj.get(it.date) ?? 0) - diff);
    }

    const coveredSet = new Set((covered ?? []).map((r: any) => r.date));
    return (sales ?? [])
      .filter((r: any) => !coveredSet.has(r.date))
      .map((r: any) => ({ date: r.date, cash: Number(r.cash) + (cashAdj.get(r.date) ?? 0) }))
      .filter((r) => r.cash > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async createCashRemittance(input: {
    branch: Branch; transferredAt: string; dates: string[]; declaredAmount: number; imagePath: string;
    ocrAmount: number | null; ocrNameMatch: boolean | null; matchStatus: MatchStatus;
    ocrTxnRef: string | null; ocrTxnTime: string | null; duplicateNote: string | null; mismatchNote: string | null;
    userId: string; userName: string;
  }): Promise<CashRemittance> {
    const { data, error } = await sb().from("cash_remittances").insert({
      branch_id: input.branch, transferred_at: input.transferredAt, declared_amount: input.declaredAmount,
      image_path: input.imagePath, ocr_amount: input.ocrAmount, ocr_name_match: input.ocrNameMatch,
      match_status: input.matchStatus, ocr_txn_ref: input.ocrTxnRef, ocr_txn_time: input.ocrTxnTime,
      duplicate_note: input.duplicateNote, mismatch_note: input.mismatchNote,
      uploaded_by: input.userName, uploaded_by_user_id: input.userId,
    }).select().single();
    if (error) throw error;
    const days = input.dates.map((d) => ({ remittance_id: data.id, branch_id: input.branch, date: d }));
    const { error: e2 } = await sb().from("cash_remittance_days").insert(days);
    if (e2) throw e2;
    return rowFromRemittanceDb(data, input.dates);
  },
  // หาว่าเลขอ้างอิงนี้เคยถูกใช้ในใบโอนอื่นมาก่อนหรือไม่
  async findDuplicateRemittance(txnRef: string): Promise<{ branch: Branch; transferredAt: string } | null> {
    const { data, error } = await sb().from("cash_remittances").select("branch_id,transferred_at")
      .eq("ocr_txn_ref", txnRef).limit(1);
    if (error) throw error;
    const hit = (data ?? [])[0];
    return hit ? { branch: hit.branch_id, transferredAt: hit.transferred_at } : null;
  },
  async listCashRemittances(branch: Branch, limit = 50): Promise<CashRemittance[]> {
    const { data, error } = await sb().from("cash_remittances").select("*").eq("branch_id", branch)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const ids = rows.map((r: any) => r.id);
    const { data: days, error: e2 } = await sb().from("cash_remittance_days").select("remittance_id,date").in("remittance_id", ids);
    if (e2) throw e2;
    const byId = new Map<number, string[]>();
    for (const d of days ?? []) {
      const arr = byId.get(d.remittance_id) ?? [];
      arr.push(d.date);
      byId.set(d.remittance_id, arr);
    }
    return rows.map((r: any) => rowFromRemittanceDb(r, (byId.get(r.id) ?? []).sort()));
  },
  async deleteCashRemittance(id: string): Promise<void> {
    const { error } = await sb().from("cash_remittances").delete().eq("id", id);
    if (error) throw error;
  },

  // ── ตัวเลือกเติมของ (v1.4) ──
  async getRestockSelections(branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number; qtyG: number; qtyG2: number }>> {
    const { data, error } = await sb().from("restock_selections")
      .select("item_id,selected,qty,qty_g,qty_g2").eq("branch_id", branch).eq("date", date);
    if (error) throw error;
    const out: Record<string, { selected: boolean; qty: number; qtyG: number; qtyG2: number }> = {};
    for (const r of data ?? []) out[r.item_id] = { selected: r.selected, qty: Number(r.qty), qtyG: Number(r.qty_g), qtyG2: Number(r.qty_g2 ?? 0) };
    return out;
  },

  async saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
    const now = new Date().toISOString();
    const payload = entries.map((e) => ({
      date, branch_id: branch, item_id: e.itemId,
      selected: e.selected, qty: e.qty, qty_g: e.qtyG, qty_g2: e.qtyG2 ?? 0,
      updated_by_user_id: userId, updated_by_name: userName, updated_at: now,
    }));
    const { error } = await sb().from("restock_selections").upsert(payload, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;
    return { ok: true, savedCount: payload.length };
  },

  // ── ตรวจวันหมดอายุ (v1.12) ──
  async getExpiryChecks(branch: Branch, checkDate: string): Promise<ExpiryCheckRow[]> {
    const { data, error } = await sb().from("expiry_checks")
      .select("id,item_id,expiry_date,qty,disposition,note")
      .eq("branch_id", branch).eq("check_date", checkDate)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, itemId: r.item_id, expiryDate: r.expiry_date, qty: Number(r.qty),
      disposition: r.disposition ?? null, note: r.note ?? "",
    }));
  },

  // ── ลงเวลาเข้า-ออกงาน (v1.22) ──
  async getTimeClockSettings(): Promise<TimeClockSettings> {
    const { data } = await sb().from("app_settings").select("key,value")
      .in("key", ["time_clock_enabled", "time_clock_require_face", "time_clock_require_location"]);
    const m = new Map((data ?? []).map((r: any) => [r.key, r.value]));
    return {
      enabled: m.get("time_clock_enabled") === "1",
      requireFace: m.get("time_clock_require_face") !== "0",
      requireLocation: m.get("time_clock_require_location") === "1",
    };
  },

  async getAppSetting(key: string): Promise<string | null> {
    const { data } = await sb().from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data as any)?.value ?? null;
  },

  async setAppSetting(key: string, value: string, updatedBy: string): Promise<void> {
    const { error } = await sb().from("app_settings")
      .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
  },

  async getBranchGeo(branch: Branch): Promise<{ lat: number; lng: number; radiusM: number } | null> {
    const { data } = await sb().from("branches").select("lat,lng,geofence_radius_m").eq("id", branch).maybeSingle();
    if (!data?.lat || !data?.lng) return null;
    return { lat: Number(data.lat), lng: Number(data.lng), radiusM: Number(data.geofence_radius_m ?? 150) };
  },

  async setBranchGeo(branch: Branch, lat: number, lng: number, radiusM: number): Promise<void> {
    const { error } = await sb().from("branches")
      .update({ lat, lng, geofence_radius_m: radiusM }).eq("id", branch);
    if (error) throw error;
  },

  async getFaceEnrollment(userId: string): Promise<{ faceId: string | null; enrolledAt: string | null; allowedUntil: string | null }> {
    const { data } = await sb().from("users")
      .select("face_id,face_enrolled_at,face_enroll_allowed_until").eq("id", userId).maybeSingle();
    return {
      faceId: (data as any)?.face_id ?? null,
      enrolledAt: (data as any)?.face_enrolled_at ?? null,
      allowedUntil: (data as any)?.face_enroll_allowed_until ?? null,
    };
  },

  // แอดมินรีเซ็ตใบหน้า — ล้างของเดิมให้เจ้าตัวลงทะเบียนใหม่ได้ (เหมือนเริ่มครั้งแรก)
  async clearFaceEnrollment(userId: string): Promise<string | null> {
    const { data } = await sb().from("users").select("face_id").eq("id", userId).maybeSingle();
    const { error } = await sb().from("users")
      .update({ face_id: null, face_enrolled_at: null, face_enroll_allowed_until: null }).eq("id", userId);
    if (error) throw error;
    return (data as any)?.face_id ?? null;
  },

  async saveFaceEnrollment(userId: string, faceId: string): Promise<void> {
    // ปิดหน้าต่างทันทีที่ลงทะเบียนสำเร็จ — เปิดค้างไว้เท่ากับเปิดช่องให้ลงซ้ำด้วยหน้าคนอื่น
    const { error } = await sb().from("users")
      .update({ face_id: faceId, face_enrolled_at: new Date().toISOString(), face_enroll_allowed_until: null })
      .eq("id", userId);
    if (error) throw error;
  },

  // กะที่ยังไม่ได้กดออกงาน — มีได้คนละ 1 กะ (unique index กันไว้ที่ฐานข้อมูลอีกชั้น)
  async getOpenShift(userId: string): Promise<TimeClockEntry | null> {
    const { data } = await sb().from("time_clock").select("*")
      .eq("user_id", userId).is("clock_out", null).maybeSingle();
    return data ? rowFromTimeClockDb(data) : null;
  },

  async clockIn(input: {
    branch: Branch | null; userId: string; userName: string; workDate: string;
    photoPath?: string | null; similarity?: number | null;
    lat?: number | null; lng?: number | null; distanceM?: number | null;
  }): Promise<TimeClockEntry> {
    const { data, error } = await sb().from("time_clock").insert({
      branch_id: input.branch, user_id: input.userId, user_name: input.userName,
      work_date: input.workDate, clock_in: new Date().toISOString(),
      in_photo_path: input.photoPath ?? null, in_face_similarity: input.similarity ?? null,
      in_lat: input.lat ?? null, in_lng: input.lng ?? null, in_distance_m: input.distanceM ?? null,
    }).select().single();
    if (error) throw error;
    return rowFromTimeClockDb(data);
  },

  async clockOut(id: number, input: {
    photoPath?: string | null; similarity?: number | null;
    lat?: number | null; lng?: number | null; distanceM?: number | null;
  }): Promise<TimeClockEntry | null> {
    const { data, error } = await sb().from("time_clock").update({
      clock_out: new Date().toISOString(), updated_at: new Date().toISOString(),
      out_photo_path: input.photoPath ?? null, out_face_similarity: input.similarity ?? null,
      out_lat: input.lat ?? null, out_lng: input.lng ?? null, out_distance_m: input.distanceM ?? null,
    }).eq("id", id).is("clock_out", null).select().maybeSingle();
    if (error) throw error;
    return data ? rowFromTimeClockDb(data) : null;
  },

  // รายเดือน — ใช้ทำสรุปชั่วโมงและหน้าให้แอดมินแก้เวลาย้อนหลัง
  async listTimeClock(month: string, branch?: Branch): Promise<TimeClockEntry[]> {
    const { from, to } = monthRange(month);
    let q = sb().from("time_clock").select("*").gte("work_date", from).lt("work_date", to)
      .order("work_date", { ascending: false }).order("clock_in", { ascending: false });
    if (branch) q = q.eq("branch_id", branch);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowFromTimeClockDb);
  },

  async editTimeClock(id: number, patch: { clockIn?: string; clockOut?: string | null; note: string; editedBy: string }): Promise<void> {
    const up: any = { edited_by: patch.editedBy, edit_note: patch.note, updated_at: new Date().toISOString() };
    if (patch.clockIn) up.clock_in = patch.clockIn;
    if (patch.clockOut !== undefined) up.clock_out = patch.clockOut;
    const { error } = await sb().from("time_clock").update(up).eq("id", id);
    if (error) throw error;
  },

  // ── ของที่ตรวจแล้วสั่ง "ส่งคืน" แต่ยังไม่ได้ฝากขึ้นรถ (v1.21) ──
  // ไม่จำกัดช่วงวัน — ของที่ค้างมาหลายวันยิ่งต้องเตือน ไม่ใช่หายไปเพราะเก่าเกิน
  async listPendingReturns(branch: Branch): Promise<PendingReturnRow[]> {
    const { data, error } = await sb().from("expiry_checks")
      .select("id,check_date,item_id,qty,expiry_date")
      .eq("branch_id", branch).eq("disposition", "return").is("dispatched_at", null)
      .order("check_date", { ascending: true });
    if (error) throw error;
    if ((data ?? []).length === 0) return [];
    const meta = await this.getMeta();
    const itemMap = new Map(meta.items.map((it) => [it.id, it]));
    return (data ?? []).map((r: any) => {
      const it = itemMap.get(r.item_id);
      return {
        id: r.id, checkDate: r.check_date, itemId: r.item_id,
        itemName: it?.name ?? r.item_id, unit: it?.unit ?? "",
        qty: Number(r.qty), expiryDate: r.expiry_date,
      };
    });
  },

  // กด "ฝากรถแล้ว" — ปิดทุกแถวที่ค้างของสาขานั้นทีเดียว (ของขึ้นรถไปพร้อมกันอยู่แล้ว)
  async markReturnsDispatched(branch: Branch): Promise<number> {
    const { data, error } = await sb().from("expiry_checks")
      .update({ dispatched_at: new Date().toISOString() })
      .eq("branch_id", branch).eq("disposition", "return").is("dispatched_at", null)
      .select("id");
    if (error) throw error;
    return (data ?? []).length;
  },

  // สาขาไหน "บันทึกผลตรวจของวันนั้นแล้ว" — ใช้ทำ badge เตือนวันอังคาร/ศุกร์
  async getBranchesWithExpiryCheck(checkDate: string): Promise<Branch[]> {
    const { data, error } = await sb().from("expiry_checks")
      .select("branch_id").eq("check_date", checkDate);
    if (error) throw error;
    return [...new Set((data ?? []).map((r: any) => r.branch_id as Branch))];
  },

  // บันทึกทับทั้งชุดต่อ (สาขา,วันตรวจ) แล้วเขียนผลลง stock_daily ให้เอง
  //
  // ⚠️ ต้อง idempotent — บันทึกซ้ำต้องไม่บวกทบ ใช้คอลัมน์ expiry_returned/expiry_used เป็นตัวจำว่า
  // "ครั้งก่อนระบบใส่ไปเท่าไหร่" แล้วถอนของเก่าออกก่อนใส่ของใหม่ (แพทเทิร์นเดียวกับ in_auto_pack)
  // ยอดที่พนักงานกรอกเองในหน้าสต็อกจึงไม่ถูกทับหาย
  async saveExpiryChecks(
    branch: Branch, checkDate: string, rows: ExpiryCheckRow[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("expiry_checks")
      .delete().eq("branch_id", branch).eq("check_date", checkDate);
    if (delErr) throw delErr;

    if (rows.length > 0) {
      const { error: insErr } = await sb().from("expiry_checks").insert(
        rows.map((r) => ({
          branch_id: branch, check_date: checkDate, item_id: r.itemId,
          expiry_date: r.expiryDate, qty: r.qty, disposition: r.disposition ?? null, note: r.note,
          created_by_user_id: userId, created_by_name: userName,
        }))
      );
      if (insErr) throw insErr;
    }

    // กฎการแปลง — "แกะไปรวมกับรายการอื่น" ต้องรู้ว่าปลายทางคือตัวไหน และ 1 หน่วยได้กี่กรัม
    // อ่านจาก items เสมอ ไม่เชื่อค่าที่ client ส่งมา (client ส่งมาแค่ itemId/qty/disposition)
    const convertSrcIds = [...new Set(rows.filter((r) => r.disposition === "convert").map((r) => r.itemId))];
    const convRule = new Map<string, { to: string; g: number }>();
    const gramsPerPack = new Map<string, number>();
    if (convertSrcIds.length > 0) {
      const { data: srcItems } = await sb().from("items")
        .select("id,expiry_convert_to_item_id,expiry_convert_g").in("id", convertSrcIds);
      const targetIds: string[] = [];
      for (const s of srcItems ?? []) {
        const g = Number(s.expiry_convert_g);
        if (s.expiry_convert_to_item_id && g > 0) {
          convRule.set(s.id, { to: s.expiry_convert_to_item_id, g });
          targetIds.push(s.expiry_convert_to_item_id);
        }
      }
      if (targetIds.length > 0) {
        const { data: tItems } = await sb().from("items").select("id,grams_per_uom").in("id", targetIds);
        for (const t of tItems ?? []) gramsPerPack.set(t.id, Number(t.grams_per_uom) || 0);
      }
    }

    // รวมยอดต่อ item ที่ต้องไปลงสต็อก
    const wantReturn = new Map<string, number>();
    const wantUsed = new Map<string, number>();
    const wantTransferOut = new Map<string, number>(); // ต้นทางการแปลง (แพ็ค)
    const wantInG = new Map<string, number>();          // ปลายทางการแปลง (กรัม)
    for (const r of rows) {
      if (r.disposition === "return") {
        wantReturn.set(r.itemId, (wantReturn.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "sell_front") {
        wantUsed.set(r.itemId, (wantUsed.get(r.itemId) ?? 0) + r.qty);
      } else if (r.disposition === "convert") {
        // ** ไม่ลง used/in ** — ของไม่ได้ขายออกและไม่ได้มาจากรถส่ง แค่ย้ายกองภายในร้าน
        // ถ้าเอาไปปนกับ used ยอด "ขายจริง" จะเพี้ยน เอาไปดูว่าเมนูไหนขายดีไม่ได้ (แพรทัก 2026-07-27)
        wantTransferOut.set(r.itemId, (wantTransferOut.get(r.itemId) ?? 0) + r.qty);
        const rule = convRule.get(r.itemId);
        if (rule) wantInG.set(rule.to, (wantInG.get(rule.to) ?? 0) + r.qty * rule.g);
      }
    }

    // ทุก item ที่เคยมีผลตรวจลงสต็อกไว้ ต้องถูกพิจารณาด้วย (เผื่อรอบนี้ถูกยกเลิก → ต้องถอนของเก่าออก)
    const { data: existing } = await sb().from("stock_daily")
      .select("item_id,used,returned,expiry_used,expiry_returned,transfer_out,transfer_in_g")
      .eq("branch_id", branch).eq("date", checkDate);
    const touched = new Set<string>([
      ...wantReturn.keys(), ...wantUsed.keys(), ...wantInG.keys(), ...wantTransferOut.keys(),
    ]);
    for (const r of existing ?? []) {
      if (Number(r.expiry_returned) !== 0 || Number(r.expiry_used) !== 0
        || Number(r.transfer_out) !== 0 || Number(r.transfer_in_g) !== 0) {
        touched.add(r.item_id);
      }
    }
    if (touched.size === 0) return;

    const byItem = new Map((existing ?? []).map((r: any) => [r.item_id, r]));
    for (const itemId of touched) {
      const cur: any = byItem.get(itemId);
      const newRet = wantReturn.get(itemId) ?? 0;
      const newUse = wantUsed.get(itemId) ?? 0;
      const newTransferOut = wantTransferOut.get(itemId) ?? 0;
      const newTransferInG = wantInG.get(itemId) ?? 0;
      if (cur) {
        // returned/used ปนกับยอดที่พนักงานกรอกเอง → ต้องถอนของที่ระบบเคยใส่ออกก่อน (idempotent)
        const baseRet = Number(cur.returned) - Number(cur.expiry_returned);
        const baseUse = Number(cur.used) - Number(cur.expiry_used);
        // transfer_* ระบบเขียนเองล้วน ไม่มีช่องให้พนักงานกรอก → เขียนทับได้ตรง ๆ
        const { error: updErr } = await sb().from("stock_daily").update({
          returned: Math.max(baseRet, 0) + newRet, expiry_returned: newRet,
          used: Math.max(baseUse, 0) + newUse, expiry_used: newUse,
          transfer_out: newTransferOut, transfer_in_g: newTransferInG,
        }).eq("branch_id", branch).eq("date", checkDate).eq("item_id", itemId);
        if (updErr) throw updErr;
      } else if (newRet > 0 || newUse > 0 || newTransferOut > 0 || newTransferInG > 0) {
        // ยังไม่มีแถวสต็อกของวันนี้ — สร้างจากยกมา แล้วใส่ผลตรวจลงไป (ยังไม่นับว่าพนักงานยืนยันคงเหลือ)
        const { data: prev } = await sb().from("stock_daily")
          .select("remain_pack,remain_g").eq("branch_id", branch).eq("item_id", itemId).lt("date", checkDate)
          .order("date", { ascending: false }).limit(1).maybeSingle();
        const carryPack = Number(prev?.remain_pack ?? 0);
        const carryG = Number(prev?.remain_g ?? 0);
        const gpu = gramsPerPack.get(itemId) ?? 0;
        const inPacks = gpu > 0 ? Math.floor(newTransferInG / gpu) : 0;
        const { error: insErr2 } = await sb().from("stock_daily").insert({
          date: checkDate, branch_id: branch, item_id: itemId,
          carry_pack: carryPack, carry_g: carryG, in_pack: 0, in_g: 0,
          used: newUse,
          remain_pack: Math.max(carryPack + inPacks - newUse - newRet - newTransferOut, 0),
          remain_g: carryG + (gpu > 0 ? newTransferInG % gpu : newTransferInG),
          returned: newRet, returned_g: 0, note: "", variance: 0,
          expiry_returned: newRet, expiry_used: newUse,
          transfer_out: newTransferOut, transfer_in_g: newTransferInG,
          remain_confirmed: false,
        });
        if (insErr2) throw insErr2;
      }
    }
  },

  // ── เคส "รับเงินไม่ตรงบิล" (v1.11) — บันทึกทับทั้งชุดต่อ (สาขา,วันที่) ──
  async getPaymentIncidents(branch: Branch, date: string): Promise<PaymentIncident[]> {
    const { data, error } = await sb().from("sales_payment_incidents")
      .select("id,kind,bill_amount,actual_amount,note,created_by_name,created_at")
      .eq("branch_id", branch).eq("date", date)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, kind: r.kind, billAmount: Number(r.bill_amount), actualAmount: Number(r.actual_amount),
      note: r.note ?? "", createdByName: r.created_by_name ?? undefined, createdAt: r.created_at ?? undefined,
    }));
  },
  async savePaymentIncidents(
    branch: Branch, date: string, incidents: PaymentIncident[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("sales_payment_incidents")
      .delete().eq("branch_id", branch).eq("date", date);
    if (delErr) throw delErr;
    if (incidents.length === 0) return;
    const { error: insErr } = await sb().from("sales_payment_incidents").insert(
      incidents.map((it) => ({
        branch_id: branch, date, kind: it.kind,
        bill_amount: it.billAmount, actual_amount: it.actualAmount, note: it.note,
        created_by_user_id: userId, created_by_name: userName,
      }))
    );
    if (insErr) throw insErr;
  },

  // itemId ที่ "ส่งไปแล้วและสาขายืนยันรับแล้ว" ของใบวันนั้น — ใช้กรองตอนพิมพ์ใบรอบที่ 2
  // ไม่นับตัวที่ติ๊ก "ไม่ได้รับ" เพราะของยังไม่ถึงสาขา ถ้าจะส่งใหม่ก็ต้องพิมพ์ซ้ำ
  async getConfirmedReceiptItemIds(branch: Branch, date: string): Promise<string[]> {
    const { data, error } = await sb().from("restock_receipts")
      .select("item_id")
      .eq("branch_id", branch).eq("date", date).eq("not_received", false);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.item_id);
  },

  async getRestockNote(branch: Branch, date: string): Promise<string> {
    const { data, error } = await sb().from("restock_notes").select("note")
      .eq("branch_id", branch).eq("date", date).maybeSingle();
    if (error) throw error;
    return data?.note ?? "";
  },
  async saveRestockNote(branch: Branch, date: string, note: string, userId: string, userName: string): Promise<void> {
    const { error } = await sb().from("restock_notes").upsert({
      branch_id: branch, date, note, updated_by: userName, updated_by_user_id: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "branch_id,date" });
    if (error) throw error;
  },

  // ── รายการที่ไม่มีให้เลือกในระบบ (v1.10) — ไม่ผูก item_id ไม่ auto-fill รับเข้า เก็บเป็นประวัติ ──
  async getRestockExtraItems(branch: Branch, date: string): Promise<RestockExtraItem[]> {
    const { data, error } = await sb().from("restock_extra_items")
      .select("name,qty,note,created_by_name,created_at")
      .eq("branch_id", branch).eq("date", date)
      .order("id");
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      name: r.name, qty: Number(r.qty), note: r.note ?? "",
      createdByName: r.created_by_name ?? undefined, createdAt: r.created_at ?? undefined,
    }));
  },
  // บันทึกทับทั้งชุดต่อ (สาขา,วันที่) — ลบของเดิมแล้ว insert ชุดใหม่ ให้ตรงกับสิ่งที่เห็นบนหน้าจอเสมอ
  async saveRestockExtraItems(
    branch: Branch, date: string, items: RestockExtraItem[], userId: string, userName: string
  ): Promise<void> {
    const { error: delErr } = await sb().from("restock_extra_items")
      .delete().eq("branch_id", branch).eq("date", date);
    if (delErr) throw delErr;
    if (items.length === 0) return;
    const { error: insErr } = await sb().from("restock_extra_items").insert(
      items.map((it) => ({
        branch_id: branch, date, name: it.name, qty: it.qty, note: it.note,
        created_by_user_id: userId, created_by_name: userName,
      }))
    );
    if (insErr) throw insErr;
  },

  // ── ยืนยันรับของ (v1.9) — ไม่ผูกวันนี้อย่างเดียว โชว์ "ทุกใบที่ยังยืนยันไม่ครบ" ของสาขานั้น ──
  async listOutstandingRestockSheets(branch: Branch): Promise<RestockSheetSummary[]> {
    const { data: sel, error } = await sb().from("restock_selections")
      .select("date,item_id").eq("branch_id", branch).eq("selected", true);
    if (error) throw error;
    const byDate = new Map<string, Set<string>>();
    for (const r of sel ?? []) {
      if (!byDate.has(r.date)) byDate.set(r.date, new Set());
      byDate.get(r.date)!.add(r.item_id);
    }
    if (byDate.size === 0) return [];
    const { data: receipts, error: rErr } = await sb().from("restock_receipts")
      .select("date,item_id").eq("branch_id", branch).in("date", Array.from(byDate.keys()));
    if (rErr) throw rErr;
    const confirmedByDate = new Map<string, Set<string>>();
    for (const r of receipts ?? []) {
      if (!confirmedByDate.has(r.date)) confirmedByDate.set(r.date, new Set());
      confirmedByDate.get(r.date)!.add(r.item_id);
    }
    const out: RestockSheetSummary[] = [];
    for (const [date, items] of byDate) {
      const confirmed = confirmedByDate.get(date) ?? new Set();
      const pending = Array.from(items).filter((id) => !confirmed.has(id)).length;
      if (pending === 0) continue;
      out.push({ date, pendingCount: pending, totalCount: items.size });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  },

  async getRestockReceiptStatus(branch: Branch, date: string): Promise<RestockReceiptStatus[]> {
    const [selRes, receiptRes, meta] = await Promise.all([
      sb().from("restock_selections").select("item_id,qty,qty_g,qty_g2").eq("branch_id", branch).eq("date", date).eq("selected", true),
      sb().from("restock_receipts").select("item_id,received_qty,received_qty_g,is_extra,not_received,note,confirmed_by_name,confirmed_at").eq("branch_id", branch).eq("date", date),
      this.getMeta(),
    ]);
    if (selRes.error) throw selRes.error;
    if (receiptRes.error) throw receiptRes.error;
    const itemMap = new Map(meta.items.map((it) => [it.id, it]));
    const receiptMap = new Map((receiptRes.data ?? []).map((r: any) => [r.item_id, r]));
    const out: RestockReceiptStatus[] = (selRes.data ?? []).map((r: any) => {
      const it = itemMap.get(r.item_id);
      const receipt = receiptMap.get(r.item_id);
      return {
        itemId: r.item_id, name: it?.name ?? r.item_id, unit: it?.unit ?? "",
        // รวมถุงเศษทั้ง 2 ถุงเป็นยอดเดียว — หน้ายืนยันรับของสนใจแค่ "ได้ครบไหม" ไม่ได้สนว่ากี่ถุง
        orderedQty: Number(r.qty), orderedQtyG: Number(r.qty_g) + Number(r.qty_g2 ?? 0),
        receivedQty: receipt ? Number((receipt as any).received_qty) : null,
        receivedQtyG: receipt ? Number((receipt as any).received_qty_g) : null,
        isExtra: false, notReceived: (receipt as any)?.not_received ?? false,
        note: (receipt as any)?.note ?? undefined,
        confirmedByName: (receipt as any)?.confirmed_by_name ?? undefined,
        confirmedAt: (receipt as any)?.confirmed_at ?? undefined,
      };
    });
    for (const receipt of (receiptRes.data ?? []) as any[]) {
      if (!receipt.is_extra) continue;
      const it = itemMap.get(receipt.item_id);
      out.push({
        itemId: receipt.item_id, name: it?.name ?? receipt.item_id, unit: it?.unit ?? "",
        orderedQty: 0, orderedQtyG: 0,
        receivedQty: Number(receipt.received_qty), receivedQtyG: Number(receipt.received_qty_g),
        isExtra: true, notReceived: receipt.not_received ?? false,
        note: receipt.note ?? undefined,
        confirmedByName: receipt.confirmed_by_name ?? undefined, confirmedAt: receipt.confirmed_at ?? undefined,
      });
    }
    return out;
  },

  async confirmRestockReceipt(
    branch: Branch, date: string, itemId: string, receivedQty: number, receivedQtyG: number,
    isExtra: boolean, userId: string, userName: string, note = "", notReceived = false
  ): Promise<void> {
    const now = new Date().toISOString();
    const { data: existingReceipt } = await sb().from("restock_receipts")
      .select("confirmed_at,not_received,received_qty,received_qty_g")
      .eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
    const wasCounted = !!existingReceipt && !existingReceipt.not_received;
    // แก้ไขจำนวนของรายการที่เคยนับเข้าสต็อกแล้ว → ใช้วันที่ยืนยันเดิม ไม่เลื่อน auto-fill มาวันนี้
    // (กันเผลอแก้ใบเก่าแล้วยอดไปโผล่วันนี้แทน) ใช้ "วันนี้" เฉพาะตอนนับเข้าสต็อกครั้งแรกจริง ๆ
    const confirmedAt: string = wasCounted ? existingReceipt!.confirmed_at : now;

    let orderedQty = 0;
    let orderedQtyG = 0;
    if (!isExtra) {
      const { data: sel } = await sb().from("restock_selections")
        .select("qty,qty_g").eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
      orderedQty = sel ? Number(sel.qty) : 0;
      orderedQtyG = sel ? Number(sel.qty_g) : 0;
    }
    const { error } = await sb().from("restock_receipts").upsert({
      date, branch_id: branch, item_id: itemId, ordered_qty: orderedQty,
      received_qty: receivedQty, received_qty_g: receivedQtyG, is_extra: isExtra, not_received: notReceived, note,
      confirmed_by_user_id: userId, confirmed_by_name: userName, confirmed_at: confirmedAt,
    }, { onConflict: "date,branch_id,item_id" });
    if (error) throw error;

    const { data: itemRow } = await sb().from("items").select("name").eq("id", itemId).maybeSingle();
    const itemName = itemRow?.name ?? itemId;
    const fmtQty = (pack: number, g: number) => `${pack}${g ? ` +${g}g` : ""}`;
    // พนักงานแก้ไขจำนวน/สถานะรับเข้าของรายการที่เคยยืนยันไปแล้ว → แจ้งเตือนแอดมินให้ตรวจสอบทุกครั้ง
    if (existingReceipt && (
      Number(existingReceipt.received_qty) !== receivedQty || Number(existingReceipt.received_qty_g) !== receivedQtyG || existingReceipt.not_received !== notReceived
    )) {
      const fromLabel = existingReceipt.not_received ? "ไม่ได้รับ" : fmtQty(Number(existingReceipt.received_qty), Number(existingReceipt.received_qty_g));
      const toLabel = notReceived ? "ไม่ได้รับ" : fmtQty(receivedQty, receivedQtyG);
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_edited", detail: `${userName} แก้ไขยอดรับเข้าจาก ${fromLabel} เป็น ${toLabel}`,
      });
    }
    if (isExtra) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_extra", detail: `เพิ่มนอกใบเดิม จำนวน ${fmtQty(receivedQty, receivedQtyG)}`,
      });
    } else if (notReceived) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_not_received", detail: `ไม่ได้รับสินค้า (สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)})`,
      });
    } else if (receivedQty !== orderedQty || receivedQtyG !== orderedQtyG) {
      await sb().from("stock_admin_flags").insert({
        branch_id: branch, date, item_id: itemId, item_name: itemName,
        reason: "receipt_mismatch", detail: `สั่งไว้ ${fmtQty(orderedQty, orderedQtyG)} ได้รับจริง ${fmtQty(receivedQty, receivedQtyG)}`,
      });
    }

    if (!wasCounted && notReceived) return; // ไม่เคยนับเข้าสต็อกและตอนนี้ก็ยังไม่ได้รับ ไม่ต้องแตะ
    // รวมยอด auto-fill ของ "วันที่นับเข้าสต็อกจริง" ใหม่เสมอ — ครอบคลุมทั้งนับใหม่ / แก้จำนวน / เปลี่ยนเป็น-จาก "ไม่ได้รับ"
    await recomputeAutoFillForToday(branch, itemId, confirmedAt.slice(0, 10));
  },

  // ยืนยันรับทีเดียวหลายรายการ (กด "ยืนยันทั้งหมด") — วน confirmRestockReceipt ต่อรายการ
  async batchConfirmRestockReceipt(
    branch: Branch, date: string,
    entries: { itemId: string; receivedQty: number; receivedQtyG: number; isExtra: boolean; notReceived: boolean; note?: string }[],
    userId: string, userName: string
  ): Promise<void> {
    for (const e of entries) {
      await this.confirmRestockReceipt(branch, date, e.itemId, e.receivedQty, e.receivedQtyG, e.isExtra, userId, userName, e.note ?? "", e.notReceived);
    }
  },

  // ยกเลิกยืนยันรับ (พลาดติ๊ก) — ลบ receipt แล้วคำนวณ auto-fill ของวันนั้นใหม่จากรายการที่เหลือ (กันเคสมีหลายใบวันเดียวกัน)
  async unconfirmRestockReceipt(branch: Branch, date: string, itemId: string): Promise<void> {
    const { data: receipt } = await sb().from("restock_receipts")
      .select("received_qty,received_qty_g,confirmed_at,not_received")
      .eq("branch_id", branch).eq("date", date).eq("item_id", itemId).maybeSingle();
    if (!receipt) return;
    const { error: delErr } = await sb().from("restock_receipts")
      .delete().eq("branch_id", branch).eq("date", date).eq("item_id", itemId);
    if (delErr) throw delErr;
    if (receipt.not_received) return; // "ไม่ได้รับ" ไม่เคยแตะสต็อก ไม่ต้องคืนค่าอะไร

    const todayStr = String(receipt.confirmed_at).slice(0, 10);
    await recomputeAutoFillForToday(branch, itemId, todayStr);
  },

  async getPendingReceiptCount(branch: Branch): Promise<number> {
    // ไม่นับใบที่ลงวันที่ล่วงหน้า — หน้ายืนยันรับของก็ไม่โชว์ใบพวกนั้นแล้ว (2026-07-28)
    // ถ้ายังนับ badge จะขึ้นเลขค้างทั้งที่กดเข้าไปแล้วเจอ "ยืนยันครบทุกใบแล้ว" — พนักงานจะเลิกเชื่อ badge
    const today = todayBangkok();
    const sheets = await this.listOutstandingRestockSheets(branch);
    return sheets.filter((s) => s.date <= today).reduce((sum, s) => sum + s.pendingCount, 0);
  },

  async listAdminFlags(filter: { includeResolved?: boolean; branch?: Branch; reasons?: AdminFlagReason[] } = {}): Promise<AdminFlag[]> {
    let q = sb().from("stock_admin_flags").select("*").order("created_at", { ascending: false });
    if (!filter.includeResolved) q = q.is("resolved_at", null);
    if (filter.branch) q = q.eq("branch_id", filter.branch);
    if (filter.reasons && filter.reasons.length > 0) q = q.in("reason", filter.reasons);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((f: any) => ({
      id: f.id, branch: f.branch_id, date: f.date, itemId: f.item_id, itemName: f.item_name,
      reason: f.reason, detail: f.detail, createdAt: f.created_at,
      resolvedAt: f.resolved_at ?? undefined, resolvedBy: f.resolved_by ?? undefined,
    }));
  },

  async resolveAdminFlag(id: number, resolvedBy: string): Promise<void> {
    const { error } = await sb().from("stock_admin_flags")
      .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy }).eq("id", id);
    if (error) throw error;
  },

  // ── ใบสั่งผลิต (v1.5) ──
  async listProductionOrders(limit = 50): Promise<ProductionOrderSummary[]> {
    const { data, error } = await sb().from("production_orders")
      .select("id,order_date,delivery_date,note,created_by_name,created_at,updated_at")
      .order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    const orders = data ?? [];
    if (orders.length === 0) return [];
    const ids = orders.map((o: any) => o.id);
    const { data: itemRows, error: e2 } = await sb().from("production_order_items")
      .select("order_id,confirmed").in("order_id", ids);
    if (e2) throw e2;
    const counts = new Map<number, { total: number; confirmed: number }>();
    for (const r of itemRows ?? []) {
      const c = counts.get(r.order_id) ?? { total: 0, confirmed: 0 };
      c.total++; if (r.confirmed) c.confirmed++;
      counts.set(r.order_id, c);
    }
    return orders.map((o: any) => ({
      id: o.id, orderDate: o.order_date, deliveryDate: o.delivery_date, note: o.note ?? "",
      itemCount: counts.get(o.id)?.total ?? 0, confirmedCount: counts.get(o.id)?.confirmed ?? 0,
      createdByName: o.created_by_name, createdAt: o.created_at, updatedAt: o.updated_at,
    }));
  },

  async getProductionOrder(id: number): Promise<ProductionOrder | null> {
    const { data: header, error } = await sb().from("production_orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!header) return null;
    const { data: items, error: e2 } = await sb().from("production_order_items")
      .select("*").eq("order_id", id).order("id");
    if (e2) throw e2;
    return rowFromProdOrderDb(header, items ?? []);
  },

  async createProductionOrder(
    input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
    userId: string, userName: string
  ): Promise<ProductionOrder> {
    const { data: header, error } = await sb().from("production_orders").insert({
      order_date: input.orderDate, delivery_date: input.deliveryDate, note: input.note ?? "",
      created_by_user_id: userId, created_by_name: userName,
    }).select().single();
    if (error) throw error;
    const rows = input.items
      .filter((i) => (i.itemId && i.branch) ? (i.qty > 0 || i.qtyG > 0) : !!i.extraName)
      .map((i) => ({
        order_id: header.id, item_id: i.itemId ?? null, branch_key: i.itemId ? i.branch : null,
        qty: i.qty, qty_g: i.qtyG,
        extra_name: i.extraName ?? null, extra_unit: i.extraUnit ?? null, extra_note: i.extraNote ?? null,
        in_stock_no_produce: i.inStockNoProduce ?? false,
        have_stock_qty: i.haveStockQty ?? 0, have_stock_g: i.haveStockG ?? 0,
        have_stock_g_text: i.haveStockGText ?? "",
      }));
    let items: any[] = [];
    if (rows.length > 0) {
      const { data, error: e2 } = await sb().from("production_order_items").insert(rows).select();
      if (e2) throw e2;
      items = data ?? [];
    }
    return rowFromProdOrderDb(header, items);
  },

  async updateProductionOrder(
    id: number,
    patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
  ): Promise<ProductionOrder | null> {
    const headerPatch: any = { updated_at: new Date().toISOString() };
    if (patch.orderDate !== undefined) headerPatch.order_date = patch.orderDate;
    if (patch.deliveryDate !== undefined) headerPatch.delivery_date = patch.deliveryDate;
    if (patch.note !== undefined) headerPatch.note = patch.note;
    const { error } = await sb().from("production_orders").update(headerPatch).eq("id", id);
    if (error) throw error;

    if (patch.items) {
      const { data: existing } = await sb().from("production_order_items")
        .select("item_id,branch_key").eq("order_id", id).not("item_id", "is", null);
      const existingKeys = new Set((existing ?? []).map((r: any) => r.item_id + "|" + r.branch_key));
      const now = new Date().toISOString();

      const gridRows = patch.items
        .filter((i) => i.itemId && i.branch)
        .filter((i) => i.qty > 0 || i.qtyG > 0 || existingKeys.has(i.itemId + "|" + i.branch))
        // เขียน in_stock_no_produce/have_stock_* ตอนแก้ใบด้วย — เดิมเขียนเฉพาะตอนสร้างใบใหม่
        // ทำให้แก้ใบเก่าแล้วค่าของเก่าที่กรอกไว้ไม่ถูกบันทึก (เจอตอนทำฟีเจอร์ "มีของเก่าบางส่วน")
        .map((i) => ({
          order_id: id, item_id: i.itemId, branch_key: i.branch, qty: i.qty, qty_g: i.qtyG,
          in_stock_no_produce: i.inStockNoProduce ?? false,
          have_stock_qty: i.haveStockQty ?? 0, have_stock_g: i.haveStockG ?? 0,
          have_stock_g_text: i.haveStockGText ?? "",
          updated_at: now,
        }));
      if (gridRows.length > 0) {
        const { error: e2 } = await sb().from("production_order_items")
          .upsert(gridRows, { onConflict: "order_id,item_id,branch_key" });
        if (e2) throw e2;
      }

      for (const row of patch.items.filter((i) => !i.itemId)) {
        if (row.id) {
          const { error: e3 } = await sb().from("production_order_items").update({
            qty: row.qty, qty_g: row.qtyG,
            extra_name: row.extraName ?? null, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
            in_stock_no_produce: row.inStockNoProduce ?? false,
            have_stock_qty: row.haveStockQty ?? 0, have_stock_g: row.haveStockG ?? 0,
            have_stock_g_text: row.haveStockGText ?? "",
            updated_at: now,
          }).eq("id", row.id).eq("order_id", id);
          if (e3) throw e3;
        } else if (row.extraName) {
          const { error: e4 } = await sb().from("production_order_items").insert({
            order_id: id, item_id: null, branch_key: null, qty: row.qty, qty_g: row.qtyG,
            extra_name: row.extraName, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
            in_stock_no_produce: row.inStockNoProduce ?? false,
            have_stock_qty: row.haveStockQty ?? 0, have_stock_g: row.haveStockG ?? 0,
            have_stock_g_text: row.haveStockGText ?? "",
          });
          if (e4) throw e4;
        }
      }
    }
    if (patch.removedItemIds?.length) {
      const { error: e5 } = await sb().from("production_order_items").delete()
        .in("id", patch.removedItemIds).eq("order_id", id).is("item_id", null);
      if (e5) throw e5;
    }
    return this.getProductionOrder(id);
  },
  async deleteProductionOrder(id: number): Promise<void> {
    const { error } = await sb().from("production_orders").delete().eq("id", id);
    if (error) throw error;
  },

  async updateProductionOrderItem(
    id: number,
    patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
    userId: string, userName: string
  ): Promise<ProductionOrderItem | null> {
    const { data: cur } = await sb().from("production_order_items").select("*").eq("id", id).maybeSingle();
    if (!cur) return null;
    const upd: any = { updated_at: new Date().toISOString() };
    if (patch.qty !== undefined) upd.qty = patch.qty;
    if (patch.qtyG !== undefined) upd.qty_g = patch.qtyG;
    if (patch.confirmed !== undefined) {
      upd.confirmed = patch.confirmed;
      if (patch.confirmed && !cur.confirmed) {
        upd.confirmed_at = new Date().toISOString();
        upd.confirmed_by_user_id = userId;
        upd.confirmed_by_name = userName;
        // default confirmed_qty = qty ปัจจุบัน ถ้า client ไม่ได้ส่งมาเอง และยังไม่เคยมีค่านี้ (ดูข้อ 0.4)
        if (patch.confirmedQty === undefined && cur.confirmed_qty == null) upd.confirmed_qty = patch.qty ?? cur.qty;
        if (patch.confirmedQtyG === undefined && cur.confirmed_qty_g == null) upd.confirmed_qty_g = patch.qtyG ?? cur.qty_g;
      }
    }
    if (patch.confirmedQty !== undefined) upd.confirmed_qty = patch.confirmedQty;
    if (patch.confirmedQtyG !== undefined) upd.confirmed_qty_g = patch.confirmedQtyG;
    const { data, error } = await sb().from("production_order_items").update(upd).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return data ? rowFromProdOrderItemDb(data) : null;
  },

  // ── audit ──
  async writeAudit(e: Omit<AuditEntry, "id" | "ts">): Promise<void> {
    await sb().from("audit_log").insert({
      user_id: e.userId, user_name: e.userName, action: e.action,
      branch: e.branch, date: e.date, entity: e.entity, detail: e.detail,
    });
  },
  async listAudit(filter: { userId?: string; branch?: string; action?: string; limit?: number }): Promise<AuditEntry[]> {
    let q = sb().from("audit_log").select("*").order("ts", { ascending: false }).limit(filter.limit ?? 200);
    if (filter.userId) q = q.eq("user_id", filter.userId);
    if (filter.branch) q = q.eq("branch", filter.branch);
    if (filter.action) q = q.eq("action", filter.action);
    const { data } = await q;
    return (data ?? []).map((r: any) => ({
      id: String(r.id), ts: r.ts, userId: r.user_id, userName: r.user_name,
      action: r.action, branch: r.branch, date: r.date, entity: r.entity, detail: r.detail ?? "",
    }));
  },
};

function rowFromReqDb(r: any): Requisition {
  return {
    id: String(r.id), branch: r.branch_id, itemId: r.item_id ?? undefined, itemName: r.item_name,
    qty: Number(r.qty), unit: r.unit ?? undefined, note: r.note ?? "",
    requestedBy: r.requested_by, requestedByUserId: r.requested_by_user_id, createdAt: r.created_at,
    seenAt: r.seen_at ?? undefined,
  };
}

function rowFromNoticeDb(r: any): BranchNotice {
  return {
    id: String(r.id), branch: r.branch_id ?? null, message: r.message,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

function rowFromEvidenceDb(r: any): SalesEvidence {
  return {
    id: String(r.id), branch: r.branch_id, date: r.date, type: r.evidence_type, imagePath: r.image_path,
    enteredAmount: Number(r.entered_amount), ocrAmount: r.ocr_amount != null ? Number(r.ocr_amount) : undefined,
    ocrNameMatch: r.ocr_name_match ?? undefined, matchStatus: r.match_status,
    duplicateNote: r.duplicate_note ?? undefined, mismatchNote: r.mismatch_note ?? undefined,
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
  };
}

function rowFromRemittanceDb(r: any, coveredDates: string[]): CashRemittance {
  return {
    id: String(r.id), branch: r.branch_id, transferredAt: r.transferred_at, declaredAmount: Number(r.declared_amount),
    imagePath: r.image_path, ocrAmount: r.ocr_amount != null ? Number(r.ocr_amount) : undefined,
    ocrNameMatch: r.ocr_name_match ?? undefined, matchStatus: r.match_status,
    duplicateNote: r.duplicate_note ?? undefined, mismatchNote: r.mismatch_note ?? undefined, coveredDates,
    uploadedBy: r.uploaded_by, createdAt: r.created_at,
  };
}

function rowFromDb(s: any): StockRow {
  return {
    itemId: s.item_id, carryPack: s.carry_pack, carryG: s.carry_g, inPack: s.in_pack, inG: s.in_g,
    used: s.used, remainPack: s.remain_pack, remainG: s.remain_g, returned: s.returned,
    returnedG: s.returned_g ?? 0,
    transferOut: Number(s.transfer_out ?? 0), transferInG: Number(s.transfer_in_g ?? 0),
    packAdjust: Number(s.pack_adjust ?? 0),
    note: s.note ?? "", variance: s.variance, hasEntry: !!s.remain_confirmed,
  };
}

function rowFromTimeClockDb(r: any): TimeClockEntry {
  return {
    id: r.id, branch: r.branch_id as Branch, userId: r.user_id, userName: r.user_name,
    workDate: r.work_date, clockIn: r.clock_in, clockOut: r.clock_out ?? null,
    inDistanceM: r.in_distance_m ?? null, outDistanceM: r.out_distance_m ?? null,
    inFaceSimilarity: r.in_face_similarity ?? null, outFaceSimilarity: r.out_face_similarity ?? null,
    editedBy: r.edited_by ?? null, editNote: r.edit_note ?? null,
  };
}

function rowFromProdOrderItemDb(r: any): ProductionOrderItem {
  return {
    id: r.id, itemId: r.item_id ?? undefined, branch: r.branch_key ?? undefined,
    qty: Number(r.qty), qtyG: Number(r.qty_g),
    extraName: r.extra_name ?? undefined, extraUnit: r.extra_unit ?? undefined, extraNote: r.extra_note ?? undefined,
    inStockNoProduce: r.in_stock_no_produce ?? false,
    haveStockQty: Number(r.have_stock_qty ?? 0), haveStockG: Number(r.have_stock_g ?? 0),
    haveStockGText: r.have_stock_g_text ?? "",
    confirmed: r.confirmed, confirmedQty: r.confirmed_qty ?? undefined, confirmedQtyG: r.confirmed_qty_g ?? undefined,
    confirmedAt: r.confirmed_at ?? undefined, confirmedByName: r.confirmed_by_name ?? undefined,
  };
}
function rowFromProdOrderDb(h: any, items: any[]): ProductionOrder {
  return {
    id: h.id, orderDate: h.order_date, deliveryDate: h.delivery_date, note: h.note ?? "",
    items: items.map(rowFromProdOrderItemDb),
    createdByName: h.created_by_name, createdAt: h.created_at, updatedAt: h.updated_at,
  };
}
