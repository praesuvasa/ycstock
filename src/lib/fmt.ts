// helper การแสดงผล
// แสดงสตางค์เมื่อมีเศษเท่านั้น (แพรทัก 2026-07-30)
// เดิมปัดเป็นจำนวนเต็มเสมอ — ยอด QR 4,616.50 กลายเป็น ฿4,617 แล้วอ่านเทียบกับสลิป/แอปธนาคารไม่ตรง
// ยอดกลม ๆ ยังขึ้นเหมือนเดิม (฿1,645) ไม่ต้องมี .00 ให้รก
export const baht = (n: number): string => {
  const v = Number(n) || 0;
  const hasCents = Math.abs(v - Math.round(v)) > 0.004;
  return "฿" + v.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
};

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * วันที่ "วันนี้" ตามเวลาไทย — ใช้ฝั่งเซิร์ฟเวอร์เป็นหลัก
 *
 * Vercel รันเป็น UTC ถ้าใช้ todayISO() ที่นั่น ช่วง 00:00–07:00 ตามเวลาไทยจะได้วันของเมื่อวาน
 * ซึ่งทำให้ตัดสินใจผิดได้ เช่นนับใบของ "พรุ่งนี้" เป็นใบที่ต้องยืนยันวันนี้
 */
export const todayBangkok = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

/** yyyy-mm-dd → dd/mm/yyyy (พ.ศ.ไม่แปลง เพื่อความชัด) */
export function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export const weekdayLabel = (w: "wed" | "sat"): string => (w === "wed" ? "วันพุธ" : "วันเสาร์");
