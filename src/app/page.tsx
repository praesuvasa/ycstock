"use client";
import React from "react";
import Link from "next/link";
import { GlassCard, Badge, Stat, PageTitle } from "@/components/ui";
import { baht, todayISO } from "@/lib/fmt";
import { BRANCHES, type Branch } from "@/lib/types";

type Dashboard = {
  salesToday: { branch: Branch; total: number }[];
  varianceAlerts: { branch: Branch; count: number }[];
};

interface RequisitionPreview {
  id: string; branch: Branch; itemName: string; qty: number; unit?: string;
  note: string; requestedBy: string; createdAt: string; seenAt?: string;
}

const LINKS = [
  { href: "/stock", label: "กรอกสต็อก", icon: "📝" },
  { href: "/restock", label: "ต้องเติม", icon: "📦" },
  { href: "/sales", label: "ยอดขาย", icon: "💰" },
  { href: "/cups", label: "ถ้วย", icon: "🥤" },
];

export default function DashboardPage() {
  const [date, setDate] = React.useState(todayISO());
  const [data, setData] = React.useState<Dashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/dashboard?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) setErr(d.error);
        else setData(d);
      })
      .catch((e) => alive && setErr(e?.message ?? "โหลดไม่สำเร็จ"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date]);

  const [reqRows, setReqRows] = React.useState<RequisitionPreview[]>([]);
  const [reqLoading, setReqLoading] = React.useState(true);
  React.useEffect(() => {
    fetch("/api/requisitions")
      .then((r) => r.json())
      .then((d: { rows?: RequisitionPreview[] }) => setReqRows(d.rows ?? []))
      .catch(() => {})
      .finally(() => setReqLoading(false));
  }, []);
  const unseenReq = React.useMemo(() => reqRows.filter((r) => !r.seenAt), [reqRows]);

  const totalSales = data?.salesToday.reduce((s, x) => s + x.total, 0) ?? 0;
  const salesOf = (b: Branch) => data?.salesToday.find((x) => x.branch === b)?.total ?? 0;
  const varOf = (b: Branch) => data?.varianceAlerts.find((x) => x.branch === b)?.count ?? 0;

  return (
    <div>
      <PageTitle
        title="ภาพรวมร้าน"
        right={
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayISO())}
            className="field w-auto text-sm"
          />
        }
      />

      {err && (
        <GlassCard className="mb-3">
          <div className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {err}</div>
        </GlassCard>
      )}

      {/* 1. ยอดขายวันนี้ — ยอดรวมเด่นกว่ายอดรายสาขา (สีแบรนด์ + ตัวใหญ่กว่า) */}
      <div className="mb-3">
        <Stat label="ยอดขายวันนี้ (รวมทุกสาขา)" value={loading ? "…" : baht(totalSales)} tone="brand" size="lg" />
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        {BRANCHES.map((b) => (
          <Stat key={b} label={`ยอดขาย ${b}`} value={loading ? "…" : baht(salesOf(b))} />
        ))}
      </div>

      {/* 2. ยอดไม่ตรง (variance) */}
      <GlassCard className="mb-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">⚠️ ยอดไม่ตรง (variance)</h2>
        </div>
        {loading ? (
          <div className="py-4 text-center text-sm text-brand-ink/40">กำลังโหลด…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {BRANCHES.map((b) => {
              const c = varOf(b);
              return (
                <div
                  key={b}
                  className="glass-soft flex items-center justify-between px-3 py-2.5"
                >
                  <span className="text-sm font-medium">{b}</span>
                  <Badge tone={c === 0 ? "ok" : "warn"}>
                    {c === 0 ? "ตรงหมด" : `${c} รายการไม่ตรง`}
                  </Badge>
                </div>
              );
            })}
            <p className="px-0.5 pt-0.5 text-xs text-brand-ink/45">
              นับจากรายการที่ยอดคงเหลือไม่ตรงกับที่ระบบคำนวณในวันนี้
            </p>
          </div>
        )}
      </GlassCard>

      {/* 3. คำขอเบิกใหม่ */}
      <GlassCard className="mb-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">🙋 คำขอเบิกใหม่</h2>
          <Link href="/requisitions" className="text-xs font-medium text-sky-700 underline underline-offset-2">
            ดูทั้งหมด →
          </Link>
        </div>
        {reqLoading ? (
          <div className="py-4 text-center text-sm text-brand-ink/40">กำลังโหลด…</div>
        ) : unseenReq.length === 0 ? (
          <div className="py-4 text-center text-sm text-ok">✓ ไม่มีคำขอค้าง</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {unseenReq.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                href="/requisitions"
                className="glass-soft flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="truncate pr-2">
                  {r.itemName}{r.unit ? ` (${r.unit})` : ""} × {r.qty}
                  <span className="ml-1.5 text-xs text-brand-ink/40">— {r.branch}</span>
                </span>
                <Badge tone="orange">ใหม่</Badge>
              </Link>
            ))}
            {unseenReq.length > 5 && (
              <p className="px-0.5 pt-0.5 text-xs text-brand-ink/50">และอีก {unseenReq.length - 5} รายการ</p>
            )}
          </div>
        )}
      </GlassCard>

      {/* 4. Quick links */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="glass flex flex-col items-center gap-1 px-3 py-4 text-center transition active:scale-[.98]"
          >
            <span className="text-2xl leading-none">{l.icon}</span>
            <span className="text-sm font-medium">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
