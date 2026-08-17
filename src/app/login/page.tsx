"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { t, type Lang, DEFAULT_LANG } from "@/lib/i18n";

// v1.31 (2026-08-17) — ภาษาของหน้านี้เลือกเองในเครื่อง (localStorage) ไม่ผูกกับ session เลย
// เพราะยังไม่ล็อกอิน เซิร์ฟเวอร์ไม่รู้ว่าใครกำลังพิมพ์ จึงเดา preferredLang ของบัญชีไม่ได้
// (ดู src/app/api/login/route.ts — error ทุกอันมาพร้อม "code" ที่เป็นกลางทางภาษาให้หน้านี้แปลเอง)
const LANG_KEY = "bqmp_lang";

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-[100dvh]" />}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [lang, setLang] = React.useState<Lang>(DEFAULT_LANG);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "th") setLang(saved);
  }, []);
  function toggleLang() {
    const next: Lang = lang === "th" ? "en" : "th";
    setLang(next);
    window.localStorage.setItem(LANG_KEY, next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: pin }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; code?: string; left?: number; minutes?: number };
      if (!res.ok || data.error) {
        // ใช้ code (เป็นกลางทางภาษา) แปลตามภาษาที่เลือกไว้ในเครื่อง — ไม่ใช้ data.error ดิบ (เป็นไทยเสมอ)
        setErr(data.code ? t(lang, `login.${data.code}`, { left: data.left ?? 0, minutes: data.minutes ?? 0 }) : t(lang, "login.errGeneric"));
        return;
      }
      // ล็อกอินเสร็จไปหน้าหลักเสมอ ไม่มีข้อยกเว้น (แพรยืนยัน 2026-07-27)
      // เดิมถ้าถูกเด้งมาจากหน้าอื่นจะพากลับไปหน้านั้น แต่พนักงานควรเห็น "วันนี้ต้องทำอะไร"
      // ก่อนเริ่มงานทุกครั้ง — เจอหน้ากลางทางแล้วงงว่ามาอยู่ตรงนี้ได้ยังไง
      router.replace("/");
      router.refresh();
    } catch {
      // fetch เองล้มเหลว (เน็ตหลุด/parse พัง) — ไม่โชว์ raw exception ให้พนักงานเห็น
      setErr(t(lang, "login.errNetwork"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-5">
      {/* ปุ่มสลับภาษา — เฉพาะหน้านี้เก็บไว้ที่เครื่อง (localStorage) เพราะยังไม่ล็อกอิน ไม่มี session
          ให้ผูกกับบัญชีได้ (แพรสั่ง 2026-08-17 เตรียมรองรับพนักงานต่างชาติที่ NCD) */}
      <button
        type="button" onClick={toggleLang}
        className="absolute right-4 top-4 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[12px] font-semibold text-brand-ink/70"
      >
        {lang === "th" ? "EN" : "ไทย"}
      </button>
      <form onSubmit={submit} className="glass w-full max-w-sm p-6 sm:p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <img src="/logo-yc.png" alt="Yogurt Culture" className="h-12 w-auto" />
          <div>
            <div className="text-lg font-semibold">{t(lang, "login.appTitle")}</div>
            <div className="text-[13px] text-brand-ink/55">{t(lang, "login.heading")}</div>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-brand-ink/55">{t(lang, "login.pinLabel")}</span>
          {/* type="text" + text-security แทน type="password" (แพรแจ้ง 2026-08-08 — ทุกคนเข้าไม่ได้พร้อมกัน)
              Safari ไม่สนใจ autoComplete="off" กับ input type="password" เลย ยังเสนอ/auto-fill รหัสเก่าจาก
              Keychain ให้อยู่ดี (คนละสาเหตุกับ 6 ส.ค. ที่เป็นเรื่อง "new-password" ชวนเซฟ) — สลับ type ไปเป็น
              text แล้วบังตัวเลขด้วย CSS text-security แทน ตัดไม่ให้ Safari มองว่าเป็นช่องรหัสผ่านเลยทั้งช่อง
              data-lpignore/data-1p-ignore กัน 1Password/LastPass เสนอ autofill ซ้ำอีกที */}
          <input
            type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" autoCapitalize="off"
            spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true"
            autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••" className="field text-center text-xl tracking-[.3em]"
            style={{ WebkitTextSecurity: "disc", MozTextSecurity: "disc", textSecurity: "disc" } as React.CSSProperties}
          />
        </label>

        {err && <p className="mt-3 rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{err}</p>}

        <button type="submit" disabled={loading || !pin}
          className="mt-5 w-full rounded-xl bg-brand-red px-4 py-3 font-semibold text-white shadow-glass transition active:scale-[.98] disabled:opacity-50">
          {loading ? t(lang, "login.submitting") : t(lang, "login.submit")}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-brand-ink/40">
          {t(lang, "login.footerLine1")}
          <br />{t(lang, "login.footerLine2")}
        </p>
      </form>
    </div>
  );
}
