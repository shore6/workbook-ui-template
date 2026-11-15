// エンジンと data.js を Node の vm で読み込み、Drill オブジェクトを返す（DOM 不要）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadSubject(dir) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(ROOT, "src/drill.js"), "utf8"), ctx, { filename: "drill.js" });
  const dataPath = path.join(dir, "data.js");
  vm.runInContext(readFileSync(dataPath, "utf8"), ctx, { filename: dataPath });
  return ctx.Drill;
}

/** 引数（科目フォルダ名 or パス）を解決。省略時は subjects/ 以下の全科目 */
import { readdirSync, existsSync } from "node:fs";
export function resolveSubjects(args) {
  if (args.length) return args.map(a => existsSync(path.join(a, "data.js")) ? path.resolve(a) : path.join(ROOT, "subjects", a));
  return readdirSync(path.join(ROOT, "subjects"), { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => path.join(ROOT, "subjects", d.name));
}
