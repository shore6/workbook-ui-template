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
    quick: ["mix", "past", "terms", "drill", "essay", "weak"],
  },
  Q: [], terms: [], gens: [], summary: [],
  src: "main",
  past: null,               // 以降に登録する問題が属する過去問（試験名）
  exams: {},                // { 試験名: { minutes } }  登録順＝表示順
};

const arr = v => Array.isArray(v) ? v : [v];
function add(type, ch, q, extra) { S.Q.push({ type, ch, src: S.src, q, ...(S.past ? { past: S.past } : {}), ...extra }); }

const Drill = {
  /** 科目の設定。複数回呼んでもマージされる */
  setup(conf) { Object.assign(S.conf, conf); },
  /** 以降に登録する問題の出典 */
  source(key) { S.src = key; },
  /** 以降に登録する問題を過去問として印を付ける。past(null) で解除。
   *  opt.minutes を書くと、本番形式で通すときの制限時間の初期値になる */
  past(name = "過去問", opt = {}) {
    S.past = name || null;
    if (S.past) S.exams[S.past] = { ...(S.exams[S.past] || {}), ...opt };
  },

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
    { ch: q.ch, src: q.src, type: q.type, past: q.past || null, make: () => q }));

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

  const stats = { total: pool.length, byType: {}, bySection: {}, bySource: {}, byPast: {} };
  pool.forEach(p => {
    if (p.past) stats.byPast[p.past] = (stats.byPast[p.past] || 0) + 1;
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
  const ALL = () => ({ chs: Object.keys(SECTIONS), types: Object.keys(TYPE_LABEL), srcs: Object.keys(SRC_LABEL), count: 20, weak: false, past: false, order: "random" });

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
    if (RUN && RUN.seq && !RUN.seq.retry) markSeq(id);
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
<section id="view-home"><div class="quick" id="quick"></div><div class="card seqcard pastcard" id="home-past"></div><div class="card seqcard" id="home-seq"></div><div class="card" id="home-stats"></div></section>
<section id="view-summary" hidden><div class="toolbar">${sheetBtn}</div><div id="summary-body"></div></section>
<section id="view-terms" hidden>
  <div class="toolbar"><div class="tfilters"><input id="term-q" placeholder="検索" type="search"><select id="term-ch"></select></div><div class="seg" id="term-hide" role="group" aria-label="赤シートで隠す側"><button data-hide="term">用語を隠す</button><button data-hide="def">説明を隠す</button></div>${sheetBtn}<span id="term-count" class="hint"></span></div>
  <div class="card" id="term-list"></div></section>
<section id="view-quiz" hidden>
  <div id="quiz-setup">
    <div class="card seqcard pastcard" id="setup-past"></div>
    <div class="card seqcard" id="setup-seq"></div>
    <div class="setgrid" id="set-grid"></div>
    <div class="setrow">
      <label>問題数 <select id="set-count">${[10, 20, 30, 50, 100].map(n => `<option value="${n}"${n === 20 ? " selected" : ""}>${n}問</option>`).join("")}<option value="0">全問</option></select></label>
      <label>順番 <select id="set-order"><option value="random">ランダム</option><option value="seq">資料の順</option></select></label>
      <label><input type="checkbox" id="set-weak"> 間違えた問題だけ</label>
      <label id="set-past-l"><input type="checkbox" id="set-past"> 過去問だけ</label>
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
    past: { label: "過去問", desc: "過去問を順番に全部", o: { past: true, count: 0, order: "seq" } },
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
    renderSeqCard($("#home-seq"));
    renderPastCard($("#home-past"));
  }

  // ---- 過去問：本番形式で通して、解答時間と正答率を測る。結果は履歴として保存 ----
  const EXAMS = Object.keys(S.exams).map(name => ({ name, ...S.exams[name], list: POOL.filter(p => p.past === name) })).filter(e => e.list.length);
  const PAST_KEY = KEY + ":past", LIMITS = [0, 10, 20, 30, 45, 50, 60, 90];
  let PAST = {};
  try { PAST = JSON.parse(localStorage.getItem(PAST_KEY) || "{}"); } catch (e) { PAST = {}; }
  const savePast = () => { try { localStorage.setItem(PAST_KEY, JSON.stringify(PAST)); } catch (e) {} };
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  function renderPastCard(box) {
    if (!EXAMS.length) { box.hidden = true; return; }
    box.innerHTML = `<div class="seqhead"><h3>過去問</h3></div>
      <p class="hint">「本番形式で通す」は全問を出題順に解き、解答時間（答え合わせまでの時間）と正答率を記録します。</p>` +
      EXAMS.map((e, i) => {
        const hist = (PAST[e.name] || {}).runs || [], last = hist[hist.length - 1];
        const best = hist.reduce((b, r) => !b || r.ok / r.total > b.ok / b.total || (r.ok / r.total === b.ok / b.total && r.ms < b.ms) ? r : b, null);
        const lim = (PAST[e.name] || {}).limit ?? e.minutes ?? 0;
        const opts = [...new Set([...LIMITS, e.minutes || 0])].sort((a, b) => a - b);
        const fmtRun = r => `${r.ok}/${r.total}問（${pct(r.ok, r.total)}%）${mmss(r.ms)}${r.timeout ? " 時間切れ" : r.answered < r.total ? " 途中終了" : ""}`;
        return `<div class="pastrow" data-x="${i}"><div class="pastname"><b>${esc(e.name)}</b><span class="chnum">${e.list.length}問</span></div>
          ${hist.length ? `<p class="hint">前回 ${fmtRun(last)}　最高 ${fmtRun(best)}　（${hist.length}回）</p>` : ""}
          <div class="setrow"><button class="primary" data-past="exam">本番形式で通す</button>
            <label>制限時間 <select data-past="limit">${opts.map(m => `<option value="${m}"${m === lim ? " selected" : ""}>${m ? m + "分" : "なし"}</option>`).join("")}</select></label>
            <button class="ghost" data-past="practice">1問ずつ解く</button></div></div>`;
      }).join("");
    $$(".pastrow", box).forEach(row => {
      const e = EXAMS[+row.dataset.x], st = () => (PAST[e.name] = PAST[e.name] || { runs: [] });
      $("[data-past=limit]", row).onchange = ev => { st().limit = +ev.target.value; savePast(); };
      $("[data-past=exam]", row).onclick = () => startExam(e, +$("[data-past=limit]", row).value);
      $("[data-past=practice]", row).onclick = () => startQuiz({ ...ALL(), past: e.name, count: 0, order: "seq" });
    });
  }
  function startExam(e, minutes) {
    const exam = { name: e.name, limit: minutes * 60000, timeout: false, last: Date.now() };
    RUN = { items: e.list.map(p => ({ ...newItem(p), ms: 0 })), i: 0, endless: false, exam };
    // 表示中の問題に、答え合わせまでの時間を足していく（別画面やタブを離れている間は止める）
    exam.timer = setInterval(() => {
      if (!RUN || RUN.exam !== exam) { clearInterval(exam.timer); return; }
      const now = Date.now(), dt = now - exam.last; exam.last = now;
      if ($("#view-quiz").hidden || $("#quiz-run").hidden || document.hidden) return;
      const it = RUN.items[RUN.i];
      if (it && !it.stop) it.ms += dt;
      const used = examUsed();
      if (exam.limit && used >= exam.limit) { exam.timeout = true; showResult(); return; }
      drawTimer();
    }, 250);
    showRun();
  }
  const examUsed = () => RUN.items.reduce((s, x) => s + (x.ms || 0), 0);
  function drawTimer() {
    const el = $("#timer"); if (!el || !RUN || !RUN.exam) return;
    const used = examUsed(), lim = RUN.exam.limit;
    el.textContent = lim ? "残り " + mmss(lim - used) : mmss(used);
    el.classList.toggle("warn", !!lim && lim - used < 60000);
  }

  // ---- 通し演習：全形式・全範囲を節の順に区切って解く。どこまで解いたかを保存して再開できる ----
  const SEQ_KEY = KEY + ":seq", SEQ_SIZES = [5, 10, 20, 30, 50];
  let SEQ = { done: [], size: 10 };
  try { SEQ = { ...SEQ, ...JSON.parse(localStorage.getItem(SEQ_KEY) || "{}") }; } catch (e) { /* 既定値のまま */ }
  const SEQ_DONE = new Set(SEQ.done);
  const saveSeq = () => { SEQ.done = [...SEQ_DONE]; try { localStorage.setItem(SEQ_KEY, JSON.stringify(SEQ)); } catch (e) {} };
  function markSeq(id) { if (!SEQ_DONE.has(id)) { SEQ_DONE.add(id); saveSeq(); } }
  // 節の定義順 → 同じ節の中は登録順（問題 → 用語 → 計算ジェネレータ）
  const secIdx = Object.fromEntries(Object.keys(SECTIONS).map((c, i) => [c, i]));
  const SEQ_LIST = POOL.map((p, i) => [p, i]).sort((a, b) => ((secIdx[a[0].ch] ?? 1e9) - (secIdx[b[0].ch] ?? 1e9)) || a[1] - b[1]).map(x => x[0]);
  const SEQ_POS = new Map(SEQ_LIST.map((p, i) => [p.id, i + 1]));
  const seqProgress = () => {
    const rest = SEQ_LIST.filter(p => !SEQ_DONE.has(p.id)); // 問題を消したあとの古いIDは数えない
    return { done: SEQ_LIST.length - rest.length, total: SEQ_LIST.length, rest };
  };
  function renderSeqCard(box) {
    const { done, total, rest } = seqProgress();
    if (!total) { box.hidden = true; return; }
    const label = !done ? "最初から始める" : rest.length ? `続きから（${SEQ_POS.get(rest[0].id)}問目〜）` : "もう一周する";
    box.innerHTML = `<div class="seqhead"><h3>通し演習</h3><span class="chnum">${done} / ${total} 問</span></div>
      <div class="bar"><span style="width:${Math.round(done / total * 100)}%"></span></div>
      <p class="hint">${rest.length ? "全形式・全範囲を節の順に、区切りごとに解きます。途中でやめても続きから再開できます。" : "全問解き終わりました。"}</p>
      <div class="setrow"><button class="primary" data-seq="go">${label}</button>
        <label>区切り <select data-seq="size">${SEQ_SIZES.map(n => `<option value="${n}"${n === SEQ.size ? " selected" : ""}>${n}問</option>`).join("")}</select></label>
        ${done ? `<button class="ghost" data-seq="reset" style="margin-left:auto">進み具合をリセット</button>` : ""}</div>`;
    $("[data-seq=size]", box).onchange = e => { SEQ.size = +e.target.value; saveSeq(); };
    $("[data-seq=go]", box).onclick = () => { if (!rest.length) { SEQ_DONE.clear(); saveSeq(); } startSeq(); };
    const r = $("[data-seq=reset]", box);
    if (r) r.onclick = () => {
      if (!r.dataset.armed) { r.dataset.armed = 1; r.textContent = "もう一度押すと最初に戻る"; return; }
      SEQ_DONE.clear(); saveSeq(); renderSeqCard(box);
    };
  }
  function startSeq() {
    const { rest } = seqProgress();
    if (!rest.length) { RUN = null; location.hash = "#home"; renderHome(); return; }
    const chunk = rest.slice(0, SEQ.size);
    RUN = { items: chunk.map(newItem), i: 0, endless: false, seq: { retry: false, from: SEQ_POS.get(chunk[0].id), round: 0 } };
    showRun();
  }
  function retrySeq(wrong) {
    RUN = { items: shuffle(wrong.map(x => ({ p: x.p, q: x.p.gen ? x.q : x.p.make(), ok: null }))), i: 0, endless: false,
      seq: { ...RUN.seq, retry: true, round: RUN.seq.round + 1 } };
    showRun();
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
  // 赤シートで隠す側：term＝説明を読んで用語を思い出す／def＝用語を見て説明を思い出す（選択は端末に保存）
  const HIDE_KEY = C.storageKey + ":termhide";
  let TERM_HIDE = "term";
  try { if (localStorage.getItem(HIDE_KEY) === "def") TERM_HIDE = "def"; } catch (e) {}
  function setTermHide(v) {
    TERM_HIDE = v;
    try { localStorage.setItem(HIDE_KEY, v); } catch (e) {}
    renderTerms();
  }
  function renderTerms() {
    const qv = norm($("#term-q").value || ""), ch = $("#term-ch").value;
    const list = S.terms.filter(g => (!ch || g[0] === ch) && (!qv || norm(g[1] + g[2] + g[3].join("")).includes(qv)));
    const hideDef = TERM_HIDE === "def";
    $$("#term-hide button").forEach(b => b.setAttribute("aria-pressed", b.dataset.hide === TERM_HIDE));
    $("#term-count").textContent = list.length + " 語";
    $("#term-list").classList.toggle("hidedef", hideDef);
    $("#term-list").innerHTML = list.map(([c, t, d, a]) => {
      const alt = a.length ? `<small>${esc(a.join("／"))}</small>` : "";
      const name = hideDef ? `<b>${esc(t)}</b>${alt}` : `<span class="r">${esc(t)}</span>${alt}`;
      const def = hideDef ? `<span class="r">${esc(d)}</span>` : esc(d);
      return `<div class="term"><div class="tname">${name}</div><div class="tdef"><span class="chip">${esc(c)}</span>${def}</div></div>`;
    }).join("");
  }

  // ---- 出題設定（選択肢が1つしかない絞り込みは出さない） ----
  function renderSetup() {
    $("#quiz-setup").hidden = false; $("#quiz-run").hidden = true; $("#quiz-result").hidden = true;
    renderSeqCard($("#setup-seq"));
    renderPastCard($("#setup-past"));
    $("#set-past-l").hidden = !POOL.some(p => p.past);
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
    return { chs: vals("ch"), types: vals("type"), srcs: vals("src"), count: +$("#set-count").value, weak: $("#set-weak").checked, past: $("#set-past").checked, order: $("#set-order").value };
  }
  function filterPool(o) {
    const pastOk = p => !o.past || (o.past === true ? !!p.past : p.past === o.past);
    return POOL.filter(p => o.chs.includes(p.ch) && o.types.includes(p.type) && o.srcs.includes(p.src) && (!o.weak || isWeak(p)) && pastOk(p));
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
    const pastTag = p.past ? `<span class="pasttag">過去問${p.past !== "過去問" ? "：" + esc(p.past) : ""}</span>` : "";
    const timer = RUN.exam ? `<span class="timer" id="timer"></span>` : "";
    const seqTag = RUN.seq ? `<span class="seqtag">${RUN.seq.retry ? `やり直し${RUN.seq.round > 1 ? RUN.seq.round + "回目" : ""}` : "通し"} ${SEQ_POS.get(p.id)}/${SEQ_LIST.length}</span>` : "";
    let html = `<div class="qhead"><span>${n}</span>${timer}${seqTag}${pastTag}<span class="tag t-${q.type}">${TYPE_LABEL[q.type]}</span><span class="chip">${esc(p.ch)}</span><span class="srcl">${esc(SRC_LABEL[p.src] || "")}${p.name ? "：" + esc(p.name) : ""}</span></div>
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
    drawTimer();
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
      const el = $("#a0"), v = el.value, nv = norm(v); el.readOnly = true; it.stop = true;
      const kw = (q.kw || []).map(k => `<span class="kw${v && nv.includes(norm(k)) ? " hit" : ""}">${esc(k)}</span>`).join("");
      $("#fb").innerHTML = `<div class="model"><h4>模範解答</h4><div>${rich(q.model)}</div>${kw ? `<h4>キーワード</h4><div>${kw}</div>` : ""}${q.exp ? `<div class="exp">${rich(q.exp)}</div>` : ""}</div>`;
      setActions(`<button class="good-b" data-s="1">○ できた</button><button class="mid-b" data-s="0">△ 一部</button><button class="bad-b" data-s="0">× できなかった</button>`);
      $$("#actions [data-s]").forEach(b => b.onclick = () => { it.ok = b.dataset.s === "1"; record(it.p.id, it.ok); go(); });
    }
  }

  function finish(it, ok, ansHtml, allowOverride) {
    it.ok = ok; it.stop = true; record(it.p.id, ok);
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
    if (RUN.seq) return showSeqResult(done, ok, wrong, cut);
    if (RUN.exam) return showExamResult(done, ok, wrong, cut);
    $("#quiz-result").innerHTML = `<div class="card"><h2>結果</h2><div class="score"><b>${ok}</b> / ${done.length} 問 <span>${done.length ? Math.round(ok / done.length * 100) : 0}%</span></div>
      ${wrong.length ? `<h3>間違えた問題</h3><ul class="wronglist">${wrong.map(x => `<li><span class="tag t-${x.q.type}">${TYPE_LABEL[x.q.type]}</span> ${cut(x.q.q)}</li>`).join("")}</ul>` : done.length ? "<p>全問正解！</p>" : ""}
      <div class="actions">${wrong.length ? `<button class="primary" id="retry">間違えた問題をもう一度</button>` : ""}<button class="ghost" id="again">出題設定へ</button></div></div>`;
    const r = $("#retry");
    if (r) r.onclick = () => { RUN = { items: shuffle(wrong.map(x => ({ p: x.p, q: x.p.gen ? x.q : x.p.make(), ok: null }))), i: 0, endless: false }; showRun(); };
    $("#again").onclick = () => { RUN = null; renderSetup(); };
  }

  // 過去問を本番形式で通したときの結果：正答率・解答時間・1問ごとの時間。履歴に残す
  function showExamResult(done, ok, wrong, cut) {
    const ex = RUN.exam; clearInterval(ex.timer);
    const total = RUN.items.length, ms = examUsed();
    if (!ex.saved) {
      const st = PAST[ex.name] = PAST[ex.name] || { runs: [] };
      st.runs = [...st.runs, { at: Date.now(), ok, total, answered: done.length, ms, timeout: ex.timeout }].slice(-20);
      savePast(); ex.saved = true;
    }
    const runs = PAST[ex.name].runs, prev = runs[runs.length - 2];
    const status = ex.timeout ? "時間切れ" : done.length < total ? "途中で終了" : "";
    const unanswered = RUN.items.filter(x => x.ok === null);
    $("#quiz-result").innerHTML = `<div class="card"><h2>${esc(ex.name)}の結果${status ? `（${status}）` : ""}</h2>
      <div class="score"><b>${ok}</b> / ${total} 問 <span>${pct(ok, total)}%</span></div>
      <div class="kpis">
        <div class="kpi"><b>${mmss(ms)}</b><span>解答時間${ex.limit ? `（制限 ${mmss(ex.limit)}）` : ""}</span></div>
        <div class="kpi"><b>${mmss(done.length ? done.reduce((t, x) => t + x.ms, 0) / done.length : 0)}</b><span>1問あたり</span></div>
        <div class="kpi"><b>${done.length}</b><span>解いた問題${unanswered.length ? `（未解答 ${unanswered.length}）` : ""}</span></div>
        ${prev ? `<div class="kpi"><b>${pct(ok, total) - pct(prev.ok, prev.total) >= 0 ? "+" : ""}${pct(ok, total) - pct(prev.ok, prev.total)}pt</b><span>前回比（前回 ${pct(prev.ok, prev.total)}%・${mmss(prev.ms)}）</span></div>` : ""}
      </div>
      <h3>1問ごとの結果</h3>
      <ol class="examlist">${RUN.items.map(x => `<li><span class="emark ${x.ok === null ? "na" : x.ok ? "ok" : "ng"}">${x.ok === null ? "未" : x.ok ? "○" : "×"}</span><span class="chnum">${mmss(x.ms || 0)}</span><span>${cut(x.q.q)}</span></li>`).join("")}</ol>
      <div class="actions">${wrong.length + unanswered.length ? `<button class="primary" id="retry">間違えた・未解答の ${wrong.length + unanswered.length} 問を練習</button>` : ""}
        <button class="ghost" id="exam-again">もう一度通す</button><button class="ghost" id="exam-home">ホームへ</button></div>
      <p class="hint">記録は「過去問」の欄に前回・最高として表示されます。</p></div>`;
    const e = EXAMS.find(x => x.name === ex.name), lim = ex.limit / 60000;
    const r = $("#retry");
    if (r) r.onclick = () => { RUN = { items: [...wrong, ...unanswered].map(x => newItem(x.p)), i: 0, endless: false }; showRun(); };
    $("#exam-again").onclick = () => startExam(e, lim);
    $("#exam-home").onclick = () => { RUN = null; location.hash = "#home"; renderHome(); };
  }

  // 区切りの結果：間違えた問題だけやり直す／次の区切りへ／ここでやめる
  function showSeqResult(done, ok, wrong, cut) {
    const { done: nDone, total, rest } = seqProgress(), sq = RUN.seq;
    const to = Math.max(...RUN.items.map(x => SEQ_POS.get(x.p.id)));
    const partial = done.length < RUN.items.length;
    const title = sq.retry ? `やり直し${sq.round > 1 ? `（${sq.round}回目）` : ""}の結果` : `${sq.from}〜${to}問目の結果${partial ? "（途中で終了）" : ""}`;
    const nextLabel = !rest.length ? "" : partial && !sq.retry ? `続きから（${SEQ_POS.get(rest[0].id)}問目〜）` : `次の${Math.min(SEQ.size, rest.length)}問へ →`;
    $("#quiz-result").innerHTML = `<div class="card"><h2>${title}</h2>
      <div class="score"><b>${ok}</b> / ${done.length} 問 <span>${done.length ? Math.round(ok / done.length * 100) : 0}%</span></div>
      <div class="seqhead"><span class="hint">通し演習の進み具合</span><span class="chnum">${nDone} / ${total} 問</span></div>
      <div class="bar"><span style="width:${Math.round(nDone / total * 100)}%"></span></div>
      ${wrong.length ? `<h3>間違えた問題</h3><ul class="wronglist">${wrong.map(x => `<li><span class="tag t-${x.q.type}">${TYPE_LABEL[x.q.type]}</span> ${cut(x.q.q)}</li>`).join("")}</ul>`
        : done.length ? `<p>${sq.retry ? "全部できました！" : "全問正解！"}</p>` : ""}
      ${rest.length ? "" : `<p><b>全 ${total} 問を解き終わりました。</b>おつかれさまでした。</p>`}
      <div class="actions">
        ${wrong.length ? `<button class="primary" id="seq-retry">間違えた ${wrong.length} 問だけやり直す</button>` : ""}
        ${nextLabel ? `<button class="${wrong.length ? "ghost" : "primary"}" id="seq-next">${nextLabel}</button>` : ""}
        <button class="ghost" id="seq-quit">ここでやめる</button></div>
      <p class="hint">進み具合は1問ごとに保存しています。ホームの「通し演習」から続きを再開できます。</p></div>`;
    const r = $("#seq-retry"); if (r) r.onclick = () => retrySeq(wrong);
    const n = $("#seq-next"); if (n) n.onclick = startSeq;
    $("#seq-quit").onclick = () => { RUN = null; location.hash = "#home"; renderHome(); };
    if (fine()) ($("#quiz-result .actions .primary") || $("#seq-quit")).focus();
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
  $$("#term-hide button").forEach(b => b.onclick = () => setTermHide(b.dataset.hide));
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
