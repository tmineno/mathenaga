// 言語ごとの処理の一覧(docs/adr/ADR-009-site-independent-ui.md「言語ごとの処理」)。
// 言語を足すときは、<言語>.js を足して LOCALES に加える。

import { ja } from './ja.js';

/**
 * @typedef {object} TextRules  路線図の文字の扱い(core/map.js が使う)
 * @property {(ch: string) => number} charWidth  1文字のおおよその幅(em)
 * @property {Array<(chars: string[], i: number) => boolean>} breakTiers
 *   折り返す位置の選び方。前のものほど優先する。i は折り返した後の行の先頭の位置
 */

/**
 * @typedef {object} Locale
 * @property {string} id  言語の ID(site.yml の lang)
 * @property {Record<string, string>} messages  文言の辞書
 * @property {TextRules} text
 * @property {(r: import('../../core/references.js').Reference) => string} bibliography  書誌の HTML
 */

/** 言語の ID → 言語ごとの処理 @type {Record<string, Locale>} */
export const LOCALES = { ja };

/**
 * 文言の差し込み。{名前} を vars の値に置き換える。vars にない名前はそのまま残す。
 * Preconditions: なし。
 * Postconditions: 置き換えた文字列を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} template
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function fill(template, vars = {}) {
  return template.replace(/\{([A-Za-z]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * 文言の差し込みの名前の集合(site.yml の messages の検査に使う)。
 * Preconditions: なし。
 * Postconditions: template の中の {名前} の名前を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} template
 * @returns {Set<string>}
 */
export function placeholders(template) {
  return new Set([...template.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]));
}
