"use client";
// v1.22 · ลงเวลาเข้า-ออกงานด้วยการสแกนหน้า
//
// เหตุผลที่ต้องสแกนหน้า (แพรระบุ): ถ้าใช้รหัสอย่างเดียว พนักงานบอกรหัสกันแล้วกดแทนกันได้
// และการเก็บรูปไว้เฉย ๆ ก็ไม่ช่วย เพราะไม่มีใครมานั่งไล่ดูรูปทั้งเดือน — ต้องปฏิเสธอัตโนมัติตั้งแต่ตอนกด
//
// กล้องเปิดเฉพาะตอนจะกดจริง แล้วปิดทันทีหลังถ่าย — ไม่ค้างไว้ทั้งหน้า
import React from "react";
import { useMe } from "@/components/nav";
import { GlassCard, PageTitle, Button, Badge } from "@/components/ui";

interface Status {
  settings: { enabled: boolean; requireFace: boolean; requireLocation: boolean };
  faceConfigured: boolean;
  enrolled: boolean;
  enrolledAt: string | null;
  open: { id: number; clockIn: string } | null;
  name: string;
  error?: string;
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

function useCamera() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [on, setOn] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const start = React.useCallback(async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setOn(true);
    } catch {
      setErr("เปิดกล้องไม่ได้ — กดอนุญาตให้แอปใช้กล้องในเบราว์เซอร์ก่อน");
    }
  }, []);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
  }, []);

  // ปิดกล้องเสมอเมื่อออกจากหน้า — ไม่งั้นไฟกล้องค้างจนพนักงานตกใจ
  React.useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const capture = React.useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 480; canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  return { videoRef, on, err, start, stop, capture };
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export default function TimeClockPage() {
  const me = useMe();
  const [st, setSt] = React.useState<Status | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const cam = useCamera();
  const [mode, setMode] = React.useState<"in" | "out" | "enroll" | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/time-clock").then((r) => r.json()).then(setSt).catch(() => {});
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function openCamera(next: "in" | "out" | "enroll") {
    setMsg(null);
    setMode(next);
    await cam.start();
  }

  function closeCamera() {
    cam.stop();
    setMode(null);
  }

  async function submit() {
    if (!mode) return;
    const image = st?.settings.requireFace || mode === "enroll" ? cam.capture() : null;
    if ((st?.settings.requireFace || mode === "enroll") && !image) {
      setMsg({ tone: "warn", text: "ถ่ายรูปไม่สำเร็จ ลองใหม่อีกครั้ง" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "enroll") {
        const res = await fetch("/api/time-clock/enroll", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: image }),
        });
        const d = await res.json();
        if (!res.ok || !d?.ok) throw new Error(d?.error ?? "ลงทะเบียนไม่สำเร็จ");
        setMsg({ tone: "ok", text: "ลงทะเบียนใบหน้าเรียบร้อย" });
      } else {
        const pos = st?.settings.requireLocation ? await getPosition() : await getPosition();
        const res = await fetch("/api/time-clock", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: mode, imageBase64: image, lat: pos?.lat, lng: pos?.lng }),
        });
        const d = await res.json();
        if (!res.ok || !d?.ok) throw new Error(d?.error ?? "ลงเวลาไม่สำเร็จ");
        setMsg({ tone: "ok", text: mode === "in" ? "บันทึกเวลาเข้างานแล้ว" : "บันทึกเวลาออกงานแล้ว" });
      }
      closeCamera();
      load();
    } catch (e: any) {
      setMsg({ tone: "warn", text: e?.message ?? "ทำรายการไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title="ลงเวลาเข้า-ออกงาน" />

      {!st.settings.enabled && (
        <div className="mb-3 rounded-xl border border-black/10 bg-black/[.03] px-3.5 py-3 text-[12px] leading-relaxed text-brand-ink/60">
          ระบบลงเวลายังไม่เปิดใช้งาน — ตอนนี้ทดสอบได้เฉพาะการลงทะเบียนใบหน้า
        </div>
      )}

      {!st.faceConfigured && (
        <div className="mb-3 rounded-xl border border-warn/35 bg-warn/[.08] px-3.5 py-3 text-[12px] leading-relaxed text-warn">
          ยังไม่ได้ตั้งค่า AWS สำหรับสแกนใบหน้า — ใส่ AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION ที่ Vercel ก่อน
        </div>
      )}

      {msg && (
        <div className={`mb-3 rounded-xl px-3.5 py-3 text-[13px] font-medium ${
          msg.tone === "ok" ? "border border-ok/35 bg-ok/10 text-ok" : "border border-warn/35 bg-warn/10 text-warn"
        }`}>
          {msg.text}
        </div>
      )}

      <GlassCard className="mb-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-[15px] font-semibold">{st.name}</p>
            <p className="text-[11.5px] text-brand-ink/50">สาขา {me?.branchScope}</p>
          </div>
          {st.open
            ? <Badge tone="ok">เข้างานแล้ว {timeOf(st.open.clockIn)}</Badge>
            : <Badge tone="neutral">ยังไม่ได้เข้างาน</Badge>}
        </div>

        {mode ? (
          <div className="grid gap-2">
            <div className="overflow-hidden rounded-2xl bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={cam.videoRef} playsInline muted className="mx-auto block aspect-square w-full max-w-[280px] object-cover" />
            </div>
            {cam.err && <p className="text-[12px] text-warn">{cam.err}</p>}
            <p className="text-center text-[11.5px] text-brand-ink/55">
              หันหน้าตรง อยู่ในที่สว่าง ไม่ใส่หมวกหรือแมสก์
            </p>
            <Button onClick={submit} disabled={busy || !cam.on}>
              {busy ? "กำลังตรวจ…" : mode === "enroll" ? "บันทึกใบหน้า" : mode === "in" ? "ยืนยันเข้างาน" : "ยืนยันออกงาน"}
            </Button>
            <Button variant="ghost" onClick={closeCamera}>ยกเลิก</Button>
          </div>
        ) : (
          <div className="grid gap-2">
            {!st.enrolled ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-brand-ink/60">
                  ยังไม่ได้ลงทะเบียนใบหน้า — ทำครั้งเดียว แล้วใช้ลงเวลาได้ตลอด
                  <span className="mt-1 block text-[11.5px] text-brand-ink/45">
                    ลงทะเบียนแล้วแก้เองไม่ได้ ถ่ายให้ชัดตั้งแต่ครั้งแรก
                  </span>
                </p>
                <Button onClick={() => openCamera("enroll")} disabled={!st.faceConfigured}>
                  ลงทะเบียนใบหน้า
                </Button>
              </>
            ) : st.open ? (
              <Button onClick={() => openCamera("out")} disabled={!st.settings.enabled}>
                ออกงาน
              </Button>
            ) : (
              <Button onClick={() => openCamera("in")} disabled={!st.settings.enabled}>
                เข้างาน
              </Button>
            )}

            {/* ไม่มีปุ่มลงทะเบียนใหม่โดยตั้งใจ — ถ้าแก้เองได้ ใครรู้รหัสของอีกคนก็เปลี่ยนเป็นหน้าตัวเองได้ */}
            {st.enrolled && (
              <p className="text-[11px] leading-relaxed text-brand-ink/40">
                ลงทะเบียนใบหน้าแล้ว · แก้เองไม่ได้ — ถ้าสแกนไม่ผ่าน (ตัดผม ใส่แว่น) แจ้งแอดมินให้รีเซ็ตให้
              </p>
            )}
          </div>
        )}
      </GlassCard>

      <p className="px-1 text-[11px] leading-relaxed text-brand-ink/45">
        ระบบเก็บเฉพาะข้อมูลที่ใช้เทียบใบหน้า ไม่ได้เก็บรูปไว้ดูย้อนหลัง ·
        ใช้เพื่อยืนยันว่าคนลงเวลาคือเจ้าของบัญชีจริงเท่านั้น
      </p>
    </div>
  );
}
