// ブラウザへの保存(localStorage)の読み書き(docs/spec/site.md「ブラウザに保存するもの」)。保存できない環境でも例外を出さない。

/**
 * 保存した値を読む。
 * Preconditions: なし。
 * Postconditions: 保存した文字列を返す。なければ、または読めなければ null。
 * Failure modes: localStorage が使えなければ null を返す(例外は出さない)。
 * Side effects: なし。
 * @param {string} k
 * @returns {string | null}
 */
export function getItem(k) {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}

/**
 * 値を保存する。v が null なら、保存した値を消す。
 * Preconditions: なし。
 * Postconditions: 保存できれば、getItem(k) が v を返す。
 * Failure modes: 保存できなくても例外は出さない(そのページの中では効く)。
 * Side effects: localStorage を書き換える。
 * @param {string} k
 * @param {string | null} v
 */
export function setItem(k, v) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* 保存できなくても、そのページの中では効く */
  }
}

/**
 * 保存した JSON のオブジェクトを読む。
 * Preconditions: なし。
 * Postconditions: 保存した値がオブジェクト(配列でない)ならそれを返す。なければ、または形が違えば空のオブジェクト。
 * Failure modes: 読めない・JSON として壊れているときも空のオブジェクトを返す(例外は出さない)。
 * Side effects: なし。
 * @param {string} k
 * @returns {Record<string, any>}
 */
export function readObject(k) {
  try {
    var v = JSON.parse(getItem(k) || 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
