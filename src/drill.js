/* =====================================================================
   Drill engine — 1ファイルで動く暗記・演習ドリルの共通部分
   科目ごとの data.js は、このファイルの後に読み込んで Drill.* を呼ぶだけ。
   ===================================================================== */
(function (root) {
"use strict";

// ---------------------------------------------------------------------
// 1. データ登録 API（data.js から呼ぶ）
// ---------------------------------------------------------------------
const S = {
  conf: {
    title: "ドリル",
    subtitle: "",
    footer: "",
    storageKey: "",            // 空なら title から自動生成
    sections: {},             // { "1.1": "1.1 見出し", ... }  表示順＝定義順
    sources: {},              // { slide: "スライド", ... }    出典ラベル
    termSource: "用語",        // 用語集から自動生成する問題の出典名
    genSource: "ランダム計算",  // ジェネレータ問題の出典名
    quick: ["mix", "terms", "drill", "essay", "weak"],
  },
  Q: [], terms: [], gens: [], summary: [],
  src: "main",
};

const arr = v => Array.isArray(v) ? v : [v];
function add(type, ch, q, extra) { S.Q.push({ type, ch, src: S.src, q, ...extra }); }

const Drill = {
  /** 科目の設定。複数回呼んでもマージされる */
  setup(conf) { Object.assign(S.conf, conf); },
  /** 以降に登録する問題の出典 */
  source(key) { S.src = key; },

  // 問題形式ごとのヘルパ（引数の並びは「節, 問題文, 形式固有…, 解説」で統一）
  mc(ch, q, choices, ans, exp = "", opt = {}) { add("mc", ch, q, { choices, ans, exp, ...opt }); },
  tf(ch, q, ans, exp = "") { add("tf", ch, q, { ans: !!ans, exp }); },
  inp(ch, q, accept, exp = "") { add("input", ch, q, { accept: arr(accept), exp }); },
  fill(ch, q, blanks, exp = "") { add("fill", ch, q, { blanks: blanks.map(([l, a]) => [l, arr(a)]), exp }); },
  calc(ch, q, parts, exp = "") { add("calc", ch, q, { parts, exp }); },
  ord(ch, q, items, exp = "") { add("order", ch, q, { items, exp }); },
  match(ch, q, left, right, ans, exp = "") { add("match", ch, q, { left, right, ans, exp }); },
  essay(ch, q, model, kw = [], exp = "") { add("essay", ch, q, { model, kw, exp }); },

  /** 用語集 [[節, 用語, 説明, 別解[]?], ...] → 用語集ページ＋入力/選択問題を自動生成 */
  terms(list) { list.forEach(([ch, term, def, alt = []]) => S.terms.push([ch, term, def, alt])); },
  /** 数値ランダム問題 [{ch, name, fn(){ return 問題オブジェクト }}] */
  generators(list) { S.gens.push(...list); },
  /** まとめ [{ch, title, body(HTML, [[語]]で赤字)}] */
  summary(list) { S.summary.push(...list); },

  util: {
    rnd: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
    pick: a => a[Math.floor(Math.random() * a.length)],
    fmt: n => (Math.round(n * 1000) / 1000).toLocaleString("ja-JP"),
    shuffle: a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  },

  validate, stats: () => buildPool().stats,
  _state: S,
};
const { rnd, pick, fmt, shuffle } = Drill.util;

// ---------------------------------------------------------------------
// 2. 定数・小道具
// ---------------------------------------------------------------------
const TYPE_LABEL = { mc: "選択", tf: "○×", input: "単語", fill: "穴埋め", calc: "計算", order: "並べ替え", match: "対応付け", essay: "記述" };
const KANA = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ"];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const red = s => s.replace(/\[\[(.+?)\]\]/g, '<span class="r">$1</span>');
/** 問題文・解説・模範解答用：改行をそのまま表示し、`コード` と表を描画する。
 *  表は「|」で始まる行（1行目が見出し行）。「|#名前」で表の名前を付け、続けて書いた表は横に並ぶ。 */
function rich(s) {
  const inline = t => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = []; let block = null;
  const flush = () => {
    if (!block) return;
    out.push(`<div class="qtables">${block.map(t => `<table class="qt">${t.cap ? `<caption>${inline(t.cap)}</caption>` : ""}${t.rows.map((r, i) =>
      `<tr>${r.map(c => i === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`).join("")}</div>`);
    block = null;
  };
  String(s).split("\n").forEach(line => {
    if (/^\|/.test(line)) {
      block = block || [];
      if (/^\|#/.test(line)) { block.push({ cap: line.slice(2).trim(), rows: [] }); return; }
      if (!block.length) block.push({ cap: "", rows: [] });
      block[block.length - 1].rows.push(line.replace(/^\||\|\s*$/g, "").split("|").map(c => c.trim()));
    } else { flush(); out.push(inline(line) + "<br>"); }
  });
  flush();
  return out.join("").replace(/(<br>)+$/, "");
}

/** 内容から作る安定ID（問題を途中に追加しても成績がずれない） */
function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---- 表記ゆれ吸収：全角半角・大小文字・ひらカタ・記号・空白・括弧書きを無視 ----
// SQL などのコード入力向けに、引用符の種類（' と "）・末尾の ;・!= と <> の違いも無視する
function norm(s) {
  s = String(s).normalize("NFKC").toLowerCase().trim();
  s = s.replace(/[‘’`´"“”]/g, "'").replace(/;+$/, "").replace(/!=/g, "<>");
  s = s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return s.replace(/[\s・･,、。.「」『』()（）\[\]［］ー〜~\-_]/g, "");
}
const stripParen = s => String(s).replace(/[（(][^）)]*[）)]/g, "");
function matches(user, accept) {
  const us = [norm(user), norm(stripParen(user))];
  if (!us[0]) return false;
  return accept.some(a => [norm(a), norm(stripParen(a))].some(n => us.includes(n)));
}
function parseNum(s) {
  const m = String(s).normalize("NFKC").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
const numOk = (x, ans) => Math.abs(x - ans) <= Math.max(1e-6, Math.abs(ans) * 0.005);

// ---------------------------------------------------------------------
// 3. 問題プール（登録データ → 出題単位）
// ---------------------------------------------------------------------
function buildPool() {
  const pool = [], seen = {};
  const push = (base, p) => {
    let id = base; seen[base] = (seen[base] || 0) + 1;
    if (seen[base] > 1) id += "~" + seen[base];
    pool.push({ id, ...p });
  };
  S.Q.forEach(q => push(q.type[0] + hashId(q.type + q.q + JSON.stringify(q.choices || q.blanks || q.parts || q.items || q.left || "")),
    { ch: q.ch, src: q.src, type: q.type, make: () => q }));

  S.terms.forEach(([ch, term, def, alt], i) => {
    const src = "term";
    push("ti" + hashId(term), { ch, src, type: "input", make: () => ({
      type: "input", q: "次の説明に当てはまる用語は？\n「" + def + "」", accept: [term, ...alt], exp: "" }) });
    push("tm" + hashId(term), { ch, src, type: "mc", make: () => {
      const same = S.terms.filter((g, j) => j !== i && g[0] === ch);
      const others = shuffle(same.length >= 3 ? same : S.terms.filter((_, j) => j !== i)).slice(0, 3).map(g => g[1]);
      const choices = shuffle([term, ...others]);
      return { type: "mc", q: "次の説明に当てはまる用語は？\n「" + def + "」", choices, ans: choices.indexOf(term), exp: "", fixed: true };
    } });
  });

  S.gens.forEach(g => {
    let type = "calc";
    try { type = g.fn().type; } catch (e) { /* validate で報告 */ }
    push("g" + hashId(g.name), { ch: g.ch, src: "gen", type, gen: true, name: g.name, make: () => g.fn() });
  });

  const stats = { total: pool.length, byType: {}, bySection: {}, bySource: {} };
  pool.forEach(p => {
    stats.byType[p.type] = (stats.byType[p.type] || 0) + 1;
    stats.bySection[p.ch] = (stats.bySection[p.ch] || 0) + 1;
    stats.bySource[p.src] = (stats.bySource[p.src] || 0) + 1;
  });
  return { pool, stats };
}

function sourceLabels() {
  const L = { ...S.conf.sources };
  if (S.terms.length) L.term = S.conf.termSource;
  if (S.gens.length) L.gen = S.conf.genSource;
  // 登録されたが未定義の出典もラベル無しで出す
  S.Q.forEach(q => { if (!(q.src in L)) L[q.src] = q.src === "main" ? "問題" : q.src; });
  return L;
}

// ---------------------------------------------------------------------
// 4. データ検証（ブラウザのコンソールと tools/check.mjs の両方で使う）
// ---------------------------------------------------------------------
/** rich() の表で、見出し行と列数がちがう行を見つける */
function checkTables(s) {
  const e = []; let cols = null;
  String(s || "").split("\n").forEach(line => {
    if (!/^\|/.test(line) || /^\|#/.test(line)) { cols = null; return; }
    const n = line.replace(/^\||\|\s*$/g, "").split("|").length;
    if (cols === null) cols = n;
    else if (n !== cols) e.push(`表の列数がそろっていない（見出し ${cols} 列、「${line.slice(0, 30)}」は ${n} 列）`);
  });
  return e;
}

function checkQ(q, where) {
  const e = [], isInt = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
  const nonEmpty = a => Array.isArray(a) && a.length > 0 && a.every(x => String(x).trim());
  if (!q || typeof q !== "object") return [where + ": 問題オブジェクトがない"];
  if (!TYPE_LABEL[q.type]) e.push(`未知の形式 "${q.type}"`);
  if (!q.q || !String(q.q).trim()) e.push("問題文が空");
  [q.q, q.exp, q.model].forEach(t => e.push(...checkTables(t)));
  switch (q.type) {
    case "mc":
      if (!Array.isArray(q.choices) || q.choices.length < 2) e.push("選択肢が2つ未満");
      else if (!isInt(q.ans, q.choices.length)) e.push(`正解番号 ${q.ans} が範囲外（0〜${q.choices.length - 1}）`);
      else if (new Set(q.choices).size !== q.choices.length) e.push("選択肢が重複");
      break;
    case "tf": if (typeof q.ans !== "boolean") e.push("ans は true/false"); break;
    case "input": if (!nonEmpty(q.accept)) e.push("正解が空"); break;
    case "fill":
      if (!nonEmpty(q.blanks)) e.push("空欄がない");
      else q.blanks.forEach(b => { if (!nonEmpty(b[1])) e.push(`空欄［${b[0]}］の正解が空`); });
      break;
    case "calc":
      if (!nonEmpty(q.parts)) e.push("設問がない");
      else q.parts.forEach(p => { if (typeof p.ans !== "number" || !isFinite(p.ans)) e.push(`「${p.label}」の答えが数値でない`); });
      break;
    case "order": if (!Array.isArray(q.items) || q.items.length < 2) e.push("項目が2つ未満"); break;
    case "match":
      if (!Array.isArray(q.left) || !Array.isArray(q.right) || !Array.isArray(q.ans)) { e.push("left/right/ans は配列"); break; }
      if (q.ans.length !== q.left.length) e.push("ans の長さが left と違う");
      if (q.right.length > KANA.length) e.push(`右側は ${KANA.length} 個まで`);
      q.ans.forEach(a => { if (!isInt(a, q.right.length)) e.push(`対応 ${a} が範囲外`); });
      break;
    case "essay": if (!q.model) e.push("模範解答が空"); break;
  }
  return e.map(m => `${where}: ${m}`);
}

function validate() {
  const errs = [], warns = [];
  const secs = S.conf.sections, hasSecs = Object.keys(secs).length > 0;
  const head = q => `[${q.ch}] ${String(q.q).replace(/\n/g, " ").slice(0, 40)}…`;
  if (!hasSecs) warns.push("setup({sections}) が未定義");
  S.Q.forEach(q => {
    errs.push(...checkQ(q, head(q)));
    if (hasSecs && !(q.ch in secs)) warns.push(`${head(q)}: 節 "${q.ch}" が sections にない`);
    if (Object.keys(S.conf.sources).length && !(q.src in S.conf.sources)) warns.push(`${head(q)}: 出典 "${q.src}" が sources にない`);
  });
  const seenTerm = {};
  S.terms.forEach(([ch, term, def]) => {
    if (!term || !def) errs.push(`用語 [${ch}] ${term}: 用語か説明が空`);
    if (seenTerm[term]) warns.push(`用語 "${term}" が重複`); seenTerm[term] = 1;
    if (def && term && norm(def).includes(norm(term))) warns.push(`用語 "${term}": 説明に答えそのものが含まれている`);
    if (hasSecs && !(ch in secs)) warns.push(`用語 ${term}: 節 "${ch}" が sections にない`);
  });
  S.gens.forEach(g => {
    for (let k = 0; k < 30; k++) {
      let q; try { q = g.fn(); } catch (e) { errs.push(`生成「${g.name}」: 例外 ${e.message}`); break; }
      const e = checkQ(q, `生成「${g.name}」`); if (e.length) { errs.push(...e); break; }
    }
  });
  S.summary.forEach(s => { if (hasSecs && !(s.ch in secs)) warns.push(`まとめ「${s.title}」: 節 "${s.ch}" が sections にない`); });
  return { errors: errs, warnings: warns };
}

// ---------------------------------------------------------------------
// 5. UI（ブラウザのみ）
// ---------------------------------------------------------------------
function boot() {
  const C = S.conf;
  const { pool: POOL } = buildPool();
  const SRC_LABEL = sourceLabels();
  const SECTIONS = Object.keys(C.sections).length ? C.sections
    : Object.fromEntries([...new Set(POOL.map(p => p.ch))].map(c => [c, c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fine = () => window.matchMedia("(pointer:fine)").matches;
  const ALL = () => ({ chs: Object.keys(SECTIONS), types: Object.keys(TYPE_LABEL), srcs: Object.keys(SRC_LABEL), count: 20, weak: false, order: "random" });

  const v = validate();
  if (v.errors.length) console.error("[drill] データエラー\n" + v.errors.join("\n"));
  if (v.warnings.length) console.warn("[drill] 警告\n" + v.warnings.join("\n"));

  // ---- 保存（この端末のブラウザだけ） ----
  const KEY = C.storageKey || "drill:" + C.title;
  let STATS = {};
  try { STATS = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { STATS = {}; }
  const saveStats = () => { try { localStorage.setItem(KEY, JSON.stringify(STATS)); } catch (e) {} };
  function record(id, ok) {
    const s = STATS[id] || { c: 0, w: 0, last: null };
    ok ? s.c++ : s.w++; s.last = ok ? 1 : 0; STATS[id] = s; saveStats();
  }
  const isWeak = p => STATS[p.id] && STATS[p.id].last === 0;

  // ---- 画面の骨組み ----
  const has = { summary: S.summary.length > 0, terms: S.terms.length > 0 };
  const VIEWS = ["home", has.summary && "summary", has.terms && "terms", "quiz"].filter(Boolean);
  const NAV = { home: "ホーム", summary: "まとめ", terms: "用語集", quiz: "演習" };
  const sheetBtn = `<button class="sheetbtn" aria-pressed="false">赤シート</button>`;
  document.title = C.title + (C.subtitle ? " " + C.subtitle : "");
  document.body.innerHTML = `
<header><div class="hwrap"><div class="logo">${esc(C.title)}${C.subtitle ? `<small>${esc(C.subtitle)}</small>` : ""}</div>
<nav>${VIEWS.map(v => `<a href="#${v}">${NAV[v]}</a>`).join("")}</nav></div></header>
<main>
<section id="view-home"><div class="quick" id="quick"></div><div class="card" id="home-stats"></div></section>
<section id="view-summary" hidden><div class="toolbar">${sheetBtn}</div><div id="summary-body"></div></section>
<section id="view-terms" hidden>
  <div class="toolbar"><div class="tfilters"><input id="term-q" placeholder="検索" type="search"><select id="term-ch"></select></div>${sheetBtn}<span id="term-count" class="hint"></span></div>
  <div class="card" id="term-list"></div></section>
<section id="view-quiz" hidden>
  <div id="quiz-setup">
    <div class="setgrid" id="set-grid"></div>
    <div class="setrow">
      <label>問題数 <select id="set-count">${[10, 20, 30, 50, 100].map(n => `<option value="${n}"${n === 20 ? " selected" : ""}>${n}問</option>`).join("")}<option value="0">全問</option></select></label>
      <label>順番 <select id="set-order"><option value="random">ランダム</option><option value="seq">資料の順</option></select></label>
      <label><input type="checkbox" id="set-weak"> 間違えた問題だけ</label>
    </div>
    <div class="setrow"><button class="primary" id="start">スタート</button><span id="set-avail"></span><button class="ghost" id="reset" style="margin-left:auto">成績をリセット</button></div>
  </div>
  <div id="quiz-run" hidden></div>
  <div id="quiz-result" hidden></div>
</section>
</main>
${C.footer ? `<footer>${esc(C.footer)}</footer>` : ""}`;

  // ---- ルーティング（#hash で画面切替。戻るボタンが効く） ----
  function route() {
    let v = (location.hash || "#home").slice(1);
    if (!VIEWS.includes(v)) v = "home";
    ["home", "summary", "terms", "quiz"].forEach(n => { $("#view-" + n).hidden = n !== v; });
    $$("nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + v));
    if (v === "home") renderHome();
    if (v === "summary") renderSummary();
    if (v === "terms") renderTerms();
    if (v === "quiz" && !RUN) renderSetup();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---- ホーム ----
  const QUICK = {
    mix: { label: "おまかせ30問", desc: "全範囲からランダム", o: { count: 30 } },
    terms: { label: "用語30問", desc: "説明を読んで用語を入力", o: { srcs: ["term"], types: ["input"], count: 30 } },
    essay: { label: "記述10問", desc: "模範解答で自己採点", o: { types: ["essay"], count: 10 } },
    weak: { label: "苦手復習", desc: "直近で間違えた問題", o: { weak: true, count: 0 } },
    drill: { label: "計算ドリル", desc: "数値が毎回変わる・終わりなし", drill: true },
  };
  const quickItems = () => C.quick.map(k => typeof k === "string" ? QUICK[k] : { label: k.label, desc: k.desc || "", o: k }).filter(Boolean);
  function renderHome() {
    const items = quickItems().map(it => ({ ...it, n: it.drill ? POOL.filter(p => p.gen).length : filterPool({ ...ALL(), ...it.o }).length }))
      .filter(it => it.n > 0 || (it.o && it.o.weak));
    $("#quick").innerHTML = items.map((it, i) => `<button data-i="${i}"${it.n ? "" : " disabled"}><b>${esc(it.label)}</b><span>${esc(it.desc)}${it.o && it.o.weak ? `（${it.n}問）` : ""}</span></button>`).join("");
    $$("#quick button").forEach(b => b.onclick = () => { const it = items[+b.dataset.i]; it.drill ? startDrill() : startQuiz({ ...ALL(), ...it.o }); });

    let c = 0, w = 0; Object.values(STATS).forEach(s => { c += s.c; w += s.w; });
    const byType = {}; POOL.forEach(p => byType[p.type] = (byType[p.type] || 0) + 1);
    const rows = Object.keys(SECTIONS).map(ch => {
      const ps = POOL.filter(p => p.ch === ch); if (!ps.length) return "";
      const ok = ps.filter(p => STATS[p.id] && STATS[p.id].last === 1).length;
      return `<div class="chrow"><div>${esc(SECTIONS[ch])}</div><div class="bar"><span style="width:${Math.round(ok / ps.length * 100)}%"></span></div><div class="chnum">${ok}/${ps.length}</div>
        <button class="mini" data-ch="${esc(ch)}">解く</button></div>`;
    }).join("");
    $("#home-stats").innerHTML = `
      <div class="kpis">
        <div class="kpi"><b>${POOL.length}</b><span>問題数</span></div>
        <div class="kpi"><b>${POOL.filter(p => STATS[p.id]).length}</b><span>解いた問題</span></div>
        <div class="kpi"><b>${c + w ? Math.round(c / (c + w) * 100) : 0}%</b><span>正答率（${c + w}回）</span></div>
        <div class="kpi"><b>${POOL.filter(isWeak).length}</b><span>直近で間違えた</span></div>
      </div>
      <p class="typecount">${Object.entries(TYPE_LABEL).filter(([t]) => byType[t]).map(([t, l]) => `<span class="tag t-${t}">${l} ${byType[t]}</span>`).join(" ")}</p>
      <h3>節ごとの習得状況</h3>${rows}`;
    $$("#home-stats [data-ch]").forEach(b => b.onclick = () => startQuiz({ ...ALL(), chs: [b.dataset.ch] }));
  }

  // ---- まとめ ----
  function renderSummary() {
    const box = $("#summary-body"); if (box.dataset.done) return;
    const chs = Object.keys(SECTIONS).filter(ch => S.summary.some(s => s.ch === ch));
    box.innerHTML = (chs.length > 1 ? `<div class="toc">${chs.map(ch => `<a href="#summary" data-jump="${esc(ch)}">${esc(SECTIONS[ch])}</a>`).join("")}</div>` : "") +
      chs.map((ch, i) => `<section class="chap" id="sum-${i}" data-ch="${esc(ch)}"><h2>${esc(SECTIONS[ch])}</h2>
        ${S.summary.filter(s => s.ch === ch).map(s => `<div class="card sum"><h3>${esc(s.title)}</h3>${red(s.body)}</div>`).join("")}
        <button class="mini go" data-ch="${esc(ch)}">この節の問題を解く →</button></section>`).join("");
    box.dataset.done = 1;
    box.addEventListener("click", e => {
      const j = e.target.closest("[data-jump]");
      if (j) { e.preventDefault(); $(`.chap[data-ch="${CSS.escape(j.dataset.jump)}"]`).scrollIntoView({ behavior: "smooth" }); return; }
      const g = e.target.closest(".go"); if (g) startQuiz({ ...ALL(), chs: [g.dataset.ch] });
    });
  }

  // ---- 赤シート：ON の間、赤字をタップすると1語ずつ表示 ----
  let SHEET = false;
  function toggleSheet() {
    SHEET = !SHEET;
    document.body.classList.toggle("sheet", SHEET);
    $$(".r.show").forEach(e => e.classList.remove("show"));
    $$(".sheetbtn").forEach(b => b.setAttribute("aria-pressed", SHEET));
  }
  document.addEventListener("click", e => { const r = SHEET && e.target.closest(".r"); if (r) r.classList.toggle("show"); });

  // ---- 用語集 ----
  function renderTerms() {
    const qv = norm($("#term-q").value || ""), ch = $("#term-ch").value;
    const list = S.terms.filter(g => (!ch || g[0] === ch) && (!qv || norm(g[1] + g[2] + g[3].join("")).includes(qv)));
    $("#term-count").textContent = list.length + " 語";
    $("#term-list").innerHTML = list.map(([c, t, d, a]) => `<div class="term"><div class="tname"><span class="r">${esc(t)}</span>${a.length ? `<small>${esc(a.join("／"))}</small>` : ""}</div><div class="tdef"><span class="chip">${esc(c)}</span>${esc(d)}</div></div>`).join("");
  }

  // ---- 出題設定（選択肢が1つしかない絞り込みは出さない） ----
  function renderSetup() {
    $("#quiz-setup").hidden = false; $("#quiz-run").hidden = true; $("#quiz-result").hidden = true;
    const cnt = f => POOL.filter(f).length;
    const groups = [
      ["ch", "範囲", Object.entries(SECTIONS).map(([k, l]) => [k, l, cnt(p => p.ch === k)])],
      ["type", "形式", Object.entries(TYPE_LABEL).map(([k, l]) => [k, l, cnt(p => p.type === k)])],
      ["src", "出典", Object.entries(SRC_LABEL).map(([k, l]) => [k, l, cnt(p => p.src === k)])],
    ].map(([n, title, opts]) => [n, title, opts.filter(o => o[2] > 0)]);
    $("#set-grid").innerHTML = groups.map(([n, title, opts]) => `<fieldset${opts.length < 2 ? " hidden" : ""}><legend>${title}</legend>
      ${opts.map(([k, l, c]) => `<label><input type="checkbox" name="${n}" value="${esc(k)}" checked> ${esc(l)} <small>${c}</small></label>`).join("")}
      <div class="sel"><a data-all="${n}" data-on="1">全部</a><a data-all="${n}" data-on="0">解除</a></div></fieldset>`).join("");
    $$("[data-all]").forEach(a => a.onclick = () => { $$(`#quiz-setup input[name=${a.dataset.all}]`).forEach(e => e.checked = a.dataset.on === "1"); upd(); });
    const upd = () => { $("#set-avail").textContent = filterPool(readSetup()).length + " 問"; };
    $("#quiz-setup").oninput = upd; upd();
  }
  function readSetup() {
    const vals = n => $$(`#quiz-setup input[name=${n}]:checked`).map(e => e.value);
    return { chs: vals("ch"), types: vals("type"), srcs: vals("src"), count: +$("#set-count").value, weak: $("#set-weak").checked, order: $("#set-order").value };
  }
  function filterPool(o) {
    return POOL.filter(p => o.chs.includes(p.ch) && o.types.includes(p.type) && o.srcs.includes(p.src) && (!o.weak || isWeak(p)));
  }

  // ---- 出題 ----
  let RUN = null;
  const newItem = p => ({ p, q: p.make(), ok: null });
  function startQuiz(o) {
    let list = filterPool(o);
    if (!list.length) { RUN = null; location.hash = "#quiz"; renderSetup(); $("#set-avail").textContent = "条件に合う問題がありません"; return; }
    if (o.order !== "seq") list = shuffle(list);
    if (o.count > 0) list = list.slice(0, o.count);
    RUN = { items: list.map(newItem), i: 0, endless: false };
    showRun();
  }
  function startDrill() { RUN = { items: [], i: 0, endless: true }; pushDrill(); showRun(); }
  function pushDrill() { RUN.items.push(newItem(pick(POOL.filter(p => p.gen)))); }
  function showRun() {
    if (location.hash !== "#quiz") location.hash = "#quiz";
    $("#quiz-setup").hidden = true; $("#quiz-result").hidden = true; $("#quiz-run").hidden = false;
    renderQ();
  }

  function renderQ() {
    const it = RUN.items[RUN.i], q = it.q, p = it.p;
    const n = RUN.endless ? `${RUN.i + 1}問目（正解 ${RUN.items.filter(x => x.ok).length}）` : `${RUN.i + 1} / ${RUN.items.length}`;
    const pct = RUN.endless ? 100 : Math.round(RUN.i / RUN.items.length * 100);
    let html = `<div class="qhead"><span>${n}</span><span class="tag t-${q.type}">${TYPE_LABEL[q.type]}</span><span class="chip">${esc(p.ch)}</span><span class="srcl">${esc(SRC_LABEL[p.src] || "")}${p.name ? "：" + esc(p.name) : ""}</span></div>
      <div class="prog"><span style="width:${pct}%"></span></div>
      <div class="qtext">${rich(q.q)}</div><div class="qbody">`;
    switch (q.type) {
      case "mc":
        // 2択や順序に意味がある選択肢（fixed）はシャッフルしない
        it.order = it.order || (q.choices.length > 2 && !q.fixed ? shuffle(q.choices.map((_, k) => k)) : q.choices.map((_, k) => k));
        html += it.order.map((k, m) => `<button class="opt" data-k="${k}"><b>${"ABCDEFGHIJ"[m]}</b>${esc(q.choices[k])}</button>`).join("");
        break;
      case "tf":
        html += `<div class="tfrow"><button class="opt" data-k="1">○</button><button class="opt" data-k="0">×</button></div>`; break;
      case "input":
        html += `<input class="ans" id="a0" autocomplete="off" enterkeyhint="done">`; break;
      case "fill":
        html += q.blanks.map((b, k) => `<label class="blank"><span>［${esc(b[0])}］</span><input class="ans" id="a${k}" autocomplete="off"></label>`).join(""); break;
      case "calc":
        html += q.parts.map((pt, k) => `<label class="blank calc"><span>${esc(pt.label)}</span><input class="ans" id="a${k}" inputmode="decimal" autocomplete="off"><em>${esc(pt.unit || "")}</em></label>`).join("");
        html += `<p class="hint">誤差0.5%まで正解</p>`; break;
      case "order":
        it.pool = it.pool || shuffle(q.items.map((_, k) => k)); it.picked = it.picked || [];
        html += `<ol class="picked" id="picked"></ol><div class="ordpool" id="ordpool"></div><p class="hint">順にタップ。並べた項目をタップで戻す</p>`; break;
      case "match":
        it.rorder = it.rorder || shuffle(q.right.map((_, k) => k));
        html += `<div class="rightlist">${it.rorder.map((k, m) => `<div><b>${KANA[m]}</b>${esc(q.right[k])}</div>`).join("")}</div>`;
        html += q.left.map((l, k) => `<label class="blank mrow"><span>${esc(l)}</span><select class="ans" id="a${k}"><option value="">—</option>${it.rorder.map((_, m) => `<option value="${m}">${KANA[m]}</option>`).join("")}</select></label>`).join("");
        break;
      case "essay":
        html += `<textarea class="ans essay" id="a0" placeholder="空欄のままでも答え合わせできます"></textarea>`; break;
    }
    html += `</div><div class="fb" id="fb"></div><div class="actions" id="actions"></div>`;
    $("#quiz-run").innerHTML = html;
    bindQ(it);
  }

  const quitBtn = `<button class="ghost" id="quit">終了</button>`;
  function setActions(html) { $("#actions").innerHTML = html + quitBtn; $("#quit").onclick = showResult; }

  function bindQ(it) {
    const q = it.q;
    if (q.type === "mc" || q.type === "tf") {
      setActions("");
      $$(".opt").forEach(b => b.onclick = () => {
        if (it.ok !== null) return;
        const correct = q.type === "mc" ? q.ans : (q.ans ? 1 : 0), ok = +b.dataset.k === correct;
        $$(".opt").forEach(x => { if (+x.dataset.k === correct) x.classList.add("good"); else if (x === b) x.classList.add("bad"); x.disabled = true; });
        finish(it, ok, "正解：" + (q.type === "tf" ? (q.ans ? "○" : "×") : esc(q.choices[correct])));
      });
    } else if (q.type === "order") {
      const draw = () => {
        $("#picked").innerHTML = it.picked.map(k => `<li data-k="${k}">${esc(q.items[k])}</li>`).join("");
        $("#ordpool").innerHTML = it.pool.filter(k => !it.picked.includes(k)).map(k => `<button class="opt" data-k="${k}">${esc(q.items[k])}</button>`).join("");
        $$("#ordpool .opt").forEach(b => b.onclick = () => { it.picked.push(+b.dataset.k); draw(); });
        $$("#picked li").forEach(li => li.onclick = () => { it.picked = it.picked.filter(k => k !== +li.dataset.k); draw(); });
      };
      draw();
      setActions(`<button class="primary" id="check">答え合わせ</button>`);
    } else {
      setActions(`<button class="primary" id="check">答え合わせ</button>${q.type === "essay" ? "" : `<button class="ghost" id="giveup">わからない</button>`}`);
      const first = $(".ans"); if (first && fine()) first.focus();
      // Enter：次の欄へ → 最後の欄なら答え合わせ → 判定後なら次の問題へ
      $$("input.ans").forEach((el, k, all) => el.onkeydown = e => {
        if (e.key !== "Enter" || e.isComposing) return;
        e.preventDefault();
        if (it.ok !== null) $("#next") && $("#next").click();
        else if (k < all.length - 1) all[k + 1].focus();
        else $("#check").click();
      });
    }
    const chk = $("#check"); if (chk) chk.onclick = () => check(it);
    const gu = $("#giveup"); if (gu) gu.onclick = () => check(it, true);
  }

  function check(it, giveup) {
    const q = it.q; if (it.ok !== null) return;
    const mark = (el, ok) => { el.classList.add(ok ? "good" : "bad"); el.disabled = true; };
    if (q.type === "input") {
      const el = $("#a0"), ok = !giveup && matches(el.value, q.accept); mark(el, ok);
      finish(it, ok, `正解：${esc(q.accept[0])}${q.accept.length > 1 ? "（別解：" + esc(q.accept.slice(1).join("／")) + "）" : ""}`, !ok && !giveup && el.value.trim());
    } else if (q.type === "fill") {
      let all = true, typed = false;
      q.blanks.forEach((b, k) => { const el = $("#a" + k), ok = !giveup && matches(el.value, b[1]); all = all && ok; typed = typed || !!el.value.trim(); mark(el, ok); });
      finish(it, all, "正解：" + q.blanks.map(b => `［${esc(b[0])}］${esc(b[1][0])}`).join("　"), !all && typed && !giveup);
    } else if (q.type === "calc") {
      let all = true;
      q.parts.forEach((pt, k) => { const el = $("#a" + k), ok = !giveup && numOk(parseNum(el.value), pt.ans); all = all && ok; mark(el, ok); });
      finish(it, all, "正解：<br>" + q.parts.map(pt => `${esc(pt.label)} ＝ ${fmt(pt.ans)} ${esc(pt.unit || "")}`).join("<br>"));
    } else if (q.type === "order") {
      const ok = it.picked.length === q.items.length && it.picked.every((k, m) => k === m);
      $("#picked").classList.add("locked"); $("#ordpool").classList.add("locked");
      finish(it, ok, "正しい順序：<ol class='ans-ol'>" + q.items.map(s => `<li>${esc(s)}</li>`).join("") + "</ol>");
    } else if (q.type === "match") {
      let all = true;
      q.left.forEach((_, k) => { const el = $("#a" + k), ok = !giveup && el.value !== "" && it.rorder[+el.value] === q.ans[k]; all = all && ok; mark(el, ok); });
      finish(it, all, "正解：<br>" + q.left.map((l, k) => `${esc(l)} → ${KANA[it.rorder.indexOf(q.ans[k])]}（${esc(q.right[q.ans[k]])}）`).join("<br>"));
    } else if (q.type === "essay") {
      const el = $("#a0"), v = el.value, nv = norm(v); el.readOnly = true;
      const kw = (q.kw || []).map(k => `<span class="kw${v && nv.includes(norm(k)) ? " hit" : ""}">${esc(k)}</span>`).join("");
      $("#fb").innerHTML = `<div class="model"><h4>模範解答</h4><div>${rich(q.model)}</div>${kw ? `<h4>キーワード</h4><div>${kw}</div>` : ""}${q.exp ? `<div class="exp">${rich(q.exp)}</div>` : ""}</div>`;
      setActions(`<button class="good-b" data-s="1">○ できた</button><button class="mid-b" data-s="0">△ 一部</button><button class="bad-b" data-s="0">× できなかった</button>`);
      $$("#actions [data-s]").forEach(b => b.onclick = () => { it.ok = b.dataset.s === "1"; record(it.p.id, it.ok); go(); });
    }
  }

  function finish(it, ok, ansHtml, allowOverride) {
    it.ok = ok; record(it.p.id, ok);
    $("#fb").innerHTML = `<div class="verdict ${ok ? "ok" : "ng"}">${ok ? "正解" : "不正解"}</div><div class="answer">${ansHtml}</div>${it.q.exp ? `<div class="exp">${rich(it.q.exp)}</div>` : ""}
      ${allowOverride ? `<button class="mini" id="override">正解にする（表記ゆれ）</button>` : ""}`;
    const last = !RUN.endless && RUN.i >= RUN.items.length - 1;
    setActions(`<button class="primary" id="next">${last ? "結果へ" : "次へ →"}</button>`);
    $("#next").onclick = go;
    const ov = $("#override");
    if (ov) ov.onclick = () => {
      const s = STATS[it.p.id]; s.w--; s.c++; s.last = 1; saveStats(); it.ok = true;
      ov.remove(); $(".verdict").className = "verdict ok"; $(".verdict").textContent = "正解（自己判定）";
    };
    if (fine()) $("#next").focus();
  }

  function go() {
    if (RUN.endless) { pushDrill(); RUN.i++; renderQ(); return; }
    if (RUN.i < RUN.items.length - 1) { RUN.i++; renderQ(); window.scrollTo(0, $("#view-quiz").offsetTop - 10); }
    else showResult();
  }

  function showResult() {
    const done = RUN.items.filter(x => x.ok !== null), ok = done.filter(x => x.ok).length, wrong = done.filter(x => !x.ok);
    $("#quiz-run").hidden = true; $("#quiz-result").hidden = false;
    const cut = s => (s = s.split("\n").filter(l => !/^\|/.test(l)).join(" "), esc(s.length > 90 ? s.slice(0, 90) + "…" : s));
    $("#quiz-result").innerHTML = `<div class="card"><h2>結果</h2><div class="score"><b>${ok}</b> / ${done.length} 問 <span>${done.length ? Math.round(ok / done.length * 100) : 0}%</span></div>
      ${wrong.length ? `<h3>間違えた問題</h3><ul class="wronglist">${wrong.map(x => `<li><span class="tag t-${x.q.type}">${TYPE_LABEL[x.q.type]}</span> ${cut(x.q.q)}</li>`).join("")}</ul>` : done.length ? "<p>全問正解！</p>" : ""}
      <div class="actions">${wrong.length ? `<button class="primary" id="retry">間違えた問題をもう一度</button>` : ""}<button class="ghost" id="again">出題設定へ</button></div></div>`;
    const r = $("#retry");
    if (r) r.onclick = () => { RUN = { items: shuffle(wrong.map(x => ({ p: x.p, q: x.p.gen ? x.q : x.p.make(), ok: null }))), i: 0, endless: false }; showRun(); };
    $("#again").onclick = () => { RUN = null; renderSetup(); };
  }

  // ---- キーボード：1〜9 で選択肢、Enter で次へ（PC 向け） ----
  document.addEventListener("keydown", e => {
    if ($("#quiz-run").hidden || e.target.matches("input,textarea,select") || e.isComposing) return;
    const it = RUN && RUN.items[RUN.i];
    if (e.key === "Enter" && it && it.ok !== null && $("#next")) { e.preventDefault(); $("#next").click(); return; }
    const n = +e.key; if (!n) return;
    const opts = $$("#quiz-run .qbody > .opt, #quiz-run .tfrow .opt");
    if (opts[n - 1] && !opts[n - 1].disabled) opts[n - 1].click();
  });

  // ---- 初期化 ----
  $("#term-ch").innerHTML = `<option value="">すべての節</option>` + Object.keys(SECTIONS).filter(c => S.terms.some(t => t[0] === c)).map(c => `<option value="${esc(c)}">${esc(SECTIONS[c])}</option>`).join("");
  $("#term-q").oninput = renderTerms; $("#term-ch").onchange = renderTerms;
  $$(".sheetbtn").forEach(b => b.onclick = toggleSheet);
  $("#start").onclick = () => startQuiz(readSetup());
  $("#reset").onclick = () => {
    const b = $("#reset");
    if (b.dataset.armed) { STATS = {}; saveStats(); b.textContent = "リセットしました"; delete b.dataset.armed; }
    else { b.dataset.armed = 1; b.textContent = "もう一度押すと消去"; }
  };
  $("nav a[href='#quiz']").onclick = () => { RUN = null; if (location.hash === "#quiz") renderSetup(); };
  route();
}

root.Drill = Drill;
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
})(typeof window !== "undefined" ? window : globalThis);
