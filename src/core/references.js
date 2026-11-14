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
    errors.push(issue('E01', file, null, 'the reference list must be an array of references'));
    return { references, errors };
  }
  data.forEach((r, index) => {
    const where = typeof r?.id === 'string' ? `reference ${r.id}` : `reference #${index + 1}`;
    /** @param {string} code @param {string} msg */
    const fail = (code, msg) => errors.push(issue(code, file, null, `${where}:${msg}`));
    if (typeof r !== 'object' || r === null || Array.isArray(r)) {
      errors.push(issue('E01', file, null, `${where} is not a mapping`));
      return;
    }
    for (const key of Object.keys(r)) if (!KEYS.includes(key)) fail('E02', `unknown key ${key}`);
    for (const key of ['id', 'type', 'authors', 'title', 'year']) {
      if (r[key] === undefined || r[key] === null || r[key] === '') fail('E08', `${key} is missing`);
    }
    if (typeof r.id === 'string' && r.id !== '') {
      const p = idProblem(r.id);
      if (p) fail('E03', p);
    }
    if (r.type !== undefined && r.type !== 'book' && r.type !== 'article') {
      fail('E02', `type "${r.type}" must be book or article`);
    }
    if (r.authors !== undefined) {
      if (!Array.isArray(r.authors) || r.authors.some((a) => typeof a !== 'string' || a.trim() === '')) {
        fail('E03', 'authors must be an array of author names');
      } else if (r.authors.length === 0) fail('E03', 'authors is empty');
    }
    for (const key of ['title', 'edition', 'publisher', 'journal', 'volume', 'issue', 'pages', 'isbn', 'doi']) {
      if (r[key] !== undefined && r[key] !== null && typeof r[key] !== 'string') {
        fail('E03', `${key} must be a string (quote it if it is only digits)`);
      }
    }
    if (r.year !== undefined && !(Number.isInteger(r.year) && r.year >= 1000 && r.year <= 9999)) {
      fail('E03', `year "${r.year}" must be a 4-digit integer`);
    }
    if (r.type === 'book' && !nonEmpty(r.publisher)) fail('E08', 'book has no publisher');
    if (r.type === 'article' && !nonEmpty(r.journal)) fail('E08', 'article has no journal');
    if (r.type !== 'article') {
      for (const key of ARTICLE_ONLY) {
        if (key !== 'journal' && r[key] !== undefined) fail('E03', `${key} can only be given for an article`);
      }
      if (r.type === 'book' && r.journal !== undefined) fail('E03', 'journal can only be given for an article');
    }
    if (!nonEmpty(r.isbn) && !nonEmpty(r.doi)) fail('E08', 'neither doi nor isbn is given (give at least one)');
    if (nonEmpty(r.isbn)) {
      if (r.type !== 'book') fail('E03', 'isbn can only be given for a book');
      const p = isbnProblem(r.isbn);
      if (p) fail('E03', p);
    }
    if (nonEmpty(r.doi) && !DOI_PATTERN.test(r.doi)) {
      fail('E03', `doi "${r.doi}" must be a DOI starting with 10. (without https://doi.org/)`);
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
  const hint = 'run npm run refs:verify';
  if (references.length === 0 && data === undefined) return errors;
  if (data === undefined) {
    for (const r of references)
      errors.push(issue('E15', file, null, `no verification record for reference ${r.id}; ${hint}`));
    return errors;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    errors.push(
      issue('E15', file, null, `verification record is unreadable (not an object keyed by reference ID); ${hint}`),
    );
    return errors;
  }
  const records = /** @type {Record<string, any>} */ (data);
  const ids = new Set(references.map((r) => r.id));
  for (const r of references) {
    const rec = records[r.id];
    if (rec === undefined)
      errors.push(issue('E15', file, null, `no verification record for reference ${r.id}; ${hint}`));
    else if (typeof rec !== 'object' || rec === null || typeof rec.fingerprint !== 'string') {
      errors.push(issue('E15', file, null, `verification record of reference ${r.id} is unreadable; ${hint}`));
    } else if (rec.fingerprint !== fingerprint(r.raw)) {
      errors.push(
        issue('E15', file, null, `reference ${r.id} was edited after its verification record was made; ${hint}`),
      );
    }
  }
  for (const id of Object.keys(records)) {
    if (!ids.has(id))
      errors.push(
        issue(
          'E15',
          file,
          null,
          `verification record exists for reference ${id}, which is not in the reference list; ${hint}`,
        ),
      );
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
    return sum % 11 === 0 ? null : `isbn "${isbn}" has a wrong check digit`;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0 ? null : `isbn "${isbn}" has a wrong check digit`;
  }
  return `isbn "${isbn}" must be ISBN-10 or ISBN-13 (10 or 13 digits; hyphens optional)`;
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
