// 表示の設定(P-09)の読み込みと、html の属性への反映(docs/spec/site.md「表示の設定」)。メニューは settings-menu.js が受け持つ。
// テーマ・文字の大きさ・本文の幅は、head の中のスクリプト(pages.js の LOOK_SCRIPT)が描く前に html の属性へ移す。
// ここでは設定の読み書きと、残りの項目(折りたたみ・ポップアップ)の反映の土台を受け持つ。

import { CHOICES, LOOK, KEYS } from '../shared/settings.js';
import { root } from './dom.js';
import { readObject } from './storage.js';

/**
 * 設定の初期値(各項目の先頭の選択肢)。
 * Preconditions: なし。
 * Postconditions: CHOICES の全項目を持つ新しいオブジェクトを返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @returns {Record<string, any>}
 */
export function defaultSettings() {
  var d = {};
  Object.keys(CHOICES).forEach(function (k) {
    d[k] = CHOICES[k][0];
  });
  return d;
}

/**
 * 保存した設定を読む。選択肢にない値の項目は初期値にする(ほかの項目は使う)。
 * Preconditions: なし。
 * Postconditions: CHOICES の全項目を持つ新しいオブジェクトを返す。
 * Failure modes: 保存した値が壊れていれば、すべて初期値になる(例外は出さない)。
 * Side effects: なし。
 * @returns {Record<string, any>}
 */
export function loadSettings() {
  var raw = readObject(KEYS.settings);
  var d = defaultSettings();
  Object.keys(CHOICES).forEach(function (k) {
    if (CHOICES[k].indexOf(raw[k]) >= 0) d[k] = raw[k];
  });
  return d;
}

/**
 * 今の表示の設定。ほかの機能と共有するので、差し替えずにその場で書き換える(元に戻すときは resetSettings)。
 */
export const settings = loadSettings();

/**
 * 設定を初期値に戻す(保存した値は消さない)。
 * Preconditions: なし。
 * Postconditions: settings のすべての項目が初期値になる。同じオブジェクトのままである。
 * Failure modes: なし。
 * Side effects: settings を書き換える。
 */
export function resetSettings() {
  Object.assign(settings, defaultSettings());
}

/**
 * テーマ・文字の大きさ・本文の幅を html の data-<項目> 属性に反映する。初期値の項目は属性を外す。
 * Preconditions: なし。
 * Postconditions: LOOK の各項目について、settings の値が初期値なら属性なし、そうでなければ属性にその値がある。
 * Failure modes: なし。
 * Side effects: html 要素の属性を書き換える。
 */
export function applyLook() {
  LOOK.forEach(function (k) {
    if (settings[k] === CHOICES[k][0]) root.removeAttribute('data-' + k);
    else root.setAttribute('data-' + k, settings[k]);
  });
}
