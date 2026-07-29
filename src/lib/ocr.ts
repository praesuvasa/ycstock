// อ่านยอดเงิน + ชื่อผู้รับ/วันที่ จากรูปสลิป/หน้าจอสรุปยอด ด้วย Claude vision (v1.7)
// เรียก Anthropic Messages API ตรงๆ ผ่าน fetch (ไม่มี SDK ติดตั้ง — ตัวเรียกเดียว ไม่คุ้มเพิ่ม dependency)
// v1.9: QR Scan (PromptPay) ไม่มีชื่อผู้รับให้เช็ค (เงินเข้าบัญชีบริษัทอยู่แล้วเสมอ) — เช็คแค่ยอด+วันที่แทน
import { VALID_RECIPIENT_NAMES } from "./recipients";
import type { EvidenceType, MatchStatus } from "./types";
import { baht } from "./fmt";

export interface OcrResult {
  amount: number | null;
  nameMatch: boolean | null; // null = ไม่ได้เช็คชื่อ (qr/grab/lineman ไม่มี concept ผู้รับเงิน)
  dateMatch: boolean | null; // null = ไม่ได้เช็ควันที่
  clarity: "clear" | "unclear";
  txnRef: string | null; // เลขอ้างอิง/เลขที่รายการ/เลขที่เอกสาร — ใช้เช็คว่ารูปนี้ถูกใช้ซ้ำที่อื่นไหม
  txnTime: string | null; // วันที่-เวลาที่ปรากฏในเอกสาร (ตามที่เห็นตรงตัว)
}

// เงินสด (บัญชีปลายทางต้องตรวจสอบ) → เช็คชื่อ; QR (เงินเข้าบัญชีบริษัทเสมออยู่แล้ว) → เช็ควันที่แทน; Grab/Lineman → เช็คแค่ยอด
// pos = รูปหน้ารายงานสรุปยอดของ POS — มีเส้นทางอ่านของตัวเอง (readPosReportImage) ไม่ผ่าน readEvidenceImage
const CHECK_NAME: Record<EvidenceType | "cash", boolean> = {
  qr: false, cash: true, grab: false, lineman: false, pos: false,
};
const CHECK_DATE: Record<EvidenceType | "cash", boolean> = {
  qr: true, cash: false, grab: false, lineman: false, pos: true,
};

export function checkFlags(kind: EvidenceType | "cash"): { checkName: boolean; checkDate: boolean } {
  return { checkName: CHECK_NAME[kind], checkDate: CHECK_DATE[kind] };
}

function formatExpectedDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const be = Number(y) + 543;
  return `${d}/${m}/${y} (หรือปี พ.ศ. ${d}/${m}/${be})`;
}

