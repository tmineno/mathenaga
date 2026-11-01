# ADR-001: ビルドツールをフレームワークなしで自作する

## Context

MathEnaga のビルドには、一般的な静的サイトジェネレーターにない処理が要る。全章の見出しを先に読んで章グラフを作る前処理、名前の解決、表示番号と式番号、路線図の SVG、定義索引、原稿の検査である([build.md](../spec/build.md)、[route-map.md](../spec/route-map.md))。記法は、markdown-it の囲むブロック(`:::`)と見出し属性(`{#ID …}`)を前提にしている([content-format.md](../spec/content-format.md))。

2026年11月の検討で、Eleventy と Astro を比べた(Alternatives)。どちらを使っても、上の処理は自作になる。

## Decision

- ビルドツールは、フレームワークを使わずに自作する。
- Node.js 22 以上、ESM、素の JavaScript に JSDoc で型を書く。
- MathEnaga 独自の処理はコアにまとめる。コアは外部ライブラリに依存させず、入出力もしない純粋な関数にする。
- markdown-it(markdown-it-container、markdown-it-attrs)、KaTeX、js-yaml を直接使う。バージョンは完全に固定する。

| 部分 | 役割 | 使うもの |
|---|---|---|
| 読み込み | 路線ファイル・分野ファイル・章の md を読む | js-yaml、markdown-it(markdown-it-container、markdown-it-attrs) |
| コア | 記法の解析、グラフの構築と検証、名前の解決、表示番号と式番号、路線図の SVG、定義索引 | 自作。外部ライブラリに依存しない |
| 数式 | TeX をビルド時に HTML にする | KaTeX |
| ページの組み立て | 章ページ・分野の入口ページ・トップページの HTML を作る | 自作の JavaScript の関数 |
| プレビュー | ファイルを監視し、変更のたびに全体を作り直してブラウザを再読み込みする | 自作 |
| 公開 | ビルドして GitHub Pages に置く | GitHub Actions |

## Consequences

- 今の記法をそのまま使える。
- 仕組みが小さく、全体を把握しやすい。コアは入出力を持たないので、単体テストで確かめやすい。
- ページの組み立て、プレビュー用のサーバー、ファイルの監視も自作になる。テンプレートの仕組みがないので、ページの HTML は JavaScript の関数で組む。
- 原稿の型検査も自作になる。[content-format.md](../spec/content-format.md) の検査は、すべて自分で書く。
- 式番号はコアが振り、番号の形と `[[@ID]]` による参照を記法に合わせる。

## Alternatives

2026年11月時点の情報である。

| 観点 | Eleventy | Astro |
|---|---|---|
| 版 | 3.1 系が安定版、4.0 はアルファ | 6 系が安定版(2026年3月) |
| 運営 | 2024年に Font Awesome が取得。2026年3月に Build Awesome への改名を発表し、直後に一時停止と報じられた | 2026年1月に Cloudflare が取得。オープンソースのまま続けると表明 |
| md の処理 | markdown-it。囲むブロック(`:::`)と見出し属性(`{#ID …}`)は既存のプラグインで、今の記法のまま書ける | remark / rehype。囲むブロックは remark-directive で書けるが、`:::goal{field=physics}` のように記法を寄せる必要がある。見出し属性は独自の処理が要る見込み |
| 数式(ビルド時) | markdown-it 用の KaTeX プラグイン | rehype-katex |
| 入力の型検査 | 自作 | front matter と YAML をスキーマで検査できる |
| ページの作り方 | Nunjucks などのテンプレート。仕組みが小さい | .astro コンポーネント。TypeScript と相性がよいが、仕組みは大きい |
| GitHub Pages | GitHub Actions でビルドして公開 | 公式の GitHub Actions がある |

どちらも、路線図・定義索引・入力の検証は自作の処理を足す必要があり、全章の見出しを先に読む前処理が要る点も同じである。今の記法をそのまま使え、仕組みが小さい点では Eleventy が合う。入力の型検査と開発元の規模を重く見るなら Astro が合う。独自の処理はどの方式でも自作になるため、どちらも使わないことにした。

出典:[Eleventy v3.0.0](https://github.com/11ty/eleventy/releases/tag/v3.0.0)、[Eleventy 2025 review](https://www.11ty.dev/blog/review-2025/)、[Eleventy is now Build Awesome](https://www.11ty.dev/blog/build-awesome/)、[改名の一時停止の報道](https://disassociated.com/font-awesome-cans-eleventy-renaming/)、[Markdown in Astro](https://v5.docs.astro.build/en/guides/markdown-content/)、[Astro 6.0 の公開](https://alternativeto.net/news/2026/3/astro-6-0-brings-new-astro-dev-built-in-fonts-api-live-content-collections-and-csp-api)、[Cloudflare による Astro の取得](https://www.nasdaq.com/press-release/cloudflare-acquires-astro-accelerate-future-high-performance-web-development-2026-01)

## Exit criteria

次のどれかが起きたら、この決定を見直す。

- ページの種類が増え、関数で組む HTML の手入れが、フレームワークを入れるコストを上回ったとき。
- 差分ビルドが要るようになったとき。全体の作り直しが、プレビューの目安(保存から数秒)に収まらなくなったときがそれにあたる。
- markdown-it 系の依存が保守されなくなったとき。
