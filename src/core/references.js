// 文献の一覧(content/references.yml)と確認の記録(content/references.verified.json)の検査。
// 形式は docs/spec/content-format.md「参考文献」、確認の記録は docs/spec/reference-check.md。
// ビルドと `npm run refs:verify` の両方が使う。問い合わせはしない。

import { createHash } from 'node:crypto';
import { idProblem } from './ids.js';
import { issue } from './issues.js';

/**
 * @typedef {object} Reference
 * @property {string} id
 * @property {'book' | 'article'} type
 * @property {string[]} authors
 * @property {string} title
 * @property {string | null} edition
 * @property {string | null} publisher
 * @property {string | null} journal
 * @property {string | null} volume
 * @property {string | null} issue
 * @property {string | null} pages
 * @property {number} year
 * @property {string | null} isbn   一覧に書いたまま(ハイフンを含みうる)
 * @property {string | null} doi
 * @property {Record<string, any>} raw  YAML から読んだ項目そのもの(fingerprint に使う)
 */

const KEYS = [
  'id',
  'type',
  'authors',
  'title',
  'edition',
  'publisher',
  'journal',
  'volume',
  'issue',
  'pages',
  'year',
  'isbn',
  'doi',
];
// volume は book にも書ける(多巻本の巻)。docs/spec/content-format.md「参考文献」
const ARTICLE_ONLY = ['journal', 'issue', 'pages'];
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

/**
 * 文献の一覧を検査する。
 * Preconditions: data は references.yml を YAML として読んだ値。
 * Postconditions: 形式どおりに読めた文献と、エラー(E01・E02・E03・E08)を返す。誤りのある項目も、ID が読めれば返す
 *   (ID の名前空間と確認の記録の照合に使うため)。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {unknown} data
 * @param {string} file
 * @returns {{ references: Reference[], errors: import('./issues.js').Issue[] }}
 */
export function checkReferences(data, file) {
  /** @type {import('./issues.js').Issue[]} */
  const errors = [];
  /** @type {Reference[]} */
  const references = [];
  if (data === null || data === undefined) return { references, errors };
  if (!Array.isArray(data)) {
    errors.push(issue('E01', file, null, '文献の一覧は文献の配列で書く'));
    return { references, errors };
  }
  data.forEach((r, index) => {
    const where = typeof r?.id === 'string' ? `文献 ${r.id}` : `${index + 1}番目の文献`;
    /** @param {string} code @param {string} msg */
    const fail = (code, msg) => errors.push(issue(code, file, null, `${where}:${msg}`));
    if (typeof r !== 'object' || r === null || Array.isArray(r)) {
      errors.push(issue('E01', file, null, `${where}が項目の組になっていない`));
      return;
    }
    for (const key of Object.keys(r)) if (!KEYS.includes(key)) fail('E02', `知らない項目 ${key} がある`);
    for (const key of ['id', 'type', 'authors', 'title', 'year']) {
      if (r[key] === undefined || r[key] === null || r[key] === '') fail('E08', `${key} がない`);
    }
    if (typeof r.id === 'string' && r.id !== '') {
      const p = idProblem(r.id);
      if (p) fail('E03', p);
    }
    if (r.type !== undefined && r.type !== 'book' && r.type !== 'article') {
      fail('E02', `type「${r.type}」は book か article`);
    }
    if (r.authors !== undefined) {
      if (!Array.isArray(r.authors) || r.authors.some((a) => typeof a !== 'string' || a.trim() === '')) {
        fail('E03', 'authors は著者の名前の配列で書く');
      } else if (r.authors.length === 0) fail('E03', 'authors が空である');
    }
    for (const key of ['title', 'edition', 'publisher', 'journal', 'volume', 'issue', 'pages', 'isbn', 'doi']) {
      if (r[key] !== undefined && r[key] !== null && typeof r[key] !== 'string') {
        fail('E03', `${key} は文字列で書く(数だけなら引用符で囲む)`);
      }
    }
    if (r.year !== undefined && !(Number.isInteger(r.year) && r.year >= 1000 && r.year <= 9999)) {
      fail('E03', `year「${r.year}」は4桁の整数で書く`);
    }
    if (r.type === 'book' && !nonEmpty(r.publisher)) fail('E08', 'book に publisher がない');
    if (r.type === 'article' && !nonEmpty(r.journal)) fail('E08', 'article に journal がない');
    if (r.type !== 'article') {
      for (const key of ARTICLE_ONLY) {
        if (key !== 'journal' && r[key] !== undefined) fail('E03', `${key} は article にだけ書ける`);
      }
      if (r.type === 'book' && r.journal !== undefined) fail('E03', 'journal は article にだけ書ける');
    }
    if (!nonEmpty(r.isbn) && !nonEmpty(r.doi)) fail('E08', 'doi と isbn のどちらもない(少なくとも一方を書く)');
    if (nonEmpty(r.isbn)) {
      if (r.type !== 'book') fail('E03', 'isbn は book にだけ書ける');
      const p = isbnProblem(r.isbn);
      if (p) fail('E03', p);
    }
    if (nonEmpty(r.doi) && !DOI_PATTERN.test(r.doi)) {
      fail('E03', `doi「${r.doi}」は 10. で始まる DOI で書く(https://doi.org/ は付けない)`);
    }
    if (typeof r.id !== 'string' || r.id === '') return;
    references.push({
      id: r.id,
      type: r.type === 'article' ? 'article' : 'book',
      authors: Array.isArray(r.authors) ? r.authors.filter((a) => typeof a === 'string') : [],
      title: typeof r.title === 'string' ? r.title : '',
      edition: str(r.edition),
      publisher: str(r.publisher),
      journal: str(r.journal),
      volume: str(r.volume),
      issue: str(r.issue),
      pages: str(r.pages),
      year: Number.isInteger(r.year) ? r.year : 0,
      isbn: str(r.isbn),
      doi: str(r.doi),
      raw: r,
    });
  });
  return { references, errors };
}

