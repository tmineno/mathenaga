// 検索 API の記録と文献の一覧の項目の照合(docs/spec/reference-check.md「照合」)。

/**
 * @typedef {object} LookupRecord  照合に使う1件の記録
 * @property {string} type     確認の記録に書く種類(CrossRef の type。NDL サーチと OpenLibrary は "book")
 * @property {string | null} crossrefType  種類を照合するときの CrossRef の type。本の記録(NDL サーチ・OpenLibrary)は null
 * @property {string} title
 * @property {string[]} authors
 * @property {string} family   第1著者の姓(照合に使う)
 * @property {number | null} year
 */

/**
 * @typedef {object} Diff  項目と記録の食い違い
 * @property {'種類' | '書名' | '第1著者' | '年'} field
 * @property {string} entry
 * @property {string} record
 */

const BOOK_TYPES = ['book', 'monograph', 'edited-book', 'reference-book'];

/**
 * 照合のための正規化(NFKC にし、英字を小文字にし、空白と記号を除く)。
 * Preconditions: なし。
 * Postconditions: 同じ文字列には同じ結果を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} s
 */
export function normalize(s) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

/**
 * 文字列の中で最初に現れる4桁の数(全角も NFKC で半角にして読む)。
 * Preconditions: なし。
 * Postconditions: 見つかれば数、なければ null。「c1978」は 1978、「1980.3」は 1980。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} s
 * @returns {number | null}
 */
export function firstYear(s) {
  const m = s.normalize('NFKC').match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

/**
 * 著者の表記から姓を取り出す。NDL サーチと OpenLibrary で使う(docs/spec/reference-check.md「照合」)。
 * カンマか読点があればその前(「姓, 名」の形)、なければ空白で区切った最後の語(「名 姓」の形)。
 * Preconditions: なし。
 * Postconditions: 区切りも空白もなければ全体を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} name
 */
export function familyFromName(name) {
  const s = name.trim();
  // 「姓, 名」の形(NDL サーチの著者、Kreyszig, Erwin)は区切りの前
  const comma = s.search(/[、,，]/u);
  if (comma >= 0) return s.slice(0, comma).trim();
  // 「名 姓」の形(OpenLibrary の著者、Erwin Kreyszig)は最後の語。空白がなければ全体(杉浦光夫)
  const words = s.split(/\s+/u);
  return words[words.length - 1] ?? '';
}

/**
 * 項目と記録を照合する。
 * Preconditions: entry は checkReferences を通った文献。
 * Postconditions: 食い違いの配列を返す。空なら一致(種類・書名・第1著者・年のすべてをみたす)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('../core/references.js').Reference} entry
 * @param {LookupRecord} rec
 * @returns {Diff[]}
 */
export function matchRecord(entry, rec) {
  /** @type {Diff[]} */
  const diffs = [];
  if (rec.crossrefType !== null) {
    const ok = entry.type === 'book' ? BOOK_TYPES.includes(rec.crossrefType) : rec.crossrefType === 'journal-article';
    if (!ok) diffs.push({ field: '種類', entry: entry.type, record: rec.crossrefType });
  }
  const t = normalize(rec.title);
  const e = normalize(entry.title);
  if (e === '' || !t.startsWith(e)) diffs.push({ field: '書名', entry: entry.title, record: rec.title });
  const family = normalize(rec.family);
  const first = normalize(entry.authors[0] ?? '');
  if (family === '' || !first.includes(family)) {
    diffs.push({ field: '第1著者', entry: entry.authors[0] ?? '', record: rec.family });
  }
  if (rec.year !== entry.year) diffs.push({ field: '年', entry: String(entry.year), record: String(rec.year) });
  return diffs;
}
