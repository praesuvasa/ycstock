// Passcode hashing (Node runtime — login / create-user routes เท่านั้น)
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { t, type Lang } from "./i18n";

/** เก็บเป็น "salt:hash" (hex) */
export function hashPasscode(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

// ── กัน PIN ซ้ำกันแบบ atomic (v1.30) ──
// scrypt สุ่ม salt ใหม่ทุกครั้งแม้ PIN เดียวกัน จึงใช้ unique constraint กับ passcode_hash ตรงๆ ไม่ได้
// คอลัมน์นี้แยกไว้ "เช็คซ้ำอย่างเดียว" — ไม่ใช่ตัวยืนยันตัวตน (passcode_hash คือตัวจริงเหมือนเดิม)
// deterministic ตั้งใจ (ไม่มี salt) เพราะต้องเทียบผ่าน DB unique index ได้ตรงๆ
const PASSCODE_LOOKUP_PEPPER = process.env.PASSCODE_LOOKUP_PEPPER || "bqmp-ops-passcode-lookup-v1";
export function passcodeLookupHash(pin: string): string {
  return createHash("sha256").update(`${PASSCODE_LOOKUP_PEPPER}:${pin}`).digest("hex");
}

export function verifyPasscode(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = scryptSync(pin, salt, 32);
  const orig = Buffer.from(hash, "hex");
  return orig.length === test.length && timingSafeEqual(orig, test);
}

// ── รหัสตั้งค่าครั้งแรก (v1.15) ──
// ใช้แทนการที่แอดมินตั้ง PIN ให้ — ออกครั้งเดียว ใช้ครั้งเดียว หมดอายุ 48 ชม.
// เก็บเป็น hash เหมือน PIN จริง (แอดมินเห็นตัวเลขแค่ตอนที่ระบบเพิ่งสร้างให้เท่านั้น)
export const SETUP_CODE_TTL_HOURS = 48;
export const PIN_LENGTH = 6;

/** เลข 6 หลักแบบสุ่มปลอดภัย — ไม่ใช้ Math.random เพราะเดาลำดับได้ */
export function generateSetupCode(): string {
  let out = "";
  while (out.length < PIN_LENGTH) {
    out += (randomBytes(4).readUInt32BE(0) % 10).toString();
  }
  return out;
}

/** PIN ต้องเป็นตัวเลขล้วน 6 หลัก และไม่ใช่รูปแบบที่เดาง่ายจนเกินไป */
// lang เผื่อ NCD (พนักงานต่างชาติ) — default "th" ไว้เหมือนเดิม ไม่กระทบผู้เรียกเดิมที่ไม่ส่งมา
export function validatePin(pin: string, lang: Lang = "th"): string | null {
  if (!/^\d{6}$/.test(pin)) return t(lang, "setPin.errNotSixDigits");
  if (/^(\d)\1{5}$/.test(pin)) return t(lang, "setPin.errRepeat");
  const asc = "0123456789", desc = "9876543210";
  if (asc.includes(pin) || desc.includes(pin)) return t(lang, "setPin.errSequential");
  return null;
}
