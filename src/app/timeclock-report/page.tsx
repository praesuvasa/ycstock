"use client";
// v1.22 · รายงานชั่วโมงทำงานรายเดือน (แอดมินเท่านั้น)
//
// เอาไปคิดค่าแรง/OT ได้ จึงต้องแก้เวลาย้อนหลังได้ (ลืมกดออกงาน ลืมกดเข้างาน)
// แต่ทุกการแก้ต้องเขียนเหตุผล และขึ้นป้าย "แก้แล้ว" ค้างไว้ตลอด —
// ตัวเลขที่แก้ได้เงียบ ๆ ไม่มีใครเชื่อ แล้วระบบลงเวลาทั้งระบบก็เสียเปล่า
import React from "react";
import { GlassCard, PageTitle, Button, Badge } from "@/components/ui";
import { visibleBranches } from "@/lib/types";
import type { Branch, TimeClockEntry } from "@/lib/types";
import { thaiDate } from "@/lib/fmt";
import { useMe, useLang } from "@/components/nav";
import { t, type Lang } from "@/lib/i18n";

interface Row extends TimeClockEntry { minutes: number | null }
interface Summary { userId: string; userName: string; minutes: number; shifts: number; openShifts: number; days: number }
interface Resp { month: string; entries: Row[]; summary: Summary[]; totalMinutes: number; error?: string }

const bkk = { timeZone: "Asia/Bangkok" } as const;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", ...bkk });
/** นาที → "8 ชม. 30 น." — อ่านง่ายกว่าทศนิยมเวลาเอาไปคุยกับพนักงาน */
const hhmm = (lang: Lang, min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t(lang, "timeclockReport.durationHoursMinutes", { h, m }) : t(lang, "timeclockReport.durationHoursOnly", { h });
};

/** yyyy-mm ของเดือนนี้ตามเวลาไทย */
const thisMonth = (): string => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
/** ค่าเริ่มต้นของ input type=time จาก ISO (ตามเวลาไทย) */
const timeValue = (iso: string): string => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(11, 16);

