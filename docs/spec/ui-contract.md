# Feature: 画面の部品の取り決め

> **Status:** Draft · 2026-11-13
> **Owner:** Taiki Mineno
> **Related:** [site.md](site.md)、[route-map.md](route-map.md)、[build.md](build.md)、[ADR-009](../adr/ADR-009-site-independent-ui.md)

## Goal

ページを組む部分(以下 html)、路線図の SVG を作る部分(core の `renderMapSvg`、以下 core)、閲覧時のスクリプト(以下 client)、CSS(以下 theme)が、この文書に書いた名前だけでつながる。どれかを書き換えるときは、この文書を見れば、ほかの部分が読んでいる名前が分かる。名前の食い違いは、閲覧したときには気づけない(機能が何も言わずに動かなくなる)ため、受け入れテストで見つける。

## Non-goals

- 閲覧時の振る舞いそのもの。振る舞いの正本は [site.md](site.md) と [route-map.md](route-map.md) で、この文書は振る舞いを動かすための名前だけを書く。
- 見た目(色・大きさ・配置)。
- 名前を変えたときに古い名前も受け付けること。名前を変えるときは、書く側と読む側を同じコミットで直す。

## Inputs / Outputs

表の「書く」は名前を HTML に出す部分、「読む」はその名前を使う部分である。振る舞いは、表の最後の列の節に書いてある。

### ページ全体

| 名前 | 付ける要素 | 値 | 書く | 読む | 振る舞い |
|---|---|---|---|---|---|
| `data-base` | `html` | ベースパス | html | client | [build.md](build.md)「出力」 |
| `data-defs` | `html` | `defs.json` の URL(版の印付き) | html | client | P-01 |
| `data-theme`・`data-text`・`data-width` | `html` | 表示の設定の値。初期値のときは付けない | head の中のスクリプト、client | theme | P-09 |
| `reduce-motion`(クラス) | `html` | 動きを減らす設定のときに付く | client | theme | [site.md](site.md)「Performance / Safety」 |
| `page-chapter`(クラス) | `body` | 章ページに付く | html | client(分野の切り替えを章ページだけで動かす) | P-05 |
| `#_fields` | `script[type="application/json"]` | 分野の並び `[{ id, title }]` | html | client | P-05 |
| `#_stations` | `script[type="application/json"]` | 執筆済みの駅を読む順に並べた `[{ id, code, name, ch, chapter }]`。`ch` は章番号、`chapter` は章の ID | html | client | P-10 |
| `#_pop` | `div.pop[role="dialog"][hidden]` | ポップアップを入れる要素 | html | client | P-01・P-11 |
| `defs.json` | (ファイル) | [build.md](build.md)「定義索引」 | html | client | P-01 |

### 分野の切り替え(P-05)

| 名前 | 付ける要素 | 値 | 書く | 読む |
|---|---|---|---|---|
| `data-set-field`、上端のバーの分野の切り替え `.switch` | 押せる要素 | 分野の ID。「指定なし」は空 | html | client:押すと分野を切り替える。`.switch` の中の要素には `aria-pressed` を付け直す |
| `data-for` | 任意 | 分野の ID か空 | html | client:選んだ値(未選択は空)と一致する要素だけを表示し、ほかは `hidden` にする |
| `data-goal-for` | 目標の印(`.goal-note`) | 分野の ID | html | client:未選択のときと、一致するときに表示する |
| `.vgroup` と、その直下の `details.v[data-field]` | 版の組と各版 | 分野の ID | html | client:選んだ分野の最初の版に `primary` を付けて開く。ほかの版は表示の設定の openOther に従う。`details.v.primary > summary` を押しても閉じない |
| `data-out`、駅の中の範囲外の印 `.out-label` | `section.station`、現在地バーのリンク | その駅が範囲外になる分野の ID を空白で区切った並び | html | client:選んだ分野が含まれていれば、駅には `is-out` を付けて中の `.out-label` を表示し、ほかの要素には `off` を付ける |

### 折りたたみとアンカー(P-04)

| 名前 | 付ける要素 | 書く | 読む |
|---|---|---|---|
| `details.fold.proof`・`details.fold.answer` | 証明の詳細、確認問題の答え | html | client:表示の設定の openProof・openAnswer に従って開閉する |
| アンカーの指す `id` | 任意 | html | client:アンカーの指す要素が `details` ならそれを開き、要素を囲む `details` もすべて開く([site.md](site.md)「ページと URL」) |

### ポップアップ(P-01・P-11)

