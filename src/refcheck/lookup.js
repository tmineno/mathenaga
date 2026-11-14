// 検索 API への問い合わせ(docs/spec/reference-check.md「問い合わせ先」)。
// ネットワークは fetch 相当の関数を通してだけ使う。テストは記録した応答を返す関数を渡す。

import { compactIsbn, isbnProblem, toIsbn13 } from '../core/references.js';
import { familyFromName, firstYear } from './match.js';

export const USER_AGENT = 'enaga-reference-check';

/**
 * @typedef {object} HttpResponse
 * @property {number} status
 * @property {string} text
 */

/**
 * @typedef {object} Http
 * @property {(url: string) => Promise<HttpResponse>} get
 */

/**
 * @typedef {(url: string, init: { headers: Record<string, string>, signal: AbortSignal, redirect: 'follow' }) => Promise<{ status: number, text: () => Promise<string> }>} FetchLike
 */

/**
 * @typedef {{ status: 'found', source: 'crossref' | 'ndl' | 'openlibrary', records: import('./match.js').LookupRecord[] }
 *   | { status: 'notfound', detail: string }
 *   | { status: 'unavailable', detail: string }} Lookup
 */

/**
 * 問い合わせの窓口を作る。1件ずつ順に行い、あいだに gapMs をあけ、1件ごとに timeoutMs で打ち切る。
 * Preconditions: fetchFn は fetch と同じ形(リダイレクトをたどる)。sleep は ms ミリ秒待つ関数。
 * Postconditions: get は応答の status と本文を返す。
 * Failure modes: get は通信の失敗か timeoutMs 以内に応答がないとき例外を投げる。
 * Side effects: get が fetchFn を呼ぶ(ネットワーク)。2回目以降の get は先に sleep(gapMs) を呼ぶ。
 * @param {{ fetch: FetchLike, sleep: (ms: number) => Promise<void>, gapMs?: number, timeoutMs?: number }} options
 * @returns {Http}
 */
