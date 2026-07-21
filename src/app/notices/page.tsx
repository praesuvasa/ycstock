"use client";
// ประกาศพิเศษ (admin) — ตั้งข้อความแจ้งเตือนชั่วคราวต่อสาขา เช่น รอบส่งของเลื่อนเพราะวันหยุด
import React from "react";
import type { BranchNotice } from "@/lib/types";
import { BRANCHES, BRANCH_LABEL_TH } from "@/lib/types";
import { GlassCard, Badge, Button, Segmented, PageTitle } from "@/components/ui";

const BRANCH_OPTS = [
  { value: "ALL", label: "ทุกสาขา" },
  ...BRANCHES.map((b) => ({ value: b as string, label: `${b} · ${BRANCH_LABEL_TH[b]}` })),
];

export default function NoticesPage() {
  const [notices, setNotices] = React.useState<BranchNotice[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [branch, setBranch] = React.useState("ALL");
  const [message, setMessage] = React.useState("");

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/notices");
      if (res.status === 403) { setForbidden(true); setNotices([]); return; }
      const data = (await res.json()) as { rows?: BranchNotice[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "โหลดไม่สำเร็จ");
      setForbidden(false);
      setNotices(data.rows ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function create() {
    if (!message.trim()) { setErr("กรอกข้อความประกาศ"); return; }
    setBusy("__new");
    setErr(null);
    try {
      const res = await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: branch === "ALL" ? null : branch, message: message.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "สร้างไม่สำเร็จ");
      setMessage(""); setBranch("ALL");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("ปิดประกาศนี้?")) return;
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/notices/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "ลบไม่สำเร็จ");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="ประกาศพิเศษ" right={<Badge tone="blue">Admin</Badge>} />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">เฉพาะ Admin เท่านั้น</p></GlassCard>
      ) : (
        <>
          <GlassCard className="mb-3">
            <div className="mb-2 text-sm font-semibold">เพิ่มประกาศ</div>
            <p className="mb-3 text-[11px] leading-relaxed text-brand-ink/50">
              ใช้แจ้งเตือนกรณีของเข้าไม่ตรงรอบปกติ เช่น วันหยุดพนักงานส่งของ หรือวันหยุดเฉพาะสาขา —
              ข้อความจะโชว์ที่หน้า &quot;ขอเบิกสินค้า&quot; ของสาขาที่เลือก จนกว่าจะกดปิด
            </p>
            <div className="grid gap-2">
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">ประกาศไปที่สาขา</span>
                <Segmented options={BRANCH_OPTS} value={branch} onChange={setBranch} />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">ข้อความ</span>
                <input
                  className="field text-left" placeholder="เช่น สัปดาห์นี้ของเข้าช้า 1 วัน เนื่องจากพนักงานส่งของลา"
                  value={message} onChange={(e) => setMessage(e.target.value)}
                />
              </label>
              <Button onClick={create} disabled={busy === "__new"}>
                {busy === "__new" ? "กำลังบันทึก…" : "เพิ่มประกาศ"}
              </Button>
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {!notices ? (
            <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
          ) : notices.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">ยังไม่มีประกาศ</p></GlassCard>
          ) : (
            <div className="grid gap-2.5">
              {notices.map((n) => (
                <GlassCard key={n.id}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge tone={n.branch === null ? "orange" : "blue"}>
                      {n.branch === null ? "ทุกสาขา" : `สาขา ${n.branch}`}
                    </Badge>
                    <span className="text-[11px] text-brand-ink/40">
                      {new Date(n.createdAt).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {n.createdBy}
                    </span>
                  </div>
                  <p className="mb-2.5 text-sm">{n.message}</p>
                  <Button variant="ghost" onClick={() => remove(n.id)} disabled={busy === n.id}>
                    {busy === n.id ? "กำลังปิด…" : "ปิดประกาศ"}
                  </Button>
                </GlassCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
