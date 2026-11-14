# ADR-009: 画面の部品からサイト固有の値を外に出し、同じ形の別サイトを作れるようにする

## Context

MathEnaga と同じ形のサイト(路線・駅・分野で章を並べ、章ページで分野を切り替えて読むサイト)を、別の科目や別の運営者が作れるようにしたい。今は、2つ目のサイトの計画はない。

今の画面は3つのファイルでできている(2026-11-13 の main 879fb23、`wc -l`)。

| ファイル | 役割 | 行数 |
|---|---|---|
| `src/site/pages.js` | `analyze()` の結果から、トップページ・分野の入口ページ・章ページの HTML を組む | 967 |
| `src/site/assets/app.js` | 閲覧時の機能(P-01〜P-12)。1つの即時関数で、ビルドを通さずに配信する | 1631 |
| `src/site/assets/style.css` | 色・書体・幅のトークンと、部品ごとの規則 | 1667 |

この形では、別のサイトを作るとコードを書き換えることになる。理由は次の4つである。

- **サイト固有の値がコードに直接書いてある。** サイト名(`SITE_NAME`)、`lang="ja"`、ロゴのドット絵(`src/site/assets/logo.txt`)、Google Fonts の URL、色と書体のトークン、ブラウザに保存するキー4つ(`mathenaga-field` など)、原稿の URL のブランチ名(`/blob/main/`)。`grep -rnE "'MathEnaga'|mathenaga-|fonts\.googleapis\.com/css2" src/site/ src/core/` は7行に当たる。
- **文言がコードに散っている。** 引用符の後に日本語が続く行(コメントの行を除く)は、`pages.js` に 81、`app.js` に 55、`src/core/map.js` に 21 ある。閲覧者に見える文言のほか、ビルドの通知の文も含んだ数である。
- **路線図のレイアウトが文言に依存している。** `src/core/map.js` は、目標の札の幅を「途中の目標」という文字列で見積もり(56 行目)、駅名の折り返しを「の・」「とや」の後ろで決めている(98〜99 行目)。
- **`pages.js` と `app.js` のあいだの取り決めが、どこにも書かれていない。** `app.js` には、`data-` 属性の名前が 24 種類(`app.js` が自分で付けるものを含む)、`getElementById` で引く id が 3 つ(`_fields`・`_stations`・`_pop`)、セレクタの文字列の中のクラス名が 26 種類出てくる。どの名前を出すかは `pages.js` のコードにしか書かれていない。表示の設定の選択肢は、`pages.js` の `LOOK_SCRIPT`、`app.js` の `CHOICES`、`style.css` のセレクタの3か所に別々に書かれている。

## Decision

### 範囲

- 同じ形の別サイトを、`src/` を変えずに `content/` を差し替えるだけで作れるようにする。日本語以外の言語のサイトも対象にする。
- 次のものは変えない:原稿の形式(サイトの設定のファイルを足すことを除く)、章ページの構成と閲覧時の機能([site.md](../spec/site.md))、路線図の描き方([route-map.md](../spec/route-map.md))、ページの URL、MathEnaga の読者がブラウザに保存した値。
- 言語ごとに変えるのは、閲覧者が見るものだけにする。ビルドのエラーと通知の文と、`npm run refs:verify` の出力(執筆者が読むもの)は英語だけで書き、言語ごとには変えない(2026-11-14 に人間が決めた)。エラーと通知のコード(E01・N01 など)と、ファイルと行番号の出し方は変えない。

### サイトごとの値は content/ に置く

| 値 | 今の場所 | 移す先 |
|---|---|---|
| サイト名 | `pages.js` の `SITE_NAME` | `content/site.yml` |
| ページの言語(言語ごとの処理も選ぶ) | `pages.js` の `lang="ja"` | `content/site.yml` |
| ロゴのドット絵 | `src/site/assets/logo.txt` | `content/assets/logo.txt` |
| 書体の読み込み先 | `pages.js` の `FONTS` | `content/site.yml` |
| 色と書体のトークンの上書き | `style.css` の `:root` | `content/assets/theme.css`(任意) |
| ブラウザに保存するキーの接頭辞 | `app.js` の `mathenaga-`(4か所) | `content/site.yml`。MathEnaga は `mathenaga` のままにする |
| 原稿のブランチ名 | `pages.js` の `/blob/main/` | `content/site.yml`(既定は `main`) |
| 文言の上書き | なし | `content/site.yml` の `messages` |

