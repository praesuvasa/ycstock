// Seed data — จากไฟล์จริง BackOffice (Par Stock + ฟอร์มกรอก YC_Stock_Tracker)
// tuple: [name, category, unit, ...parPerBranch]  ยาว = 3 + BRANCHES.length
// ลำดับ par คอลัมน์ท้าย = ตามลำดับ BRANCHES ("SND"→"NVP"→"KCN")   (null = "-" ไม่ stock)
import type { Item, ParMap, CupSize, Branch } from "./types";
import { BRANCHES } from "./types";

type Row = [string, string, string, ...Array<number | null>];

const RAW: Row[] = [
  // Yogurt 1kg/Box (เต็ม+เศษ)
  ["Greek Yogurt 1kg", "Yogurt 1kg/Box", "1kg/Box", 6, 6, 3],
  ["Yuzu", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Kyoho", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Mint", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Vanilla", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Pineapple", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Biscoff", "Yogurt 1kg/Box", "1kg/Box", 2, 2, null],
  ["Overnight oats biscoff", "Yogurt 1kg/Box", "1kg/Box", 1, 1, null],
  ["Plain Yogurt (ธรรมชาติ)", "Yogurt 1kg/Box", "1kg/Box", 6, 6, 3],
  // Yogurt 500g/Box (เต็ม+เศษ)
  ["Greek Yogurt 500g", "Yogurt 500g/Box", "500g/Box", 8, 12, 7],
  ["Plain Yogurt 500g", "Yogurt 500g/Box", "500g/Box", 2, 4, 2],
  // ACAI (special)
  ["R-ACAI Bowl", "ACAI", "Bowl", 15, 15, null],
  ["S-ACAI Cup (mini)", "ACAI", "Cup", 15, 15, null],
  // Soft Serve / Ice Cream
  ["น้ำ Ice cream / Soft Serve", "Soft Serve / Ice Cream", "2kg/Bag", null, 4, null],
  ["Granola โรย Ice cream", "Soft Serve / Ice Cream", "g.", null, 1, null],
  ["Softserve ถ้วยกระดาษ", "Soft Serve / Ice Cream", "ถ้วย", 5, 5, null],
  // Shake แข็ง (special)
  ["Shake (แช่แข็ง)", "Shake แข็ง", "ถ้วย", 80, 100, null],
  // Drink / แยมกระปุก
  ["Peanut Butter", "Drink / แยมกระปุก", "กระปุก", null, null, null],
  ["Water น้ำดื่ม", "Drink / แยมกระปุก", "ขวด", 12, 12, null],
  ["ถุงสตรอเบอรี่", "Drink / แยมกระปุก", "ถุง", 8, 12, 5],
  ["ถุงบลูเบอรี่", "Drink / แยมกระปุก", "ถุง", 8, 12, 5],
  ["ถุงธรรมชาติ", "Drink / แยมกระปุก", "ถุง", 10, 12, 5],
  ["ถุงลิ้นจี่", "Drink / แยมกระปุก", "ถุง", 8, 12, 5],
  ["ถุงยูส", "Drink / แยมกระปุก", "ถุง", 8, 12, 5],
  ["ถุงพีช", "Drink / แยมกระปุก", "ถุง", 5, 8, 5],
  // Cereals
  ["Cornflakes Malt (M)", "Cereals", "กระปุก", 4, 4, null],
  ["Granola (M)", "Cereals", "กระปุก", 4, 4, null],
  ["Choc Chip Cookies", "Cereals", "กระปุก", null, null, null],
  // Toppings
  ["Cookies Crumbs", "Toppings", "750g/pack", 1, 1, null],
  ["Oreo", "Toppings", "454g/pack", 2, 2, null],
  ["Choc Chips", "Toppings", "300g/pack", 1, 1, null],
  ["Cornflakes (Topping)", "Toppings", "1,000g/box", 1, 1, null],
  ["Granola (Topping)", "Toppings", "2,000g/box", 1, 1, null],
  ["Almond", "Toppings", "400g/pack", 1, 1, null],
  ["Pecan", "Toppings", "400g/pack", 1, 1, null],
  ["Walnut", "Toppings", "400g/pack", 1, 1, null],
  ["Coconut Chips", "Toppings", "130g/box", 0, 0, null], // Par เดิม 150 แพ็ค เป็นข้อมูลผิด (เหมือน Softserve Toppings)
  ["Chia Seed", "Toppings", "400g/pack", 1, 1, null],
  ["Flax Seed", "Toppings", "400g/pack", 1, 1, null],
  ["Cacao Nibs", "Toppings", "400g/pack", 1, 1, null],
  ["Grape Jelly", "Toppings", "1,000g/pack", 1, 1, null],
  ["Honey Jelly", "Toppings", "1,000g/pack", 1, 1, null],
  // Fruits
  ["Strawberry (250g)", "Fruits", "250g/box", 4, 4, null],
  ["Strawberry (500g)", "Fruits", "500g/box", null, null, null],
  ["Blueberry (125g)", "Fruits", "125g/box", null, null, null],
  ["Blueberry (300g)", "Fruits", "300g/box", 3, 3, null],
  ["Blueberry (500g)", "Fruits", "500g/box", null, null, null],
  ["Apple Cinnamon", "Fruits", "500g/pack", 1, 1, null],
  ["กล้วย", "Fruits", "ลูก", 0, 0, null],
  // Sauces
  ["Honey", "Sauces", "1,000g/bottle", 1, 1, null],
  ["Caramel", "Sauces", "1,000g/bottle", 1, 1, null],
  ["Peanut Butter Sauce", "Sauces", "1,000g/pack", 1, 1, null],
  // CUP/ถ้วย (cup reconcile)
  ["Cup P (5oz)", "CUP/ถ้วย", "50/pack", 1, 1, null],
  ["Cup S (9oz)", "CUP/ถ้วย", "50/pack", 2, 2, null],
  ["Small Bowl", "CUP/ถ้วย", "50/pack", 1, 1, null],
  ["Cup (14oz)", "CUP/ถ้วย", "50/pack", 2, 2, null],
  // TOPPING CUP
  ["Cup 3oz (Topping)", "TOPPING CUP", "50/pack", 2, 2, null],
  ["Cup+Lid (Big) 3oz", "TOPPING CUP", "50/pack", 2, 2, null],
  ["Cup+Lid (Small) 1oz", "TOPPING CUP", "50/pack", 2, 2, null],
  // LID/ฝา
  ["Bowl Lid", "LID/ฝา", "50/pack", 2, 2, null],
  ["Smoothies Lid", "LID/ฝา", "50/pack", 2, 2, null],
  ["Lid S (92)", "LID/ฝา", "50/pack", 2, 2, null],
  ["Lid Top / Lid P (75)", "LID/ฝา", "50/pack", 2, 2, null],
  // SPOON/ช้อน
  ["Wood Spoon in bag", "SPOON/ช้อน", "100/pack", 1, 1, null],
  ["Wood Spoon", "SPOON/ช้อน", "100/pack", 3, 3, null],
  ["Tester Spoon ช้อนชิม", "SPOON/ช้อน", "100/pack", 1, 1, null],
  ["Short Spoon (ช้อนถ้วยP)", "SPOON/ช้อน", "100/pack", 2, 2, null],
  ["Straw/หลอด - ใหญ่", "SPOON/ช้อน", "100/pack", 2, 2, null],
  ["Straw/หลอด - เล็ก", "SPOON/ช้อน", "100/pack", 1, 1, null],
  // BAG/ถุง
  ["Fail Bag ถุงฟลอย", "BAG/ถุง", "ใบ", 2, 2, null],
  ["ถุงกระดาษแก้วเดี่ยว", "BAG/ถุง", "ใบ", 40, 40, null],
  ["ถุงกระดาษแก้วคู่", "BAG/ถุง", "ใบ", 40, 40, null],
  ["ถุงกระดาษใหญ่", "BAG/ถุง", "ใบ", 30, 30, null],
  ["กระดาษกันหก", "BAG/ถุง", "ห่อ (500ชิ้น)", 1, 1, null],
  ["ฟอยล์แก้ว", "BAG/ถุง", "อัน", 30, 30, null],
  ["ฐานรองแก้วเดี่ยว", "BAG/ถุง", "อัน", 40, 40, null],
  ["ฐานรองแก้ว (คู่)", "BAG/ถุง", "อัน", 30, 30, null],
  ["Zip Bag Small / ถุงซิป", "BAG/ถุง", "Pack", 1, 1, null],
  ["Bag 4x14", "BAG/ถุง", "Pack", 2, 2, null],
  ["Bag 6x14", "BAG/ถุง", "Pack", 2, 2, null],
  ["Bag 8x14", "BAG/ถุง", "Pack", 2, 2, null],
  ["Bag 9x14", "BAG/ถุง", "Pack", 2, 2, null],
  // STICKER
  ["Bag Sticker สติ๊กเกอร์ลิ้น", "STICKER", "Sheet", 4, 4, null],
  ["Sticker Roll (สก๊อตเทป)", "STICKER", "Roll", 2, 2, null],
  // ของใช้
  ["Print Paper กระดาษปริ้น", "ของใช้", "Roll", 3, 3, null],
  ["Gloves YG / ถุงมือ", "ของใช้", "Box", 1, 1, null],
  ["Black Bag 30x40 / ถุงขยะ", "ของใช้", "Roll", 1, 1, null],
  ["Dry Tissue / ทิชชู่แห้ง", "ของใช้", "Pack", 3, 3, null],
  ["Wet Tissue / ทิชชู่เปียก", "ของใช้", "Pack", 2, 2, null],
  ["Tissue ทิชชู่ลูกค้า", "ของใช้", "Pack", 1, 1, null],
  // น้ำยาทำความสะอาด
  ["น้ำยาถูพื้น", "น้ำยาทำความสะอาด", "ขวด", 1, 1, null],
  ["น้ำยาตัดไขมัน", "น้ำยาทำความสะอาด", "ขวด", 1, 1, null],
  ["น้ำยาล้างจาน", "น้ำยาทำความสะอาด", "แพค", 1, 1, null],
  ["น้ำยาอเนกประสงค์", "น้ำยาทำความสะอาด", "ขวด", 1, 1, null],
  ["น้ำยาล้างเครื่องไอดิม", "น้ำยาทำความสะอาด", "ห่อ", 1, 1, null],
  // Smoothies (Pre-packed) (special)
  ["Wake up call (Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20, null],
  ["Energy Sip (Straw+Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20, null],
  ["Yellow Madness (Pineapple+Mango+Passion)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20, null],
  ["Ready to Glow (Straw+Blue+Banana)", "Smoothies (Pre-packed)", "10ถุง/Pack", 20, 20, null],
  // Yogurt Smoothies Powder
  ["ผงโกโก้ (COCOA)", "Yogurt Smoothies Powder", "Bag", 1, 1, null],
  ["ผงมาคิ (MAQUI)", "Yogurt Smoothies Powder", "Bag", 1, 1, null],
  ["ผงคาม (CAMU)", "Yogurt Smoothies Powder", "Bag", 1, 1, null],
  ["น้ำเชื่อม (Syrup)", "Yogurt Smoothies Powder", "Bottle", 1, 1, null],
  // Yogurt Shake
  ["Biscoff Spread เล็ก", "Yogurt Shake", "Bottle", 2, 2, null],
  ["Biscoff Spread ใหญ่", "Yogurt Shake", "Bottle", null, null, null],
  ["ซอส Chocolate", "Yogurt Shake", "500/Bag", 1, 1, null],
  ["ซอส Strawberry", "Yogurt Shake", "500/Bag", 1, 1, null],
  ["ปีโป้", "Yogurt Shake", "40 อัน/Bag", 1, 1, null],
  ["ปีโป้ลิ้นจี่", "Yogurt Shake", "กล่อง", 1, 1, null],
  // Softserve Toppings — Par ตั้งเป็น 0 แพ็ค (ไม่ใช่ 300) เพราะระบบยังไม่มี Par แบบกรัมแยกต่างหาก
  ["พิสตาชิโอ้เครป", "Softserve Toppings", "กรัม", null, 0, null],
  ["พิสตาชิโอ้บัตเตอร์", "Softserve Toppings", "กรัม", null, 0, null],
  ["พิสตาชิโอ้ท๊อปปิ้ง", "Softserve Toppings", "กรัม", null, 0, null],
  // เพิ่มท้ายสุด (ไม่แทรกกลาง) กัน id ของไอเทมเดิมเลื่อน — เหมือน Choc Chip Cookies (ยังไม่ตั้ง Par)
  ["Cranberry Cookies", "Cereals", "กระปุก", null, null, null],
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

// กลุ่มเศษรวม (default) — สินค้าหลายขนาดที่แกะแล้วเศษปนกัน แชร์เศษก้อนเดียว (กรัมต่อกล่อง = ขนาด)
// [group, gramsPerBox]
const REMAINDER_GROUP: Record<string, [string, number]> = {
  "Strawberry (250g)": ["Strawberry", 250], "Strawberry (500g)": ["Strawberry", 500],
  "Blueberry (125g)": ["Blueberry", 125], "Blueberry (300g)": ["Blueberry", 300], "Blueberry (500g)": ["Blueberry", 500],
};

const slug = (i: number) => "it-" + String(i + 1).padStart(3, "0");

export const ITEMS: Item[] = RAW.map(([name, category, unit], i) => {
  const qty = UOM1_QTY[name];
  const grp = REMAINDER_GROUP[name];
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
    // grouped item: gramsPerUOM = ขนาดกล่อง (ใช้คิดเศษรวม) แม้ UOM=2
    gramsPerUOM: hasRemainder ? qty : grp ? grp[1] : 0,
    remainderGroup: grp ? grp[0] : undefined,
    sort: i,
  };
});

export const PAR: ParMap = Object.fromEntries(
  RAW.map((row, i) => {
    const [, , , ...pars] = row;
    const byBranch = Object.fromEntries(
      BRANCHES.map((b, bi) => [b, pars[bi] ?? null])
    ) as Record<Branch, number | null>;
    return [slug(i), byBranch];
  })
);

export const CATEGORIES: string[] = [...new Set(ITEMS.map((it) => it.category))];
