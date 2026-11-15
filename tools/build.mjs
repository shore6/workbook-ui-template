// 使い方: node tools/build.mjs [科目...]
// subjects/<科目>/index.html が参照するローカルの CSS / JS をすべて埋め込み、
// dist/<科目>.html（1ファイルで動く。スマホに送る・LMS に置くのに便利）を作る。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ROOT, loadSubject, resolveSubjects } from "./load.mjs";

const isLocal = u => !/^(https?:)?\/\//.test(u);
const outDir = path.join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });

let failed = false;
for (const dir of resolveSubjects(process.argv.slice(2))) {
  const name = path.basename(dir);
  if (name.startsWith("_")) continue; // ひな形はビルドしない
  const Drill = loadSubject(dir);
  const { errors } = Drill.validate();
  if (errors.length) { console.error(`✕ ${name}: データエラーがあるため中止（npm run check で詳細）`); failed = true; continue; }

  const read = rel => readFileSync(path.resolve(dir, rel), "utf8");
  const conf = Drill._state.conf;
  let html = read("index.html")
    .replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => isLocal(href) ? `<style>\n${read(href)}</style>` : m)
    // </script> が中に含まれていてもタグが閉じないようにエスケープ
    .replace(/<script src="([^"]+)"><\/script>/g, (m, src) => isLocal(src) ? `<script>\n${read(src).replace(/<\/script/gi, "<\\/script")}</script>` : m)
    .replace(/<title>.*?<\/title>/, `<title>${conf.title}${conf.subtitle ? " " + conf.subtitle : ""}</title>`);
  const out = path.join(outDir, name + ".html");
  writeFileSync(out, html);
  console.log(`✓ ${path.relative(ROOT, out)}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  ${Drill.stats().total}問`);
}
process.exit(failed ? 1 : 0);
