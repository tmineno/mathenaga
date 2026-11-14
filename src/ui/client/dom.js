// ページの要素と実行環境の共有値(docs/spec/site.md「閲覧時の機能」)。閲覧時のどの機能も、ここから読む。

/** html 要素 */
export const root = document.documentElement;
/** サイトの基点の URL(data-base)。なければ '/' */
export const base = root.getAttribute('data-base') || '/';
/** OS の設定が「視差効果を減らす」か */
export const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 章のページか */
export const isChapter = document.body.classList.contains('page-chapter');

/**
 * セレクターに合う要素の配列を返す。
 * Preconditions: sel が正しいセレクターである。
 * Postconditions: el の中(省略すれば document)の、合う要素を文書順に並べた配列を返す。なければ空の配列。
 * Failure modes: sel が正しくなければ querySelectorAll が例外を投げる。
 * Side effects: なし。
 * @param {string} sel
 * @param {ParentNode} [el]
 * @returns {any[]}
 */
export function all(sel, el) {
  return Array.prototype.slice.call((el || document).querySelectorAll(sel));
}