export async function readEvidenceImage(
  base64: string, mediaType: string, kind: EvidenceType | "cash", expectedDate?: string
): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — ติดต่อแอดมินเพื่อเปิดใช้การอ่านยอดอัตโนมัติ");

  const { checkName, checkDate } = checkFlags(kind);
  const questions: string[] = ["ยอดเงินรวมที่อ่านได้จากรูป"];
  if (checkName) questions.push(`ชื่อผู้รับเงิน/บัญชีปลายทางในรูป ตรงกับรายชื่อใดชื่อหนึ่งในนี้หรือไม่ (ยอมรับสะกด/รูปแบบต่างกันเล็กน้อย เช่นมีคำนำหน้า บจก./บริษัท หรือมีแค่บางส่วน): ${VALID_RECIPIENT_NAMES.join(", ")}`);
  if (checkDate && expectedDate) questions.push(`วันที่ในเอกสารนี้ตรงกับวันที่ ${formatExpectedDate(expectedDate)} หรือไม่`);

  const schema: any = {
    type: "object",
    properties: {
      amount: { type: ["number", "null"], description: "ยอดเงินรวมที่อ่านได้จากรูป เป็นตัวเลขล้วน ไม่มี comma/สกุลเงิน — null ถ้าอ่านไม่ได้เลย" },
      clarity: { type: "string", enum: ["clear", "unclear"], description: "unclear ถ้าลายมือ/คุณภาพภาพไม่ชัดจนไม่มั่นใจตัวเลขหรือวันที่" },
      txnRef: { type: ["string", "null"], description: "เลขอ้างอิง/เลขที่รายการ/หมายเลขเอกสารที่ปรากฏในรูป (transaction ID, เลขที่รายการโอน, เลขที่ใบเสร็จ ฯลฯ) คัดลอกตรงตัวตามที่เห็น — null ถ้าไม่มี/อ่านไม่ออก" },
      txnTime: { type: ["string", "null"], description: "วันที่และเวลาที่ปรากฏในรูป (เวลาทำรายการ หรือเวลาที่ออกรายงาน) ตรงตัวตามที่เห็น — null ถ้าไม่มี/อ่านไม่ออก" },
      ...(checkName ? { nameMatch: { type: "boolean", description: "true ถ้าชื่อผู้รับเงินตรงกับรายชื่อที่ให้มา" } } : {}),
      ...(checkDate ? { dateMatch: { type: "boolean", description: "true ถ้าวันที่ในเอกสารตรงกับวันที่ที่ต้องตรวจสอบ" } } : {}),
    },
    required: [
      "amount", "clarity", "txnRef", "txnTime",
      ...(checkName ? ["nameMatch"] : []),
      ...(checkDate ? ["dateMatch"] : []),
    ],
  };

  const promptText = `อ่านรูปสลิปโอนเงิน/หน้าจอสรุปยอดนี้ แล้วรายงาน: ${questions.map((q, i) => `${i + 1}) ${q}`).join(" ")} — และเสมอ: เลขอ้างอิง/เลขที่รายการ/หมายเลขเอกสารที่ปรากฏในรูป (ถ้ามี) กับวันที่-เวลาที่ปรากฏในรูป (ถ้ามี) เพื่อใช้ตรวจสอบว่ารูปนี้เคยถูกใช้มาก่อนหรือไม่`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      tools: [{ name: "report_reading", description: "รายงานยอดเงินและผลตรวจสอบที่อ่านได้จากรูป", input_schema: schema }],
      tool_choice: { type: "tool", name: "report_reading" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: promptText },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const toolUse = (data?.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse) throw new Error("อ่านผลจาก Claude ไม่สำเร็จ (ไม่มี tool_use block)");
  const input = toolUse.input ?? {};
  return {
    amount: typeof input.amount === "number" ? input.amount : null,
    nameMatch: checkName ? (typeof input.nameMatch === "boolean" ? input.nameMatch : null) : null,
    dateMatch: checkDate ? (typeof input.dateMatch === "boolean" ? input.dateMatch : null) : null,
    clarity: input.clarity === "unclear" ? "unclear" : "clear",
    txnRef: typeof input.txnRef === "string" && input.txnRef.trim() ? input.txnRef.trim() : null,
    txnTime: typeof input.txnTime === "string" && input.txnTime.trim() ? input.txnTime.trim() : null,
  };
}

export function computeMatchStatus(enteredAmount: number, ocr: OcrResult, checkName: boolean, checkDate = false): MatchStatus {
  if (ocr.clarity === "unclear" || ocr.amount === null) return "unclear";
  if (checkName && ocr.nameMatch === false) return "mismatch";
  if (checkDate && ocr.dateMatch === false) return "mismatch";
  if (Math.abs(ocr.amount - enteredAmount) > 1) return "mismatch";
  return "ok";
}

// อธิบายสาเหตุที่ไม่ตรงให้ชัดเจน — กันสับสนเวลายอดตรงเป๊ะแต่ระบบขึ้น "ไม่ตรง" เพราะจริงๆ คือชื่อผู้รับ/วันที่ไม่ตรง
export function describeMismatch(enteredAmount: number, ocr: OcrResult, checkName: boolean, checkDate = false): string | null {
  const amountWrong = ocr.amount !== null && Math.abs(ocr.amount - enteredAmount) > 1;
  const nameWrong = checkName && ocr.nameMatch === false;
  const dateWrong = checkDate && ocr.dateMatch === false;
  const reasons: string[] = [];
  if (amountWrong) reasons.push(`ยอด (อ่านได้ ${baht(ocr.amount!)})`);
  if (dateWrong) reasons.push("วันที่ในเอกสาร");
  if (nameWrong) reasons.push("ชื่อผู้รับเงิน");
  if (reasons.length === 0) return null;
  const suffix = !amountWrong ? " (ยอดถูกต้อง)" : "";
  return `${reasons.join(" และ ")}ไม่ตรงกับที่ควรจะเป็น${suffix}`;
}

// ── อ่านหน้ารายงานสรุปยอดขายบน POS iPad (v1.24) ──
//
// แทนที่ช่อง "ยอดขายรวมตาม POS" ที่ให้พิมพ์เอง — แพรบอกพนักงานสับสนว่าต้องเอาเลขจากไหน
// ถ่ายรูปหน้ารายงานมาแนบแทน แล้วระบบอ่านเอง 4 ค่า: ยอดขายทั้งหมด · เงินสด · อื่นๆ · ช่วงวันที่
//
// "อื่นๆ" ของ POS = ทุกช่องทางที่ไม่ใช่เงินสด (QR + EDC + Grab + Lineman) รวมเป็นก้อนเดียว
// จึงเทียบได้แค่ 3 ตัว: ยอดรวม · เงินสด · ที่เหลือ — ซึ่งพอดักการกรอกผิดช่องได้แล้ว
export interface PosReportReading {
  total: number | null;      // ยอดขายทั้งหมด
  cash: number | null;       // เงินสด
  other: number | null;      // อื่นๆ (ไม่ใช่เงินสด)
  billCount: number | null;  // จำนวนบิล
  dateFrom: string | null;   // yyyy-mm-dd — ช่วงวันที่ของรายงาน (ซ้ายมือ)
  dateTo: string | null;     // yyyy-mm-dd — (ขวามือ)
  clarity: "clear" | "unclear";
}

