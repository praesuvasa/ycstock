// สร้าง SQL seed ของ items + par_levels จาก single source of truth (src/lib/seed-data.ts)
// รัน: node --experimental-strip-types scripts/gen-seed.mjs > supabase/seed-items.sql
// (seed-data.ts มี import แบบ type-only เท่านั้น จึงถูก strip ได้)
import { ITEMS, PAR } from "../src/lib/seed-data.ts";
import { BRANCHES } from "../src/lib/types.ts";

const esc = (s) => String(s).replace(/'/g, "''");
const bool = (b) => (b ? "true" : "false");
const nn = (v) => (v == null ? "null" : v);

let out = "-- generated from src/lib/seed-data.ts\n";
out += "insert into items (id,name,category,unit,is_special,is_cup,cup_size,has_remainder,grams_per_uom,remainder_group,sort) values\n";
out += ITEMS.map((it) =>
  `('${it.id}','${esc(it.name)}','${esc(it.category)}','${esc(it.unit)}',${bool(it.isSpecial)},${bool(it.isCup)},${it.cupSize ? `'${it.cupSize}'` : "null"},${bool(it.hasRemainder)},${it.gramsPerUOM},${it.remainderGroup ? `'${esc(it.remainderGroup)}'` : "null"},${it.sort})`
).join(",\n") + "\non conflict (id) do update set has_remainder=excluded.has_remainder, grams_per_uom=excluded.grams_per_uom, remainder_group=excluded.remainder_group;\n\n";

out += "insert into par_levels (item_id,branch_id,level) values\n";
const rows = [];
for (const it of ITEMS) {
  for (const b of BRANCHES) rows.push(`('${it.id}','${b}',${nn(PAR[it.id][b])})`);
}
out += rows.join(",\n") + "\non conflict (item_id,branch_id) do update set level = excluded.level;\n";

process.stdout.write(out);
