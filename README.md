# workbook-ui-template

1ファイルで動く「まとめ＋赤シート＋用語集＋問題演習」ドリルのテンプレートです。
共通部分（エンジン）と科目ごとの問題データを分けてあるので、**科目を増やすときは `data.js` を1つ書くだけ**で済みます。

```
src/
  drill.js        エンジン（データ登録 API・採点・画面・成績保存）
  drill.css       見た目（色は :root の変数で変更）
subjects/
  _template/      新しい科目のひな形（全形式の書き方見本つき）
  info-network/   実例：情報ネットワーク 後期中間（771問）
tools/
  new.mjs         ひな形から科目を作る
  check.mjs       問題データの誤りを検出
  build.mjs       CSS/JS を埋め込んで dist/<科目>.html（1ファイル）を作る
docs/
  know-how.md     元ドリルから取り出した、再利用できる工夫と設計ポイント
  ai-prompt.md    スライドやプリントから data.js を AI に作らせるときのプロンプト
```

## 使い方

Node.js 18 以上があれば動きます（依存パッケージなし）。

```bash
npm run new -- my-subject
```

`subjects/my-subject/data.js` を編集して、

```bash
npm run check -- my-subject
```

```bash
npm run build -- my-subject
```

`dist/my-subject.html` ができます。この1ファイルをスマホに送る、LMS に置く、などでそのまま使えます。
編集中は `subjects/my-subject/index.html` をブラウザで直接開けば確認できます（ビルド不要）。

## data.js の書き方（要点）

```js
Drill.setup({
  title: "科目名", subtitle: "試験名・範囲",
  storageKey: "my-subject-v1",                  // 成績の保存先（科目ごとに別にする）
  sections: { "1.1": "1.1 節の名前", ... },      // 範囲の絞り込み・進捗表示に使う
  sources:  { slide: "スライド", orig: "オリジナル" },
});
const { source, mc, tf, inp, fill, calc, ord, match, essay, terms, generators, summary } = Drill;

source("slide");                                         // 以降の問題の出典
mc("1.1", "問題文", ["選択肢0", "選択肢1", "選択肢2"], 1, "解説");
tf("1.1", "問題文", true);
inp("1.1", "問題文", ["正解", "別解"]);
fill("1.1", "［A］と［B］", [["A", "正解"], ["B", ["正解", "別解"]]]);
calc("1.1", "問題文", [{ label: "呼量", ans: 9600, unit: "bps" }], "解説");
ord("1.1", "順に並べよ", ["1番目", "2番目", "3番目"]);
match("1.1", "対応付けよ", ["左0", "左1"], ["右0", "右1"], [1, 0]);   // left[i] ↔ right[ans[i]]
essay("1.1", "説明せよ", "模範解答", ["キーワード1", "キーワード2"]);

terms([["1.1", "用語", "説明（用語そのものは書かない）", ["別解"]]]);   // 用語集＋自動で2問ずつ
generators([{ ch: "1.1", name: "名前", fn() { return { type: "calc", q: "…", parts: [...] }; } }]);
summary([{ ch: "1.1", title: "見出し", body: `<ul><li>[[赤字]]になる</li></ul>` }]);
```

全形式の見本は [`subjects/_template/data.js`](subjects/_template/data.js) にあります。

使わない機能は自動で隠れます。用語がなければ「用語集」タブと用語ボタンが、ジェネレータがなければ「計算ドリル」が、出典が1種類なら出典の絞り込み欄が出ません。

## 元のドリルから変えたところ

- 共通部分を `src/` に分け、問題データは `data.js` だけにした
- 説明が重なっていた文言を短くした
  - 「赤シートをかける（赤字を隠す）」→ ON/OFF が色でわかる「赤シート」ボタン1つ
  - 説明文やプレースホルダを短くした（例：「数値だけ入力（カンマ可）。小数はそのまま入力。誤差0.5%まで正解。」→「誤差0.5%まで正解」）
  - 選択肢が1つしかない絞り込み欄や、0問になるボタンは表示しない
- 「2択は並べ替えない」判定を、選択肢の文言に頼る正規表現から `choices.length > 2 && !fixed` に変えた
- 成績のIDを「先頭からの番号」から「問題内容のハッシュ」に変えた。問題を途中に追加しても、ほかの問題の成績がずれない
- PC では 1〜9 キーで選択肢を選べ、Enter で次へ進める
- データ検証（`npm run check`）を追加した。ブラウザのコンソールにも同じ警告が出る

詳しくは [docs/know-how.md](docs/know-how.md) を参照してください。