`site.yml` の形式と検査は [content-format.md](../spec/content-format.md)「サイトの設定」に書く。

### 言語ごとの処理

言語によって変わるものを `src/ui/locales/<言語>.js` に集め、`site.yml` の `lang` で選ぶ。今は `ja` だけを用意する。ほかの言語は、ファイルを1つ足して加える。

| 処理 | 中身 | 今の場所 |
|---|---|---|
| 文言の辞書 | 番号の形(「第{n}章」「定理 {number}」)、ブロックの札、区画の名前(「出発点」など)、アイコンの説明、Issue の題名の接頭辞(「[改善案] 」)、路線図の札と代替テキスト | `pages.js`・`app.js`・`core/map.js` |
| 書誌の形 | 参考文献の項目の組み立て。`ja` では、書名・題名で和文と欧文を分ける([site.md](../spec/site.md)「注と参考文献の表示」) | `pages.js` の `bibliography` |
| 路線図の折り返しの規則 | 駅名と章のタイトルを折り返す位置の選び方。`ja` では、「の」「・」の後ろ、「と」「や」と空白の後ろ、文字の種類の変わり目の順に選ぶ | `core/map.js` の `wrapText` |
| 文字幅の見積もり | 路線図の札の幅を決めるための、文字列のおおよその幅。`ja` では、U+2E80 以上の文字を 1em、ほかを 0.58em とみなす | `core/map.js` の `textWidth` |

- 辞書の値は文字列にし、番号などは `{n}` の形で差し込む。`site.yml` の `messages` で項目ごとに上書きできる。
- core は、折り返しの規則・文字幅の見積もり・路線図の文言を引数で受け取る。core に依存も入出力も持たせない方針(ADR-001)は変えない。

### ディレクトリ

```
src/
  core/  render/  io/  dev/  refcheck/  build.js   今のまま
  ui/
    shared/    html と client の両方が読む定義(表示の設定の選択肢、保存キーの名前)
    locales/   言語ごとの処理(ja.js)
    html/      今の pages.js と logo.js。ページを部品の関数で組む
    client/    今の app.js。機能ごとのモジュールに分ける
    theme/     今の style.css。トークンと部品ごとのファイルに分ける
```

- 依存は、html から core・render・shared・locales へ、client から shared と locales の文言へ、の向きだけにする。client は core を読まない。
- html(と、路線図の SVG を作る core)と client・theme は、[ui-contract.md](../spec/ui-contract.md) に書いた名前だけでつなぐ。
- npm のパッケージにはしない。

### 配信

- client は、ビルドが esbuild で `assets/app.js` の1ファイルにまとめる。形は即時関数にする。文言と保存キーの接頭辞は、まとめるときに埋め込む。esbuild は `dependencies` に足し、版を完全に固定する(ADR-001)。
- theme は、ビルドが決まった順につないで `assets/style.css` にし、最後にサイトの `theme.css` を足す。路線の色の `assets/lines.css` は今のままにする。
- head の中で表示の設定を html の属性に移すスクリプト(今の `LOOK_SCRIPT`)は、shared の選択肢の定義から作る。
- ページの URL と版の印([build.md](../spec/build.md)「出力」)は変わらない。

### ツールの名前

- ビルドツールと画面の部品(`src/` 全体)を enaga と呼ぶ。MathEnaga は、enaga で作った最初のサイトの名前になる(2026-11-14 に人間が決めた)。
- `package.json` の `name` を `enaga` にする。文献の確認の User-Agent を `enaga-reference-check` にする([reference-check.md](../spec/reference-check.md))。
- リポジトリの名前と、MathEnaga の URL は変えない。

### 環境変数

