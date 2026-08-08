"use client";
import React from "react";
import { useRouter } from "next/navigation";

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
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) { setErr(data.error ?? "เข้าสู่ระบบไม่สำเร็จ"); return; }
      // ล็อกอินเสร็จไปหน้าหลักเสมอ ไม่มีข้อยกเว้น (แพรยืนยัน 2026-07-27)
      // เดิมถ้าถูกเด้งมาจากหน้าอื่นจะพากลับไปหน้านั้น แต่พนักงานควรเห็น "วันนี้ต้องทำอะไร"
      // ก่อนเริ่มงานทุกครั้ง — เจอหน้ากลางทางแล้วงงว่ามาอยู่ตรงนี้ได้ยังไง
      router.replace("/");
      router.refresh();
    } catch {
      // fetch เองล้มเหลว (เน็ตหลุด/parse พัง) — ไม่โชว์ raw exception ให้พนักงานเห็น
      setErr("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-5">
      <form onSubmit={submit} className="glass w-full max-w-sm p-6 sm:p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <img src="/logo-yc.png" alt="Yogurt Culture" className="h-12 w-auto" />
          <div>
            <div className="text-lg font-semibold">ระบบจัดการสต็อก</div>
            <div className="text-[13px] text-brand-ink/55">เข้าสู่ระบบ</div>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-brand-ink/55">รหัสเข้าระบบ</span>
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
          {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-brand-ink/40">
          ใช้รหัสส่วนตัวของคุณ · เข้าครั้งแรกใช้รหัสตั้งค่าที่ได้รับ แล้วระบบจะให้ตั้งรหัสเอง
          <br />ลืมรหัส — แจ้งผู้ดูแลออกรหัสตั้งค่าใหม่ให้
        </p>
      </form>
    </div>
  );
}
