<h1><img src="docs/assets/banner.svg" alt="MathEnaga" width="332" height="118"></h1>

大学数学を、物理・情報など他分野の学生に届ける静的サイトと、それを原稿から作るビルドツール。

数学の概念を「駅」、分野の流れを「路線」に見立て、路線図で今いる場所と目標までの道のりを示す。読者は自分の分野(理論物理・情報科学)を選んで、その分野に必要な範囲と応用を読める。

[公開先](https://tmineno.github.io/mathenaga/)
[コンセプト](docs/spec/README.md)

## 必要なもの

- Node.js 22 以上と npm
- テストを実行するなら、Playwright が使う Chromium

```sh
npm ci
npx playwright install chromium   # npm test の閲覧テストに使う
```

## コマンド

| コマンド                          | 内容                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                   | `content/` を検査し、通れば `dist/` にサイトを書き出す。エラーがあれば `dist/` には触れない                             |
| `npm run dev`                     | ビルドして `http://127.0.0.1:8000/` で配信する。`content/` と `src/` を保存するたびに作り直し、ブラウザを再読み込みする |
| `npm test`                        | 単体テスト・結合テストと、Playwright でブラウザを動かす閲覧テストを実行する                                             |
| `npm run format` / `format:check` | Prettier で整形する / 整形済みか確かめる                                                                                |
| `npm run lint`                    | ESLint                                                                                                                  |
| `npm run typecheck`               | JSDoc の型を TypeScript で検査する                                                                                      |
| `npm run banner`                  | `src/site/assets/logo.txt` から README のバナー(`docs/assets/banner.svg`)を作り直す                                     |

環境変数:

- `MATHENAGA_BASE_PATH`:サイトを置くパス。既定は `/`。`/` で始まり `/` で終わる(例:`/mathenaga/`)
- `MATHENAGA_REPO_URL`:改善案を起票する GitHub のリポジトリ(`https://github.com/<owner>/<repo>`)。渡すと各駅に Issue 起票のアイコンが出て、本文を選んだときのメニューに「起票」と「編集」(GitHub で原稿の該当行を開く)が出る。公開のワークフローはリポジトリの URL を渡す
- `PORT`:`npm run dev` のポート。既定は 8000

ビルドのエラーは `E05 chapters/03-completeness-fixed-point/index.md:12 …` のように、コードとファイルと行で出る。コードの意味は [content-format.md の Failure modes](docs/spec/content-format.md#failure-modes) にある。

## 原稿を書く

```
content/
  lines.yml                       路線(記号・名前・色・配置・未執筆の章)
  fields/<分野ID>.yml             分野(名前・紹介文・目標の駅)
  chapters/<章番号>-<章ID>/
    index.md                      章の本文
    figures/                      章で使う図(任意)
```

- 章番号は章フォルダの接頭辞で決まる(`03-completeness-fixed-point` は第3章、章 ID は `completeness-fixed-point`)
- 章の md は、front matter(`title`・`subtitle`・`line`)、章頭、`## 駅名 {#ID …}` で始まる駅、章末で書く。駅の中身は `::: definition` などの囲むブロックで書く
- 数式は KaTeX。別行立ての式 `$$…$$` には章ごとの式番号 (3.1) が付き、`{#ID}` を付けると `[[@ID]]` で参照できる
- 定義と定理には章ごとの通し番号(定義 3.1、定理 3.4)が、分野での応用には別の通し番号(応用 3.2)が付き、ID を `[[@ID]]` と書くと番号で参照できる
- 図は章フォルダの `figures/` に置き、画像だけの段落に `![代替テキスト](figures/x.svg "キャプション"){#ID}` と書く。章ごとの図番号(図 3.1)が付き、`[[@ID]]` で参照できる。キャプションの `$…$` は数式として描く
- 用語や駅へのリンクは `[[コーシー列]]` や `[[banach|バナッハの不動点定理]]` と書く
- まだ書いていない章は、`lines.yml` の路線に `planned`(章番号・タイトル・予定の駅名)として書くと、全体の路線図に灰色で出る。章フォルダの仮原稿は要らない

書き方の規則と、ビルドが検査する内容は [docs/spec/content-format.md](docs/spec/content-format.md) にある。完成した章の例は [第3章](content/chapters/03-completeness-fixed-point/index.md)。

## ディレクトリ

| パス           | 内容                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------- |
| `content/`     | 原稿                                                                                         |
| `src/core/`    | 記法の解析、章グラフ、名前の解決、表示番号と式番号、路線図の配置。入出力を持たない純粋な関数 |
| `src/render/`  | markdown-it と KaTeX による描画                                                              |
| `src/io/`      | 原稿の読み込みと `dist/` への書き出し                                                        |
| `src/site/`    | ページの組み立てと、閲覧時の CSS・スクリプト                                                 |
| `src/dev/`     | `npm run dev` のサーバー                                                                     |
| `src/build.js` | ビルドの入口                                                                                 |
| `tests/`       | 単体テスト(`unit/`)、結合テスト(`integration/`)、閲覧テスト(`browser/`)                      |
| `scripts/`     | 開発用のスクリプト(README のバナーの生成)                                                    |
| `docs/spec/`   | 仕様書。仕様とコードが食い違ったら仕様が正しい                                               |
| `docs/adr/`    | 設計の決定記録                                                                               |

## 仕様

| 文書                                               | 扱う範囲                                   |
| -------------------------------------------------- | ------------------------------------------ |
| [content-format.md](docs/spec/content-format.md)   | 原稿の形式と検査の規則                     |
| [build.md](docs/spec/build.md)                     | ビルドツール、導出する値、出力、CI と公開  |
| [route-map.md](docs/spec/route-map.md)             | 路線図の SVG                               |
| [site.md](docs/spec/site.md)                       | 生成するページと閲覧時の機能               |
| [ADR-001](docs/adr/ADR-001-handmade-build-tool.md) | ビルドツールをフレームワークなしで自作する |
| [ADR-002](docs/adr/ADR-002-definition-index.md)    | 用語の定義を定義索引から一括で取得する     |

## CI と公開

- CI(`.github/workflows/ci.yml`)は format → lint → typecheck → test の順に実行する。main はブランチ保護で CI の `check` を必須にしている
- 変更はブランチから PR を作り、`check` が通ってから `gh pr merge --merge` でマージする。ローカルで作ったマージコミットは main に push できない
- main に入ると、`.github/workflows/pages.yml` がベースパス `/<リポジトリ名>/` でビルドし、GitHub Pages に置く
