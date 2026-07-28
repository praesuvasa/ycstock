"use client";
// v1.22 · ตั้งค่าระบบลงเวลา (แอดมินเท่านั้น)
//
// อยู่นอก /time-clock ตั้งใจ — middleware อนุญาต /time-clock ให้พนักงานทั้ง prefix
// ถ้าวางหน้านี้ไว้ใต้ /time-clock/... พนักงานจะเปิดหน้าตั้งค่าได้ด้วย
import React from "react";
import { GlassCard, PageTitle, Button, Badge } from "@/components/ui";
import { BRANCHES, BRANCH_LABEL_TH } from "@/lib/types";
import type { Branch } from "@/lib/types";

interface Geo { lat: number; lng: number; radiusM: number }
interface Resp {
  settings: { enabled: boolean; requireFace: boolean; requireLocation: boolean };
  branches: { branch: Branch; geo: Geo | null }[];
  expiryCheckEnabled: boolean;
  error?: string;
}

function Toggle({ on, label, hint, onChange }: {
  on: boolean; label: string; hint: string; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3 rounded-xl border border-black/[.07] bg-white/70 px-3.5 py-3 text-left"
    >
      <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-ok" : "bg-black/15"}`}>
        <span className={`h-4 w-4 rounded-full bg-white transition ${on ? "translate-x-4" : ""}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[11.5px] leading-relaxed text-brand-ink/50">{hint}</span>
      </span>
    </button>
  );
}

export default function TimeClockAdminPage() {
  const [data, setData] = React.useState<Resp | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [radius, setRadius] = React.useState<Record<string, string>>({});

  const load = React.useCallback(() => {
    fetch("/api/time-clock/settings").then((r) => r.json()).then((d: Resp) => {
      setData(d);
      setRadius(Object.fromEntries(d.branches?.map((b) => [b.branch, String(b.geo?.radiusM ?? 150)]) ?? []));
    }).catch(() => {});
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function saveSettings(next: Resp["settings"]) {
    setSaving(true);
    setMsg(null);
    try {
      await fetch("/api/time-clock/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: next }),
      });
      setData((d) => (d ? { ...d, settings: next } : d));
      setMsg("บันทึกแล้ว");
    } finally {
      setSaving(false);
    }
  }

  // ตั้งพิกัดจากตำแหน่งปัจจุบัน — ต้องยืนอยู่ที่ร้านตอนกด
  async function useHere(branch: Branch) {
    setMsg(null);
    if (!navigator.geolocation) { setMsg("เครื่องนี้ไม่รองรับการอ่านตำแหน่ง"); return; }
    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const res = await fetch("/api/time-clock/settings", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branch, lat: p.coords.latitude, lng: p.coords.longitude,
              radiusM: Number(radius[branch]) || 150,
            }),
          });
          const d = await res.json();
          if (!res.ok || !d?.ok) throw new Error(d?.error ?? "บันทึกไม่สำเร็จ");
          setMsg(`ตั้งพิกัดสาขา ${branch} แล้ว (แม่นยำ ±${Math.round(p.coords.accuracy)} ม.)`);
          load();
        } catch (e: any) {
          setMsg(e?.message ?? "บันทึกไม่สำเร็จ");
        } finally {
          setSaving(false);
        }
      },
      () => { setMsg("อ่านตำแหน่งไม่ได้ — กดอนุญาตให้เบราว์เซอร์ใช้ตำแหน่งก่อน"); setSaving(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function saveRadius(branch: Branch, geo: Geo) {
    setSaving(true);
    try {
      await fetch("/api/time-clock/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, lat: geo.lat, lng: geo.lng, radiusM: Number(radius[branch]) || 150 }),
      });
      setMsg(`อัปเดตรัศมีสาขา ${branch} แล้ว`);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;
  if (data.error) return <p className="py-10 text-center text-sm text-brand-red">{data.error}</p>;

  const s = data.settings;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title="ตั้งค่าระบบ" />

      {msg && (
        <div className="mb-3 rounded-xl border border-ok/35 bg-ok/10 px-3.5 py-2.5 text-[12.5px] font-medium text-ok">
          {msg}
        </div>
      )}

      <GlassCard className="mb-3">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">เมนูที่เปิดให้พนักงานใช้</p>
        <Toggle
          on={data.expiryCheckEnabled} label="ตรวจสอบวันหมดอายุ"
          hint="ปิดอยู่ = ไม่มีเมนูนี้ ไม่มีในเช็คลิสต์งานวันนี้ และไม่มีเลขเตือน · ของที่ต้องส่งคืนให้กรอกที่หน้า “ส่งคืน” ตามเดิม"
          onChange={async (v) => {
            setSaving(true);
            try {
              await fetch("/api/time-clock/settings", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ expiryCheckEnabled: v }),
              });
              setData((d) => (d ? { ...d, expiryCheckEnabled: v } : d));
              setMsg("บันทึกแล้ว");
            } finally { setSaving(false); }
          }}
        />
      </GlassCard>

      <GlassCard className="mb-3">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">ลงเวลาเข้า-ออกงาน</p>
        <div className="grid gap-2">
          <Toggle
            on={s.enabled} label="เปิดให้พนักงานลงเวลา"
            hint="ปิดอยู่ = พนักงานยังลงทะเบียนใบหน้าได้ แต่กดเข้า-ออกงานไม่ได้"
            onChange={(v) => saveSettings({ ...s, enabled: v })}
          />
          <Toggle
            on={s.requireFace} label="บังคับสแกนใบหน้า"
            hint="ปิดแล้วจะกดลงเวลาได้เลยโดยไม่ต้องถ่ายหน้า — ลงเวลาแทนกันได้ทันที ไม่แนะนำให้ปิด"
            onChange={(v) => saveSettings({ ...s, requireFace: v })}
          />
          <Toggle
            on={s.requireLocation} label="บังคับให้อยู่ในรัศมีร้าน"
            hint="ต้องตั้งพิกัดร้านของสาขานั้นก่อน ไม่งั้นพนักงานสาขานั้นจะลงเวลาไม่ได้เลย"
            onChange={(v) => saveSettings({ ...s, requireLocation: v })}
          />
        </div>
      </GlassCard>

      <GlassCard>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-brand-ink/45">พิกัดร้าน</p>
        <p className="mb-2.5 text-[11.5px] leading-relaxed text-brand-ink/55">
          กด &ldquo;ใช้ตำแหน่งปัจจุบัน&rdquo; ตอนยืนอยู่ที่ร้านสาขานั้น · รัศมีแนะนำ 150 ม.
          เผื่อความคลาดเคลื่อนของ GPS ในอาคาร (ห้างมักจับตำแหน่งเพี้ยนได้หลายสิบเมตร)
        </p>
        <div className="grid gap-2">
          {data.branches.map(({ branch, geo }) => (
            <div key={branch} className="rounded-xl border border-black/[.07] bg-white/70 px-3 py-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[13.5px] font-semibold">{branch}</span>
                <span className="text-[11.5px] text-brand-ink/50">{BRANCH_LABEL_TH[branch]}</span>
                <span className="ml-auto">
                  {geo ? <Badge tone="ok">ตั้งแล้ว</Badge> : <Badge tone="warn">ยังไม่ได้ตั้ง</Badge>}
                </span>
              </div>
              {geo && (
                <p className="mb-1.5 text-[11px] tabular-nums text-brand-ink/45">
                  {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                </p>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  inputMode="numeric"
                  value={radius[branch] ?? "150"}
                  onChange={(e) => setRadius((r) => ({ ...r, [branch]: e.target.value }))}
                  className="field w-16 px-2 py-1.5 text-center text-[12.5px]"
                />
                <span className="text-[11px] text-brand-ink/45">เมตร</span>
                <div className="ml-auto flex gap-1.5">
                  {geo && (
                    <button
                      type="button"
                      onClick={() => saveRadius(branch, geo)}
                      disabled={saving}
                      className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-brand-ink disabled:opacity-50"
                    >
                      บันทึกรัศมี
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => useHere(branch)}
                    disabled={saving}
                    className="rounded-lg bg-brand-ink px-2.5 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
                  >
                    ใช้ตำแหน่งปัจจุบัน
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-brand-ink/45">
        ถ้าไม่ได้ไปที่ร้าน: เปิด Google Maps ที่หน้าร้าน กดค้างบนแผนที่จะได้พิกัด แล้วบอกผมได้ ผมใส่ให้
      </p>
    </div>
  );
}
