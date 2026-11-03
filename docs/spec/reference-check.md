# Feature: 文献の実在確認

> **Status:** Draft · 2026-11-03
> **Owner:** Taiki Mineno
> **Related:** [content-format.md](content-format.md)(文献の一覧の形式)、[build.md](build.md)、[ADR-005](../adr/ADR-005-notes-and-references.md)

## Goal

執筆者(人間か AI)が文献の一覧(`content/references.yml`)に文献を足すときは、検索 API への問い合わせで、その文献が実在し、書誌が一覧の記載と一致することを確かめてから使う。確かめていない文献を引いた原稿からは、ビルドがサイトを作らない。

## Non-goals

- 引いた箇所に、その内容が書いてあるかを確かめること。確かめるのは書誌までで、内容は執筆の規則([AGENTS.md](../../AGENTS.md))と人間の確認で担う。
- 一覧の書誌を、検索 API の記録から書き起こすこと。書き起こすと、照合が記録とそれ自身の比較になり、別の実在の記録(本の書評の DOI など)を選んだ誤りを止められない。書誌は、出版社や雑誌のページなど、確認に使う API とは別の情報源から執筆者が書く。
- ウェブページ・未刊行の資料の確認。文献にできない([content-format.md](content-format.md)「参考文献」)。
- ビルドの中で問い合わせること。ビルドはネットワークを使わない([build.md](build.md))。

## Inputs / Outputs

入力は文献の一覧(`content/references.yml`)と、今の確認の記録(`content/references.verified.json`。なければ空)である。出力は確認の記録と、文献ごとの結果の一覧である。

### 問い合わせ先

一覧の項目に書いた識別子(doi・isbn)は、すべて確かめる。両方を書いた項目は、両方とも一致したときだけ確かめたものとする。

| 識別子 | 問い合わせ先 | 照合に使う記録 |
|---|---|---|
| doi | CrossRef:`GET https://api.crossref.org/works/<DOI>` | 200 の応答の `message`。404 は「見つからない」 |
| isbn | NDL サーチ:`GET https://ndlsearch.ndl.go.jp/api/opensearch?isbn=<ISBN>` | 返った item のうち、`dc:identifier` の型が `dcndl:ISBN` か `dcndl:ISBN13` で、値がその ISBN と同じもの。型が `dcndl:ErrorISBN`(誤記として登録された ISBN)の一致は使わない。ISBN-10 と ISBN-13 は、同じ本を指すものとして比べる |
| isbn(NDL サーチに照合できる記録がないとき) | OpenLibrary:`GET https://openlibrary.org/isbn/<ISBN>.json`(転送をたどる) | 記録の `isbn_10` か `isbn_13` に、その ISBN があるときだけ使う。著者の名前は、著者の記録を1回たどって得る |

### 照合

識別子ごとに、照合に使う記録のうち、次をすべてみたすものが1つ以上あれば一致とする。

| 項目 | 規則 |
|---|---|
| 種類 | `book` は CrossRef の type が `book`・`monograph`・`edited-book`・`reference-book` のどれか。`article` は `journal-article`。NDL サーチと OpenLibrary の記録は本の記録なので、種類は確かめない(`article` に isbn は書けない) |
| 書名 | 正規化(NFKC にし、英字を小文字にし、空白と記号を除く)して比べ、記録の書名が項目の title と一致するか、項目の title で始まる(記録にだけ副題がある) |
| 第1著者 | 記録の第1著者の姓(CrossRef は `family`、NDL サーチと OpenLibrary は著者の表記の最初の区切り(読点・カンマ・空白)まで)を正規化したものが、項目の authors の最初の人を正規化したものに含まれる |
| 年 | 記録の年(CrossRef は `issued` の年、NDL サーチは `dcterms:issued` の中で最初に現れる4桁の数(`c1978` は 1978、`1980.3` は 1980)、OpenLibrary は `publish_date` の中の4桁の数)が、項目の year と一致する |

### 確認の記録(references.verified.json)

文献の ID をキーにし、ID の文字コード順に並べた JSON のオブジェクトである。各項目は次の値を持つ。

| キー | 値 |
|---|---|
| fingerprint | 一覧の項目を正規の JSON(キーを文字コード順に並べ、空白を入れない)にしたものの SHA-256 の16進 |
| checks | 識別子ごとの照合の結果の配列。各要素は identifier(`doi:<DOI>` か `isbn:<ISBN-13>`)、source(`crossref`・`ndl`・`openlibrary`)、record(一致した記録の type・title・authors・year) |
| checked | 確かめた日(`YYYY-MM-DD`) |

- ビルドは、一覧のすべての項目について、fingerprint が今の項目と一致する記録があることを確かめる。なければ E15 で止まる([content-format.md](content-format.md))。ビルドは問い合わせない。
- 記録は `refs:verify` だけが書く。手で書かない。

### 公開する入口

