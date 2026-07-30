"use client";
// /yogi — หน้าหลักของฝ่ายผลิต (v1.25)
//
// ไม่มี POS / ยอดขาย / เปิด-ปิดร้าน ตามที่แพรกำหนด — งานผลิตไม่ได้ปิดยอดรายวันเหมือนหน้าร้าน
// ตอนนี้มีของจริงให้ใช้แค่ "ลงเวลาเข้า-ออกงาน" · เมนูงานผลิต (สต็อกกลาง · วัตถุดิบ · บันทึกการผลิต)
// ยังไม่ได้ทำ — เขียนบอกไว้ตรง ๆ ดีกว่าโชว์เมนูที่กดแล้วว่าง
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, PageTitle } from "@/components/ui";
import { useMe } from "@/components/nav";

export default function YogiHomePage() {
  const me = useMe();
  const router = useRouter();

  // พนักงานหน้าร้านหลุดเข้ามา → ส่งกลับหน่วยตัวเอง (แอดมินดูได้ทุกหน่วย ไม่ต้องเด้ง)
  React.useEffect(() => {
    if (me && me.workUnit !== "production" && me.role !== "admin") router.replace("/store");
  }, [me, router]);

  if (!me) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-6 w-1.5 rounded-full bg-brand-yogi" />
        <PageTitle title="ฝ่ายผลิต" />
      </div>

      <GlassCard className="mb-3">
        <p className="text-[13.5px] font-medium">สวัสดี {me.name}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink/55">
          หน่วยงาน: ฝ่ายผลิต · งานที่ทำในระบบนี้ไม่มีการปิดยอดรายวันเหมือนหน้าร้าน
        </p>
        <Link
          href="/time-clock"
          className="mt-3 block rounded-xl bg-brand-yogi px-4 py-3 text-center text-[15px] font-semibold text-white"
        >
          ลงเวลาเข้า-ออกงาน →
        </Link>
      </GlassCard>

      <GlassCard>
        <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">เมนูฝ่ายผลิตที่กำลังทำ</p>
        <ul className="mt-2 grid gap-1.5 text-[12.5px] leading-relaxed text-brand-ink/60">
          <li>· เช็คสต็อกกลาง (หน้าร้านดึงยอดจากที่นี่)</li>
          <li>· เช็คสต็อกวัตถุดิบ</li>
          <li>· บันทึกค่าการผลิต</li>
        </ul>
        <p className="mt-2.5 border-t border-black/[.06] pt-2.5 text-[11.5px] leading-relaxed text-brand-ink/45">
          ยังไม่เปิดใช้ — จะแจ้งเมื่อพร้อม ระหว่างนี้ลงเวลาเข้า-ออกงานได้ตามปกติ
        </p>
      </GlassCard>
    </div>
  );
}
