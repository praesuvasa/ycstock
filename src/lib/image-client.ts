"use client";
// ย่อรูปฝั่ง browser ก่อนอัปโหลด (กันไฟล์ใหญ่จากกล้องมือถือ + ลด token ตอน OCR) — v1.7

export function resizeImageToBase64(file: File, maxDim = 1600, quality = 0.82): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas ไม่รองรับ")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("อ่านรูปไม่สำเร็จ")); };
    img.src = url;
  });
}
