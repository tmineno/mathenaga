// 分野の切り替え(P-05)と、折りたたみの開閉(docs/spec/site.md「分野の切り替え」「ページと URL」)。

import { KEYS } from './site.js';
import { all, isChapter } from './dom.js';
import { settings } from './settings.js';

var fields;
try {
  fields = JSON.parse((document.getElementById('_fields') || {}).textContent || '[]');
} catch {
  fields = [];
}
var ids = fields.map(function (f) {
  return f.id;
});

function readStored() {
  try {
    var v = window.localStorage.getItem(KEYS.field);
    if (v === '') return '';
    return ids.indexOf(v) >= 0 ? v : null;
  } catch {
    return null;
  }
}

function store(v) {
  try {
    window.localStorage.setItem(KEYS.field, v);
  } catch {
    /* 保存できなくても切り替えは動く */
  }
}

function initialField() {
  var q = new URLSearchParams(window.location.search).get('field');
  if (q !== null && ids.indexOf(q) >= 0) {
    store(q);
    return q;
  }
  var s = readStored();
  return s === null ? '' : s;
}

var field = '';

/**
 * 今選んでいる分野の ID を返す。
 * Preconditions: なし。
 * Postconditions: 分野の ID を返す。選んでいなければ ''(章のページでは、initField の前も '')。
 * Failure modes: なし。
 * Side effects: なし。
 * @returns {string}
 */
export function currentField() {
  return field;
}

/**
 * 分野 f の表示にする(版の出し分け・目標・範囲外の駅・切り替えボタンの押下状態)。保存や URL の書き換えはしない。
 * Preconditions: 章のページである。f は分野の ID か ''(未選択)。
 * Postconditions: currentField() が f を返す。分野ごとの要素の hidden・クラスが f に合う。
 * Failure modes: 該当する要素がなければ何もしない。
 * Side effects: DOM の属性とクラスを書き換える。
 * @param {string} f
 */
export function apply(f) {
  field = f;
  all('[data-for]').forEach(function (el) {
    el.hidden = el.getAttribute('data-for') !== f;
  });
  all('[data-goal-for]').forEach(function (el) {
    el.hidden = !(f === '' || el.getAttribute('data-goal-for') === f);
  });
  // 版の組ごとに、選んだ分野の最初の版だけを開く(同じ分野の応用が2つ以上あれば、2つ目以降はほかの分野の版と同じに扱う)
  all('.vgroup').forEach(function (g) {
    var found = false;
    all(':scope > details.v[data-field]', g).forEach(function (d) {
      var primary = !found && f !== '' && d.getAttribute('data-field') === f;
      if (primary) found = true;
      d.classList.toggle('primary', primary);
      d.open = primary || settings.openOther;
    });
  });
  all('[data-out]').forEach(function (el) {
    var outs = (el.getAttribute('data-out') || '').split(' ');
    var out = f !== '' && outs.indexOf(f) >= 0;
    if (el.classList.contains('station')) {
      el.classList.toggle('is-out', out);
      var label = el.querySelector('.out-label');
      if (label) label.hidden = !out;
    } else {
      el.classList.toggle('off', out);
    }
  });
  all('.switch [data-set-field]').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-set-field') === f));
  });
}

function setField(f) {
  apply(f);
  store(f);
  try {
    var url = new URL(window.location.href);
    if (f) url.searchParams.set('field', f);
    else url.searchParams.delete('field');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* URL を書き換えられなくても表示は切り替わる */
  }
}

/**
 * 証明の詳細と確認問題の答えを、表示の設定の「最初から開く」の状態にする。
 * Preconditions: なし。
 * Postconditions: 対象の折りたたみの open が、settings の openProof・openAnswer と同じになる。
 * Failure modes: 該当する要素がなければ何もしない。
 * Side effects: DOM の open 属性を書き換える。
 * @param {string} [only] 'openProof' か 'openAnswer' なら、その種類の折りたたみだけ(設定を変えたとき)
 */
export function applyFolds(only) {
  if (only !== 'openAnswer') {
    all('details.fold.proof').forEach(function (d) {
      d.open = settings.openProof;
    });
  }
  if (only !== 'openProof') {
    all('details.fold.answer').forEach(function (d) {
      d.open = settings.openAnswer;
    });
  }
}

/**
 * アンカーの指す先が折りたたみ(ID を付けた応用など)か、折りたたみの中にあれば、開いて表示する
 * (site.md「ページと URL」。注の一覧から、証明の詳細の中の注の印へ戻るときなど)。
 * Preconditions: なし。
 * Postconditions: URL のアンカーの指す要素を囲む折りたたみがすべて開く。閉じていたものがあれば、その要素へスクロールする。
 * Failure modes: アンカーがない・壊れている(`#%` など)・指す要素がないときは何もしない(例外は出さない)。
 * Side effects: DOM の open 属性を書き換え、スクロールすることがある。
 */
export function openTarget() {
  var id = window.location.hash.slice(1);
  if (!id) return;
  try {
    id = decodeURIComponent(id);
  } catch {
    return; // `#%` のような壊れたアンカーは無視する(ほかの機能の初期化を止めない)
  }
  var el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'DETAILS') /** @type {HTMLDetailsElement} */ (el).open = true;
  var opened = false;
  for (var d = el.parentElement ? el.parentElement.closest('details') : null; d;) {
    if (!(/** @type {HTMLDetailsElement} */ (d).open)) {
      /** @type {HTMLDetailsElement} */ (d).open = true;
      opened = true;
    }
    d = d.parentElement ? d.parentElement.closest('details') : null;
  }
  // 閉じた折りたたみの中の要素には、ブラウザが移動できないので、開いてから移る
  if (opened) el.scrollIntoView();
}

/**
 * 分野の切り替えを始める。章のページでは、保存した(か URL の)分野と折りたたみの状態を反映し、アンカーの先を開く。
 * 切り替えボタンの押下と、選んだ分野の版(details.v.primary)の見出しの既定動作の抑止(閉じさせない)は、全ページで受け付ける。
 * Preconditions: 表示の設定(settings)を読み込んである。
 * Postconditions: 章のページなら分野・折りたたみが反映され、hashchange で openTarget が動く。クリックの委譲が登録される。
 * Failure modes: localStorage や URL が扱えなくても、切り替えは動く(保存と URL の書き換えだけ省く)。
 * Side effects: DOM の更新、イベントリスナーの登録、分野の保存(URL の field 指定があるとき)。
 */
export function initField() {
  if (isChapter) {
    apply(initialField());
    applyFolds();
    openTarget();
    window.addEventListener('hashchange', openTarget);
  }

  document.addEventListener('click', function (e) {
    var target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    var b = target.closest('[data-set-field]');
    if (b) {
      setField(b.getAttribute('data-set-field') || '');
      return;
    }
    var s = target.closest('details.v.primary > summary');
    if (s) e.preventDefault();
  });
}
