// i18n เบา ๆ ไม่ใช้ library — เพราะทั้งแอปเป็น client component ล้วน ไม่มี routing ตาม locale เลย
// (ดูเหตุผลเต็มที่ /Users/praee/.claude/plans/zesty-whistling-crystal.md)
// t() เป็น pure function ใช้ได้ทั้งฝั่ง client (ผ่าน useLang ใน nav.tsx) และฝั่ง server (API routes
// เรียกตรง ๆ ด้วย session.lang) — ไม่มี React/browser dependency ในไฟล์นี้เลย
import { th as thCommon } from "./th/common";
import { en as enCommon } from "./en/common";
import { th as thNav } from "./th/nav";
import { en as enNav } from "./en/nav";
import { th as thLogin } from "./th/login";
import { en as enLogin } from "./en/login";
import { th as thSetPin } from "./th/setPin";
import { en as enSetPin } from "./en/setPin";
import { th as thErrors } from "./th/errors";
import { en as enErrors } from "./en/errors";
import { th as thStore } from "./th/store";
import { en as enStore } from "./en/store";
import { th as thNotices } from "./th/notices";
import { en as enNotices } from "./en/notices";
import { th as thFeedback } from "./th/feedback";
import { en as enFeedback } from "./en/feedback";
import { th as thCashRemittance } from "./th/cashRemittance";
import { en as enCashRemittance } from "./en/cashRemittance";
import { th as thRequisitions } from "./th/requisitions";
import { en as enRequisitions } from "./en/requisitions";
import { th as thAllowance } from "./th/allowance";
import { en as enAllowance } from "./en/allowance";
import { th as thExpiry } from "./th/expiry";
import { en as enExpiry } from "./en/expiry";
import { th as thCups } from "./th/cups";
import { en as enCups } from "./en/cups";
import { th as thTimeClock } from "./th/timeClock";
import { en as enTimeClock } from "./en/timeClock";
import { th as thSchedule } from "./th/schedule";
import { en as enSchedule } from "./en/schedule";
import { th as thConfirmReceipt } from "./th/confirmReceipt";
import { en as enConfirmReceipt } from "./en/confirmReceipt";
import { th as thSales } from "./th/sales";
import { en as enSales } from "./en/sales";
import { th as thStock } from "./th/stock";
import { en as enStock } from "./en/stock";

export type Lang = "th" | "en";
export const DEFAULT_LANG: Lang = "th";

const DICT = {
  th: { common: thCommon, nav: thNav, login: thLogin, setPin: thSetPin, errors: thErrors, store: thStore, notices: thNotices, feedback: thFeedback, cashRemittance: thCashRemittance, requisitions: thRequisitions, allowance: thAllowance, expiry: thExpiry, cups: thCups, timeClock: thTimeClock, schedule: thSchedule, confirmReceipt: thConfirmReceipt, sales: thSales, stock: thStock },
  en: { common: enCommon, nav: enNav, login: enLogin, setPin: enSetPin, errors: enErrors, store: enStore, notices: enNotices, feedback: enFeedback, cashRemittance: enCashRemittance, requisitions: enRequisitions, allowance: enAllowance, expiry: enExpiry, cups: enCups, timeClock: enTimeClock, schedule: enSchedule, confirmReceipt: enConfirmReceipt, sales: enSales, stock: enStock },
} as const;

function lookup(dict: unknown, key: string): string | undefined {
  const val = key.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, dict);
  return typeof val === "string" ? val : undefined;
}

/**
 * แปลข้อความตาม key แบบ dot-path (เช่น "login.heading", "nav.user.stock")
 * หา key ไม่เจอในภาษาที่ขอ → fallback เป็นไทยเสมอ (กันหน้าที่ยังไม่ได้แปลพัง/ขึ้น undefined)
 * ไม่เจอแม้แต่ในไทย → คืน key ดิบ ๆ ไว้เห็นว่าลืมเพิ่ม ไม่ทำให้หน้าเว็บพัง
 */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let out = lookup(DICT[lang], key);
  if (out === undefined && lang !== "th") out = lookup(DICT.th, key);
  if (out === undefined) out = key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}
