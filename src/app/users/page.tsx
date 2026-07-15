"use client";
// จัดการผู้ใช้ (admin) — สร้าง / toggle active / รีเซ็ตรหัส / แก้ role+สาขา
import React from "react";
import type { User, Role, BranchScope } from "@/lib/types";
import { GlassCard, Badge, Button, Segmented, PageTitle } from "@/components/ui";

const ROLE_OPTS: { value: Role; label: string }[] = [
  { value: "user", label: "พนักงาน" },
  { value: "admin", label: "ผู้ดูแล" },
];
const SCOPE_OPTS: { value: BranchScope; label: string }[] = [
  { value: "all", label: "ทุกสาขา" },
  { value: "SND", label: "SND" },
  { value: "NVP", label: "NVP" },
];

export default function UsersPage() {
  const [users, setUsers] = React.useState<User[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  // ฟอร์มเพิ่ม
  const [name, setName] = React.useState("");
  const [passcode, setPasscode] = React.useState("");
  const [role, setRole] = React.useState<Role>("user");
  const [scope, setScope] = React.useState<BranchScope>("all");

  const load = React.useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/users");
      if (res.status === 403) { setForbidden(true); setUsers([]); return; }
      const data = (await res.json()) as { users?: User[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "โหลดไม่สำเร็จ");
      setForbidden(false);
      setUsers(data.users ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!name.trim() || !passcode.trim()) { setErr("กรอกชื่อ + รหัส (PIN)"); return; }
    setBusy("__new");
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), passcode: passcode.trim(), role, branchScope: scope }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "สร้างไม่สำเร็จ");
      setName(""); setPasscode(""); setRole("user"); setScope("all");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  function resetPin(u: User) {
    const pin = window.prompt("รหัสใหม่ (PIN) สำหรับ " + u.name);
    if (pin && pin.trim()) patch(u.id, { passcode: pin.trim() });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="จัดการผู้ใช้" right={<Badge tone="blue">Admin</Badge>} />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">เฉพาะ Admin เท่านั้น</p></GlassCard>
      ) : (
        <>
          {/* ฟอร์มเพิ่มผู้ใช้ */}
          <GlassCard className="mb-3">
            <div className="mb-2 text-sm font-semibold">เพิ่มผู้ใช้</div>
            <div className="grid gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">ชื่อ</span>
                <input className="field text-left" placeholder="ชื่อพนักงาน"
                  value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">รหัส (PIN)</span>
                <input className="field text-left" inputMode="numeric" placeholder="เช่น 1234"
                  value={passcode} onChange={(e) => setPasscode(e.target.value)} />
              </label>
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">สิทธิ์</span>
                <Segmented options={ROLE_OPTS} value={role} onChange={setRole} />
              </div>
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">สาขา</span>
                <Segmented options={SCOPE_OPTS} value={scope} onChange={setScope} />
              </div>
              <Button onClick={create} disabled={busy === "__new"}>
                {busy === "__new" ? "กำลังสร้าง…" : "สร้างผู้ใช้"}
              </Button>
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {/* รายชื่อผู้ใช้ */}
          {!users ? (
            <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
          ) : users.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">ยังไม่มีผู้ใช้</p></GlassCard>
          ) : (
            <div className="grid gap-2.5">
              {users.map((u) => (
                <GlassCard key={u.id}>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold">{u.name}</span>
                      <Badge tone={u.role === "admin" ? "orange" : "neutral"}>
                        {u.role === "admin" ? "ผู้ดูแล" : "พนักงาน"}
                      </Badge>
                      <Badge tone={u.active ? "ok" : "warn"}>{u.active ? "ใช้งาน" : "ปิด"}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <span className="mb-1 block text-[11px] text-brand-ink/50">สิทธิ์</span>
                      <Segmented options={ROLE_OPTS} value={u.role}
                        onChange={(v) => v !== u.role && patch(u.id, { role: v })} />
                    </div>
                    <div>
                      <span className="mb-1 block text-[11px] text-brand-ink/50">สาขา</span>
                      <Segmented options={SCOPE_OPTS} value={u.branchScope}
                        onChange={(v) => v !== u.branchScope && patch(u.id, { branchScope: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="ghost" onClick={() => patch(u.id, { active: !u.active })} disabled={busy === u.id}>
                        {u.active ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
                      </Button>
                      <Button variant="ghost" onClick={() => resetPin(u)} disabled={busy === u.id}>
                        รีเซ็ตรหัส
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
