// KaTeX による数式の描画(ビルド時)。

import katex from 'katex';

/** @type {import('katex').KatexOptions} */
const OPTIONS = { throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' };

/** @typedef {{ html: string, error: null } | { html: null, error: string }} Rendered */

/**
 * 描画した結果。同じ TeX と display からは同じ結果になるので、プロセスの中で覚えておく。
 * テストは1つのプロセスで原稿を何度もビルドするので、同じ式を描画し直さずに済む。
 * @type {Map<string, Rendered>}
 */
const rendered = new Map();

/**
 * TeX を HTML にする。
 * Preconditions: なし。
 * Postconditions: KaTeX の HTML を返す。display が true なら別行立てにする。同じ tex と display には同じオブジェクトを返す。
 * Failure modes: KaTeX が解釈できなければ { error } を返す(例外は投げない)。
 * Side effects: 結果をプロセスの中で覚える(呼び出し側は返したオブジェクトを書き換えない)。
 * @param {string} tex
 * @param {boolean} display
 * @returns {Rendered}
 */
export function renderTex(tex, display) {
  const key = `${display ? 'D' : 'I'}${tex}`;
  let r = rendered.get(key);
  if (!r) {
    r = render(tex, display);
    rendered.set(key, r);
  }
  return r;
}

/**
 * @param {string} tex
 * @param {boolean} display
 * @returns {Rendered}
 */
function render(tex, display) {
  try {
    return { html: katex.renderToString(tex, { ...OPTIONS, displayMode: display }), error: null };
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { html: null, error: String(err?.message ?? err).replace(/^KaTeX parse error: /, '') };
  }
}
