// 使い方: node tools/new.mjs <科目フォルダ名>
// subjects/_template をコピーして新しい科目を作る
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./load.mjs";

const name = process.argv[2];
if (!name || !/^[\w.-]+$/.test(name)) { console.error("使い方: npm run new -- <科目フォルダ名（英数字・-_.）>"); process.exit(1); }
const dest = path.join(ROOT, "subjects", name);
if (existsSync(dest)) { console.error(`既に存在します: subjects/${name}`); process.exit(1); }
cpSync(path.join(ROOT, "subjects/_template"), dest, { recursive: true });
const data = path.join(dest, "data.js");
writeFileSync(data, readFileSync(data, "utf8").replace('storageKey: "my-subject-v1"', `storageKey: "${name}-v1"`));
console.log(`作成しました: subjects/${name}/\n  1. data.js を編集\n  2. npm run check -- ${name}\n  3. npm run build -- ${name}  → dist/${name}.html`);
