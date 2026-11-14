// 日本語の、言語ごとの処理(docs/adr/ADR-009-site-independent-ui.md「言語ごとの処理」)。
// 文言の辞書、書誌の形、路線図の折り返しの規則と文字幅の見積もり。

import { escapeHtml as h } from '../../core/text.js';

/**
 * 文字の種類(折り返しの規則で、種類の変わり目を見るため)。
 * @param {string} ch
 */
function script(ch) {
  const cp = /** @type {number} */ (ch.codePointAt(0));
  if (cp >= 0x30a0 && cp <= 0x30ff) return 'kata';
  if (cp >= 0x3040 && cp <= 0x309f) return 'hira';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'kanji';
  return 'other';
}

/**
 * 路線図の文字の扱い(docs/spec/route-map.md「配置」6)。core/map.js が使う。
 * - charWidth:1文字のおおよその幅(em)。全角(U+2E80 以上)は 1em、それ以外は 0.58em とみなす。
 * - breakTiers:折り返す位置の選び方。i は折り返した後の行の先頭の位置で、chars[i - 1] がその前の文字。
 *   前のものほど優先する。「の」「・」の後ろ、「と」「や」と空白の後ろ、文字の種類の変わり目の順。
 * @type {import('./index.js').TextRules}
 */
export const text = {
  charWidth: (ch) => (/** @type {number} */ (ch.codePointAt(0)) >= 0x2e80 ? 1 : 0.58),
  breakTiers: [
    (chars, i) => 'の・'.includes(chars[i - 1]),
    (chars, i) => 'とや'.includes(chars[i - 1]) || chars[i - 1] === ' ',
    (chars, i) => script(chars[i - 1]) !== script(chars[i]),
  ],
};

/**
 * 参考文献の項目の書誌(site.md「注と参考文献の表示」)。要素を「、」で区切って「。」で終え、
 * その後に ISBN と DOI のリンクを空白で区切って置く。書名・題名に仮名か漢字があれば和文として扱う。
 * Preconditions: r は検査を通った文献の項目。
 * Postconditions: 書誌の HTML を返す。文字はエスケープ済み。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('../../core/references.js').Reference} r
 * @returns {string}
 */
export function bibliography(r) {
  const ja = /[぀-ヿ㐀-鿿]/.test(r.title);
  const authors = r.authors.length >= 4 ? `${h(r.authors[0])}ほか` : r.authors.map(h).join('、');
  /** @type {string[]} */
  const parts = [authors];
  if (r.type === 'book') {
    // 多巻本の巻は、書名の後に空白を挟んで書名と一緒に囲む(『解析入門 II』)
    const title = r.volume ? `${h(r.title)} ${h(r.volume)}` : h(r.title);
    parts.push(ja ? `『${title}』` : `<i>${title}</i>`);
    if (r.edition) parts.push(h(r.edition));
    if (r.publisher) parts.push(h(r.publisher));
  } else {
    parts.push(ja ? `「${h(r.title)}」` : `“${h(r.title)}”`);
    if (r.journal) parts.push(ja ? h(r.journal) : `<i>${h(r.journal)}</i>`);
    if (r.volume) parts.push(`${h(r.volume)}${r.issue ? `(${h(r.issue)})` : ''}`);
    if (r.pages) parts.push(h(r.pages));
  }
  parts.push(String(r.year));
  let out = `${parts.join('、')}。`;
  if (r.isbn) out += ` ISBN ${h(r.isbn)}`;
  if (r.doi) {
    const url = `https://doi.org/${r.doi}`;
    out += ` <a href="${h(url)}">${h(url)}</a>`;
  }
  return out;
}

/**
 * 文言の辞書。値は文字列で、{n} のような差し込みを含めてよい(content-format.md「サイトの設定」の messages)。
 * @type {Record<string, string>}
 */
export const messages = {};

/** @type {import('./index.js').Locale} */
export const ja = { id: 'ja', messages, text, bibliography };