/**
 * 確認の記録を検査する(E15)。
 * Preconditions: data は references.verified.json を JSON として読んだ値(ファイルがなければ undefined)。
 *   references は checkReferences の結果。
 * Postconditions: 一覧のすべての文献に、fingerprint が今の項目と一致する記録があれば、エラーは空。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {unknown} data
 * @param {Reference[]} references
 * @param {string} file  確認の記録のファイル名(エラーの表示に使う)
 * @returns {import('./issues.js').Issue[]}
 */
export function checkVerified(data, references, file) {
  /** @type {import('./issues.js').Issue[]} */
  const errors = [];
  const hint = 'npm run refs:verify を実行する';
  if (references.length === 0 && data === undefined) return errors;
  if (data === undefined) {
    for (const r of references) errors.push(issue('E15', file, null, `文献 ${r.id} の確認の記録がない。${hint}`));
    return errors;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push(issue('E15', file, null, `確認の記録が読めない(文献の ID をキーにしたオブジェクトでない)。${hint}`));
    return errors;
  }
  const records = /** @type {Record<string, any>} */ (data);
  const ids = new Set(references.map((r) => r.id));
  for (const r of references) {
    const rec = records[r.id];
    if (rec === undefined) errors.push(issue('E15', file, null, `文献 ${r.id} の確認の記録がない。${hint}`));
    else if (typeof rec !== 'object' || rec === null || typeof rec.fingerprint !== 'string') {
      errors.push(issue('E15', file, null, `文献 ${r.id} の確認の記録が読めない。${hint}`));
    } else if (rec.fingerprint !== fingerprint(r.raw)) {
      errors.push(issue('E15', file, null, `文献 ${r.id} は、確認の記録を取った後に書き換えられている。${hint}`));
    }
  }
  for (const id of Object.keys(records)) {
    if (!ids.has(id)) errors.push(issue('E15', file, null, `文献の一覧にない文献 ${id} の確認の記録がある。${hint}`));
  }
  return errors;
}

/**
 * 文献の項目の fingerprint(docs/spec/reference-check.md「確認の記録」)。
 * 項目を正規の JSON(キーを文字コード順に並べ、空白を入れない)にしたものの SHA-256 の16進。
 * Preconditions: raw は YAML から読んだ項目(JSON にできる値)。
 * Postconditions: 64 文字の16進を返す。キーの順や YAML の書き方の違いでは変わらない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {unknown} raw
 */
export function fingerprint(raw) {
  return createHash('sha256').update(canonicalJson(raw)).digest('hex');
}

/** @param {unknown} v @returns {string} */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (v);
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * ISBN から区切りを除く(数字と X だけにする)。
 * @param {string} isbn
 */
export function compactIsbn(isbn) {
  return isbn.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * ISBN の形とチェックディジットを確かめる。
 * Preconditions: なし。
 * Postconditions: 正しければ null、誤りなら理由の文を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} isbn
 * @returns {string | null}
 */
export function isbnProblem(isbn) {
  const s = compactIsbn(isbn);
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0 ? null : `isbn「${isbn}」のチェックディジットが合わない`;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0 ? null : `isbn「${isbn}」のチェックディジットが合わない`;
  }
  return `isbn「${isbn}」は ISBN-10 か ISBN-13 で書く(数字10桁か13桁。ハイフンは任意)`;
}

/**
 * ISBN を ISBN-13 の数字の列にする。
 * Preconditions: isbnProblem が null の ISBN。
 * Postconditions: 13 桁の数字の列を返す。ISBN-10 は 978 を付けてチェックディジットを計算し直す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} isbn
 */
export function toIsbn13(isbn) {
  const s = compactIsbn(isbn);
  if (s.length === 13) return s;
  const body = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** @param {unknown} v @returns {v is string} */
function nonEmpty(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** @param {unknown} v */
function str(v) {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
