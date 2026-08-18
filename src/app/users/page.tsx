"use client";
// จัดการผู้ใช้ (admin) — สร้าง / toggle active / รีเซ็ตรหัส / แก้ role+สาขา
import React from "react";
import type { User, Role, BranchScope } from "@/lib/types";
import { BRANCHES } from "@/lib/types";
import { GlassCard, Badge, Button, Segmented, PageTitle } from "@/components/ui";
import { useLang } from "@/components/nav";
import { t } from "@/lib/i18n";

// ป้ายสิทธิ์ (role) ต่อแถว — เก็บเป็น "ชื่อ key" ไม่ใช่ข้อความ เพราะ const นี้อยู่นอก component
// เข้าถึง lang ไม่ได้ ต้อง resolve เป็นข้อความจริงตอน render ในคอมโพเนนต์ (t(lang, ROLE_LABEL_KEY[u.role]))
const ROLE_LABEL_KEY: Record<Role, string> = { user: "users.roleUser", restock: "users.roleRestock", admin: "users.roleAdmin" };

export default function UsersPage() {
  const lang = useLang();
  const ROLE_OPTS: { value: Role; label: string }[] = [
    { value: "user", label: t(lang, "users.roleUser") },
    { value: "restock", label: t(lang, "users.roleRestock") },
    { value: "admin", label: t(lang, "users.roleAdmin") },
  ];
  const UNIT_OPTS = [
    { value: "store", label: t(lang, "users.unitStore") },
    { value: "production", label: t(lang, "users.unitProduction") },
  ];
  const SCOPE_OPTS: { value: BranchScope; label: string }[] = [
    { value: "all" as BranchScope, label: t(lang, "users.allBranches") },
    ...BRANCHES.map((b) => ({ value: b as BranchScope, label: b })),
  ];
  // ภาษา UI (v1.31) — เตรียมรองรับพนักงานต่างชาติที่ NCD (แพรสั่ง 2026-08-17)
  // default "th" ตอนสร้างบัญชีอยู่แล้ว (เว้นแต่สาขา NCD → default "en") ตรงนี้ให้แอดมินเปลี่ยนทีหลังได้
  const LANG_OPTS: { value: "th" | "en"; label: string }[] = [
    { value: "th", label: t(lang, "users.langTh") },
    { value: "en", label: t(lang, "users.langEn") },
  ];

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
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "users.errLoadFailed"));
      setForbidden(false);
      setUsers(data.users ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, [lang]);
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
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "users.errSaveFailed"));
      await load();
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!name.trim()) { setErr(t(lang, "users.errNameRequired")); return; }
    setBusy("__new");
    setErr(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role, branchScope: scope }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; setupCode?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "users.errCreateFailed"));
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
    const typed = window.prompt(t(lang, "users.deleteConfirmPrompt", { name: u.name }));
    if (typed === null) return;
    if (typed.trim() !== u.name) { setErr(t(lang, "users.errNameMismatch")); return; }
    setBusy(u.id);
    setErr(null);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "users.errDeleteFailed"));
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
    const ok = window.confirm(t(lang, "users.resetFaceConfirm", { name: u.name }));
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
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? t(lang, "users.errResetFaceFailed"));
      window.alert(t(lang, "users.resetFaceDoneAlert", { name: u.name }));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  // ออกรหัสตั้งค่าใหม่ = ตัด PIN เดิมทิ้งทันที เจ้าตัวต้องเข้ามาตั้งใหม่ → ต้องถามก่อน
  async function issueSetupCode(u: User) {
    const ok = window.confirm(t(lang, "users.issueSetupCodeConfirm", { name: u.name }));
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
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "users.errIssueCodeFailed"));
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
      <PageTitle title={t(lang, "users.pageTitle")} right={<Badge tone="blue">Admin</Badge>} />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">{t(lang, "users.adminOnly")}</p></GlassCard>
      ) : (
        <>
          {issued && (
            <GlassCard className="mb-3">
              <p className="text-[12px] text-brand-ink/60">{t(lang, "users.issuedCodeOf")} <b>{issued.name}</b></p>
              <p className="my-1 text-[32px] font-semibold tracking-[.25em] tabular-nums">{issued.code}</p>
              <p className="text-[11.5px] leading-relaxed text-warn">
                {t(lang, "users.issuedCodeWarningLine1")}
                <br />{t(lang, "users.issuedCodeWarningLine2")}
              </p>
              <button
                type="button" onClick={() => setIssued(null)}
                className="mt-2 text-[12px] font-medium text-brand-red underline underline-offset-2"
              >
                {t(lang, "users.issuedCodeDismiss")}
              </button>
            </GlassCard>
          )}
          {/* ฟอร์มเพิ่มผู้ใช้ */}
          <GlassCard className="mb-3">
            <div className="mb-2 text-sm font-semibold">{t(lang, "users.addUserTitle")}</div>
            <div className="grid gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">{t(lang, "users.nameLabel")}</span>
                <input className="field text-left" placeholder={t(lang, "users.namePlaceholder")}
                  value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <p className="rounded-lg bg-black/[.03] px-2.5 py-2 text-[11.5px] leading-relaxed text-brand-ink/60">
                {t(lang, "users.setupCodeInfoPre")} <b>{t(lang, "users.setupCodeInfoBold")}</b>{" "}
                {t(lang, "users.setupCodeInfoPost")}
              </p>
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.roleFieldLabel")}</span>
                <Segmented options={ROLE_OPTS} value={role} onChange={setRole} />
              </div>
              <div>
                <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.branchFieldLabel")}</span>
                <Segmented options={SCOPE_OPTS} value={scope} onChange={setScope} />
              </div>
              <Button onClick={create} disabled={busy === "__new"}>
                {busy === "__new" ? t(lang, "users.creatingBtn") : t(lang, "users.createUserBtn")}
              </Button>
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {/* รายชื่อผู้ใช้ */}
          {!users ? (
            <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "users.loadingText")}</p></GlassCard>
          ) : users.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "users.noUsersText")}</p></GlassCard>
          ) : (
            <div className="grid gap-2.5">
              {users.map((u) => (
                <GlassCard key={u.id}>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold">{u.name}</span>
                      {/* แก้ชื่อ (แพรขอ 2026-07-30) — สะกดผิด/เปลี่ยนชื่อเล่น ไม่ต้องลบบัญชีแล้วสร้างใหม่
                          ซึ่งจะทำให้ประวัติลงเวลาและตารางกะของคนนั้นขาดตอน */}
                      <button
                        type="button"
                        onClick={() => {
                          const next = window.prompt(t(lang, "users.editNamePrompt", { name: u.name }), u.name);
                          const trimmed = (next ?? "").trim();
                          if (!trimmed || trimmed === u.name) return;
                          patch(u.id, { name: trimmed });
                        }}
                        className="text-[11.5px] font-medium text-sky-700 underline underline-offset-2"
                      >
                        {t(lang, "users.editNameBtn")}
                      </button>
                      <Badge tone={u.role === "admin" ? "orange" : u.role === "restock" ? "blue" : "neutral"}>
                        {t(lang, ROLE_LABEL_KEY[u.role])}
                      </Badge>
                      <Badge tone={u.active ? "ok" : "warn"}>{u.active ? t(lang, "users.statusActive") : t(lang, "users.statusInactive")}</Badge>
                      {u.mustSetPasscode && <Badge tone="orange">{t(lang, "users.mustSetPasscodeBadge")}</Badge>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.roleFieldLabel")}</span>
                      <Segmented options={ROLE_OPTS} value={u.role}
                        onChange={(v) => v !== u.role && patch(u.id, { role: v })} />
                    </div>
                    {/* หน่วยงาน (v1.24) — ฝ่ายผลิตเห็นแค่เมนูลงเวลา ไม่เห็นงานหน้าร้าน
                        และลงเวลาได้โดยไม่ต้องผูกสาขา จึงซ่อนช่องสาขาไปเลยเมื่อเลือกฝ่ายผลิต
                        (โชว์ไว้แล้วกดได้ทั้งที่ไม่มีผล = ทำให้เข้าใจผิดว่าตั้งแล้วมีความหมาย) */}
                    <div>
                      <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.unitFieldLabel")}</span>
                      <Segmented
                        options={UNIT_OPTS}
                        value={(u.workUnit ?? "store") as string}
                        onChange={(v) => v !== (u.workUnit ?? "store") && patch(u.id, { workUnit: v })}
                      />
                    </div>
                    {u.role === "user" && (u.workUnit ?? "store") === "store" && (
                      <div>
                        <span className="mb-1 block text-[11px] text-brand-ink/50">
                          {t(lang, "users.seniorDescription")}
                        </span>
                        <Segmented
                          options={[{ value: "no", label: t(lang, "users.seniorOptNo") }, { value: "yes", label: t(lang, "users.seniorOptYes") }]}
                          value={u.isSenior ? "yes" : "no"}
                          onChange={(v) => patch(u.id, { isSenior: v === "yes" })}
                        />
                      </div>
                    )}

                    {(u.workUnit ?? "store") === "store" && (
                      <div>
                        <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.branchFieldLabel")}</span>
                        <Segmented options={SCOPE_OPTS} value={u.branchScope}
                          onChange={(v) => v !== u.branchScope && patch(u.id, { branchScope: v })} />
                      </div>
                    )}
                    <div>
                      <span className="mb-1 block text-[11px] text-brand-ink/50">{t(lang, "users.uiLangFieldLabel")}</span>
                      <Segmented options={LANG_OPTS} value={u.preferredLang ?? "th"}
                        onChange={(v) => v !== (u.preferredLang ?? "th") && patch(u.id, { preferredLang: v })} />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-black/[.03] px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-[12.5px]">{t(lang, "users.allowanceTitle")}</div>
                        <div className="text-[10.5px] text-brand-ink/45">
                          {u.allowanceEnabled
                            ? t(lang, "users.allowanceEnabledDetail", { amount: u.allowanceMonthly ?? 400 })
                            : t(lang, "users.allowanceDisabledDetail")}
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
                        {u.allowanceEnabled ? t(lang, "users.allowanceOnBtn") : t(lang, "users.allowanceOffBtn")}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button variant="ghost" onClick={() => patch(u.id, { active: !u.active })} disabled={busy === u.id}>
                        {u.active ? t(lang, "users.disableUserBtn") : t(lang, "users.enableUserBtn")}
                      </Button>
                      <Button variant="ghost" onClick={() => issueSetupCode(u)} disabled={busy === u.id}>
                        {t(lang, "users.issueNewCodeBtn")}
                      </Button>
                    </div>
                    {/* พนักงานลงทะเบียนใบหน้าเองได้ครั้งเดียว แก้เองไม่ได้
                        ปุ่มนี้คือทางเดียวที่จะลงใหม่ได้ ใช้เมื่อสแกนไม่ผ่านจริง ๆ */}
                    <Button variant="ghost" onClick={() => resetFace(u)} disabled={busy === u.id}>
                      {t(lang, "users.resetFaceBtn")}
                    </Button>
                    {/* บัญชีแอดมินไม่มีปุ่มลบเลย — ซ่อนดีกว่าโชว์แล้วกดไม่ได้ (กันคำถามว่าทำไมกดไม่ได้) */}
                    {u.role !== "admin" && (
                      <button
                        type="button"
                        onClick={() => removeUser(u)}
                        disabled={busy === u.id}
                        className="mt-0.5 self-start text-[11.5px] font-medium text-warn underline underline-offset-2 disabled:opacity-40"
                      >
                        {t(lang, "users.deleteUserBtn")}
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
