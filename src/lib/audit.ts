// Audit helper — เรียกหลัง mutation สำเร็จทุกครั้งใน BFF
import type { Session } from "./types";
import { db } from "./db";

export async function writeAudit(
  session: Session | null,
  action: string,
  opts: { branch?: string | null; date?: string | null; entity?: string | null; detail?: string } = {},
): Promise<void> {
  try {
    await db.writeAudit({
      userId: session?.userId ?? "system",
      userName: session?.name ?? "system",
      action,
      branch: opts.branch ?? null,
      date: opts.date ?? null,
      entity: opts.entity ?? null,
      detail: opts.detail ?? "",
    });
  } catch {
    // อย่าให้ audit ล้มทำ mutation พัง — log เงียบ
  }
}