export async function readPosReportImage(base64: string, mediaType: string): Promise<PosReportReading> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — ติดต่อแอดมินเพื่อเปิดใช้การอ่านยอดอัตโนมัติ");

  const schema = {
    type: "object",
    properties: {
      total: { type: ["number", "null"], description: "ยอดขายทั้งหมด (ตัวเลขใหญ่สีเขียว หรือช่อง 'ยอดรวม') เป็นตัวเลขล้วนไม่มี comma — null ถ้าอ่านไม่ได้" },
      cash: { type: ["number", "null"], description: "ยอดช่อง 'เงินสด' — null ถ้าไม่มี/อ่านไม่ได้" },
      other: { type: ["number", "null"], description: "ยอดช่อง 'อื่นๆ' — null ถ้าไม่มี/อ่านไม่ได้" },
      billCount: { type: ["number", "null"], description: "จำนวนบิล — null ถ้าไม่มี/อ่านไม่ได้" },
      dateFrom: { type: ["string", "null"], description: "วันที่เริ่มของช่วงรายงาน รูปแบบ YYYY-MM-DD (แปลง พ.ศ. เป็น ค.ศ. ให้ด้วย เช่น 29 กรกฎาคม 2568 = 2025-07-29) — null ถ้าอ่านไม่ได้" },
      dateTo: { type: ["string", "null"], description: "วันที่สิ้นสุดของช่วงรายงาน รูปแบบ YYYY-MM-DD — ถ้ารายงานเป็นวันเดียวให้ตอบเท่ากับ dateFrom" },
      clarity: { type: "string", enum: ["clear", "unclear"], description: "unclear ถ้าภาพเบลอ/มืด/เอียงจนไม่มั่นใจตัวเลขหรือวันที่ หรือรูปนี้ไม่ใช่หน้ารายงานสรุปยอดของ POS" },
    },
    required: ["total", "cash", "other", "billCount", "dateFrom", "dateTo", "clarity"],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      tools: [{ name: "report_pos", description: "รายงานตัวเลขที่อ่านได้จากหน้ารายงานสรุปยอดขายของ POS", input_schema: schema }],
      tool_choice: { type: "tool", name: "report_pos" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: "รูปนี้คือหน้า 'รายงาน' สรุปยอดขายรายวันของระบบ POS ในร้าน อ่านแล้วรายงาน: "
              + "1) ยอดขายทั้งหมด 2) ยอดเงินสด 3) ยอดอื่นๆ 4) จำนวนบิล 5) ช่วงวันที่ของรายงาน (วันที่เริ่ม–วันที่สิ้นสุด) "
              + "— อ่านเฉพาะตัวเลขที่เห็นจริงในรูป ห้ามคำนวณหรือเดาแทน ถ้าช่องไหนอ่านไม่ออกให้ตอบ null "
              + "และถ้ารูปนี้ไม่ใช่หน้ารายงานสรุปยอดของ POS ให้ตอบ clarity = unclear",
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const toolUse = (data?.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse) throw new Error("อ่านผลจาก Claude ไม่สำเร็จ (ไม่มี tool_use block)");
  const i = toolUse.input ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    total: num(i.total),
    cash: num(i.cash),
    other: num(i.other),
    billCount: num(i.billCount),
    dateFrom: day(i.dateFrom),
    dateTo: day(i.dateTo),
    clarity: i.clarity === "unclear" ? "unclear" : "clear",
  };
}

