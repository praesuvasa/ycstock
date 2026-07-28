// ── จดจำใบหน้าสำหรับลงเวลาเข้า-ออกงาน (v1.22) ──
//
// ใช้ AWS Rekognition แบบ collection: ลงทะเบียนใบหน้าครั้งเดียวต่อคน (IndexFaces)
// แล้วตอนลงเวลาส่งรูปไปค้นในคอลเลกชัน (SearchFacesByImage) ว่าตรงกับใคร
//
// ** ไม่เก็บรูปต้นฉบับไว้จับคู่ ** — AWS เก็บเป็นเวกเตอร์ตัวเลข (faceId) เท่านั้น
// รูปที่เก็บใน storage เป็นหลักฐานย้อนหลังของฝั่งเรา คนละเรื่องกับตัวที่ใช้เทียบ
//
// ยังไม่ตั้งค่า AWS ก็ไม่พัง — โยน error ที่อ่านรู้เรื่องกลับไปให้หน้าจอแสดง
import {
  RekognitionClient,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  CreateCollectionCommand,
  DescribeCollectionCommand,
} from "@aws-sdk/client-rekognition";

export const FACE_MATCH_THRESHOLD = 92; // % ความเหมือนขั้นต่ำที่ยอมให้ผ่าน

export class FaceNotConfiguredError extends Error {
  constructor() {
    super("ยังไม่ได้ตั้งค่า AWS สำหรับสแกนใบหน้า — ใส่ค่า AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION ที่ Vercel ก่อน");
    this.name = "FaceNotConfiguredError";
  }
}

// ตัดช่องว่าง/บรรทัดใหม่/เครื่องหมายคำพูดที่ติดมาตอน copy-paste เสมอ
// AWS เอาค่าไปต่อเป็น Authorization header ตรง ๆ ถ้ามีอักขระแปลกปนจะพังด้วย error
// "Invalid key=value pair (missing equal-sign) in Authorization header" ซึ่งอ่านแล้วไม่มีทางเดาถูกว่าเกิดจากช่องว่าง
const envClean = (v: string | undefined): string =>
  (v ?? "").trim().replace(/^["']|["']$/g, "");

export const faceConfigured = (): boolean =>
  !!(envClean(process.env.AWS_ACCESS_KEY_ID) && envClean(process.env.AWS_SECRET_ACCESS_KEY) && envClean(process.env.AWS_REGION));

const COLLECTION = envClean(process.env.REKOGNITION_COLLECTION_ID) || "yc-staff-faces";

let client: RekognitionClient | null = null;
function rk(): RekognitionClient {
  if (!faceConfigured()) throw new FaceNotConfiguredError();
  if (!client) {
    client = new RekognitionClient({
      region: envClean(process.env.AWS_REGION),
      credentials: {
        accessKeyId: envClean(process.env.AWS_ACCESS_KEY_ID),
        secretAccessKey: envClean(process.env.AWS_SECRET_ACCESS_KEY),
      },
    });
  }
  return client;
}

// สร้าง collection ให้เองครั้งแรก — จะได้ไม่ต้องไปกดสร้างใน console
async function ensureCollection(): Promise<void> {
  try {
    await rk().send(new DescribeCollectionCommand({ CollectionId: COLLECTION }));
  } catch (e: any) {
    if (e?.name !== "ResourceNotFoundException") throw e;
    await rk().send(new CreateCollectionCommand({ CollectionId: COLLECTION }));
  }
}

const toBytes = (base64: string): Uint8Array =>
  Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");

/** ลงทะเบียนใบหน้าของคนคนหนึ่ง — คืน faceId ที่ต้องเก็บไว้ในตาราง users */
export async function enrollFace(userId: string, imageBase64: string): Promise<string> {
  await ensureCollection();
  const res = await rk().send(new IndexFacesCommand({
    CollectionId: COLLECTION,
    ExternalImageId: userId,
    Image: { Bytes: toBytes(imageBase64) },
    MaxFaces: 1,
    QualityFilter: "AUTO",
    DetectionAttributes: [],
  }));
  const rec = res.FaceRecords?.[0];
  if (!rec?.Face?.FaceId) {
    // ไม่เจอหน้า/รูปไม่ชัด — บอกให้ถ่ายใหม่ ดีกว่าปล่อยให้ลงทะเบียนด้วยรูปที่ใช้ไม่ได้
    throw new Error("ไม่พบใบหน้าในรูป หรือรูปไม่ชัดพอ — ถ่ายใหม่ในที่สว่าง หันหน้าตรง ไม่ใส่หมวก/แมสก์");
  }
  return rec.Face.FaceId;
}

/** ลบใบหน้าที่ลงทะเบียนไว้ (ลาออก / ลงทะเบียนใหม่) */
export async function deleteFace(faceId: string): Promise<void> {
  await rk().send(new DeleteFacesCommand({ CollectionId: COLLECTION, FaceIds: [faceId] }));
}

/**
 * ค้นว่ารูปนี้ตรงกับใครบ้าง — คืนรายชื่อที่ผ่านเกณฑ์ทั้งหมด เรียงจากคล้ายที่สุด
 *
 * ** ต้องคืนหลายรายการ ไม่ใช่รายการเดียว ** เพราะคนหนึ่งคนมีได้หลายบัญชี
 * (แพรมีทั้งบัญชีแอดมินและบัญชีทดสอบ — หน้าเดียวกันอยู่ในระบบ 2 รายการ)
 * ถ้าเอาแค่ตัวที่คล้ายที่สุดตัวเดียว จะสุ่มได้บัญชีอีกใบแล้วฟ้องว่า "ไม่ใช่เจ้าของบัญชี" ทั้งที่เป็นคนเดียวกัน
 */
export async function identifyFace(imageBase64: string): Promise<{ userId: string; similarity: number }[]> {
  await ensureCollection();
  try {
    const res = await rk().send(new SearchFacesByImageCommand({
      CollectionId: COLLECTION,
      Image: { Bytes: toBytes(imageBase64) },
      FaceMatchThreshold: FACE_MATCH_THRESHOLD,
      MaxFaces: 10,
    }));
    return (res.FaceMatches ?? [])
      .filter((m) => !!m.Face?.ExternalImageId)
      .map((m) => ({
        userId: m.Face!.ExternalImageId!,
        similarity: Math.round((m.Similarity ?? 0) * 10) / 10,
      }));
  } catch (e: any) {
    // ไม่เจอหน้าในรูปเลย AWS โยน InvalidParameterException — ไม่ใช่ระบบพัง แค่ถ่ายไม่ติดหน้า
    if (e?.name === "InvalidParameterException") return [];
    throw e;
  }
}