| 入口 | 事前条件 | 事後条件 | 失敗したとき | 副作用 |
|---|---|---|---|---|
| `npm run refs:verify` | ネットワークにつながる。一覧が [content-format.md](content-format.md) の形式どおり(形式が違えば、ビルドと同じエラーを出して問い合わせない) | 記録がないか、fingerprint が今の項目と合わない文献をすべて問い合わせ、一致した文献の記録を書く。一覧にない文献の記録は消す。文献ごとに「一致」「一致しない」「確かめられなかった」を出す。すべて一致すれば終了コード 0 | 一致しない文献があれば、項目と記録の違い(どの項目が、どの値と食い違ったか)を出し、終了コード 1。確かめられなかった文献(通信の失敗、30 秒以内に応答がない、5xx)があれば終了コード 2(1 と 2 の両方があれば 1)。どちらの場合も、一致した文献の記録は書く | `content/references.verified.json` を書き換える |
| `npm run refs:verify -- --all` | 同上 | すべての文献を問い合わせ直す。ほかは上と同じ | 上と同じ | 上と同じ |
| `npm run refs:verify -- --check` | 同上 | すべての文献を問い合わせ直し、照合の結果が今の記録と(checked を除いて)一致すれば終了コード 0。CI で使う | 照合が一致しない、または今の記録と合わなければ 1。確かめられなかった文献があれば 2 | なし(ファイルを書かない) |

- 問い合わせは1件ずつ順に行い、あいだを 1 秒あける。User-Agent は `mathenaga-reference-check` とし、連絡先は入れない。
- CI は、文献の一覧か確認の記録を変えた PR でだけ `--check` を実行し、失敗したらマージできないようにする([build.md](build.md)「CI と公開」)。

## Failure modes

| きっかけ | 検出 | 外から見える振る舞い | 直し方 |
|---|---|---|---|
| 架空の DOI | CrossRef の 404 | 「見つからない」で一致しない(終了コード 1) | 実物の書誌を確かめ直す |
| 本に、その本の書評の DOI を付けた(Kreyszig の例。[ADR-005](../adr/ADR-005-notes-and-references.md)) | 種類(journal-article)か書名が一致しない | 一致しない(終了コード 1)。食い違った項目を出す | 本に DOI がなければ ISBN で書く。検索結果から別の DOI を選び直さない |
| ISBN が無関係な記録に当たる(OpenLibrary の誤った登録、NDL サーチの誤記の ISBN) | ISBN の型の規則と、書名の照合 | 一致しない(終了コード 1) | 実物の ISBN を確かめ直す |
| 版が違う(ISBN は別の版、year は別の版) | 年が一致しない | 一致しない(終了コード 1) | 引いた版の ISBN と年にそろえる |
| API が止まっている・遅い | 通信の失敗、30 秒の待ち切れ、5xx | 「確かめられなかった」(終了コード 2)。その文献の記録は書かない | 時間をおいて再実行する |
| 確認の記録を手で書いた・書き換えた | CI の `--check` | 一致しない(終了コード 1)で、マージできない | 記録を消し、`refs:verify` で取り直す |
| 一覧の項目を書き換えた後に確かめていない | ビルドの E15 | ビルドが止まる | `refs:verify` を実行する |

## Performance / Safety

- ネットワークを使うのは `refs:verify` だけである。ビルドとテストは使わない。
- テストは、記録した応答(`tests/fixtures/references/`)を使い、ネットワークにつながずに行う。
- 問い合わせに送るのは識別子だけで、利用者の情報を送らない。
- 速度:Not load-bearing — no constraint(1件ごとに 1 秒あけるので、件数に比例して時間がかかる)。

## Acceptance tests

記録した応答を使い、ネットワークにつながずに確かめる。

1. 論文 LeCun・Bengio・Hinton「Deep learning」(Nature, 2015, DOI `10.1038/nature14539`)の項目は一致し、記録ができる。記録の source は `crossref` で、fingerprint は項目の正規の JSON の SHA-256 である。
2. 1 の DOI を `10.1038/nature99999999` に変えると「見つからない」で、終了コード 1、記録はできない。
3. Kreyszig『Introductory Functional Analysis with Applications』の項目(type `book`)に、書評の DOI `10.1137/1021075` を付けると、種類が一致しないと出て、終了コード 1。
4. ISBN 978-0-00-000000-2 の項目は、OpenLibrary の記録の書名と一致しないと出て、終了コード 1。
5. NDL サーチで、型が `dcndl:ErrorISBN` の識別子だけが一致する ISBN の項目は、NDL サーチの記録を使わない(OpenLibrary にも記録がなければ「見つからない」)。
6. 和書の項目(ISBN つき)が、NDL サーチの記録と一致し、記録の source が `ndl` になる。
7. 6 の項目の year を1つ変えると、年が一致しないと出て、終了コード 1。
8. 1 の記録の record の title を手で書き換えて `--check` を実行すると、今の記録と合わないと出て、終了コード 1。ファイルは変わらない。
9. 応答が 500 か、30 秒以内に来ないと「確かめられなかった」と出て、終了コード 2。その文献の記録は書かない。
10. 一致した後に続けて実行すると、問い合わせは1件も行わず、終了コード 0。一覧から文献を1つ消して実行すると、その記録が消える。

## Open questions

- NDL サーチの記録で、巻(「解析入門 I」の I)が書名と別の要素に入っているときの書名の照合。実装のときに、和書の記録を集めて決める。
- NDL サーチの記録の年が、版の年でなく刷の年になっているときの扱い。上と同じく、記録を集めて決める。
