"use client";
// v1.9 · รายการรอตรวจสอบ — รับไม่ตรงยอดสั่ง / เพิ่มนอกใบ / พนักงานแก้ทับค่า auto-fill ในหน้าสต็อก
// admin เห็นทุกเหตุผล/ทุกสาขา แก้ไว้ได้ · senior เห็นได้ด้วย (แพรสั่ง 2026-08-06) แต่ล็อกสาขาตัวเอง
// เห็นแค่ "แก้ยอดซ้ำ/ย้อนหลัง" และดูอย่างเดียว กดตรวจแล้วไม่ได้ (server กรอง/บล็อกให้อยู่แล้ว ฝั่งนี้แค่ซ่อนปุ่มให้ดูสะอาด)
import React from "react";
import type { AdminFlag, AdminFlagReason } from "@/lib/types";
import { GlassCard, PageTitle, Badge } from "@/components/ui";
import { thaiDate } from "@/lib/fmt";
import { useMe } from "@/components/nav";

const REASON_LABEL: Record<AdminFlagReason, string> = {
  receipt_mismatch: "รับไม่ตรงยอดสั่ง",
  receipt_not_received: "ไม่ได้รับสินค้า",
  receipt_extra: "เพิ่มนอกใบ",
  stock_override: "แก้ทับยอด auto-fill",
  receipt_edited: "แก้ไขยอดรับเข้า",
  stock_impossible: "คงเหลือเกินของที่มี",
  stock_backdated_edit: "แก้ยอดย้อนหลัง",
  stock_same_day_edit: "แก้ยอดซ้ำ (วันนี้)",
  receipt_vs_manual: "ยืนยันรับไม่ตรงยอดที่กรอกเอง",
  cup_pack_mismatch: "แพคถ้วยไม่ครบ/เกิน",
  receipt_after_count: "ยืนยันรับของหลังนับสต็อก",
  schedule_changed: "ตารางกะเปลี่ยน",
};
const REASON_TONE: Record<AdminFlagReason, "warn" | "orange"> = {
  receipt_mismatch: "warn",
  receipt_not_received: "warn",
  receipt_extra: "orange",
  stock_override: "warn",
  receipt_edited: "orange",
  stock_impossible: "warn",
  // แก้ย้อนหลังเสี่ยงกว่าแก้ซ้ำวันนี้ (แพรชี้ 2026-08-06) — อาจเป็นการปรับยอดปิดงานเก่า
  // ให้ "พอดี" กับที่นับวันนี้ แทนที่จะเป็นแค่แก้เลขนับผิด ให้เด่นกว่าด้วยสีแดงแทนส้ม
  stock_backdated_edit: "warn",
  stock_same_day_edit: "orange",
  receipt_vs_manual: "warn",
  cup_pack_mismatch: "orange",
  receipt_after_count: "warn",
  schedule_changed: "orange",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function AdminFlagsPage() {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const isSenior = !isAdmin && !!me?.isSenior;

  const [flags, setFlags] = React.useState<AdminFlag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resolvingId, setResolvingId] = React.useState<number | null>(null);
  const [resolvingAll, setResolvingAll] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch("/api/admin-flags")
      .then((r) => r.json())
      .then((d: { flags?: AdminFlag[] }) => setFlags(d.flags ?? []))
      .finally(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function resolve(id: number) {
    setResolvingId(id);
    try {
      await fetch("/api/admin-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setFlags((rows) => rows.filter((f) => f.id !== id));
    } finally {
      setResolvingId(null);
    }
  }

  // ตรวจแล้วทั้งหมด (แพรขอ 2026-08-11) — ทีเดียวทุกรายการที่เห็นอยู่ในหน้านี้
  async function resolveAll() {
    const ids = flags.map((f) => f.id);
    if (ids.length === 0) return;
    if (!window.confirm(`ตรวจแล้วทั้งหมด ${ids.length} รายการ?`)) return;
    setResolvingAll(true);
    try {
      await fetch("/api/admin-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setFlags([]);
    } finally {
      setResolvingAll(false);
    }
  }

  return (
    <div>
      <PageTitle
        title={isSenior ? "ประวัติการแก้ไข" : "รายการรอตรวจสอบ"}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-ink/50">{flags.length} รายการ</span>
            {isAdmin && flags.length > 0 && (
              <button
                onClick={resolveAll}
                disabled={resolvingAll || resolvingId !== null}
                className="shrink-0 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-50"
              >
                {resolvingAll ? "กำลังตรวจ…" : "ตรวจแล้วทั้งหมด"}
              </button>
            )}
          </div>
        }
      />
      {isSenior && (
        <p className="mb-3 text-[12px] text-brand-ink/50">เห็นเฉพาะสาขา {me?.branchScope} · ตรวจสอบให้แอดมินดูอย่างเดียว</p>
      )}
      <GlassCard>
        {loading ? (
          <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>
        ) : flags.length === 0 ? (
          <p className="py-8 text-center text-sm text-brand-ink/50">ไม่มีรายการต้องตรวจ ✓</p>
        ) : (
          <div className="grid gap-1.5">
            {flags.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 rounded-lg bg-black/[.02] px-2.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium">{f.itemName}</span>
                    <Badge tone={REASON_TONE[f.reason]}>{REASON_LABEL[f.reason]}</Badge>
                    <Badge tone="blue">{f.branch}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-brand-ink/50">
                    {f.editedBy && <>แก้โดย <span className="font-medium text-brand-ink/70">{f.editedBy}</span> · </>}
                    {f.detail} · {thaiDate(f.date)} · {fmtWhen(f.createdAt)}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => resolve(f.id)}
                    disabled={resolvingId === f.id}
                    className="shrink-0 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-ink disabled:opacity-50"
                  >
                    ตรวจแล้ว
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
