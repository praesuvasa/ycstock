// Signed session cookie — Web Crypto HMAC (ใช้ได้ทั้ง Edge middleware และ Node routes)
import type { Session } from "./types";

export const SESSION_COOKIE = "yc_session";
// v1.32 (2026-08-08) — ยืดจาก 12 → 24 ชม. กันหลุดกลางกะยาว (แพรสั่ง — เจอเคสกะเช้าแล้วดันหลุด
// ตอนบ่าย) กติกา "หลุดทุกเช้าเมื่อข้ามวัน" ข้างล่าง (verifySession) ยังอยู่เหมือนเดิม ไม่เปลี่ยน —
// นี่แค่กันไม่ให้ 12 ชม.เดิมมาตัดจบก่อนกติกาข้ามวันจะทำงานเอง
const SESSION_HOURS = 24;
// v1.33 (2026-08-22) — admin ไม่ต้อง logout ทุกเช้าเหมือนพนักงานทั่วไป (แพรขอ — หลุดบ่อยเท่าไหร่
// ยิ่งมีโอกาสพิมพ์ PIN ผิดตอนเข้าใหม่บ่อยเท่านั้น เจอเคสรหัสผิดซ้ำๆ ช่วงนี้เพราะข้ามวันแล้วหลุดทุกครั้ง)
// พนักงานทั่วไปยังหลุดทุกเช้าเหมือนเดิม — กติกานี้ตั้งใจไว้ให้เป็นตัวเช็คว่าเข้าเวรตรงเวลา
const ADMIN_SESSION_HOURS = 24 * 90; // 90 วัน — ยังมี ceiling อยู่ ไม่ใช่ไม่หมดอายุเลย (กันเคสเครื่องหาย/ถูกขโมย)

/**
 * วันที่ตามเวลาไทยจาก epoch — บวก 7 ชั่วโมงตรง ๆ ไม่พึ่ง Intl
 * middleware รันบน edge ซึ่งบางรันไทม์ไม่มีข้อมูลโซนเวลาครบ · ไทยไม่มี DST จึงบวกคงที่ได้เป๊ะ
 */
const bkkDay = (t: number): string => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);

function secret(): string {
  return process.env.SESSION_SECRET || "yc-stock-dev-secret-change-me"; // dev fallback (ตั้ง env จริงบน production)
}

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string): Uint8Array => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64u(sig);
}

/** สร้าง token: base64url(payload).base64url(hmac) · เซ็ต exp = now + 24h (admin = 90 วัน) */
export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const now = Date.now();
  const hours = s.role === "admin" ? ADMIN_SESSION_HOURS : SESSION_HOURS;
  const payload: Session = { ...s, exp: now + hours * 3600_000, day: bkkDay(now) };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

/** ตรวจ token → Session ถ้าถูกต้องและยังไม่หมดอายุ, ไม่งั้น null */
export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  if (expected !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64u(body))) as Session;
    if (!s.exp || s.exp < Date.now()) return null;
    // ข้ามวันแล้วถือว่าหมดอายุเสมอ — พนักงานต้องใส่ PIN ใหม่ทุกเช้าก่อนเริ่มงาน (เช็คว่าเข้าเวรตรงเวลา)
    // admin ยกเว้นกติกานี้ (v1.33 — แพรขอ ไม่ต้องหลุดทุกเช้า) ยังผูกกับ exp ด้านบนอยู่ดี (90 วัน) ไม่ใช่ไม่มีวันหมดอายุเลย
    // session เก่าที่ยังไม่มีฟิลด์ day เลย ก็ให้หมดอายุไปเลยรอบเดียว (เว้น admin เหมือนกัน)
    if (s.role !== "admin" && (!s.day || s.day !== bkkDay(Date.now()))) return null;
    return s;
  } catch {
    return null;
  }
}
