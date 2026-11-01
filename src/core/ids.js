// ID の形式(docs/spec/content-format.md「ID」)。

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * ID の形式を確かめる。
 * Preconditions: なし(どんな値でもよい)。
 * Postconditions: 正しければ null、誤りなら理由の文を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {unknown} id
 * @returns {string | null}
 */
export function idProblem(id) {
  if (typeof id !== 'string' || id === '') return 'ID が空である';
  if (!ID_PATTERN.test(id)) return `ID「${id}」は英小文字・数字・ハイフンで書く`;
  if (id.startsWith('def-')) return `ID「${id}」は def- で始められない`;
  return null;
}
