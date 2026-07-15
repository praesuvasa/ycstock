// Signed session cookie — Web Crypto HMAC (ใช้ได้ทั้ง Edge middleware และ Node routes)
import type { Session } from "./types";

export const SESSION_COOKIE = "yc_session";
const SESSION_HOURS = 12;

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

/** สร้าง token: base64url(payload).base64url(hmac) · เซ็ต exp = now + 12h */
export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const payload: Session = { ...s, exp: Date.now() + SESSION_HOURS * 3600_000 };
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
    return s;
  } catch {
    return null;
  }
}
