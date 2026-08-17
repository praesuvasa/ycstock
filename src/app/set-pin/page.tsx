"use client";
// v1.15 · ตั้งรหัสเข้าระบบด้วยตัวเอง
//
// เข้าหน้านี้ 2 ทาง:
//  1) เข้าครั้งแรกด้วย "รหัสตั้งค่า" จากแอดมิน → middleware บังคับมาที่นี่ ข้ามไม่ได้
//  2) เข้าเองจากเมนู เพื่อเปลี่ยนรหัสเมื่อไหร่ก็ได้
//
// autoComplete="off" ตั้งใจ (เดิมเป็น "new-password") — พบสาเหตุ "ล็อกอินไม่ได้ทุกวัน" (แพร 2026-08-06)
// จริงๆ รหัสยังถูกต้องเสมอ แต่ browser/password manager เห็น autoComplete="new-password" แล้วเสนอ
// "บันทึกรหัสผ่าน?" ทุกครั้งที่ตั้ง PIN ใหม่ พอเปลี่ยน PIN บ่อยจะมีรหัสเก่าหลายอันค้างอยู่ใน password
// manager แล้วมันเดา autofill รหัสเก่าให้ที่หน้า login แทนรหัสปัจจุบัน — "off" ตัดสัญญาณนี้ทิ้ง
// (ของเก่าที่บันทึกไปแล้วยังต้องให้แพรไปลบเองในตัวจัดการรหัสผ่านของเบราว์เซอร์)
//
// v1.31 (2026-08-08) — พนักงานเข้าไม่ได้พร้อมกันหลายคน สาเหตุใหม่: Safari ไม่สนใจ
// autoComplete="off" กับ input type="password" เลย (ยืนยันจาก WebKit เอง) ยังเสนอ/auto-fill รหัสเก่าจาก
// Keychain ให้อยู่ดี — เปลี่ยนช่องกรอกจาก type="password" เป็น type="text" + บังตัวเลขด้วย CSS
// text-security แทน ตัด Safari ไม่ให้มองว่าเป็นช่องรหัสผ่านตั้งแต่ต้น (ดูรายละเอียดที่ login/page.tsx)
import React from "react";
import { useRouter } from "next/navigation";
import { useMe, useLang } from "@/components/nav";
import { GlassCard, PageTitle, Button } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function SetPinPage() {
  const me = useMe();
  const lang = useLang();
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
    if (/^(\d)\1{5}$/.test(v)) return t(lang, "setPin.errRepeat");
    const asc = "0123456789", desc = "9876543210";
    if (asc.includes(v) || desc.includes(v)) return t(lang, "setPin.errSequential");
    return null;
  }

  const pinIssue = localPinIssue(pin);
  const mismatch = pin.length === 6 && confirm.length === 6 && pin !== confirm ? t(lang, "setPin.errMismatch") : null;
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
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? t(lang, "setPin.errGeneric"));
      window.alert(t(lang, "setPin.successAlert"));
      // เข้าครั้งแรก (ยังไม่ลงทะเบียนใบหน้า) → ไปลงทะเบียนใบหน้าต่อทันที
      // เข้าเองจากเมนู "เปลี่ยนรหัสของฉัน" (ลงทะเบียนแล้ว) → กลับหน้าหลัก ไม่ใช่พาไปหน้าลงเวลา
      router.replace(me?.mustEnrollFace ? "/time-clock" : "/");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "setPin.errGeneric"));
      setPin(""); setConfirm("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <PageTitle title={t(lang, "setPin.title")} />

      <GlassCard>
        <p className="mb-3 text-[12.5px] leading-relaxed text-brand-ink/60">
          {me ? <><b>{me.name}</b>{me.branchScope !== "all" ? ` · ${t(lang, "setPin.branchPrefix")}${me.branchScope}` : ""} — </> : null}
          {t(lang, "setPin.introSuffix")}
        </p>

        <div className="grid gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "setPin.newPinLabel")}</span>
            <input
              inputMode="numeric" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off"
              spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true"
              style={{ WebkitTextSecurity: "disc", MozTextSecurity: "disc", textSecurity: "disc" } as React.CSSProperties}
              value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))}
              className="field text-center text-[20px] tracking-[.4em]"
              placeholder="••••••"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "setPin.confirmLabel")}</span>
            <input
              inputMode="numeric" type="text" autoComplete="off" autoCorrect="off" autoCapitalize="off"
              spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true"
              style={{ WebkitTextSecurity: "disc", MozTextSecurity: "disc", textSecurity: "disc" } as React.CSSProperties}
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
            {saving ? t(lang, "setPin.saving") : t(lang, "setPin.save")}
          </Button>
        </div>

        <div className="mt-3 rounded-lg bg-warn/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-warn">
          <b>{t(lang, "setPin.warnTitle")}</b> — {t(lang, "setPin.warnBody")}
          <br />{t(lang, "setPin.warnForgot")}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-brand-ink/45">
          {t(lang, "setPin.ruleHint")}
        </p>
      </GlassCard>
    </div>
  );
}
