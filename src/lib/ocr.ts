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
const CHECK_NAME: Record<EvidenceType | "cash", boolean> = {
  qr: false, cash: true, grab: false, lineman: false,
};
const CHECK_DATE: Record<EvidenceType | "cash", boolean> = {
  qr: true, cash: false, grab: false, lineman: false,
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
