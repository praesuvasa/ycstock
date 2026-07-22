// อ่านยอดเงิน + ชื่อผู้รับจากรูปสลิป/หน้าจอสรุปยอด ด้วย Claude vision (v1.7)
// เรียก Anthropic Messages API ตรงๆ ผ่าน fetch (ไม่มี SDK ติดตั้ง — ตัวเรียกเดียว ไม่คุ้มเพิ่ม dependency)
import { VALID_RECIPIENT_NAMES } from "./recipients";
import type { EvidenceType, MatchStatus } from "./types";

export interface OcrResult {
  amount: number | null;
  nameMatch: boolean | null; // null = ไม่ได้เช็คชื่อ (grab/lineman)
  clarity: "clear" | "unclear";
}

const CHECK_NAME: Record<EvidenceType | "cash", boolean> = {
  qr: true, cash: true, grab: false, lineman: false,
};

export async function readEvidenceImage(
  base64: string, mediaType: string, kind: EvidenceType | "cash"
): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY — ติดต่อแอดมินเพื่อเปิดใช้การอ่านยอดอัตโนมัติ");

  const checkName = CHECK_NAME[kind];
  const nameInstruction = checkName
    ? `2) ชื่อผู้รับเงิน/บัญชีปลายทางในรูป ตรงกับรายชื่อใดชื่อหนึ่งในนี้หรือไม่ (ยอมรับสะกด/รูปแบบต่างกันเล็กน้อย เช่นมีคำนำหน้า บจก./บริษัท หรือมีแค่บางส่วน): ${VALID_RECIPIENT_NAMES.join(", ")}`
    : "";
  const schema: any = {
    type: "object",
    properties: {
      amount: { type: ["number", "null"], description: "ยอดเงินรวมที่อ่านได้จากรูป เป็นตัวเลขล้วน ไม่มี comma/สกุลเงิน — null ถ้าอ่านไม่ได้เลย" },
      clarity: { type: "string", enum: ["clear", "unclear"], description: "unclear ถ้าลายมือ/คุณภาพภาพไม่ชัดจนไม่มั่นใจตัวเลขหรือชื่อ" },
      ...(checkName ? { nameMatch: { type: "boolean", description: "true ถ้าชื่อผู้รับเงินตรงกับรายชื่อที่ให้มา" } } : {}),
    },
    required: checkName ? ["amount", "clarity", "nameMatch"] : ["amount", "clarity"],
  };

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
          { type: "text", text: `อ่านรูปสลิปโอนเงิน/หน้าจอสรุปยอดนี้ แล้วรายงาน 1) ยอดเงินรวม${nameInstruction ? " " + nameInstruction : ""}` },
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
    clarity: input.clarity === "unclear" ? "unclear" : "clear",
  };
}

export function computeMatchStatus(enteredAmount: number, ocr: OcrResult, checkName: boolean): MatchStatus {
  if (ocr.clarity === "unclear" || ocr.amount === null) return "unclear";
  if (checkName && ocr.nameMatch === false) return "mismatch";
  if (Math.abs(ocr.amount - enteredAmount) > 1) return "mismatch";
  return "ok";
}
