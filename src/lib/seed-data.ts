// Seed data — จากไฟล์จริง BackOffice (Par Stock + ฟอร์มกรอก YC_Stock_Tracker)
// tuple: [name, category, unit, parSND, parNVP]   (null = "-" ไม่ stock)
import type { Item, ParMap, CupSize } from "./types";

type Row = [string, string, string, number | null, number | null];

const RAW: Row[] = [
  // Yogurt 1kg/Box (เต็ม+เศษ)
  ["Greek Yogurt 1kg", "Yogurt 1kg/Box", "1kg/Box", 6, 6],
  ["Yuzu", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Kyoho", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Mint", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Vanilla", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Pineapple", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Biscoff", "Yogurt 1kg/Box", "1kg/Box", 2, 2],
  ["Overnight oats biscoff", "Yogurt 1kg/Box", "1kg/Box", 1, 1],
  ["Plain Yogurt (ธรรมชาติ)", "Yogurt 1kg/Box", "1kg/Box", 6, 6],
  // Yogurt 500g/Box (เต็ม+เศษ)
  ["Greek Yogurt 500g", "Yogurt 500g/Box", "500g/Box", 8, 12],
  ["Plain Yogurt 500g", "Yogurt 500g/Box", "500g/Box", 2, 4],
  // ACAI (special)
  ["R-ACAI Bowl", "ACAI", "Bowl", 15, 15],
  ["S-ACAI Cup (mini)", "ACAI", "Cup", 15, 15],
  // Soft Serve / Ice Cream
  ["น้ำ Ice cream / Soft Serve", "Soft Serve / Ice Cream", "2kg/Bag", null, 4],
  ["Granola โรย Ice cream", "Soft Serve / Ice Cream", "g.", null, 1],
  // Softserve TH
  ["Softserve ถ้วยกระดาษ", "Softserve TH", "ถ้วย", null, null],
  // Shake แข็ง (special)
  ["Shake (แช่แข็ง)", "Shake แข็ง", "ถ้วย", 80, 100],
  // Drink / แยมกระปุก
  ["Peanut Butter", "Drink / แยมกระปุก", "กระปุก", null, null],
  ["Water น้ำดื่ม", "Drink / แยมกระปุก", "ขวด", 12, 12],
  ["ถุงสตรอเบอรี่", "Drink / แยมกระปุก", "ถุง", 8, 12],
  ["ถุงบลูเบอรี่", "Drink / แยมกระปุก", "ถุง", 8, 12],
  ["ถุงธรรมชาติ", "Drink / แยมกระปุก", "ถุง", 10, 12],
  ["ถุงลิ้นจี่", "Drink / แยมกระปุก", "ถุง", 8, 12],
  ["ถุงยูส", "Drink / แยมกระปุก", "ถุง", 8, 12],
  ["ถุงพีช", "Drink / แยมกระปุก", "ถุง", 5, 8],
  // Cereals
  ["Cornflakes Malt (M)", "Cereals", "กระปุก", 4, 4],
  ["Granola (M)", "Cereals", "กระปุก", 4, 4],
  ["Choc Chip Cookies", "Cereals", "กระปุก", null, null],
  // Toppings
  ["Cookies Crumbs", "Toppings", "750g/pack", 1, 1],
  ["Oreo", "Toppings", "454g/pack", 2, 2],
  ["Choc Chips", "Toppings", "300g/pack", 1, 1],
  ["Cornflakes (Topping)", "Toppings", "1,000g/box", 1, 1],
  ["Granola (Topping)", "Toppings", "2,000g/box", 1, 1],
  ["Almond", "Toppings", "400g/pack", 1, 1],
  ["Pecan", "Toppings", "400g/pack", 1, 1],
  ["Walnut", "Toppings", "400g/pack", 1, 1],
  ["Coconut Chips", "Toppings", "130g/box", 150, 150],
  ["Chia Seed", "Toppings", "400g/pack", 1, 1],
  ["Flax Seed", "Toppings", "400g/pack", 1, 1],
  ["Cacao Nibs", "Toppings", "400g/pack", 1, 1],
  ["Grape Jelly", "Toppings", "1,000g/pack", 1, 1],
  ["Honey Jelly", "Toppings", "1,000g/pack", 1, 1],
  // Fruits
  ["Strawberry (250g)", "Fruits", "250g/box", 4, 4],
  ["Strawberry (500g)", "Fruits", "500g/box", null, null],
  ["Blueberry (125g)", "Fruits", "125g/box", null, null],
  ["Blueberry (300g)", "Fruits", "300g/box", 3, 3],
  ["Blueberry (500g)", "Fruits", "500g/box", null, null],
  ["Apple Cinnamon", "Fruits", "500g/pack", 1, 1],
  ["Banana", "Fruits", "ชิ้น", null, null],
  // Sauces
  ["Honey", "Sauces", "1,000g/bottle", 1, 1],
  ["Caramel", "Sauces", "1,000g/bottle", 1, 1],
  ["Peanut Butter Sauce", "Sauces", "1,000g/pack", 1, 1],
  // CUP/ถ้วย (cup reconcile)
  ["Cup P (5oz)", "CUP/ถ้วย", "50/pack", 1, 1],
  ["Cup S (9oz)", "CUP/ถ้วย", "50/pack", 2, 2],
  ["Small Bowl", "CUP/ถ้วย", "50/pack", 1, 1],
  ["Cup (14oz)", "CUP/ถ้วย", "50/pack", 2, 2],
  // TOPPING CUP
  ["Cup 3oz (Topping)", "TOPPING CUP", "50/pack", 2, 2],
  ["Cup+Lid (Big) 3oz", "TOPPING CUP", "50/pack", 2, 2],
  ["Cup+Lid (Small) 1oz", "TOPPING CUP", "50/pack", 2, 2],
  // LID/ฝา
  ["Bowl Lid", "LID/ฝา", "50/pack", 2, 2],
  ["Smoothies Lid", "LID/ฝา", "50/pack", 2, 2],
  ["Lid S (92)", "LID/ฝา", "50/pack", 2, 2],
  ["Lid Top / Lid P (75)", "LID/ฝา", "50/pack", 2, 2],
  // SPOON/ช้อน
  ["Wood Spoon in bag", "SPOON/ช้อน", "100/pack", 1, 1],
  ["Wood Spoon", "SPOON/ช้อน", "100/pack", 3, 3],
  ["Tester Spoon ช้อนชิม", "SPOON/ช้อน", "100/pack", 1, 1],
  ["Short Spoon (ช้อนถ้วยP)", "SPOON/ช้อน", "100/pack", 2, 2],
  ["Straw/หลอด - ใหญ่", "SPOON/ช้อน", "100/pack", 2, 2],
  ["Straw/หลอด - เล็ก", "SPOON/ช้อน", "100/pack", 1, 1],
  // BAG/ถุง
  ["Fail Bag ถุงฟลอย", "BAG/ถุง", "ใบ", 2, 2],
  ["ถุงกระดาษแก้วเดี่ยว", "BAG/ถุง", "ใบ", 40, 40],
  ["ถุงกระดาษแก้วคู่", "BAG/ถุง", "ใบ", 40, 40],
  ["ถุงกระดาษใหญ่", "BAG/ถุง", "ใบ", 30, 30],
  ["กระดาษกันหก", "BAG/ถุง", "ห่อ (500ชิ้น)", 1, 1],
  ["ฟอยล์แก้ว", "BAG/ถุง", "อัน", 30, 30],
  ["ฐานรองแก้วเดี่ยว", "BAG/ถุง", "อัน", 40, 40],
  ["ฐานรองแก้ว (คู่)", "BAG/ถุง", "อัน", 30, 30],
  ["Zip Bag Small / ถุงซิป", "BAG/ถุง", "Pack", 1, 1],
  ["Bag 4x14", "BAG/ถุง", "Pack", 2, 2],
  ["Bag 6x14", "BAG/ถุง", "Pack", 2, 2],
  ["Bag 8x14", "BAG/ถุง", "Pack", 2, 2],
  ["Bag 9x14", "BAG/ถุง", "Pack", 2, 2],
  // STICKER
  ["Bag Sticker สติ๊กเกอร์ลิ้น", "STICKER", "Sheet", 4, 4],
  ["Sticker Roll (สก๊อตเทป)", "STICKER", "Roll", 2, 2],
  // ของใช้
  ["Print Paper กระดาษปริ้น", "ของใช้", "Roll", 3, 3],
  ["Gloves YG / ถุงมือ", "ของใช้", "Box", 1, 1],
  ["Black Bag 30x40 / ถุงขยะ", "ของใช้", "Roll", 1, 1],
  ["Dry Tissue / ทิชชู่แห้ง", "ของใช้", "Pack", 3, 3],
  ["Wet Tissue / ทิชชู่เปียก", "ของใช้", "Pack", 2, 2],
  ["Tissue ทิชชู่ลูกค้า", "ของใช้", "Pack", 1, 1],
  // น้ำยาทำความสะอาด
  ["น้ำยาถูพื้น", "น้ำยาทำความสะอาด", "ขวด", 1, 1],
  ["น้ำยาตัดไขมัน", "น้ำยาทำความสะอาด", "ขวด", 1, 1],
  ["น้ำยาล้างจาน", "น้ำยาทำความสะอาด", "แพค", 1, 1],
  ["น้ำยาอเนกประสงค์", "น้ำยาทำความสะอาด", "ขวด", 1, 1],
  ["น้ำยาล้างเครื่องไอดิม", "น้ำยาทำความสะอาด", "ห่อ", 1, 1],
  // Smoothies (Pre-packed) (special)
  ["Wake up call (Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20],
  ["Energy Sip (Straw+Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20],
  ["Yellow Madness (Pineapple+Mango+Passion)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20],
  ["Ready to Glow (Straw+Blue+Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20],
  // Yogurt Smoothies Powder
  ["ผงโกโก้ (COCOA)", "Yogurt Smoothies Powder", "Bag", 1, 1],
  ["ผงมาคิ (MAQUI)", "Yogurt Smoothies Powder", "Bag", 1, 1],
  ["ผงคาม (CAMU)", "Yogurt Smoothies Powder", "Bag", 1, 1],
  ["น้ำเชื่อม (Syrup)", "Yogurt Smoothies Powder", "Bottle", 1, 1],
  // Yogurt Shake
  ["Biscoff Spread เล็ก", "Yogurt Shake", "Bottle", 2, 2],
  ["Biscoff Spread ใหญ่", "Yogurt Shake", "Bottle", null, null],
  ["ซอส Chocolate", "Yogurt Shake", "500/Bag", 1, 1],
  ["ซอส Strawberry", "Yogurt Shake", "500/Bag", 1, 1],
  ["ปีโป้", "Yogurt Shake", "40 อัน/Bag", 1, 1],
  ["ปีโป้ลิ้นจี่", "Yogurt Shake", "กล่อง", 1, 1],
  // Softserve Toppings
  ["พิสตาชิโอ้เครป", "Softserve Toppings", "กรัม", null, 300],
  ["พิสตาชิโอ้บัตเตอร์", "Softserve Toppings", "กรัม", null, 300],
  ["พิสตาชิโอ้ท๊อปปิ้ง", "Softserve Toppings", "กรัม", null, 300],
];

// 7 รายการ special (รอบเข้าของแยกวัน/สาขา) — match by name prefix
const SPECIAL_PREFIX = [
  "Shake (แช่แข็ง)", "R-ACAI Bowl", "S-ACAI Cup (mini)",
  "Wake up call", "Energy Sip", "Yellow Madness", "Ready to Glow",
];
const CUP_MAP: Record<string, CupSize> = {
  "Cup P (5oz)": "P", "Cup S (9oz)": "S", "Small Bowl": "BOWL", "Cup (14oz)": "14OZ",
};
// จาก Par Stock.xlsx — UOM=1 (ขายแบบแกะแยกได้) + จำนวน/แพค (หน่วยย่อยต่อ 1 แพ็ค)
// รายการที่ไม่อยู่ในนี้ = UOM=2 (ขายยกกล่อง/เต็มแพ็ค) · แก้ได้หน้า Settings
const UOM1_QTY: Record<string, number> = {
  "Greek Yogurt 1kg": 1000, "Yuzu": 1000, "Kyoho": 1000, "Mint": 1000, "Vanilla": 1000,
  "Pineapple": 1000, "Biscoff": 1000, "Overnight oats biscoff": 1000, "Plain Yogurt (ธรรมชาติ)": 1000,
  "น้ำ Ice cream / Soft Serve": 2000, "Granola โรย Ice cream": 1000,
  "Cookies Crumbs": 750, "Oreo": 454, "Choc Chips": 300, "Cornflakes (Topping)": 1000,
  "Granola (Topping)": 2000, "Almond": 400, "Pecan": 400, "Walnut": 400, "Coconut Chips": 130,
  "Chia Seed": 400, "Flax Seed": 400, "Cacao Nibs": 400, "Grape Jelly": 1000, "Honey Jelly": 1000,
  "Apple Cinnamon": 500, "Honey": 1000, "Caramel": 1000, "Peanut Butter Sauce": 1000,
  "Cup P (5oz)": 50, "Cup S (9oz)": 50, "Small Bowl": 50, "Cup (14oz)": 50,
  "ผงโกโก้ (COCOA)": 500, "ผงมาคิ (MAQUI)": 80, "ผงคาม (CAMU)": 100, "น้ำเชื่อม (Syrup)": 720,
  "Biscoff Spread เล็ก": 400, "Biscoff Spread ใหญ่": 1000, "ซอส Chocolate": 500, "ซอส Strawberry": 500,
  "ปีโป้": 40, "ปีโป้ลิ้นจี่": 560, "พิสตาชิโอ้เครป": 400, "พิสตาชิโอ้บัตเตอร์": 570, "พิสตาชิโอ้ท๊อปปิ้ง": 470,
};

const slug = (i: number) => "it-" + String(i + 1).padStart(3, "0");

export const ITEMS: Item[] = RAW.map(([name, category, unit], i) => {
  const qty = UOM1_QTY[name];
  const hasRemainder = qty != null; // UOM=1 = ขายแบบแกะ (มีเศษ)
  return {
    id: slug(i),
    name,
    category,
    unit,
    isSpecial: SPECIAL_PREFIX.some((p) => name.startsWith(p)),
    isCup: name in CUP_MAP,
    cupSize: CUP_MAP[name],
    hasRemainder,
    gramsPerUOM: hasRemainder ? qty : 0,
    sort: i,
  };
});

export const PAR: ParMap = Object.fromEntries(
  RAW.map(([, , , snd, nvp], i) => [slug(i), { SND: snd, NVP: nvp }])
);

export const CATEGORIES: string[] = [...new Set(ITEMS.map((it) => it.category))];
