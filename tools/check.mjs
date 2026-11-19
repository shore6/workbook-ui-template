// 使い方: node tools/check.mjs [科目...]
// 問題データの誤り（正解番号の範囲外・空欄の正解漏れ・節IDの打ち間違いなど）を検出する
import path from "node:path";
import { loadSubject, resolveSubjects } from "./load.mjs";

let failed = false;
for (const dir of resolveSubjects(process.argv.slice(2))) {
  const name = path.basename(dir);
  let Drill;
  try { Drill = loadSubject(dir); }
  catch (e) { console.error(`✕ ${name}: data.js の読み込みに失敗\n  ${e.stack.split("\n").slice(0, 2).join("\n  ")}`); failed = true; continue; }

  const { errors, warnings } = Drill.validate();
  const st = Drill.stats();
  const fmt = o => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(" ");
  console.log(`${errors.length ? "✕" : "✓"} ${name}  ${st.total}問`);
  console.log(`  形式  ${fmt(st.byType)}`);
  console.log(`  節    ${fmt(st.bySection)}`);
  console.log(`  出典  ${fmt(st.bySource)}`);
  if (Object.keys(st.byPast).length) console.log(`  過去問 ${fmt(st.byPast)}`);
  errors.forEach(e => console.log("  ERROR " + e));
  warnings.forEach(w => console.log("  warn  " + w));
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
