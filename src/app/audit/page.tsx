"use client";
// Audit Log — ดูประวัติการกระทำ + กรอง action/สาขา
// admin เห็นทุกสาขา · senior staff เห็นได้ด้วย (แพรสั่ง 2026-08-06) แต่ล็อกแค่สาขาตัวเอง — ซ่อนตัวกรองสาขา/action ระดับบัญชีให้
import React from "react";
import type { AuditEntry } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { GlassCard, Badge, Segmented, PageTitle } from "@/components/ui";
import { useMe } from "@/components/nav";

const ACTION_OPTS_ADMIN = [
  { value: "", label: "ทั้งหมด" },
  { value: "save_stock", label: "สต็อก" },
  { value: "save_sales", label: "ยอดขาย" },
  { value: "create_user", label: "สร้างผู้ใช้" },
  { value: "update_user", label: "แก้ผู้ใช้" },
  { value: "login", label: "ล็อกอิน" },
];
// senior ไม่เห็น action ระดับบัญชี/ระบบ (server กรองให้อยู่แล้ว แต่ตัดตัวเลือกที่กดแล้วว่างเปล่าออกไปเลย)
const ACTION_OPTS_SENIOR = [
  { value: "", label: "ทั้งหมด" },
  { value: "save_stock", label: "สต็อก" },
  { value: "save_sales", label: "ยอดขาย" },
];
const BRANCH_OPTS = [
  { value: "", label: "ทุกสาขา" },
  ...BRANCHES.map((b) => ({ value: b, label: b })),
];

function actionTone(action: string): "ok" | "warn" | "blue" | "orange" | "neutral" {
  if (action === "login") return "blue";
  if (action.startsWith("save_")) return "ok";
  if (action === "create_user") return "orange";
  if (action === "update_user") return "warn";
  return "neutral";
}

function fmtTs(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString("th-TH", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function AuditPage() {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const isSenior = !isAdmin && !!me?.isSenior;
  const ACTION_OPTS = isAdmin ? ACTION_OPTS_ADMIN : ACTION_OPTS_SENIOR;

  const [rows, setRows] = React.useState<AuditEntry[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [action, setAction] = React.useState("");
  const [branch, setBranch] = React.useState("");

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (action) qs.set("action", action);
      if (isAdmin && branch) qs.set("branch", branch);
      const res = await fetch("/api/audit" + (qs.toString() ? "?" + qs.toString() : ""));
      if (res.status === 403) { setForbidden(true); setRows([]); return; }
      const data = (await res.json()) as { rows?: AuditEntry[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "โหลดไม่สำเร็จ");
      setForbidden(false);
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, [action, branch, isAdmin]);
  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle
        title={isAdmin ? "Audit Log" : "ประวัติการทำงาน"}
        right={isAdmin ? <Badge tone="blue">Admin</Badge> : <Badge tone="blue">สาขา {me?.branchScope}</Badge>}
      />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">เฉพาะ Admin และ senior staff เท่านั้น</p></GlassCard>
      ) : (
        <>
          {isSenior && (
            <p className="mb-3 text-[12px] text-brand-ink/50">เห็นเฉพาะรายการของสาขา {me?.branchScope}</p>
          )}
          <GlassCard className="mb-3">
            <div className="grid gap-2">
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">ประเภท</span>
                <div className="flex flex-wrap gap-1.5">
                  {ACTION_OPTS.map((o) => (
                    <button key={o.value} onClick={() => setAction(o.value)}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        action === o.value ? "bg-brand-ink text-white" : "bg-white/60 text-brand-ink border border-black/5"
                      }`}>{o.label}</button>
                  ))}
                </div>
              </div>
              {isAdmin && (
                <div>
                  <span className="mb-1 block text-[11px] text-brand-ink/50">สาขา</span>
                  <Segmented options={BRANCH_OPTS} value={branch} onChange={setBranch} />
                </div>
              )}
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {!rows ? (
            <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
          ) : rows.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">ไม่มีรายการ</p></GlassCard>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => (
                <div key={r.id} className="glass-soft px-3.5 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={actionTone(r.action)}>{r.action}</Badge>
                      {r.branch && <Badge>{r.branch}</Badge>}
                    </div>
                    <span className="text-[11px] text-brand-ink/50">{fmtTs(r.ts)}</span>
                  </div>
                  <div className="text-sm text-brand-ink/80">
                    <span className="font-medium">{r.userName}</span>
                    {r.detail && <span className="text-brand-ink/60"> · {r.detail}</span>}
                  </div>
                  {r.date && <div className="mt-0.5 text-[11px] text-brand-ink/40">วันที่ข้อมูล: {r.date}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