| 名前 | 付ける要素 | 値 | 書く | 読む |
|---|---|---|---|---|
| `button.term[data-def]` | 本文の用語 | 定義の ID | html | client:`defs.json` の項目を出す |
| `.note-ref a[data-note]`、注の一覧の項目 `#_note-<注番号>-text` の中の `.note-body` | 注の印と、注の一覧の項目 | 注番号。`href` は `#_note-<注番号>-text` | html | client:注の一覧の項目の `.note-body` の写しを出す |
| `a.cite[data-cite]`、参考文献の項目 `#<文献ID>` の中の `.ref-body` | 文献の印と、参考文献の項目 | 文献の ID | html | client:参考文献の項目の `.ref-body` の写しを出す |
| `aria-expanded` | 上の3つ | 開いているときだけ `true` | html(初期値 `false`)、client | client |

### 現在地バー(P-02)

| 名前 | 付ける要素 | 値 | 書く | 読む |
|---|---|---|---|---|
| `.mini a[data-st]` | 現在地バーのリンク | 駅の ID | html | client:読んでいる駅のリンクに `on` と `aria-current="location"` を付ける |
| `section.station[data-station]` | 駅 | 駅の ID | html | client:画面に入った駅を、読んでいる駅とする |

### 路線図(P-03、[route-map.md](route-map.md)「図の操作」)

| 名前 | 付ける要素 | 書く | 読む |
|---|---|---|---|
| `.map-scroll` | 図の枠 | html | client:`pan` を付けてドラッグで動かす。ドラッグ中は `dragging` を付ける。中に `.map-tools` を作る |
| `svg.map` の `width`・`height`・`viewBox` | 図 | core | client:倍率から `data-lod` を付ける |
| `svg.map a.ch` と、その中の `rect.card`。今の章は `rect.card.current` | 章の札 | core | client:ポインターが札の上にあるあいだ `a.ch` に `on` を付ける。開いたときに今の章の札を枠の中央に寄せる |

### 起票とコピー(P-07・P-08・P-12)

| 名前 | 付ける要素 | 値 | 書く | 読む |
|---|---|---|---|---|
| `article.chapter[data-chapter]` | 章の本文 | 章番号 | html | client |
| `data-source` | `article.chapter` | 原稿のファイルの URL。`SITE_REPO_URL` を渡したビルドだけに付く | html | client |
| `data-loc` | 区画(駅と、「この章のゴール」「出発点」「ふりかえり」「確認問題」「参考文献」の節) | 区画の名前。駅は表示番号、節は節の名前 | html | client |
| `data-p` | 段落 | 区画の中の段落の番号([site.md](site.md)「位置情報つきのコピー」) | html | client |
| `data-l` | 段落 | 原稿の行。`N` か `N-M`。`SITE_REPO_URL` を渡したビルドだけに付く | html | client |
| `data-issue` | 区画 | その区画の起票の URL。`SITE_REPO_URL` を渡したビルドだけに付く | html | client |
| `a.issue[data-page]` | 駅の起票のリンク | ページのパス | html | client:オリジンを足し、リンクの URL の `page` の欄に入れる |
| `.eq-num`・`.st-tools`・`.note-ref`・`.note-back`、`hidden` の要素 | コピーしない要素 | — | html | client:選んだ範囲から除く |
| `.katex` の中の `annotation[encoding="application/x-tex"]`、別行立ての式の親の `.katex-display` | 数式 | — | KaTeX | client:数式を TeX に戻してコピーする |

### しおり(P-10)

| 名前 | 付ける要素 | 値 | 書く | 読む |
|---|---|---|---|---|
| `button.bm[data-bm][hidden]` | 駅のしおりのボタン | 駅の ID | html | client:表示し、`aria-pressed`・`aria-label`・`data-tip` を付け直す |
| `.bar .bm-open[hidden][aria-controls="_bookmarks"]` | 上端のバーのしおりのボタン | — | html | client:表示し、押すと一覧(`#_bookmarks`)を開く |

### client が作る要素

theme は、client が作る次の要素と、client が付ける状態のクラスを読む。

| 機能 | 名前 |
|---|---|
| ポップアップの中身 | `.pop-h`・`.badge`・`.pop-en`・`.pop-body`・`.flow`(`.pop-body` に一緒に付ける。html が本文の枠に付けるものと同じ)・`.pop-s`・`.pop-go` |
| 選択メニュー | `.copy-menu`・`[data-copy]`・`[data-act]`・`.copy-sep`・`.copy-status`・`[data-tip]` |
| 路線図の操作 | `.map-tools` |
| しおりの一覧 | `#_bookmarks.bm-panel`・`.bm-list`・`.bm-empty`・`.bm-del` |
| 表示の設定 | `.settings-btn`・`#_settings.settings`・`.seg`・`.check`・`.settings-actions`・`.settings-status` |
| 状態のクラスと属性 | `primary`・`is-out`・`off`・`on`・`pan`・`dragging`・`data-lod`(`svg.map` に付ける) |

