// 属性 {#ID キー=値 キー="空白を含む値"} の解析(docs/spec/content-format.md「ブロック」)。

const TOKEN = /\s*(?:#([^\s"{}]+)|([A-Za-z_][\w-]*)=(?:"([^"]*)"|([^\s"{}]+))|(\S+))/gy;

/**
 * @typedef {object} ParsedAttrs
 * @property {string | null} id
 * @property {Record<string, string>} values
 * @property {string[]} problems  解釈できなかった部分の説明
 */

/**
 * 波かっこの内側を解析する。
 * Preconditions: src は波かっこを含まない内側の文字列。
 * Postconditions: id(# の値)と、キーと値の組を返す。重複と解釈できない部分は problems に入る。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {string} src
 * @returns {ParsedAttrs}
 */
export function parseAttrs(src) {
  /** @type {ParsedAttrs} */
  const out = { id: null, values: {}, problems: [] };
  TOKEN.lastIndex = 0;
  let m;
  while (TOKEN.lastIndex < src.length && (m = TOKEN.exec(src))) {
    if (m[0].trim() === '') break;
    if (m[1] !== undefined) {
      if (out.id !== null) out.problems.push(`two #IDs given (#${out.id} and #${m[1]})`);
      else out.id = m[1];
    } else if (m[2] !== undefined) {
      const value = m[3] !== undefined ? m[3] : m[4];
      if (Object.hasOwn(out.values, m[2])) out.problems.push(`attribute ${m[2]} is given twice`);
      else out.values[m[2]] = value;
    } else {
      out.problems.push(`cannot parse attribute "${m[5]}"`);
    }
  }
  return out;
}

/**
 * カンマ区切りの値を配列にする。空の要素は残す(呼び出し側で誤りにする)。
 * @param {string} value
 */
export function splitList(value) {
  return value.split(',').map((s) => s.trim());
}
