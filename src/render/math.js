// KaTeX による数式の描画(ビルド時)。

import katex from 'katex';

/** @type {import('katex').KatexOptions} */
const OPTIONS = { throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' };

/**
 * TeX を HTML にする。
 * Preconditions: なし。
 * Postconditions: KaTeX の HTML を返す。display が true なら別行立てにする。
 * Failure modes: KaTeX が解釈できなければ { error } を返す(例外は投げない)。
 * Side effects: なし。
 * @param {string} tex
 * @param {boolean} display
 * @returns {{ html: string, error: null } | { html: null, error: string }}
 */
export function renderTex(tex, display) {
  try {
    return { html: katex.renderToString(tex, { ...OPTIONS, displayMode: display }), error: null };
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { html: null, error: String(err?.message ?? err).replace(/^KaTeX parse error: /, '') };
  }
}
