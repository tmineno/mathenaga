// ID の形式(docs/spec/content-format.md「ID」)。

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 定義の ID の接頭辞。定義の ID だけがこれで始まる(ADR-008)。 */
export const DEF_PREFIX = 'def-';

/**
 * ID の形式を確かめる。
 * Preconditions: なし(どんな値でもよい)。
 * Postconditions: 正しければ null、誤りなら理由の文を返す。definition が true なら定義の ID として、
 *   `def-` で始まることを求める。false ならほかの種類の ID として、`def-` で始まらないことを求める。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {unknown} id
 * @param {boolean} [definition] 定義の ID なら true
 * @returns {string | null}
 */
export function idProblem(id, definition = false) {
  if (typeof id !== 'string' || id === '') return 'ID が空である';
  if (!ID_PATTERN.test(id)) return `ID「${id}」は英小文字・数字・ハイフンで書く`;
  if (definition && !id.startsWith(DEF_PREFIX)) return `定義の ID「${id}」は def- で始める(def-${id})`;
  if (!definition && id.startsWith(DEF_PREFIX))
    return `ID「${id}」は def- で始められない(def- で始まるのは定義の ID だけ)`;
  return null;
}
