"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-[100dvh]" />}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
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
      const from = params.get("from");
      router.replace(from && from.startsWith("/") ? from : "/stock");
      router.refresh();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
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
          <span className="text-[12px] text-brand-ink/55">รหัสผ่าน (PIN)</span>
          <input
            type="password" inputMode="numeric" autoFocus value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••" className="field text-center text-xl tracking-[.3em]"
          />
        </label>

        {err && <p className="mt-3 rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">{err}</p>}

        <button type="submit" disabled={loading || !pin}
          className="mt-5 w-full rounded-xl bg-brand-red px-4 py-3 font-semibold text-white shadow-glass transition active:scale-[.98] disabled:opacity-50">
          {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
        <p className="mt-4 text-center text-[11px] text-brand-ink/40">ใช้รหัสส่วนตัวของคุณ · ลืมรหัสติดต่อผู้ดูแล</p>
      </form>
    </div>
  );
}