export default function TimeClockReportPage() {
  const me = useMe();
  const lang = useLang();
  const [month, setMonth] = React.useState(thisMonth());
  const [branch, setBranch] = React.useState<Branch | "">("");
  const [data, setData] = React.useState<Resp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/time-clock/report?month=${month}${branch ? `&branch=${branch}` : ""}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
      .catch(() => setLoading(false));
  }, [month, branch]);
  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title={t(lang, "nav.adminMenu.timeclockReport")} />

      <GlassCard className="mb-3">
        <div className="grid gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "timeclockReport.monthLabel")}</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="field" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button" onClick={() => setBranch("")}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${branch === "" ? "bg-brand-ink text-white" : "border border-black/10 bg-white/70"}`}
            >
              {t(lang, "timeclockReport.allBranches")}
            </button>
            {visibleBranches(me?.role).map((b) => (
              <button
                key={b} type="button" onClick={() => setBranch(b)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${branch === b ? "bg-brand-ink text-white" : "border border-black/10 bg-white/70"}`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {loading && <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "timeclockReport.loadingText")}</p>}
      {data?.error && <p className="py-8 text-center text-sm text-brand-red">{data.error}</p>}

      {data && !data.error && (
        <>
          <GlassCard className="mb-3">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "timeclockReport.summaryTitle")}</p>
              <p className="text-[12px] text-brand-ink/50">{t(lang, "timeclockReport.totalMonthLabel", { value: hhmm(lang, data.totalMinutes) })}</p>
            </div>
            {data.summary.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-ink/45">{t(lang, "timeclockReport.summaryEmptyState")}</p>
            ) : (
              <div className="grid gap-2">
                {data.summary.map((u) => (
                  <div key={u.userId} className="flex items-center gap-3 rounded-xl border border-black/[.07] bg-white/70 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{u.userName}</p>
                      <p className="text-[11.5px] text-brand-ink/50">
                        {t(lang, "timeclockReport.daysShiftsLabel", { days: u.days, shifts: u.shifts })}
                        {u.openShifts > 0 && <span className="text-warn">{t(lang, "timeclockReport.openShiftsSuffix", { n: u.openShifts })}</span>}
                      </p>
                    </div>
                    <p className="shrink-0 text-[16px] font-semibold tabular-nums">{hhmm(lang, u.minutes)}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "timeclockReport.dailyTitle")}</p>
          <div className="grid gap-2">
            {data.entries.map((e) => (
              <div key={e.id} className="rounded-xl border border-black/[.07] bg-white/70 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">
                      {/* ฝ่ายผลิตไม่ได้ผูกสาขา — เก็บ branch เป็นค่าว่าง (v1.24) */}
                      {e.userName} <span className="text-brand-ink/40">· {e.branch ?? t(lang, "timeclockReport.productionUnit")}</span>
                    </p>
                    <p className="text-[11.5px] text-brand-ink/50">{thaiDate(e.workDate)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold tabular-nums">
                      {timeOf(e.clockIn)} – {e.clockOut ? timeOf(e.clockOut) : <span className="text-warn">{t(lang, "timeclockReport.notClockedOutYet")}</span>}
                    </p>
                    <p className="text-[11.5px] text-brand-ink/50">{e.minutes === null ? "—" : hhmm(lang, e.minutes)}</p>
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {e.editedBy && <Badge tone="orange">{t(lang, "timeclockReport.editedByBadge", { name: e.editedBy })}</Badge>}
                  {e.inFaceSimilarity != null && <Badge tone="ok">{t(lang, "timeclockReport.faceScanBadge", { pct: e.inFaceSimilarity })}</Badge>}
                  {e.inDistanceM != null && <Badge tone="neutral">{t(lang, "timeclockReport.distanceBadge", { m: e.inDistanceM })}</Badge>}
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="ml-auto text-[11.5px] font-medium text-brand-red underline underline-offset-2"
                  >
                    {t(lang, "timeclockReport.editTimeButton")}
                  </button>
                </div>
                {e.editNote && <p className="mt-1 text-[11px] text-brand-ink/45">{t(lang, "timeclockReport.editNotePrefix", { note: e.editNote })}</p>}
              </div>
            ))}
            {data.entries.length === 0 && (
              <GlassCard><p className="py-6 text-center text-sm text-brand-ink/45">{t(lang, "timeclockReport.emptyMonthState")}</p></GlassCard>
            )}
          </div>
        </>
      )}

      {editing && <EditDialog row={editing} lang={lang} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// แก้เวลาย้อนหลัง — กรอกเป็นเวลา (ชม.:นาที) ของ "วันทำงาน" นั้น
// ถ้าเวลาออกน้อยกว่าเวลาเข้า ถือว่าข้ามคืน (ปิดร้านดึกแล้วกดออกหลังเที่ยงคืน) บวกวันให้อัตโนมัติ
function EditDialog({ row, lang, onClose, onSaved }: { row: Row; lang: Lang; onClose: () => void; onSaved: () => void }) {
  const [tIn, setTIn] = React.useState(timeValue(row.clockIn));
  const [tOut, setTOut] = React.useState(row.clockOut ? timeValue(row.clockOut) : "");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  /** "HH:mm" ของวันทำงาน (เวลาไทย) → ISO */
  const toIso = (hm: string, plusDay = false): string => {
    const [h, m] = hm.split(":").map(Number);
    const base = new Date(`${row.workDate}T00:00:00+07:00`);
    base.setUTCHours(base.getUTCHours() + h, base.getUTCMinutes() + m);
    if (plusDay) base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString();
  };

  async function save() {
    setErr(null);
    if (note.trim().length < 3) { setErr(t(lang, "timeclockReport.errReasonRequiredClient")); return; }
    setSaving(true);
    try {
      const clockIn = toIso(tIn);
      const overnight = !!tOut && tOut < tIn;
      const res = await fetch("/api/time-clock/report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id, clockIn,
          clockOut: tOut ? toIso(tOut, overnight) : null,
          note: note.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? t(lang, "timeclockReport.errSaveFailed"));
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "timeclockReport.errSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-brand-cream p-4 shadow-2xl">
        <p className="text-[15px] font-semibold">{t(lang, "timeclockReport.dialogTitle", { name: row.userName ?? "" })}</p>
        <p className="mb-3 text-[12px] text-brand-ink/50">
          {thaiDate(row.workDate)} · {row.branch ? t(lang, "timeclockReport.branchLabel", { branch: row.branch }) : t(lang, "timeclockReport.productionUnit")}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "timeclockReport.clockInLabel")}</span>
            <input type="time" value={tIn} onChange={(e) => setTIn(e.target.value)} className="field" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "timeclockReport.clockOutLabel")}</span>
            <input type="time" value={tOut} onChange={(e) => setTOut(e.target.value)} className="field" />
          </label>
        </div>
        {!!tOut && tOut < tIn && (
          <p className="mt-1 text-[11px] text-brand-ink/45">{t(lang, "timeclockReport.overnightNote")}</p>
        )}

        <label className="mt-2.5 flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">{t(lang, "timeclockReport.reasonLabel")}</span>
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(lang, "timeclockReport.reasonPlaceholder")}
            className="field text-left"
          />
        </label>

        {err && <p className="mt-2 rounded-lg bg-warn/10 px-2.5 py-2 text-[12px] text-warn">{err}</p>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>{t(lang, "timeclockReport.cancelButton")}</Button>
          <Button onClick={save} disabled={saving}>{saving ? t(lang, "timeclockReport.savingButton") : t(lang, "timeclockReport.saveButton")}</Button>
        </div>
        <p className="mt-2 text-center text-[10.5px] leading-relaxed text-brand-ink/40">
          {t(lang, "timeclockReport.editFooterNote")}
        </p>
      </div>
    </div>
  );
}
