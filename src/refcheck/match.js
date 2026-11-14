// 検索 API の記録と文献の一覧の項目の照合(docs/spec/reference-check.md「照合」)。

/**
 * @typedef {object} LookupRecord  照合に使う1件の記録
 * @property {string} type     確認の記録に書く種類(CrossRef の type。NDL サーチと OpenLibrary は "book")
 * @property {string | null} crossrefType  種類を照合するときの CrossRef の type。本の記録(NDL サーチ・OpenLibrary)は null
 * @property {string} title
 * @property {string[]} authors
 * @property {string} family   第1著者の姓(照合に使う)
 * @property {number | null} year
 * @property {string | null} volume  巻(NDL サーチの dcndl:volume。なければ '')。巻を比べない記録(CrossRef・OpenLibrary)は null
 */

/**
 * @typedef {object} Diff  項目と記録の食い違い
 * @property {'type' | 'title' | 'first author' | 'year' | 'volume'} field
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
 * 巻の表記をそろえる(docs/spec/reference-check.md「照合」の巻のそろえ方)。
 * Preconditions: なし。
 * Postconditions: `１`・`第2巻`・`[第1]`・`volume1`・`1 : 軽装版`・`I`・`Vol. 1` は数の文字列、`上巻` は「上」、
 *   `: pbk`・`: 新装` は空文字列を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} s
 */
export function volumeKey(s) {
  // コロンから後ろは製本や版の区別(`1 : 軽装版`、`: pbk`)
  const head = s.normalize('NFKC').toLowerCase().split(':')[0];
  const t = head.replace(/(^|[\s[(])(volume|vol|part|pt)\.?/gu, '$1').replace(/[第巻\s[\]()]/gu, '');
  return /^[ivx]+$/.test(t) ? romanToArabic(t) : t;
}

/**
 * i・v・x だけのローマ数字をアラビア数字にする。正しく読めなければ、そのまま返す。
 * @param {string} t
 */
function romanToArabic(t) {
  /** @type {Record<string, number>} */
  const v = { i: 1, v: 5, x: 10 };
  let n = 0;
  for (let k = 0; k < t.length; k++) {
    const cur = v[t[k]];
    const next = v[t[k + 1]] ?? 0;
    n += cur < next ? -cur : cur;
  }
  return toRoman(n) === t ? String(n) : t;
}

/** @param {number} n 1〜39 */
function toRoman(n) {
  const tens = ['', 'x', 'xx', 'xxx'];
  const ones = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
  return n >= 1 && n <= 39 ? tens[Math.floor(n / 10)] + ones[n % 10] : '';
}

/** 項目に volume がないとき、記録のこの巻があれば一致しない(多巻本のどの巻かを書誌に書かせる) */
const NUMBERED_VOLUME = /^(\d+[a-z]?|上|中|下)$/u;

/**
 * 項目と記録を照合する。
 * Preconditions: entry は checkReferences を通った文献。
 * Postconditions: 食い違いの配列を返す。空なら一致(種類・書名・第1著者・年と、記録が巻を持てば巻のすべてをみたす)。
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
    if (!ok) diffs.push({ field: 'type', entry: entry.type, record: rec.crossrefType });
  }
  const t = normalize(rec.title);
  const e = normalize(entry.title);
  if (e === '' || !t.startsWith(e)) diffs.push({ field: 'title', entry: entry.title, record: rec.title });
  const family = normalize(rec.family);
  const first = normalize(entry.authors[0] ?? '');
  if (family === '' || !first.includes(family)) {
    diffs.push({ field: 'first author', entry: entry.authors[0] ?? '', record: rec.family });
  }
  if (rec.year !== entry.year) diffs.push({ field: 'year', entry: String(entry.year), record: String(rec.year) });
  if (rec.volume !== null) {
    const r = volumeKey(rec.volume);
    const bad = entry.volume ? volumeKey(entry.volume) !== r : NUMBERED_VOLUME.test(r);
    if (bad) diffs.push({ field: 'volume', entry: entry.volume ?? '(none)', record: rec.volume || '(none)' });
  }
  return diffs;
}
