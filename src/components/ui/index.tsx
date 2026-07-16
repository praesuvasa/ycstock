"use client";
// Glass UI kit — ทุก module ใช้ร่วมกัน (อย่าแก้ signature)
import React from "react";
import { BRANCHES } from "@/lib/types";

export function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "blue" | "orange" }) {
  const map: Record<string, string> = {
    neutral: "bg-black/5 text-brand-ink/70",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    blue: "bg-brand-blue/25 text-sky-700",
    orange: "bg-brand-orange/20 text-orange-700",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${map[tone]}`}>{children}</span>;
}

export function Button({ children, onClick, variant = "primary", type = "button", disabled }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost"; type?: "button" | "submit"; disabled?: boolean;
}) {
  const base = "w-full rounded-xl px-4 py-3 text-[15px] font-semibold transition active:scale-[.98] disabled:opacity-50";
  const styles = variant === "primary"
    ? "bg-brand-red text-white shadow-glass"
    : "bg-white/70 text-brand-ink border border-black/10";
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>{children}</button>;
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
            value === o.value ? "bg-brand-ink text-white" : "bg-white/60 text-brand-ink border border-black/5"
          }`}>{o.label}</button>
      ))}
    </div>
  );
}

// เลือกสาขา — ถ้า locked (user มีสิทธิ์สาขาเดียว) แสดงชิปล็อกแทนปุ่มสลับ
export function BranchPicker<T extends string>({ value, onChange, locked, options }: {
  options?: { value: T; label: string }[]; value: T; onChange: (v: T) => void; locked?: boolean;
}) {
  const opts = options ?? BRANCHES.map((b) => ({ value: b as unknown as T, label: `สาขา ${b}` }));
  if (locked) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white/70 px-3 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-ink text-[11px] font-bold text-white">{value}</span>
        <span className="text-sm font-medium">สาขา {value}</span>
        <span className="ml-auto text-[11px] text-brand-ink/40">🔒 สิทธิ์สาขานี้</span>
      </div>
    );
  }
  return <Segmented options={opts} value={value} onChange={onChange} />;
}

export function Accordion({ title, count, defaultOpen = false, children }: {
  title: React.ReactNode; count?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="glass-soft mb-2.5 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left text-[15px] font-medium">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs text-brand-ink/50">
          {count}<span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {open && <div className="border-t border-black/5 px-2.5 py-1.5">{children}</div>}
    </div>
  );
}

export function NumberField({ label, value, onChange, readOnly, tone }: {
  label?: string; value: number | string; onChange?: (v: string) => void; readOnly?: boolean; tone?: "auto" | "ro";
}) {
  const cls = tone === "auto" ? "bg-brand-blue/15 font-semibold text-sky-800"
    : tone === "ro" ? "bg-black/5 text-brand-ink/50" : "";
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[11px] text-brand-ink/50">{label}</span>}
      <input inputMode="numeric" value={value} readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`field ${cls}`} />
    </label>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "default" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-brand-ink";
  return (
    <div className="glass-soft px-3.5 py-3">
      <div className="text-[11px] text-brand-ink/50">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export function SaveBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 -mx-4 mt-3 border-t border-black/5 bg-gradient-to-t from-white/90 to-white/40 px-4 py-3 backdrop-blur-md sm:-mx-5">{children}</div>;
}

export function PageTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {right}
    </div>
  );
}
