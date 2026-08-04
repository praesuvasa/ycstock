"use client";
import React from "react";
import type { Branch, SalesRow, SalesEvidence, EvidenceType, MatchStatus, PaymentIncident, PaymentIncidentKind } from "@/lib/types";
import { incidentAdjustment, sumIncidentAdjustments } from "@/lib/calc";
import { baht, todayISO, thaiDate } from "@/lib/fmt";
import { GlassCard, BranchPicker, NumberField, Stat, Button, SaveBar, PageTitle, Badge, Dialog } from "@/components/ui";
import { TodayNextStep } from "@/components/today-next-step";
import { useMe } from "@/components/nav";
import { resizeImageToBase64 } from "@/lib/image-client";

const MATCH_LABEL: Record<MatchStatus, { text: string; tone: "ok" | "warn" | "neutral" }> = {
  ok: { text: "✅ ยอดถูกต้อง", tone: "ok" },
  mismatch: { text: "⚠️ ไม่ตรง", tone: "warn" },
  unclear: { text: "⚠️ อ่านไม่ชัด ตรวจสอบเอง", tone: "warn" },
  duplicate: { text: "🚫 รูปนี้ถูกใช้ไปแล้ว", tone: "warn" },
  pending: { text: "⏳ กำลังตรวจสอบ", tone: "neutral" },
};