export function createHttp({ fetch: fetchFn, sleep, gapMs = 1000, timeoutMs = 30000 }) {
  let first = true;
  return {
    async get(url) {
      if (!first) await sleep(gapMs);
      first = false;
      const ctl = new AbortController();
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          ctl.abort();
          reject(new Error(`no response within ${timeoutMs / 1000} s`));
        }, timeoutMs);
      });
      const request = (async () => {
        const res = await fetchFn(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: ctl.signal,
          redirect: 'follow',
        });
        return { status: res.status, text: await res.text() };
      })();
      try {
        return /** @type {HttpResponse} */ (await Promise.race([request, timeout]));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * DOI を CrossRef に問い合わせる。
 * Preconditions: doi は 10. で始まる DOI。
 * Postconditions: 200 なら found(記録1件)、404 なら notfound、通信の失敗・5xx・そのほかの status は unavailable。
 * Failure modes: 例外は投げない。
 * Side effects: http.get を1回呼ぶ。
 * @param {string} doi
 * @param {Http} http
 * @returns {Promise<Lookup>}
 */
export async function lookupDoi(doi, http) {
  const url = `https://api.crossref.org/works/${encodeURI(doi)}`;
  const res = await tryGet(http, url);
  if ('error' in res) return { status: 'unavailable', detail: res.error };
  if (res.status === 404) return { status: 'notfound', detail: 'not registered in CrossRef (404)' };
  if (res.status !== 200) return { status: 'unavailable', detail: `CrossRef returned status ${res.status}` };
  try {
    const m = JSON.parse(res.text).message;
    const authors = (m.author ?? []).map((/** @type {any} */ a) =>
      a.family ? [a.given, a.family].filter(Boolean).join(' ') : String(a.name ?? ''),
    );
    const first = (m.author ?? [])[0];
    const year = m.issued?.['date-parts']?.[0]?.[0];
    return {
      status: 'found',
      source: 'crossref',
      records: [
        {
          type: String(m.type),
          crossrefType: String(m.type),
          title: String((m.title ?? [])[0] ?? ''),
          authors,
          family: String(first?.family ?? first?.name ?? ''),
          year: Number.isInteger(year) ? year : null,
          volume: null,
        },
      ],
    };
  } catch {
    return { status: 'unavailable', detail: 'CrossRef response is not valid JSON' };
  }
}

/**
 * ISBN を NDL サーチに問い合わせ、使える記録がなければ OpenLibrary に問い合わせる。
 * Preconditions: isbn は isbnProblem が null の ISBN。
 * Postconditions: found(source は ndl か openlibrary)、notfound(どちらにも使える記録がない)、unavailable のどれか。
 *   NDL サーチに使える記録(dc:identifier の型が dcndl:ISBN か dcndl:ISBN13 で、値が同じ ISBN)があれば、
 *   照合が合わなくても OpenLibrary には問い合わせない。dcndl:ErrorISBN の一致は使わない。
 * Failure modes: 例外は投げない。NDL サーチが答えなかったときは OpenLibrary に回さず unavailable にする。
 * Side effects: http.get を1〜3回呼ぶ。
 * @param {string} isbn
 * @param {Http} http
 * @returns {Promise<Lookup>}
 */
export async function lookupIsbn(isbn, http) {
  const isbn13 = toIsbn13(isbn);
  const ndlRes = await tryGet(http, `https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn13}`);
  if ('error' in ndlRes) return { status: 'unavailable', detail: `NDL Search: ${ndlRes.error}` };
  if (ndlRes.status !== 200) {
    return { status: 'unavailable', detail: `NDL Search returned status ${ndlRes.status}` };
  }
  const records = parseNdl(ndlRes.text, isbn13);
  if (records.length > 0) return { status: 'found', source: 'ndl', records };

  const olRes = await tryGet(http, `https://openlibrary.org/isbn/${isbn13}.json`);
  if ('error' in olRes) return { status: 'unavailable', detail: `OpenLibrary:${olRes.error}` };
  if (olRes.status === 404) {
    return { status: 'notfound', detail: 'no record of that ISBN in NDL Search or OpenLibrary' };
  }
  if (olRes.status !== 200) {
    return { status: 'unavailable', detail: `OpenLibrary returned status ${olRes.status}` };
  }
  /** @type {any} */
  let rec;
  try {
    rec = JSON.parse(olRes.text);
  } catch {
    return { status: 'unavailable', detail: 'OpenLibrary response is not valid JSON' };
  }
  const listed = [...(rec.isbn_10 ?? []), ...(rec.isbn_13 ?? [])];
  if (!listed.some((/** @type {unknown} */ v) => sameIsbn(v, isbn13))) {
    return {
      status: 'notfound',
      detail: 'no record in NDL Search, and the OpenLibrary record does not have that ISBN',
    };
  }
  let name = '';
  const authorKey = rec.authors?.[0]?.key;
  if (typeof authorKey === 'string') {
    const a = await tryGet(http, `https://openlibrary.org${authorKey}.json`);
    if ('error' in a) return { status: 'unavailable', detail: `OpenLibrary (authors): ${a.error}` };
    if (a.status >= 500) return { status: 'unavailable', detail: `OpenLibrary returned status ${a.status}` };
    if (a.status === 200) {
      try {
        const aj = JSON.parse(a.text);
        name = String(aj.name ?? aj.personal_name ?? '');
      } catch {
        name = '';
      }
    }
  }
  return {
    status: 'found',
    source: 'openlibrary',
    records: [
      {
        type: 'book',
        crossrefType: null,
        title: String(rec.title ?? ''),
        authors: name ? [name] : [],
        family: familyFromName(name),
        year: firstYear(String(rec.publish_date ?? '')),
        volume: null,
      },
    ],
  };
}

/**
 * NDL サーチ(OpenSearch の RSS)から、その ISBN の記録を取り出す。
 * Preconditions: isbn13 は ISBN-13 の数字の列。
 * Postconditions: dc:identifier の型が dcndl:ISBN か dcndl:ISBN13 で、ISBN-13 にして isbn13 と等しい値を持つ item だけを返す。
 * Failure modes: 例外は投げない。読めない item は使わない。
 * Side effects: なし。
 * @param {string} xml
 * @param {string} isbn13
 * @returns {import('./match.js').LookupRecord[]}
 */
export function parseNdl(xml, isbn13) {
  /** @type {import('./match.js').LookupRecord[]} */
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const usable = allTags(item, 'dc:identifier', true).some(
      ({ attr, text }) => (attr === 'dcndl:ISBN' || attr === 'dcndl:ISBN13') && sameIsbn(text, isbn13),
    );
    if (!usable) continue;
    let authors = allTags(item, 'dc:creator').map((t) => t.text);
    if (authors.length === 0) {
      const a = allTags(item, 'author')[0]?.text;
      if (a) authors = [a];
    }
    out.push({
      type: 'book',
      crossrefType: null,
      title: allTags(item, 'dc:title')[0]?.text ?? '',
      authors,
      family: familyFromName(authors[0] ?? ''),
      year: firstYear(allTags(item, 'dcterms:issued')[0]?.text ?? ''),
      volume: allTags(item, 'dcndl:volume')[0]?.text ?? '',
    });
  }
  return out;
}

/** @param {unknown} v @param {string} isbn13 */
function sameIsbn(v, isbn13) {
  if (typeof v !== 'string' || isbnProblem(v) !== null) return false;
  return toIsbn13(compactIsbn(v)) === isbn13;
}

/**
 * @param {string} xml
 * @param {string} name
 * @param {boolean} [withType]
 * @returns {Array<{ attr: string, text: string }>}
 */
function allTags(xml, name, withType = false) {
  const re = new RegExp(`<${name}(?: xsi:type="([^"]*)")?>([\\s\\S]*?)</${name}>`, 'g');
  return [...xml.matchAll(re)].map((m) => ({ attr: withType ? (m[1] ?? '') : '', text: decodeXml(m[2]).trim() }));
}

/** @param {string} s */
function decodeXml(s) {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * @param {Http} http
 * @param {string} url
 * @returns {Promise<HttpResponse | { error: string }>}
 */
async function tryGet(http, url) {
  try {
    return await http.get(url);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
