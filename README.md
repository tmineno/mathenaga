<h1><img src="docs/assets/banner.svg" alt="MathEnaga" width="332" height="118"></h1>

大学数学を、物理・情報など数学以外の分野の学生に届ける静的サイト。原稿からサイトを作るツールは [enaga](https://github.com/tmineno/enaga) で、このリポジトリには原稿を置く。

数学の概念を「駅」、分野の流れを「路線」に見立て、路線図で今いる場所と目標までの道のりを示す。読者は自分の分野(理論物理・情報科学)を選んで、その分野に必要な範囲と応用を読める。

**[サイトを開く](https://tmineno.github.io/mathenaga/)** · [コンセプト](https://github.com/tmineno/enaga/blob/v0.1.1/docs/spec/README.md)

## 手元で動かす

Node.js 22 以上が要る。

```sh
npm ci
npm run dev     # ビルドして http://127.0.0.1:8000/ で配信する。保存するたびに作り直す
npm run build   # content/ の原稿を検査し、dist/ にサイトを書き出す
npm run check   # 原稿の不変条件を確かめる。先に npx playwright install chromium が要る
```

## もっと知る

- 原稿の書き方:[AGENTS.md](AGENTS.md)。形式とエラーコードは enaga の [content-format.md](https://github.com/tmineno/enaga/blob/v0.1.1/docs/spec/content-format.md)
- コマンド・環境変数・CI と公開:enaga の [build.md](https://github.com/tmineno/enaga/blob/v0.1.1/docs/spec/build.md)
- 仕様書の一覧と用語:enaga の [docs/spec/](https://github.com/tmineno/enaga/blob/v0.1.1/docs/spec/README.md)。ツールの変更履歴は、2026-11-14 までこのリポジトリの、それより後は enaga のリポジトリの履歴にある

変更はブランチから PR を作り、CI の `check` が通ってから GitHub 上でマージする。main への直接の push はブランチ保護で拒否される。