- 名前を `SITE_BASE_PATH`・`SITE_REPO_URL` に変える。ツールの名前は付けない(2026-11-14 に人間が決めた)。
- 古い名前(`MATHENAGA_BASE_PATH`・`MATHENAGA_REPO_URL`)も受け付ける。古い名前だけを渡したときはその値を使い、通知 N05 を出す。新しい名前と古い名前に違う値を渡したときは、E13 で止める([build.md](../spec/build.md))。
- 公開のワークフロー(`.github/workflows/pages.yml`)は、新しい名前で渡す。

### テスト用原稿

- テスト用原稿(`tests/fixtures/content/`)にも `site.yml` と `assets/logo.txt` を足す(2026-11-14 に人間が決めた。ADR-004)。値は MathEnaga と同じ(`name` は MathEnaga、`lang` は `ja`、`storage_prefix` は `mathenaga`、ロゴは MathEnaga のもの)にし、今の受け入れテストの期待値を変えない。
- `site.yml` の値がページに届くことは、テストが一時ディレクトリに写したテスト用原稿の `site.yml` を書き換えて確かめる。

## Consequences

- 別サイトは、`src/` と `package.json` などを写し、`content/` を差し替えて作る。パッケージにするまでは、MathEnaga 側の改修を別サイトへ取り込む作業は手作業になる。
- 切り離しが済んだかは、`grep -rnE "'MathEnaga'|mathenaga-|fonts\.googleapis\.com/css2" src/` が0行で、`git ls-files src` に `logo.txt` がないことで確かめる。今の `src/` では前者が8行に当たる(Context の7行と、`src/refcheck/lookup.js` の User-Agent)。書体の読み込み先は Google Fonts に限るので([content-format.md](../spec/content-format.md)「サイトの設定」)、`fonts.googleapis.com` のオリジンそのものはコードに残る。検査は、MathEnaga の書体を選んだ CSS の URL(`/css2?…`)だけを対象にする。古い環境変数の名前(`MATHENAGA_BASE_PATH` など)は大文字なので、この検査には当たらない。
- 依存が1つ増える(esbuild)。esbuild は、プラットフォームごとのバイナリを optional な依存として入れる。CI(GitHub Actions の Linux)と手元で同じ版を使う。
- 仕様([content-format.md](../spec/content-format.md)・[build.md](../spec/build.md)・[site.md](../spec/site.md)・[route-map.md](../spec/route-map.md)・[reference-check.md](../spec/reference-check.md)・[ui-contract.md](../spec/ui-contract.md))は、この ADR と一緒に直した。実装では、公開のワークフローと、環境変数の名前を使うテスト(`tests/integration/build.test.js` など)も直す。
- ロゴの元データの場所が変わるので、`scripts/banner.js` と `tests/integration/logo.test.js` を直す。`tests/unit/style.test.js` は、読む CSS のパスを直す。
- 表示の設定の選択肢の定義が1か所になり、head のスクリプトと client の食い違いが起きなくなる。ダークの値の2か所(OS の設定に合わせるときと、表示の設定でダークを選んだとき)は CSS の書き方の制約で残るので、引き続き `tests/unit/style.test.js` で確かめる。
- GitHub Pages のプロジェクトサイトは、同じ持ち主のものどうしでオリジン(`<owner>.github.io`)を共有する。接頭辞を変えれば、同じオリジンに2つのサイトを置いても、保存した値がぶつからない。
- 言語ごとの処理として用意するのは `ja` だけなので、何を辞書に入れ、何を関数にするかの区切りは、`ja` の1例だけで決めることになる。2つ目の言語を足すときに見直す(Exit criteria)。
- ビルドのエラーと通知の文が、日本語から英語に変わる。MathEnaga の執筆者(人間と AI エージェント)も英語の文を読むことになる。コードは変わらないので、コードで書いた AGENTS.md の手順はそのまま使える。
- ファイルの分割と移動(構造の変更)と、値を外に出す変更は、別のコミットにする。構造の変更では、テスト用原稿でビルドした `dist/` の HTML が、変更の前後で `?v=` の値を除いて同じであることと、`npm test` が通ることを確かめる(`app.js` と `style.css` は、まとめ方が変わると中身と版の印が変わる)。

