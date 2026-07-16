// Unit tests สำหรับ business logic (lib/calc)
// รัน: node --test --experimental-strip-types
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  remainPieces, remainGrams, variance, restockNeed, isSpecialActive, cupReconcile,
} from "../src/lib/calc.ts";

test("remainPieces = carry + in - used, ไม่ต่ำกว่า 0", () => {
  assert.equal(remainPieces(6, 4, 2), 8);
  assert.equal(remainPieces(2, 0, 5), 0); // ไม่ติดลบ
  assert.equal(remainPieces("", "", ""), 0);
});

test("remainGrams = MAX(carryG + inG - used, 0)", () => {
  assert.equal(remainGrams(1000, 500, 300), 1200);
  assert.equal(remainGrams(100, 0, 500), 0);
});

test("variance = carry + in - used - returned - remain", () => {
  assert.equal(variance(6, 4, 2, 0, 8), 0);   // ตรง
  assert.equal(variance(6, 4, 2, 0, 7), 1);   // ไม่ตรง
});

test("restockNeed = MAX(par - remain, 0); par null -> null", () => {
  assert.equal(restockNeed(6, 4), 2);
  assert.equal(restockNeed(6, 6), 0);
  assert.equal(restockNeed(6, 9), 0);
  assert.equal(restockNeed(null, 4), null);
});

test("isSpecialActive: SND=เสาร์, NVP=พุธ, KCN=พุธ+เสาร์", () => {
  assert.equal(isSpecialActive("SND", "sat"), true);
  assert.equal(isSpecialActive("SND", "wed"), false);
  assert.equal(isSpecialActive("NVP", "wed"), true);
  assert.equal(isSpecialActive("NVP", "sat"), false);
  assert.equal(isSpecialActive("KCN", "wed"), true);
  assert.equal(isSpecialActive("KCN", "sat"), true);
});

test("cupReconcile: balanced เมื่อรายขนาดตรงหมด", () => {
  const r = cupReconcile([
    { size: "P", start: 100, in: 0, remain: 60, sold: 40 },
    { size: "S", start: 50, in: 0, remain: 30, sold: 20 },
  ]);
  assert.equal(r.balanced, true);
  assert.equal(r.swapLikely, false);
  assert.equal(r.totalDiff, 0);
});

test("cupReconcile: swapLikely เมื่อรวมตรงแต่รายขนาดเพี้ยน (สลับขนาด)", () => {
  const r = cupReconcile([
    { size: "P", start: 100, in: 0, remain: 60, sold: 45 }, // used 40, sold 45 → -5
    { size: "S", start: 50, in: 0, remain: 30, sold: 15 },  // used 20, sold 15 → +5
  ]);
  assert.equal(r.balanced, false);
  assert.equal(r.totalDiff, 0);
  assert.equal(r.swapLikely, true);
});

test("cupReconcile: ยอดรวมไม่ตรง (ไม่ใช่แค่สลับ)", () => {
  const r = cupReconcile([
    { size: "P", start: 100, in: 0, remain: 50, sold: 40 }, // used 50, sold 40 → +10
  ]);
  assert.equal(r.totalDiff, 10);
  assert.equal(r.swapLikely, false);
  assert.equal(r.balanced, false);
});
