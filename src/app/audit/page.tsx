"use client";
// Audit Log — ดูประวัติการกระทำ + กรอง action/สาขา
// admin เห็นทุกสาขา · senior staff เห็นได้ด้วย (แพรสั่ง 2026-08-06) แต่ล็อกแค่สาขาตัวเอง — ซ่อนตัวกรองสาขา/action ระดับบัญชีให้
import React from "react";
import type { AuditEntry } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { GlassCard, Badge, Segmented, PageTitle } from "@/components/ui";
import { useMe, useLang } from "@/components/nav";
import { t } from "@/lib/i18n";

const ACTION_OPTS_ADMIN = [
  { value: "", labelKey: "audit.actionAll" },
  { value: "save_stock", labelKey: "audit.actionStock" },
  { value: "save_sales", labelKey: "audit.actionSales" },
  { value: "create_user", labelKey: "audit.actionCreateUser" },
  { value: "update_user", labelKey: "audit.actionUpdateUser" },
  { value: "login", labelKey: "audit.actionLogin" },
];
// senior ไม่เห็น action ระดับบัญชี/ระบบ (server กรองให้อยู่แล้ว แต่ตัดตัวเลือกที่กดแล้วว่างเปล่าออกไปเลย)
const ACTION_OPTS_SENIOR = [
  { value: "", labelKey: "audit.actionAll" },
  { value: "save_stock", labelKey: "audit.actionStock" },
  { value: "save_sales", labelKey: "audit.actionSales" },
];
const BRANCH_OPTS_BASE = BRANCHES.map((b) => ({ value: b, label: b }));

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
  const lang = useLang();
  const isAdmin = me?.role === "admin";
  const isSenior = !isAdmin && !!me?.isSenior;
  const ACTION_OPTS = isAdmin ? ACTION_OPTS_ADMIN : ACTION_OPTS_SENIOR;
  const BRANCH_OPTS = [
    { value: "", label: t(lang, "audit.allBranches") },
    ...BRANCH_OPTS_BASE,
  ];

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
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "audit.errLoadFailed"));
      setForbidden(false);
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, [action, branch, isAdmin, lang]);
  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle
        title={isAdmin ? t(lang, "nav.adminMenu.auditLog") : t(lang, "nav.logging.auditLog")}
        right={isAdmin ? <Badge tone="blue">Admin</Badge> : <Badge tone="blue">{t(lang, "audit.branchBadge", { branch: me?.branchScope ?? "" })}</Badge>}
      />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">{t(lang, "audit.errForbidden")}</p></GlassCard>
      ) : (
        <>
          {isSenior && (
            <p className="mb-3 text-[12px] text-brand-ink/50">{t(lang, "audit.seniorScopeNote", { branch: me?.branchScope ?? "" })}</p>
          )}
          <GlassCard className="mb-3">
            <div className="grid gap-2">
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "audit.typeLabel")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {ACTION_OPTS.map((o) => (
                    <button key={o.value} onClick={() => setAction(o.value)}
                      className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                        action === o.value ? "bg-brand-ink text-white" : "bg-white/60 text-brand-ink border border-black/5"
                      }`}>{t(lang, o.labelKey)}</button>
                  ))}
                </div>
              </div>
              {isAdmin && (
                <div>
                  <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "audit.branchLabel")}</span>
                  <Segmented options={BRANCH_OPTS} value={branch} onChange={setBranch} />
                </div>
              )}
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {!rows ? (
            <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "audit.loading")}</p></GlassCard>
          ) : rows.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "audit.emptyState")}</p></GlassCard>
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
                  {r.date && <div className="mt-0.5 text-[11px] text-brand-ink/40">{t(lang, "audit.dataDateLabel", { date: r.date })}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
