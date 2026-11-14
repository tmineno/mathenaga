// HTML と XML のエスケープ。

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * HTML・XML の本文と属性値に入れられる形にする。
 * Preconditions: なし。
 * Postconditions: & < > " ' を文字参照に置き換えた文字列を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {unknown} value
 */
export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ (ESCAPES)[c]);
}

export const escapeHtml = escapeXml;

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
