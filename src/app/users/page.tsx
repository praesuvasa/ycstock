"use client";
// จัดการผู้ใช้ (admin) — สร้าง / toggle active / รีเซ็ตรหัส / แก้ role+สาขา
import React from "react";
import type { User, Role, BranchScope } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { GlassCard, Badge, Button, Segmented, PageTitle } from "@/components/ui";

const ROLE_OPTS: { value: Role; label: string }[] = [
  { value: "user", label: "พนักงาน" },
  { value: "restock", label: "จนท. Restock" },
  { value: "admin", label: "ผู้ดูแล" },
];
const ROLE_LABEL_TH: Record<Role, string> = { user: "พนักงาน", restock: "จนท. Restock", admin: "ผู้ดูแล" };
const SCOPE_OPTS: { value: BranchScope; label: string }[] = [
  { value: "all" as BranchScope, label: "ทุกสาขา" },
  ...BRANCHES.map((b) => ({ value: b as BranchScope, label: b })),
];

export default function UsersPage() {
  const [users, setUsers] = React.useState<User[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [forbidden, setForbidden] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  // ฟอร์มเพิ่ม
  const [name, setName] = React.useState("");
  // รหัสตั้งค่าที่เพิ่งออกให้ — โชว์ครั้งเดียวตรงนี้ ดูย้อนหลังไม่ได้ (DB เก็บแค่ hash)
  const [issued, setIssued] = React.useState<{ name: string; code: string } | null>(null);
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
    if (!name.trim()) { setErr("กรอกชื่อ"); return; }
    setBusy("__new");
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role, branchScope: scope }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; setupCode?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "สร้างไม่สำเร็จ");
      if (data.setupCode) setIssued({ name: name.trim(), code: data.setupCode });
      setName(""); setRole("user"); setScope("all");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  // ลบถาวร — ให้พิมพ์ชื่อยืนยัน เพราะกู้คืนไม่ได้ และปุ่มอยู่ติดกับปุ่มอื่นที่กดผิดง่าย
  async function removeUser(u: User) {
    const typed = window.prompt(
      `ลบบัญชี "${u.name}" ถาวร — กู้คืนไม่ได้\n\n` +
      `ถ้าแค่ให้เขาเข้าระบบไม่ได้ ใช้ "ปิดการใช้งาน" ดีกว่า (ประวัติยังอยู่ครบ)\n\n` +
      `ยืนยันโดยพิมพ์ชื่อให้ตรง:`
    );
    if (typed === null) return;
    if (typed.trim() !== u.name) { setErr("ชื่อที่พิมพ์ไม่ตรง — ยกเลิกการลบ"); return; }
    setBusy(u.id);
    setErr(null);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "ลบไม่สำเร็จ");
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  // รีเซ็ตใบหน้า — ใช้เมื่อเจ้าตัวสแกนไม่ผ่านแล้วจริง ๆ (ตัดผม ใส่แว่น)
  // เป็นทางเดียวที่ลงทะเบียนใหม่ได้ เพราะพนักงานแก้เองไม่ได้
  async function resetFace(u: User) {
    const ok = window.confirm(
      `รีเซ็ตใบหน้าของ ${u.name}?\n\n` +
      `ใบหน้าเดิมจะถูกลบ และเจ้าตัวต้องลงทะเบียนใหม่เองก่อนถึงจะลงเวลาได้อีก`
    );
    if (!ok) return;
    setBusy(u.id);
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, resetFace: true }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? "รีเซ็ตไม่สำเร็จ");
      window.alert(`รีเซ็ตใบหน้าของ ${u.name} แล้ว — ให้เจ้าตัวเข้าเมนู "ลงเวลาเข้า-ออกงาน" แล้วลงทะเบียนใหม่`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  // ออกรหัสตั้งค่าใหม่ = ตัด PIN เดิมทิ้งทันที เจ้าตัวต้องเข้ามาตั้งใหม่ → ต้องถามก่อน
  async function issueSetupCode(u: User) {
    const ok = window.confirm(
      `ออกรหัสตั้งค่าใหม่ให้ ${u.name}?\n\nรหัสเดิมของเขาจะใช้เข้าระบบไม่ได้ทันที ` +
      `และต้องเอารหัสใหม่ไปตั้งรหัสเองก่อนถึงจะใช้งานต่อได้`
    );
    if (!ok) return;
    setBusy(u.id);
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, issueSetupCode: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; setupCode?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "ออกรหัสไม่สำเร็จ");
      if (data.setupCode) setIssued({ name: u.name, code: data.setupCode });
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="จัดการผู้ใช้" right={<Badge tone="blue">Admin</Badge>} />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">เฉพาะ Admin เท่านั้น</p></GlassCard>
      ) : (
        <>
          {issued && (
            <GlassCard className="mb-3">
              <p className="text-[12px] text-brand-ink/60">รหัสตั้งค่าของ <b>{issued.name}</b></p>
              <p className="my-1 text-[32px] font-semibold tracking-[.25em] tabular-nums">{issued.code}</p>
              <p className="text-[11.5px] leading-relaxed text-warn">
                ส่งให้เจ้าตัวเดี๋ยวนี้ — ปิดหน้านี้แล้วดูย้อนหลังไม่ได้ (ระบบเก็บเป็นค่าเข้ารหัส)
                <br />ใช้เข้าระบบได้ครั้งเดียว หมดอายุใน 48 ชั่วโมง
              </p>
              <button
                type="button" onClick={() => setIssued(null)}
                className="mt-2 text-[12px] font-medium text-brand-red underline underline-offset-2"
              >
                ส่งให้เรียบร้อยแล้ว — ปิด
              </button>
            </GlassCard>
          )}
          {/* ฟอร์มเพิ่มผู้ใช้ */}
          <GlassCard className="mb-3">
            <div className="mb-2 text-sm font-semibold">เพิ่มผู้ใช้</div>
            <div className="grid gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">ชื่อ</span>
                <input className="field text-left" placeholder="ชื่อพนักงาน"
                  value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <p className="rounded-lg bg-black/[.03] px-2.5 py-2 text-[11.5px] leading-relaxed text-brand-ink/60">
                ไม่ต้องตั้งรหัสให้ — ระบบจะออก <b>รหัสตั้งค่า</b> 6 หลักให้ส่งต่อ
                แล้วเจ้าตัวเข้าครั้งแรกเพื่อตั้งรหัสของตัวเอง (คุณจะไม่รู้รหัสจริงของเขา)
              </p>
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
                      <Badge tone={u.role === "admin" ? "orange" : u.role === "restock" ? "blue" : "neutral"}>
                        {ROLE_LABEL_TH[u.role]}
                      </Badge>
                      <Badge tone={u.active ? "ok" : "warn"}>{u.active ? "ใช้งาน" : "ปิด"}</Badge>
                      {u.mustSetPasscode && <Badge tone="orange">ยังไม่ได้ตั้งรหัส</Badge>}
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
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-black/[.03] px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-[12.5px]">สิทธิ์ซื้อของในร้าน</div>
                        <div className="text-[10.5px] text-brand-ink/45">
                          {u.allowanceEnabled ? `฿${u.allowanceMonthly ?? 400}/เดือน · เห็นเมนูนี้` : "ยังไม่ได้รับสิทธิ์ · ไม่เห็นเมนู"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => patch(u.id, { allowanceEnabled: !u.allowanceEnabled })}
                        disabled={busy === u.id}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
                          u.allowanceEnabled ? "bg-brand-red text-white" : "border border-black/10 bg-white/70 text-brand-ink"
                        }`}
                      >
                        {u.allowanceEnabled ? "เปิดอยู่" : "เปิดสิทธิ์"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="ghost" onClick={() => patch(u.id, { active: !u.active })} disabled={busy === u.id}>
                        {u.active ? "ปิดการใช้งาน" : "เปิดใช้งาน"}
                      </Button>
                      <Button variant="ghost" onClick={() => issueSetupCode(u)} disabled={busy === u.id}>
                        ออกรหัสตั้งค่าใหม่
                      </Button>
                    </div>
                    {/* พนักงานลงทะเบียนใบหน้าเองได้ครั้งเดียว แก้เองไม่ได้
                        ปุ่มนี้คือทางเดียวที่จะลงใหม่ได้ ใช้เมื่อสแกนไม่ผ่านจริง ๆ */}
                    <Button variant="ghost" onClick={() => resetFace(u)} disabled={busy === u.id}>
                      รีเซ็ตใบหน้า (ให้ลงทะเบียนใหม่)
                    </Button>
                    {/* บัญชีแอดมินไม่มีปุ่มลบเลย — ซ่อนดีกว่าโชว์แล้วกดไม่ได้ (กันคำถามว่าทำไมกดไม่ได้) */}
                    {u.role !== "admin" && (
                      <button
                        type="button"
                        onClick={() => removeUser(u)}
                        disabled={busy === u.id}
                        className="mt-0.5 self-start text-[11.5px] font-medium text-warn underline underline-offset-2 disabled:opacity-40"
                      >
                        ลบบัญชีถาวร
                      </button>
                    )}
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