## Alternatives

**置き方**

| 方式 | 内容 | 長所 | 短所 |
|---|---|---|---|
| リポジトリの中でディレクトリを分ける(採用) | 上の `src/ui/` | 公開 API を固めずに済む。今のテストがそのまま使える | 別サイトへの取り込みは手作業 |
| npm workspaces | `packages/*` に分け、それぞれに `package.json` を置く | 依存の向きを `package.json` で強制できる | 利用者が1つのうちは、版と依存の管理が増えるだけ |
| npm に公開する | 版を付けて公開する | 別サイトが npm で取り込める | 公開 API の互換を守る責任が生じる。利用者がいないうちに固めると、MathEnaga の都合がそのまま API になる |
| 何もしない | 別サイトは MathEnaga を写して値を書き換える | 今は手間がない | 値が3つのファイルに散っているので、改修を取り込むたびに書き換え直す |

**client の配信**

| 方式 | 内容 | 長所 | 短所 |
|---|---|---|---|
| esbuild で1ファイルにまとめる(採用) | ビルドが即時関数の1ファイルにする | 今の配信の形(1ファイルで、版の印を1つ付ける)を変えない | 依存が1つ増える |
| import map | ES モジュールのまま配信し、import map でモジュールごとに版の印を付ける | 依存が増えない | 読み込むファイルが機能の数だけ増える。すべてのページに import map を書く |
| ソースを連結する | 即時関数の中身をファイルに分け、ビルドが順につなぐ | 依存が増えない | ファイル間の依存がソースに書かれず、つなぐ順に頼る |

**言語の範囲**

| 方式 | 内容 | 長所 | 短所 |
|---|---|---|---|
| 言語ごとの処理を差し替えられるようにする(採用) | 文言・書誌の形・折り返しの規則・文字幅の見積もりを `locales/<言語>.js` にまとめる | 日本語以外のサイトも、ファイルを1つ足せば作れる | `ja` の1例だけで区切りを決めるので、2つ目の言語で見直しが要りうる |
| 日本語のサイトだけにする | 文言だけを辞書にし、書誌と折り返しは日本語用のまま残す | 変える箇所が少ない | 日本語以外のサイトを作るときに、core と html をもう一度書き換える |

**執筆者が読む文(ビルドのエラーと通知、`npm run refs:verify` の出力)**

| 方式 | 長所 | 短所 |
|---|---|---|
| 英語だけにする(採用) | どの言語のサイトの執筆者も読める。文が1組で済む | MathEnaga の執筆者も英語で読むことになる |
| 日本語のまま | 今の文を変えなくてよい | 日本語を読めない執筆者は、エラーを読めない |
| 言語ごとにする | 執筆者がサイトの言語で読める | 言語ごとの処理の辞書が大きく増え、言語を足すたびにエラーの文もすべて訳す |

**環境変数の名前**

| 方式 | 長所 | 短所 |
|---|---|---|
| `SITE_` に変え、古い名前も受け付ける(採用) | ツールの名前が変わっても変数名は変わらない。今の CI と手元の設定がすぐには壊れない | 古い名前を読む処理が、消すまで残る |
| `ENAGA_` に変える | ほかの道具の変数とぶつかりにくい | ツールの名前を変えると、変数名も変わる |
| 今の名前のまま | 何も変えなくてよい | 別サイトの設定に MathEnaga の名前が残る |

フレームワークのテーマにする案(Eleventy・Astro)は、ADR-001 と同じ理由で採らない。

## Exit criteria

次のどれかが起きたら、この決定を見直す。

- 2つ目のサイトを実際に始めたとき。パッケージにするか(npm workspaces か、npm への公開か)を決める。古い環境変数の名前を受け付ける処理も、このときに消す。
- 2つ目の言語の処理を足すとき。何を辞書に入れ、何を関数にするかの区切りを見直す。
- esbuild が保守されなくなったとき。
