# 記録した応答

`responses.json` は、`npm run refs:verify` のテスト(`tests/unit/reference-check.test.js`)が使う応答の記録である。URL をキーに、status と本文を持つ。

- 記録した日: 2026-11-03。User-Agent は `mathenaga-reference-check`(連絡先なし)。
- CrossRef: `https://api.crossref.org/works/<DOI>`(10.1038/nature14539 の 200、10.1038/nature99999999 の 404、10.1137/1021075 の 200)。
- NDL サーチ: `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=<ISBN-13>`(9780471507314、9780000000002、9784000000000、9784000298711、9784130620062、9784000051927)。最後の2つは多巻本の巻の照合(受け入れテスト 11・12)に使う。
- OpenLibrary: `https://openlibrary.org/isbn/<ISBN-13>.json`(転送をたどった後の応答)と、著者の記録 `/authors/OL144195A.json`。9784000000000 と 9784000298711 の 404 は HTML のページなので、本文を省いた(照合は 404 の本文を読まない)。
- ほかの本文は、応答をそのまま保存した。