// ตรวจรูปรายงาน POS เทียบกับที่พนักงานกรอก — คืนสถานะ + เหตุผลที่ไม่ผ่านเป็นภาษาคน
// เทียบ 3 ด่าน: วันที่ของรายงาน → ยอดรวม → เงินสด (ที่เหลือคืออื่นๆ ซึ่งตรงเองถ้า 2 ตัวแรกตรง)
export function checkPosReport(
  r: PosReportReading, expectedDate: string, enteredTotal: number, enteredCash: number
): { status: MatchStatus; note: string | null } {
  if (r.clarity === "unclear" || r.total === null) {
    return { status: "unclear", note: "อ่านรูปไม่ชัด — ถ่ายใหม่ให้เห็นทั้งหน้าจอรายงาน ตรงและสว่างพอ" };
  }
  const reasons: string[] = [];
  if (r.dateFrom && r.dateFrom !== expectedDate) {
    reasons.push(`รายงานในรูปเป็นวันที่ ${r.dateFrom} ไม่ใช่ ${expectedDate}`);
  } else if (r.dateTo && r.dateTo !== expectedDate) {
    reasons.push(`ช่วงวันที่ในรูปไม่ใช่วันเดียว (${r.dateFrom ?? "?"} ถึง ${r.dateTo})`);
  }
  if (Math.abs(r.total - enteredTotal) > 1) {
    reasons.push(`ยอดขายทั้งหมดในรูป ${baht(r.total)} แต่ผลรวมที่กรอก ${baht(enteredTotal)}`);
  }
  if (r.cash !== null && Math.abs(r.cash - enteredCash) > 1) {
    reasons.push(`เงินสดในรูป ${baht(r.cash)} แต่กรอกไว้ ${baht(enteredCash)}`);
  }
  return reasons.length ? { status: "mismatch", note: reasons.join(" · ") } : { status: "ok", note: null };
}

// ── อ่านบิลสิทธิ์พนักงาน (v1.13 เฟส 2) ──
// ต่างจาก readEvidenceImage ตรงที่บิลหน้าร้านมี 3 ตัวเลขที่ต้องแยกให้ออก (เต็ม/ส่วนลด/จ่ายจริง)
// ยอดที่ตัดสิทธิ์คือ "ส่วนลด" เท่านั้น — อ่านผิดช่องแล้วสิทธิ์จะเพี้ยนทันที จึงบังคับให้ตอบครบทั้ง 3
export interface BillReading {
  billTotal: number | null;
  discountAmount: number | null;
  paidAmount: number | null;
  billDate: string | null;   // yyyy-mm-dd
  clarity: "clear" | "unclear";
}

export async function readStaffBillImage(base64: string, mediaType: string): Promise<BillReading> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — ติดต่อแอดมินเพื่อเปิดใช้การอ่านยอดอัตโนมัติ");

  const schema = {
    type: "object",
    properties: {
      billTotal: { type: ["number", "null"], description: "ยอดรวมก่อนหักส่วนลด (subtotal / ยอดสินค้า) เป็นตัวเลขล้วน — null ถ้าอ่านไม่ได้" },
      discountAmount: { type: ["number", "null"], description: "ยอดส่วนลดบนบิล เป็นเลขบวก (ถ้าบิลเขียนติดลบ ให้ตอบค่าสัมบูรณ์) — null ถ้าบิลนี้ไม่มีส่วนลด" },
      paidAmount: { type: ["number", "null"], description: "ยอดสุทธิที่ลูกค้าจ่ายจริงหลังหักส่วนลด (grand total / ยอดชำระ) — null ถ้าอ่านไม่ได้" },
      billDate: { type: ["string", "null"], description: "วันที่บนบิลในรูปแบบ YYYY-MM-DD (แปลง พ.ศ. เป็น ค.ศ. ให้ด้วยถ้าบิลเป็น พ.ศ.) — null ถ้าไม่มี/อ่านไม่ออก" },
      clarity: { type: "string", enum: ["clear", "unclear"], description: "unclear ถ้าภาพไม่ชัดจนไม่มั่นใจตัวเลข หรือแยกไม่ออกว่าตัวไหนคือส่วนลด" },
    },
    required: ["billTotal", "discountAmount", "paidAmount", "billDate", "clarity"],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      tools: [{ name: "report_bill", description: "รายงานตัวเลขที่อ่านได้จากบิลหน้าร้าน", input_schema: schema }],
      tool_choice: { type: "tool", name: "report_bill" },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "อ่านบิลขายหน้าร้านนี้ แล้วรายงาน 1) ยอดรวมก่อนหักส่วนลด 2) ยอดส่วนลด 3) ยอดสุทธิที่จ่ายจริง 4) วันที่บนบิล — ถ้าบิลไม่มีบรรทัดส่วนลดเลย ให้ discountAmount เป็น null อย่าเดา" },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const toolUse = (data?.content ?? []).find((b: any) => b.type === "tool_use");
  if (!toolUse) throw new Error("อ่านผลจาก Claude ไม่สำเร็จ (ไม่มี tool_use block)");
  const i = toolUse.input ?? {};
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : null);
  return {
    billTotal: numOrNull(i.billTotal),
    discountAmount: numOrNull(i.discountAmount),
    paidAmount: numOrNull(i.paidAmount),
    billDate: typeof i.billDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.billDate) ? i.billDate : null,
    clarity: i.clarity === "unclear" ? "unclear" : "clear",
  };
}