### ブラウザに保存するもの

接頭辞は `content/site.yml` で決める([ADR-009](../adr/ADR-009-site-independent-ui.md))。MathEnaga の接頭辞は `mathenaga` である。

| キー | 値 | 読み書きする機能 |
|---|---|---|
| `<接頭辞>-field` | 分野の ID。「指定なし」は空文字列 | P-05 |
| `<接頭辞>-settings` | 表示の設定の JSON オブジェクト。初期値に戻すと消す | P-09 |
| `<接頭辞>-map-zoom` | 路線図の倍率(数) | 路線図の操作 |
| `<接頭辞>-bookmarks` | 駅の ID の JSON 配列。空になると消す | P-10 |

### 名前の付け方

- ツールが付ける id は `_` で始め、原稿の ID と衝突させない([site.md](site.md)「ページと URL」)。
- 表示の設定の選択肢は1か所で定め、head の中のスクリプトと client は、その定義から作る。

## Failure modes

| きっかけ | 外から見える振る舞い |
|---|---|
| ページに取り決めの要素がない(章ページ以外、`SITE_REPO_URL` を渡さないビルド、注のない章など) | その要素を使う機能だけが動かない。ほかの機能は動き、例外を出さない |
| 埋め込みの JSON(`#_fields`・`#_stations`)が読めない | 空の配列として扱う |
| 保存した値が選択肢にない、または JSON として読めない | 無視して初期値にする |
| 書く側の名前と読む側の名前が食い違う | 閲覧したときには、機能が何も言わずに動かなくなるだけで気づけない。受け入れテスト 1・2 で見つける |

## Performance / Safety

| 項目 | 要件 |
|---|---|
| 埋め込みの JSON | `<` を `<` にして、`</script>` で要素が閉じないようにする |
| HTML として差し込むもの | client が HTML として差し込むのは、同じサイトの `defs.json` の `html`、同じページの中の注と書誌の写し、client に書いたアイコンだけにする |
| 速度 | Not load-bearing — no constraint |

## Acceptance tests

1. client のソースの中で、セレクタや属性名を受け取る呼び出し(`querySelector`・`querySelectorAll`・`closest`・`matches`・`getElementById`・`getAttribute`・`setAttribute`・`removeAttribute`・`classList`)と、`className`・`id` への代入に渡した文字列から、クラス名・id・`data-` 属性名を集める。その集合は、この文書の表の「名前」の列に出てくる名前の集合と一致する(「付ける要素」の列は説明なので比べない)。ソースにあって表にない名前と、表にあってソースにない名前は、どちらも0個である。表から1行を消すと、このテストは落ちる。文字列をつないで組み立てる名前(`#_note-<注番号>-text` の `.note-body`、`#<文献ID>` の `.ref-body`、`data-<項目>`)は、組み立てる部分の文字列(`'#_note-'`・`'-text .note-body'`・`' .ref-body'`・`'data-' + k`)が client のソースにあることを確かめて、ソースの名前に数える。名前の列の `<…>` は差し込む値で、名前はその手前までとする。
2. テスト用原稿でビルドした全ページを合わせると、表の「書く」が html か core になっている名前がすべて出てくる。`SITE_REPO_URL` を渡したビルドだけに付く名前は、渡したビルドで確かめる。
3. テスト用原稿の章ページから `#_stations` を消して開くと、しおりのボタンは表示されないままで、分野の切り替えと用語ポップアップは動き、ページの例外は0件である。
4. 表示の設定のうち html の属性で切り替える項目について、初期値以外の値(theme の `light`・`dark`、text の `small`・`large`、width の `narrow`・`wide`)ごとに、theme に `[data-<項目>='<値>']` が出てくる。head の中のスクリプトが受け付ける値は、client の選択肢の定義と同じである。選択肢の定義に値を1つ足すと、theme にその値の規則がないので、このテストは落ちる。
5. ブラウザに保存するキーは表の4つだけである。MathEnaga のビルドでは `mathenaga-field`・`mathenaga-settings`・`mathenaga-map-zoom`・`mathenaga-bookmarks` になり、今の読者が保存した値をそのまま読める。

## Open questions

- なし。