// ช่องแนบรูปหลักฐาน (QR/Grab/Lineman) — อัปโหลดแล้วให้ Claude อ่านยอด+เทียบกับที่กรอกทันที
function EvidenceSlot({ branch, date, type, label, enteredAmount, row, onUploaded }: {
  branch: Branch; date: string; type: EvidenceType; label: string; enteredAmount: number;
  row?: SalesEvidence; onUploaded: (row: SalesEvidence) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const res = await fetch("/api/sales-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, type, imageBase64: base64, mediaType, enteredAmount }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "อัปโหลดไม่สำเร็จ");
      onUploaded(data.evidence as SalesEvidence);
    } catch (e: any) {
      setErr(e?.message ?? "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const m = row ? MATCH_LABEL[row.matchStatus] : null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-2.5 py-2">
      {row?.imageUrl ? (
        <a href={row.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={row.imageUrl} alt={label} className="h-10 w-10 rounded-lg object-cover" />
        </a>
      ) : (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/5 text-[9px] text-brand-ink/35">ไม่มีรูป</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-brand-ink/50">หลักฐาน{label}</div>
        <div className="text-[11.5px] font-semibold text-sky-800">ต้องตรงกับ {baht(enteredAmount)}</div>
        {m ? (
          <>
            <Badge tone={m.tone}>{m.text}</Badge>
            {row?.matchStatus === "mismatch" && row.mismatchNote && (
              <div className="mt-0.5 text-[10px] text-warn">{row.mismatchNote}</div>
            )}
            {row?.matchStatus === "duplicate" && row.duplicateNote && (
              <div className="mt-0.5 text-[10px] text-warn">{row.duplicateNote}</div>
            )}
          </>
        ) : (
          <span className="text-[11px] text-brand-ink/35">ยังไม่แนบ</span>
        )}
        {err && <div className="mt-0.5 text-[10px] text-warn">{err}</div>}
      </div>
      <button
        type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
      >
        {busy ? "กำลังส่ง…" : row ? "เปลี่ยนรูป" : "แนบรูป"}
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

// v1.24 · ตรวจยอดด้วยรูปหน้ารายงานของ POS iPad (แพรสั่ง 2026-07-29)
//
// เดิมเป็นช่องให้พิมพ์ "ยอดขายรวมตาม POS" เอง — แพรบอกพนักงานสับสน ไม่รู้ว่าเลขนี้เอามาจากไหน
// เปลี่ยนเป็นถ่ายรูปหน้ารายงานมาแนบ แล้วระบบอ่านยอด+วันที่ในรูปเทียบให้เอง ไม่มีเลขให้กรอกผิด
interface PosReading {
  total: number | null; cash: number | null; other: number | null;
  billCount: number | null; dateFrom: string | null; dateTo: string | null;
}

function PosReportSlot({ branch, date, enteredTotal, enteredCash, row, reading, onDone }: {
  branch: Branch; date: string; enteredTotal: number; enteredCash: number;
  row?: SalesEvidence; reading: PosReading | null;
  onDone: (row: SalesEvidence, reading: PosReading | null) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const res = await fetch("/api/sales/pos-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, imageBase64: base64, mediaType, enteredTotal, enteredCash }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "แนบรูปไม่สำเร็จ");
      onDone(data.evidence as SalesEvidence, (data.reading ?? null) as PosReading | null);
    } catch (e: any) {
      setErr(e?.message ?? "แนบรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // ยอดที่กรอกเปลี่ยนไปหลังแนบรูป → ผลตรวจเดิมใช้ไม่ได้แล้ว ต้องบอกให้ตรวจใหม่ ไม่งั้นจะเห็น "ถูกต้อง" ค้างทั้งที่เลขเปลี่ยน
  const stale = !!row && Math.abs(row.enteredAmount - enteredTotal) > 1;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">ตรวจกับรายงานใน POS iPad</p>
          <p className="text-[11.5px] leading-relaxed text-brand-ink/55">
            เปิดหน้า &ldquo;รายงาน&rdquo; ของวันนี้บน POS แล้วถ่ายรูปมาแนบ — ระบบอ่านยอดกับวันที่ในรูปให้เอง
          </p>
        </div>
        {row?.imageUrl && (
          <a href={row.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
            <img src={row.imageUrl} alt="รายงาน POS" className="h-12 w-12 rounded-lg border border-black/10 object-cover" />
          </a>
        )}
      </div>

      <button
        type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-brand-ink disabled:opacity-50"
      >
        {busy ? "กำลังอ่านรูป…" : row ? "แนบรูปใหม่" : "📷 แนบรูปหน้ารายงาน POS"}
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {err && <p className="mt-1.5 text-[11.5px] text-warn">{err}</p>}

      {row && (
        stale ? (
          <div className="mt-2 rounded-xl border border-warn/40 bg-warn/[.08] px-3 py-2.5">
            <p className="text-[13px] font-semibold text-warn">ยอดที่กรอกเปลี่ยนหลังแนบรูป</p>
            <p className="text-[11.5px] leading-relaxed text-brand-ink/60">
              ตอนแนบตรวจกับยอด {baht(row.enteredAmount)} แต่ตอนนี้กรอกรวม {baht(enteredTotal)} — แนบรูปใหม่เพื่อตรวจอีกครั้ง
            </p>
          </div>
        ) : row.matchStatus === "ok" ? (
          <div className="mt-2 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2.5">
            <p className="text-[14px] font-semibold text-ok">ข้อมูลถูกต้อง ✓</p>
            <p className="text-[11.5px] leading-relaxed text-brand-ink/60">
              ตรงกับรายงาน POS ทั้งยอดรวมและเงินสด
              {reading?.total != null && <> · ยอดในรูป {baht(reading.total)}</>}
              {reading?.billCount != null && <> · {reading.billCount} บิล</>}
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-xl border border-warn/40 bg-warn/[.08] px-3 py-2.5">
            <p className="text-[13px] font-semibold text-warn">
              {row.matchStatus === "unclear" ? "อ่านรูปไม่ชัด" : "ไม่ตรงกับรายงาน POS"}
            </p>
            <p className="text-[11.5px] leading-relaxed text-brand-ink/60">
              {row.mismatchNote ?? "ตรวจสอบตัวเลขที่กรอกอีกครั้ง"}
            </p>
          </div>
        )
      )}
    </div>
  );
}

// เก็บ input เป็น string เพื่อให้ลบ/พิมพ์ได้ลื่น แล้วค่อยแปลงเป็นเลขตอนคำนวณ
type Field = "cash" | "qr" | "edc" | "grab" | "lineman" | "posTotal";
type Form = Record<Field, string>;
const EMPTY: Form = { cash: "", qr: "", edc: "", grab: "", lineman: "", posTotal: "" };

const toNum = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fromRow = (row: SalesRow): Form => ({
  cash: String(row.cash ?? 0),
  qr: String(row.qr ?? 0),
  edc: String(row.edc ?? 0),
  grab: String(row.grab ?? 0),
  lineman: String(row.lineman ?? 0),
  // ใบเก่าก่อนมีช่องนี้จะเป็น null — ปล่อยว่างไว้ ไม่ใส่ 0 เพราะ 0 แปลว่า "วันนั้นขายไม่ได้เลย"
  posTotal: row.posTotal === null || row.posTotal === undefined ? "" : String(row.posTotal),
});

// v1.11: ประเภทเคส "รับเงินไม่ตรงบิล" — เพิ่มประเภทใหม่ที่นี่ที่เดียว (สูตรคำนวณอยู่ใน calc.ts)
// ทุกเคสคำนวณจาก "ผลต่าง" อย่างเดียว (ดู incidentAdjustment) — เลยถามช่องเดียวพอ
// เดิมให้กรอกยอดบิล + ยอดโอน 2 ช่อง ซึ่งพนักงานงงว่าอันไหนใส่ตรงไหน (แพรทัก 2026-07-30)
// amountLabel = คำถามที่พนักงานตอบได้ทันทีหน้างาน · negative = เงินสดเข้าลิ้นชักแทนที่จะออก
const AMOUNT_LABEL: Record<PaymentIncidentKind, string> = {
  over_no_change: "ลูกค้าโอนเกินกี่บาท (ไม่ได้ทอนคืน)",
  over_cash_change: "คืนเงินสดให้ลูกค้ากี่บาท",
  under_cash_topup: "ลูกค้าจ่ายสดเพิ่มกี่บาท",
  menu_change_refund: "คืนเงินสดให้ลูกค้ากี่บาท",
  void_full_refund: "คืนเงินสดให้ลูกค้ากี่บาท (เท่ากับยอดที่โอนมา)",
};
const NEGATIVE_KINDS: PaymentIncidentKind[] = ["under_cash_topup"];

const INCIDENT_KINDS: { kind: PaymentIncidentKind; label: string; hint: string }[] = [
  { kind: "over_no_change", label: "โอนเกิน · ไม่ได้ทอนคืน", hint: "ส่วนเกินนับเป็นรายได้ของร้าน" },
  { kind: "over_cash_change", label: "โอนเกิน · ทอนเป็นเงินสด", hint: "หยิบเงินสดในลิ้นชักคืนลูกค้า" },
  { kind: "under_cash_topup", label: "โอนขาด · จ่ายสดเพิ่ม", hint: "โอนไม่ครบ แล้วจ่ายส่วนต่างเป็นเงินสด" },
  // เคสจริงจากแพร: ลูกค้าโอน 200 → void บิล → คีย์บิลใหม่ 190 → คืนสด 10
  // POS จะเห็น QR แค่ 190 (บิลใหม่) แต่เงินเข้าบัญชีจริง 200 และเงินสดหายไป 10
  // ครอบเคสยกเลิกทั้งบิลด้วย — ใส่ยอดบิลใหม่ = 0
  // เคสจริง 2026-07-30: ลูกค้าโอนแล้วไม่เอาเลย void ทั้งบิล คืนสดเต็มจำนวน
  { kind: "void_full_refund", label: "ลูกค้ายกเลิกทั้งบิล · คืนสดเต็มจำนวน",
    hint: "โอนมาแล้วไม่เอาเลย — void บิลออกจาก POS แล้วคืนเงินสดทั้งก้อน กรอกแค่ยอดที่โอนมา" },
  { kind: "menu_change_refund", label: "void บิล/เปลี่ยนเมนู · คืนสดจากลิ้นชัก",
    hint: "โอนมาแล้ว void บิลเก่า คีย์บิลใหม่ที่ถูกลง แล้วคืนส่วนต่างเป็นเงินสด · ยกเลิกทั้งบิลใส่ยอดบิลใหม่ = 0" },
];

// อ่านสาขา/วันที่จาก query string ถ้ามี (เช่น มาจาก prompt "ไปกรอกยอดขาย" หลังบันทึกสต็อก)
// ใช้ window.location ตรงๆ แทน useSearchParams เพื่อเลี่ยงต้องห่อ Suspense
function fromQuery<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const v = new URLSearchParams(window.location.search).get(key);
  return (valid as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

export default function SalesPage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>(() => fromQuery("branch", ["SND", "NVP", "KCN"] as const, "NVP"));
  const [date, setDate] = React.useState<string>(() => {
    if (typeof window === "undefined") return todayISO();
    const v = new URLSearchParams(window.location.search).get("date");
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayISO();
  });

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);
  const [form, setForm] = React.useState<Form>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // v1.11: เคส "รับเงินไม่ตรงบิล" (QR ↔ เงินสด) — กรอกยอด POS ตามปกติ แล้วบันทึกเคสแยก
  // ระบบคำนวณยอดเงินเข้าจริงให้เอง ไม่ต้องให้พนักงานคิดเองว่าช่องไหนบวกช่องไหนลบ
  const [incidents, setIncidents] = React.useState<PaymentIncident[]>([]);
  // เคสต้องบันทึกก่อนแนบหลักฐาน (แพรกำหนดลำดับ)
  // เทียบกับ "ชุดที่บันทึกไว้จริง" แทนการตั้ง flag เอง — กันเคสกดเพิ่มแล้วลบออก
  // แล้วสถานะ "ยังไม่บันทึก" ค้างจนปลดล็อกแนบหลักฐานไม่ได้
  const [savedIncidents, setSavedIncidents] = React.useState<PaymentIncident[]>([]);
  const [savingIncidents, setSavingIncidents] = React.useState(false);
  const [savedOnce, setSavedOnce] = React.useState(false);
  // กล่องเคสยุบไว้เป็นดีฟอลต์ · กางเองเมื่อวันนั้นมีเคสบันทึกไว้แล้ว จะได้ไม่ต้องไล่กดหา
  const [incidentOpen, setIncidentOpen] = React.useState(false);
  // popup ยืนยันผลการบันทึก (แพรสั่ง 2026-07-29) — พนักงานเคยกดออกจากหน้าก่อนบันทึกเสร็จเพราะไม่มีอะไรบอก
  const [dialog, setDialog] = React.useState<{
    tone: "ok" | "warn"; title: string; body?: string;
    actionLabel?: string; onAction?: () => void; secondaryLabel?: string;
  } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    // ล้างของสาขา/วันที่เดิมทิ้งทันทีก่อนยิงโหลด (แพรเจอ 2026-07-28)
    //
    // เดิมค่าเก่าค้างบนจอจนกว่าโหลดใหม่จะเสร็จ — บนมือถือเน็ตช้าอาจค้างหลายวินาที
    // แพรสลับไป KCN 24 ก.ค. (ไม่มีข้อมูล) แต่ยังเห็นยอด 5,439 ของ NVP 28 ก.ค. ค้างอยู่
    // ที่อันตรายกว่าคือถ้ากดบันทึกตอนนั้นพอดี ยอดของสาขาหนึ่งจะถูกเขียนลงอีกสาขาทันที
    setForm(EMPTY);
    setIncidents([]);
    setSavedIncidents([]);
    try {
      const res = await fetch(`/api/sales?branch=${branch}&date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setForm(fromRow(data.row as SalesRow));
      const loaded = (data.incidents ?? []) as PaymentIncident[];
      setIncidents(loaded);
      setSavedIncidents(loaded);
      setIncidentOpen(loaded.length > 0); // วันนั้นมีเคสอยู่แล้ว → กางให้เลย ไม่ต้องไล่กดหา
    } catch (e: any) {
      setErr(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      setForm(EMPTY);
      setIncidents([]);
      setSavedIncidents([]);
      setIncidentOpen(false);
    } finally {
      setLoading(false);
    }
  }, [branch, date]);

  React.useEffect(() => {
    load();
  }, [load]);

  // หลักฐาน QR/Grab/Lineman/รายงาน POS ของสาขา+วันที่นี้
  const [evidence, setEvidence] = React.useState<Partial<Record<EvidenceType, SalesEvidence>>>({});
  // ตัวเลขที่อ่านได้จากรูปรายงาน POS รอบล่าสุด — ใช้โชว์รายละเอียด (จำนวนบิล/ยอดในรูป) เท่านั้น
  // ไม่ได้เก็บลง DB จึงเป็น null ตอนเพิ่งเปิดหน้ามาเจอรูปที่แนบไว้เมื่อวาน — สถานะตรวจยังอ่านจาก evidence ได้ปกติ
  const [posReading, setPosReading] = React.useState<PosReading | null>(null);
  const loadEvidence = React.useCallback(() => {
    fetch(`/api/sales-evidence?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((d: { rows?: SalesEvidence[] }) => {
        const map: Partial<Record<EvidenceType, SalesEvidence>> = {};
        for (const row of d.rows ?? []) map[row.type] = row;
        setEvidence(map);
        setPosReading(null); // รูปของสาขา/วันที่ใหม่ — รายละเอียดที่อ่านไว้รอบก่อนใช้ไม่ได้แล้ว
      })
      .catch(() => {});
  }, [branch, date]);
  React.useEffect(() => { loadEvidence(); }, [loadEvidence]);

  const set = (f: Field) => (v: string) => setForm((p) => ({ ...p, [f]: v }));

  // คำนวณสด
  const inStore = toNum(form.cash) + toNum(form.qr) + toNum(form.edc);
  const delivery = toNum(form.grab) + toNum(form.lineman);
  const total = inStore + delivery;

  // v1.11: ยอด "เงินเข้าจริง" = ยอด POS ที่กรอก + ผลรวมเคสรับเงินไม่ตรงบิล
  // ตัวนี้คือตัวที่ต้องตรงกับสลิปธนาคาร/เงินในลิ้นชัก จึงใช้เทียบตอนอัปโหลดหลักฐาน
  const editIncidents = (fn: (prev: PaymentIncident[]) => PaymentIncident[]) => setIncidents(fn);

  // เทียบเฉพาะเคสที่ "กรอกยอดแล้วจริง" — แถวเปล่าที่เพิ่งกดเพิ่ม (ยังไม่ใส่ตัวเลข) ไม่นับว่าเป็นการแก้
  // เพราะ server ก็กรองแถวเปล่าทิ้งอยู่แล้ว · ผลคือ เพิ่มแล้วลบออก = กลับมาเหมือนเดิม = ไม่ค้างสถานะ
  const normalizeIncidents = (list: PaymentIncident[]) =>
    JSON.stringify(
      list
        .filter((i) => i.billAmount > 0 || i.actualAmount > 0)
        .map((i) => ({ kind: i.kind, billAmount: i.billAmount, actualAmount: i.actualAmount, note: i.note ?? "" }))
    );
  const incidentsDirty = normalizeIncidents(incidents) !== normalizeIncidents(savedIncidents);
  // ต้องกรอกยอด QR ตาม POS ก่อน (แพรกำหนด) — เคสทุกประเภทปรับยอด QR เป็นฐาน
  // ถ้าฐานยังเป็น 0 "ยอดเงินเข้าจริง" จะเพี้ยน แล้วพนักงานอาจเอาไปเทียบสลิปผิดตัว
  const posReady = toNum(form.qr) > 0;

  const saveIncidents = async () => {
    setSavingIncidents(true);
    setErr(null);
    try {
      const res = await fetch("/api/sales/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, incidents }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "บันทึกเคสไม่สำเร็จ");
      const saved = (data.incidents ?? []) as PaymentIncident[]; // ใช้ชุดที่ผ่านการกรองจาก server
      setIncidents(saved);
      setSavedIncidents(saved);
    } catch (e: any) {
      setErr(e?.message ?? "บันทึกเคสไม่สำเร็จ");
      setDialog({ tone: "warn", title: "บันทึกเคสไม่สำเร็จ", body: e?.message ?? "ลองใหม่อีกครั้ง" });
    } finally {
      setSavingIncidents(false);
    }
  };

  const adj = React.useMemo(() => sumIncidentAdjustments(incidents), [incidents]);
  const actualQr = toNum(form.qr) + adj.qr;
  const actualCash = toNum(form.cash) + adj.cash;
  const hasAdjustment = adj.qr !== 0 || adj.cash !== 0;

  // บังคับแนบหลักฐานก่อนบันทึกได้ (แพรสั่ง 2026-08-04) — เฉพาะช่องที่ยอดไม่เป็น 0 เท่านั้น
  // ช่องที่ไม่มีเงินเข้าเลยไม่ต้องมีรูปให้แนบ ไม่งั้นจะตันบันทึกไม่ได้ทั้งที่ไม่มีอะไรต้องพิสูจน์
  // เริ่มบังคับตั้งแต่วันที่พนักงานเริ่มใช้ระบบจริง (2026-08-05) — ของวันก่อนหน้ายังแก้ไขได้ตามปกติ
  const EVIDENCE_REQUIRED_FROM = "2026-08-05";
  const missingEvidence: string[] = [];
  if (date >= EVIDENCE_REQUIRED_FROM) {
    if (toNum(form.qr) > 0 && !evidence.qr) missingEvidence.push("สรุปยอด QR");
    if (toNum(form.grab) > 0 && !evidence.grab) missingEvidence.push("สรุปยอด Grab");
    if (toNum(form.lineman) > 0 && !evidence.lineman) missingEvidence.push("สรุปยอด Lineman");
    if (total > 0 && !evidence.pos) missingEvidence.push("รายงานยอดขาย POS");
  }

  const save = async () => {
    if (loading) return; // ยังโหลดข้อมูลของสาขา/วันที่นี้ไม่เสร็จ — กันบันทึกทับด้วยค่าที่ยังไม่ใช่ของจริง
    setSaving(true);
    setErr(null);
    try {
      const row: SalesRow = {
        cash: toNum(form.cash),
        qr: toNum(form.qr),
        edc: toNum(form.edc),
        grab: toNum(form.grab),
        lineman: toNum(form.lineman),
        posTotal: form.posTotal === "" ? null : toNum(form.posTotal),
      };
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, row, incidents }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "บันทึกไม่สำเร็จ");
      setSavedIncidents(incidents); // ปุ่มนี้บันทึกเคสให้ด้วย — sync สถานะ ไม่ให้ค้างว่า "ยังไม่บันทึก"
      setSavedOnce(true);
      setDialog({ tone: "ok", title: "บันทึกยอดขายสำเร็จ", body: `สาขา ${branch} · ${thaiDate(date)} · รวมทั้งวัน ${baht(total)}` });
    } catch (e: any) {
      setErr(e?.message ?? "บันทึกไม่สำเร็จ");
      setDialog({ tone: "warn", title: "ยังบันทึกไม่สำเร็จ", body: e?.message ?? "ลองกดบันทึกอีกครั้ง" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="ยอดขาย"
        right={loading ? <Badge tone="blue">กำลังโหลด…</Badge> : <Badge tone="ok">{baht(total)}</Badge>}
      />

      {/* สาขา + วันที่ */}
      <GlassCard className="mb-3">
        <div className="flex flex-col gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field"
            />
          </label>
        </div>
      </GlassCard>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      {/* In-store */}
      <GlassCard className="mb-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">In-store (หน้าร้าน)</h2>
          <Badge tone="neutral">รวม {baht(inStore)}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField label="เงินสด" value={form.cash} onChange={set("cash")} />
          <NumberField label="PromptPay / QR" value={form.qr} onChange={set("qr")} />
          <NumberField label="EDC บัตร" value={form.edc} onChange={set("edc")} />
        </div>
        {/* แพรถามเอง: พนักงานจะรู้ได้ยังไงว่าต้องใส่ยอด POS ไม่ใช่ยอดในแอปธนาคาร (2026-07-28)
            ทั้งสองเลขมีอยู่จริงตรงหน้าและต่างกันได้ ถ้าไม่เขียนบอก จะเดาเอาเอง แล้วยอดจะเพี้ยนแบบเงียบ ๆ */}
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-brand-ink/50">
          ทุกช่องกรอกตามที่ <b className="font-semibold text-brand-ink/70">POS iPad</b> สรุปเท่านั้น
          <span className="block">หากมีเคสโอนขาด/โอนเกิน/คืนเงินสด ระบบจะคำนวณให้อัตโนมัติ กดเพิ่มเคสด้านล่างได้เลย</span>
        </p>
        {/* v1.11: เคสรับเงินไม่ตรงบิล (QR ↔ เงินสด) — ยุบไว้เป็นดีฟอลต์ (แพรขอ 2026-07-27)
            เพราะเป็นเคสนาน ๆ ที กางค้างไว้ทุกวันทำให้หน้าจอรก และพนักงานสับสนว่าต้องกรอกด้วยไหม */}
        <div className="mt-3 rounded-xl border border-black/10 bg-black/[.02] px-3 py-2.5">
          <button
            type="button"
            onClick={() => setIncidentOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={incidentOpen}
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium">
                รับเงินไม่ตรงบิล
                {incidents.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-red px-1.5 text-[10px] font-semibold text-white">
                    {incidents.length}
                  </span>
                )}
              </span>
              {!incidentOpen && (
                <span className="block text-[11px] leading-relaxed text-brand-ink/45">
                  กดเมื่อมีเคสลูกค้าโอนเกิน/ขาด
                </span>
              )}
            </span>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className={`shrink-0 text-brand-ink/40 transition-transform ${incidentOpen ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {incidentOpen && (
          <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px] leading-relaxed text-brand-ink/50">
              ทุกเคสที่โอนขาด/เกิน คำนวณจากยอด QR — ถ้าช่อง QR ว่าง ค่าจะเพี้ยน
            </p>
            <button
              type="button"
              disabled={!posReady}
              onClick={() => editIncidents((p) => [...p, { kind: "over_no_change", billAmount: 0, actualAmount: 0, note: "" }])}
              className="shrink-0 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-[11.5px] font-medium text-brand-red disabled:opacity-40"
            >
              + เพิ่มเคส
            </button>
          </div>

          {!posReady && (
            <div className="mt-2 rounded-lg border border-warn/30 bg-warn/[.07] px-2.5 py-2 text-[11.5px] leading-relaxed text-warn">
              กรอกยอด <b>PromptPay / QR</b> ด้านบนตาม POS ก่อน ถึงจะเพิ่มเคสได้
              <span className="block text-brand-ink/50">เพราะเคสทุกแบบคิดจากยอด QR เป็นฐาน — ถ้าฐานยังว่าง ยอดเงินเข้าจริงจะเพี้ยน</span>
            </div>
          )}

          {incidents.length > 0 && (
            <div className="mt-2.5 grid gap-2">
              {incidents.map((it, i) => {
                const a = incidentAdjustment(it.kind, it.billAmount, it.actualAmount);
                const patch = (p: Partial<PaymentIncident>) =>
                  editIncidents((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <div key={i} className="rounded-lg bg-white/70 px-2.5 py-2">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <select
                        value={it.kind}
                        onChange={(e) => {
                          const k = e.target.value as PaymentIncidentKind;
                          const v = Math.abs(it.actualAmount);
                          patch({ kind: k, billAmount: 0, actualAmount: NEGATIVE_KINDS.includes(k) ? -v : v });
                        }}
                        className="field min-w-0 flex-1 py-1 text-left text-[12px]"
                      >
                        {INCIDENT_KINDS.map((k) => (
                          <option key={k.kind} value={k.kind}>{k.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => editIncidents((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 pt-1 text-[11px] font-medium text-warn underline underline-offset-2"
                      >
                        ลบ
                      </button>
                    </div>
                    {/* ช่องเดียว = จำนวนเงินที่ต่างจากบิล · ระบบแปลงเป็นยอด QR/เงินสดให้เอง */}
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10.5px] font-medium text-brand-ink/60">{AMOUNT_LABEL[it.kind]}</span>
                      <input
                        inputMode="decimal"
                        value={Math.abs(it.actualAmount) || ""}
                        onChange={(e) => {
                          const v = Math.abs(toNum(e.target.value));
                          patch({ billAmount: 0, actualAmount: NEGATIVE_KINDS.includes(it.kind) ? -v : v });
                        }}
                        placeholder="เช่น 129"
                        className="field py-1.5 text-center text-[15px] font-semibold"
                      />
                    </label>
                    {it.actualAmount !== 0 && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-sky-700">
                        ระบบจะปรับให้: ยอด QR {a.qr >= 0 ? "+" : ""}{a.qr}
                        {a.cash !== 0 && <> · เงินสดในลิ้นชัก {a.cash >= 0 ? "+" : ""}{a.cash}</>}
                        {a.overBill !== 0 && <> · เกินบิล {a.overBill} (นับเป็นรายได้ร้าน)</>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasAdjustment && (
            <div className="mt-2.5 rounded-xl border-2 border-brand-blue/50 bg-brand-blue/15 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                ยอดเงินเข้าจริง — ต้องตรงกับแอปธนาคาร
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-[12px] text-sky-700">QR</span>
                <span className="text-[18px] font-bold leading-none tabular-nums text-sky-900">{baht(actualQr)}</span>
                <span className="text-[11px] text-sky-700/70">(POS {baht(toNum(form.qr))})</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2 border-t border-sky-700/15 pt-1.5">
                <span className="text-[12px] text-sky-700">เงินสดในลิ้นชัก</span>
                <span className="text-[16px] font-semibold leading-none tabular-nums text-sky-900">{baht(actualCash)}</span>
              </div>
              {adj.overBill !== 0 && (
                <p className="mt-1.5 text-[11.5px] text-sky-700">เกินบิลรวม {baht(adj.overBill)} (นับเป็นรายได้ร้าน)</p>
              )}
              {/* เลขในแอปธนาคารกลายเป็น "ตัวตรวจ" ไม่ใช่ "ตัวกรอก" — ถ้าไม่ตรงแปลว่ายังมีเคสตกหล่น */}
              <p className="mt-1.5 border-t border-sky-700/15 pt-1.5 text-[11px] leading-relaxed text-sky-700/80">
                เอาเลขนี้ไปเทียบกับยอดในแอปธนาคาร ถ้าไม่ตรง แปลว่ายังมีเคสที่ยังไม่ได้บันทึก
              </p>
            </div>
          )}

          {/* ลำดับที่แพรกำหนด: บันทึกเคส → แนบหลักฐาน → บันทึกยอดขาย
              ต้องบันทึกเคสก่อน เพราะยอดที่เอาไปเทียบสลิปต้องรวมผลของเคสแล้ว */}
          {(incidentsDirty || savedIncidents.length > 0) && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={saveIncidents}
                disabled={savingIncidents || !incidentsDirty || !posReady}
                className={`w-full rounded-lg px-3 py-2 text-[12.5px] font-semibold transition disabled:opacity-60 ${
                  incidentsDirty ? "bg-brand-red text-white" : "border border-ok/40 bg-ok/10 text-ok"
                }`}
              >
                {savingIncidents ? "กำลังบันทึก…" : incidentsDirty ? "บันทึกเคส (ทำก่อนแนบหลักฐาน)" : "✓ บันทึกเคสแล้ว"}
              </button>
              {incidentsDirty && (
                <p className="mt-1 text-center text-[11px] text-warn">
                  ยังไม่ได้บันทึกเคส — แนบหลักฐานตอนนี้ยอดอาจไม่ตรง
                </p>
              )}
            </div>
          )}
          </>
          )}
        </div>

        {toNum(form.qr) > 0 && (
          <div className="mt-2.5">
            {incidentsDirty ? (
              <div className="rounded-xl border border-warn/30 bg-warn/[.07] px-2.5 py-2.5 text-[11.5px] leading-relaxed text-warn">
                กดปุ่ม &ldquo;บันทึกเคส&rdquo; ด้านบนก่อน แล้วช่องแนบหลักฐาน QR จะเปิดให้ใช้
                <span className="block text-brand-ink/50">เพราะยอดที่ใช้เทียบสลิปต้องรวมผลของเคสแล้ว</span>
              </div>
            ) : (
            <EvidenceSlot
              branch={branch} date={date} type="qr" label="สรุปยอด QR เข้าบัญชี" enteredAmount={actualQr}
              row={evidence.qr} onUploaded={(row) => setEvidence((p) => ({ ...p, qr: row }))}
            />
            )}
          </div>
        )}

      </GlassCard>

      {/* Delivery */}
      <GlassCard className="mb-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Delivery</h2>
          <Badge tone="orange">รวม {baht(delivery)}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="Grab" value={form.grab} onChange={set("grab")} />
          <NumberField label="Lineman" value={form.lineman} onChange={set("lineman")} />
        </div>
        <div className="mt-2.5 grid gap-2">
          {toNum(form.grab) > 0 && (
            <EvidenceSlot
              branch={branch} date={date} type="grab" label="สรุปยอด Grab" enteredAmount={toNum(form.grab)}
              row={evidence.grab} onUploaded={(row) => setEvidence((p) => ({ ...p, grab: row }))}
            />
          )}
          {toNum(form.lineman) > 0 && (
            <EvidenceSlot
              branch={branch} date={date} type="lineman" label="สรุปยอด Lineman" enteredAmount={toNum(form.lineman)}
              row={evidence.lineman} onUploaded={(row) => setEvidence((p) => ({ ...p, lineman: row }))}
            />
          )}
        </div>
      </GlassCard>

      {/* รวมทั้งวัน + ตรวจกับรายงาน POS
          POS สรุป "อื่นๆ" มาเป็นก้อนเดียว (QR + EDC + Grab + Lineman) พนักงานต้องลบเลขเองกว่าจะได้ยอด QR
          ซึ่งพลาดง่ายและไม่มีอะไรฟ้อง · v1.24 เปลี่ยนจาก "พิมพ์ยอดรวม POS เอง" เป็นถ่ายรูปหน้ารายงานมาแนบ
          ระบบอ่านยอด+วันที่ในรูปแล้วเทียบให้ — ไม่มีเลขให้กรอกผิด และรูปยังเป็นหลักฐานย้อนหลังได้ */}
      <GlassCard className="mb-3">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="In-store" value={baht(inStore)} />
          <Stat label="Delivery" value={baht(delivery)} />
          <Stat label="รวมทั้งวัน" value={baht(total)} tone="ok" />
        </div>

        <div className="mt-3 border-t border-black/[.06] pt-3">
          <PosReportSlot
            branch={branch} date={date}
            enteredTotal={total} enteredCash={toNum(form.cash)}
            row={evidence.pos} reading={posReading}
            onDone={(row, reading) => {
              setEvidence((p) => ({ ...p, pos: row }));
              setPosReading(reading);
              // ยอดรวมที่อ่านได้จากรูปคือค่าที่เก็บลง posTotal — ไม่ต้องให้ใครพิมพ์เอง
              if (reading?.total != null) setForm((p) => ({ ...p, posTotal: String(reading.total) }));
              // ตรวจเสร็จแล้วเด้งถามทันที (แพรสั่ง 2026-07-29) — จุดที่ลืมบ่อยที่สุดคือ
              // แนบรูปเห็นว่า "ถูกต้อง" แล้วเข้าใจว่าจบงาน ทั้งที่ยังไม่ได้กดบันทึก
              // ปุ่มในหน้าต่างนี้บันทึกให้เลย ไม่ต้องกลับไปหาปุ่มด้านล่าง
              if (row.matchStatus === "ok") {
                setDialog({
                  tone: "ok",
                  title: "ตรวจแล้ว ข้อมูลถูกต้อง ✓",
                  body: "เหลืออีกขั้นเดียว — ยังไม่ได้บันทึกยอดขายของวันนี้",
                  actionLabel: "บันทึกยอดขายเลย",
                  onAction: () => { setDialog(null); save(); },
                  secondaryLabel: "ไว้ก่อน",
                });
              } else {
                setDialog({
                  tone: "warn",
                  title: row.matchStatus === "unclear" ? "อ่านรูปไม่ชัด" : "ยอดยังไม่ตรงกับรายงาน POS",
                  body: row.mismatchNote ?? "ตรวจตัวเลขที่กรอกอีกครั้ง แล้วแนบรูปใหม่",
                  actionLabel: "กลับไปแก้ตัวเลข",
                });
              }
            }}
          />
        </div>
      </GlassCard>

      <TodayNextStep show={savedOnce} hideTask={["sales", "receipt"]} />

      {dialog && (
        <Dialog
          open tone={dialog.tone} title={dialog.title}
          actionLabel={dialog.actionLabel ?? (dialog.tone === "ok" ? "เรียบร้อย" : "ปิด")}
          onAction={dialog.onAction}
          secondaryLabel={dialog.secondaryLabel}
          onClose={() => setDialog(null)}
        >
          {dialog.body}
        </Dialog>
      )}

      <SaveBar>
        {missingEvidence.length > 0 && (
          <p className="mb-2 text-center text-[12px] font-medium text-warn">
            ยังไม่ได้แนบหลักฐาน: {missingEvidence.join(" · ")}
          </p>
        )}
        <Button onClick={save} disabled={saving || loading || missingEvidence.length > 0}>
          {saving ? "กำลังบันทึก…" : "บันทึกยอดขาย"}
        </Button>
      </SaveBar>
    </div>
  );
}
