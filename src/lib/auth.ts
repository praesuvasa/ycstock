// Passcode hashing (Node runtime — login / create-user routes เท่านั้น)
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** เก็บเป็น "salt:hash" (hex) */
export function hashPasscode(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPasscode(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = scryptSync(pin, salt, 32);
  const orig = Buffer.from(hash, "hex");
  return orig.length === test.length && timingSafeEqual(orig, test);
}
