"use client";
// v1.15 · ตั้งรหัสเข้าระบบด้วยตัวเอง
//
// เข้าหน้านี้ 2 ทาง:
//  1) เข้าครั้งแรกด้วย "รหัสตั้งค่า" จากแอดมิน → middleware บังคับมาที่นี่ ข้ามไม่ได้
//  2) เข้าเองจากเมนู เพื่อเปลี่ยนรหัสเมื่อไหร่ก็ได้
import React from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/components/nav";
import { GlassCard, PageTitle, Button } from "@/components/ui";

export default function SetPinPage() {
  const me = useMe();
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  // มิเรอร์กติกาเดียวกับ validatePin ใน src/lib/auth.ts (ห้าม import ตรง ๆ เพราะไฟล์นั้นดึง
  // node:crypto เข้ามาด้วย ซึ่ง bundle ฝั่ง client ไม่ได้) — ให้พนักงานเห็น error ทันทีไม่ต้องรอ round-trip
  // เซิร์ฟเวอร์ยังตรวจซ้ำอีกชั้นเสมอ (defense-in-depth) จุดนี้แค่ช่วยเรื่อง UX
  function localPinIssue(v: string): string | null {
    if (v.length < 6) return null; // ยังพิมพ์ไม่ครบ ไม่ต้องขึ้น error
    if (/^(\d)\1{5}$/.test(v)) return "รหัสซ้ำตัวเดียวทั้งหมดใช้ไม่ได้ (เช่น 111111)";
    const asc = "0123456789", desc = "9876543210";
    if (asc.includes(v) || desc.includes(v)) return "รหัสเรียงกันใช้ไม่ได้ (เช่น 123456)";
    return null;
  }

  const pinIssue = localPinIssue(pin);
  const mismatch = pin.length === 6 && confirm.length === 6 && pin !== confirm ? "รหัสสองช่องไม่ตรงกัน" : null;
  const clientIssue = pinIssue ?? mismatch;
  const ready = pin.length === 6 && confirm.length === 6 && !saving && !clientIssue;

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: pin, confirmPin: confirm }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? "ตั้งรหัสไม่สำเร็จ");
      window.alert("ตั้งรหัสเรียบร้อย — ครั้งหน้าใช้รหัสนี้เข้าระบบ");
      // เข้าครั้งแรก (ยังไม่ลงทะเบียนใบหน้า) → ไปลงทะเบียนใบหน้าต่อทันที
      // เข้าเองจากเมนู "เปลี่ยนรหัสของฉัน" (ลงทะเบียนแล้ว) → กลับหน้าหลัก ไม่ใช่พาไปหน้าลงเวลา
      router.replace(me?.mustEnrollFace ? "/time-clock" : "/");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "ตั้งรหัสไม่สำเร็จ");
      setPin(""); setConfirm("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <PageTitle title="ตั้งรหัสของคุณ" />

      <GlassCard>
        <p className="mb-3 text-[12.5px] leading-relaxed text-brand-ink/60">
          {me ? <><b>{me.name}</b>{me.branchScope !== "all" ? ` · สาขา ${me.branchScope}` : ""} — </> : null}
          ตั้งรหัสตัวเลข 6 หลักที่จำได้ ใช้เข้าระบบครั้งต่อไป
        </p>

        <div className="grid gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">รหัสใหม่ (6 หลัก)</span>
            <input
              inputMode="numeric" type="password" autoComplete="new-password"
              value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))}
              className="field text-center text-[20px] tracking-[.4em]"
              placeholder="••••••"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">ยืนยันอีกครั้ง</span>
            <input
              inputMode="numeric" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(digitsOnly(e.target.value))}
              className="field text-center text-[20px] tracking-[.4em]"
              placeholder="••••••"
            />
          </label>

          {/* แจ้งทันทีตอนพิมพ์ครบ ก่อนกดบันทึกด้วยซ้ำ — ไม่ต้องรอ round-trip ไปเจอ error จากเซิร์ฟเวอร์ */}
          {!err && clientIssue && (
            <p className="rounded-lg bg-brand-red/10 px-2.5 py-2 text-[12px] text-brand-red">{clientIssue}</p>
          )}

          {err && (
            <p className="rounded-lg bg-brand-red/10 px-2.5 py-2 text-[12px] text-brand-red">{err}</p>
          )}

          <Button onClick={save} disabled={!ready}>
            {saving ? "กำลังบันทึก…" : "บันทึกรหัส"}
          </Button>
        </div>

        <div className="mt-3 rounded-lg bg-warn/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
          <b>ห้ามบอกใคร</b> — แอดมินก็ดูรหัสนี้ไม่ได้ ระบบเก็บเป็นค่าเข้ารหัสเท่านั้น
          <br />ลืมรหัสให้แจ้งแอดมินออก &ldquo;รหัสตั้งค่าใหม่&rdquo; ให้ แล้วมาตั้งใหม่ที่หน้านี้
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-brand-ink/45">
          ใช้เลขซ้ำกันทั้งหมด (111111) หรือเลขเรียง (123456) ไม่ได้ — เดาง่ายเกินไป
        </p>
      </GlassCard>
    </div>
  );
}
