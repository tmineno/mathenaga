// エラーと通知。コードの意味は docs/spec/content-format.md「Failure modes」。

/**
 * @typedef {object} Issue
 * @property {string} code   E01〜E13 または N01〜N03
 * @property {string} file   content/ からの相対パス(ベースパスの誤りなどは "-")
 * @property {number | null} line  1 から数えた行番号。わからなければ null
 * @property {string} message
 */

/**
 * Preconditions: code は E01〜E13 か N01〜N03。
 * Postconditions: 新しい Issue を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} code
 * @param {string} file
 * @param {number | null | undefined} line
 * @param {string} message
 * @returns {Issue}
 */
export function issue(code, file, line, message) {
  return { code, file, line: line ?? null, message };
}

/**
 * 1行の表示にする。例:「E05 chapters/03-x/index.md:12 requires の参照先 foo がない」
 * @param {Issue} i
 */
export function formatIssue(i) {
  const where = i.line ? `${i.file}:${i.line}` : i.file;
  return `${i.code} ${where} ${i.message}`;
}

/**
 * ファイル・行・コードの順に並べた新しい配列を返す(出力を毎回同じにするため)。
 * @param {Issue[]} list
 */
export function sortIssues(list) {
  return [...list].sort(
    (a, b) => cmp(a.file, b.file) || (a.line ?? 0) - (b.line ?? 0) || cmp(a.code, b.code) || cmp(a.message, b.message),
  );
}

/** @param {string} a @param {string} b */
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
