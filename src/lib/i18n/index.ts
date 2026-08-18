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

export type Lang = "th" | "en";
export const DEFAULT_LANG: Lang = "th";

const DICT = {
  th: { common: thCommon, nav: thNav, login: thLogin, setPin: thSetPin, errors: thErrors, store: thStore },
  en: { common: enCommon, nav: enNav, login: enLogin, setPin: enSetPin, errors: enErrors, store: enStore },
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
