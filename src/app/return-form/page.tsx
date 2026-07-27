"use client";
// v1.12 · ใบส่งคืนสินค้า — แบบฟอร์มเปล่าให้เขียนมือ (A4 แนวตั้ง 10 บรรทัด)
//
// ทำไมเป็นฟอร์มเปล่า ไม่ใช่ใบที่ระบบกรอกให้: หน้าร้านไม่มีเครื่องพิมพ์ที่พิมพ์ตามสั่งได้
// สาขาต้องถ่ายเอกสารเก็บไว้เป็นปึกแล้วหยิบมาเขียนตอนส่งคืน — ใบนี้จึงต้องพิมพ์ล่วงหน้าได้
// ข้อมูลจริงยังถูกบันทึกในระบบที่หน้า "วันหมดอายุ" อยู่แล้ว ใบนี้คือหลักฐานกระดาษที่เดินทางไปกับของ
import React from "react";
import { PageTitle, GlassCard, Button, Badge } from "@/components/ui";

const COPY_OPTIONS = [1, 5, 10, 20];

function logExport(copies: number) {
  fetch("/api/export-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "print_return_form", detail: `พิมพ์ใบส่งคืนเปล่า ${copies} ใบ` }),
  }).catch(() => {});
}

const Dots = ({ w }: { w: string }) => (
  <span className="inline-block border-b border-dotted border-black align-bottom" style={{ width: w }} />
);

function Sheet({ last }: { last: boolean }) {
  return (
    <div className={last ? "" : "break-after-page"}>
      <div className="mb-3 flex items-end justify-between border-b-[2.5px] border-black pb-2">
        <span className="text-[20px] font-semibold leading-none text-black">ใบส่งคืนสินค้า</span>
        <span className="text-[10px] tracking-[.12em] text-neutral-600">YOGURT CULTURE</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-8 gap-y-2 text-[12.5px] text-black">
        <span>สาขา <Dots w="150px" /></span>
        <span>วันที่ <Dots w="140px" /></span>
        <span>รอบตรวจ <Dots w="100px" /></span>
      </div>

      <table className="w-full border-collapse text-[11.5px] text-black">
        <thead>
          <tr>
            <th className="w-[30px] border border-black px-1.5 py-1 text-left font-medium">ที่</th>
            <th className="border border-black px-1.5 py-1 text-left font-medium">ชื่อสินค้า</th>
            <th className="w-[95px] border border-black px-1.5 py-1 text-left font-medium">วันหมดอายุ</th>
            <th className="w-[65px] border border-black px-1.5 py-1 text-left font-medium">จำนวน</th>
            <th className="w-[150px] border border-black px-1.5 py-1 text-left font-medium">เหตุผล</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }, (_, i) => (
            <tr key={i}>
              <td className="h-[32px] border border-black px-1.5 text-[10px] text-neutral-500">{i + 1}</td>
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
              <td className="border border-black" />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border border-t-0 border-black px-1.5 pb-6 pt-1 text-[10px] text-neutral-600">หมายเหตุ</div>

      <div className="mt-8 flex gap-5">
        {[
          "ผู้ส่งคืน (สาขา)",
          "ผู้รับของ (คนขับรถ)",
          "ผู้ตรวจรับ (ครัวกลาง)",
        ].map((label) => (
          <div key={label} className="flex-1 text-center text-[10.5px] text-black">
            <div className="mb-1 h-[34px] border-b border-dotted border-black" />
            {label}
            <div className="mt-1 text-[9.5px] text-neutral-600">วันที่ ______________</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReturnFormPage() {
  const [copies, setCopies] = React.useState(5);

  function print() {
    logExport(copies);
    window.print();
  }

  return (
    <>
      {/* หน้าจอ — ตั้งค่าแล้วสั่งพิมพ์ */}
      <div className="mx-auto max-w-2xl px-4 py-4 pb-10 print:hidden">
        <PageTitle title="ใบส่งคืนสินค้า" right={<Badge tone="blue">A4 แนวตั้ง</Badge>} />

        <GlassCard className="mb-3">
          <p className="mb-3 text-[12.5px] leading-relaxed text-brand-ink/60">
            แบบฟอร์มเปล่าสำหรับเขียนมือ — พิมพ์เก็บไว้ที่สาขาเป็นปึก แล้วหยิบมาเขียนตอนมีของส่งคืน
            ใบละ 10 รายการ ถ้าไม่พอให้ใช้ใบที่ 2 ต่อ
          </p>
          <p className="mb-2 text-[11px] text-brand-ink/50">พิมพ์ครั้งนี้กี่ใบ</p>
          <div className="mb-3 flex gap-2">
            {COPY_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCopies(n)}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                  copies === n ? "bg-brand-red text-white" : "border border-black/10 bg-white/70 text-brand-ink"
                }`}
              >
                {n} ใบ
              </button>
            ))}
          </div>
          <Button onClick={print}>พิมพ์ใบส่งคืน</Button>
          <p className="mt-2 text-center text-[10.5px] leading-relaxed text-brand-ink/45">
            ในหน้าต่างพิมพ์ เลือกกระดาษ A4 · แนวตั้ง — ถ้าอยากถ่ายเอกสารต่อ พิมพ์ 1 ใบพอ
          </p>
        </GlassCard>

        {/* ตัวอย่างบนจอ — ใช้โครงเดียวกับใบพิมพ์จริง จะได้ไม่หลุดกัน */}
        <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">ตัวอย่าง</p>
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white p-5">
          <div className="min-w-[520px]">
            <Sheet last />
          </div>
        </div>
      </div>

      {/* ใบพิมพ์จริง */}
      <div className="hidden print:block">
        <style>{"@page { size: A4 portrait; margin: 14mm; }"}</style>
        {Array.from({ length: copies }, (_, i) => (
          <Sheet key={i} last={i === copies - 1} />
        ))}
      </div>
    </>
  );
}
