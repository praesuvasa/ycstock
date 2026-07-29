"use client";
// v1.19 · แถบ "หลังบันทึกเสร็จ" — บอกพนักงานว่าวันนี้เหลืออะไรอีกไหม (แพรขอ 2026-07-27)
//
// เจตนา: พนักงานกดบันทึกเสร็จแล้วมักไม่รู้ว่าจบงานหรือยัง ต้องเดาเอง/ถามกัน
// ถ้าครบแล้วให้บอกชัด ๆ ว่า "งานวันนี้ครบแล้ว" · ถ้ายังไม่ครบให้มีทางกลับไปดูว่าเหลืออะไร
//
// โหลดจาก /api/home ซึ่งเป็นเช็คลิสต์ของ "ทั้งสาขา" — เพื่อนทำไปแล้วก็นับให้
// แอดมิน/บัญชีที่ไม่ผูกสาขาจะได้ error จาก API → ไม่แสดงอะไรเลย (ไม่ใช่กลุ่มเป้าหมาย)
import React from "react";
import Link from "next/link";

interface HomeTask {
  key: string;
  label: string;
  href: string;
  status: "done" | "todo" | "due";
}

// noPrimary = หน้าที่เรียกมีปุ่ม "ไปทำงานถัดไป" ของตัวเองอยู่แล้ว (เช่นหน้าสต็อกที่ต้องไปยอดขายเสมอ)
// ตรงนี้เหลือแค่บอกว่าเหลืออะไรบ้าง จะได้ไม่มีปุ่มใหญ่ 2 อันชี้คนละทางในกล่องเดียวกัน
export function TodayNextStep({ show, hideTask, noPrimary }: { show: boolean; hideTask?: string; noPrimary?: boolean }) {
  const [data, setData] = React.useState<{ remaining: number; tasks: HomeTask[] } | null>(null);

  React.useEffect(() => {
    if (!show) return;
    let alive = true;
    fetch("/api/home")
      .then((r) => r.json())
      .then((d) => { if (alive && !d?.error) setData({ remaining: d.remaining ?? 0, tasks: d.tasks ?? [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [show]);

  if (!show || !data) return null;

  // งานที่เพิ่งบันทึกอาจยังไม่ทันสะท้อนใน API (เช่นบันทึกยอดขายเป็น 0 บาทจริง ๆ)
  // จึงตัดตัวเองออกจากลิสต์ที่โชว์ ไม่งั้นจะขึ้นว่า "ยังไม่ได้ทำ" ทั้งที่เพิ่งกดไป
  const left = data.tasks.filter((t) => t.status !== "done" && t.key !== hideTask);

  if (left.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-ok/30 bg-ok/10 px-4 py-4 text-center">
        <p className="text-[16px] font-semibold text-ok">งานวันนี้ครบแล้ว</p>
        <p className="mt-0.5 text-[12px] text-brand-ink/55">ขอบคุณสำหรับวันนี้</p>
      </div>
    );
  }

  // v1.24: พาไปงานถัดไปตรง ๆ (แพรขอ 2026-07-29 — "บันทึกสต็อกเสร็จแล้วให้ขึ้นว่าไปบันทึกยอดขายเหมือนเดิม")
  // ปุ่มหลัก = งานที่ค้างอันแรก · กลับหน้าหลักลดเป็นลิงก์รอง เพราะเป็นทางอ้อมกว่า
  const next = left[0];
  return (
    <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 px-4 py-3.5">
      <p className="text-[13.5px] font-medium">
        ยังเหลืออีก <span className="text-brand-red">{left.length}</span> อย่างที่ต้องทำวันนี้
      </p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-brand-ink/55">
        {left.map((t) => t.label).join(" · ")}
      </p>
      {!noPrimary && (
        <Link
          href={next.href}
          className="mt-2.5 block rounded-xl bg-brand-red px-4 py-3 text-center text-[14px] font-semibold text-white"
        >
          ไป{next.label} →
        </Link>
      )}
      <Link
        href="/"
        className="mt-1.5 block px-4 py-1.5 text-center text-[12px] font-medium text-brand-ink/55 underline underline-offset-2"
      >
        กลับไปเช็คที่หน้าหลัก
      </Link>
    </div>
  );
}
