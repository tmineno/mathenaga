// 表示の設定のメニュー(P-09)(docs/spec/site.md「表示の設定」)。
// 右下の歯車のボタンと、その上に開くメニュー。スクリプトが動くときだけ作る。

import { LOOK } from '../shared/settings.js';
import { KEYS, msg } from './site.js';
import { isChapter } from './dom.js';
import { apply, applyFolds, currentField } from './field.js';
import { mapResets } from './map.js';
import { applyLook, resetSettings, settings } from './settings.js';
import { setItem } from './storage.js';

var GROUPS = [
  {
    key: 'theme',
    title: msg('settings.theme'),
    options: [
      ['light', msg('settings.theme.light')],
      ['dark', msg('settings.theme.dark')],
      ['auto', msg('settings.theme.auto')],
    ],
  },
  {
    key: 'text',
    title: msg('settings.text'),
    options: [
      ['small', msg('settings.text.small')],
      ['medium', msg('settings.text.medium')],
      ['large', msg('settings.text.large')],
    ],
  },
  {
    key: 'width',
    title: msg('settings.width'),
    options: [
      ['narrow', msg('settings.width.narrow')],
      ['standard', msg('settings.width.standard')],
      ['wide', msg('settings.width.wide')],
    ],
  },
  {
    title: msg('settings.open'),
    checks: [
      ['openProof', msg('settings.open.proof')],
      ['openAnswer', msg('settings.open.answer')],
      ['openOther', msg('settings.open.other')],
    ],
  },
  {
    key: 'popup',
    title: msg('settings.popup'),
    options: [
      ['hover', msg('settings.popup.hover')],
      ['click', msg('settings.popup.click')],
    ],
  },
];

function gearSvg() {
  // 歯が 8 つの歯車。外の半径 10、歯の根元 7.4、中の穴 3.2(24×24 の中央)
  var n = 8;
  var step = (Math.PI * 2) / n;
  var pts = [];
  function at(r, a) {
    return (12 + r * Math.cos(a)).toFixed(2) + ' ' + (12 + r * Math.sin(a)).toFixed(2);
  }
  for (var i = 0; i < n; i++) {
    var c = i * step - Math.PI / 2;
    pts.push(at(7.4, c - 0.32 * step), at(10, c - 0.17 * step), at(10, c + 0.17 * step), at(7.4, c + 0.32 * step));
  }
  var d = 'M' + pts.join(' L') + ' Z M15.2 12 A3.2 3.2 0 1 0 8.8 12 A3.2 3.2 0 1 0 15.2 12 Z';
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="' +
    d +
    '"/></svg>'
  );
}

/**
 * 表示の設定のメニューを始める。
 * Preconditions: bookmark が initBookmarks の返り値である(「しおりを消す」が使うので、しおりを先に作る)。
 * Postconditions: 右下に歯車のボタンとメニューが加わり、設定の変更が html・折りたたみ・ポップアップに反映されて保存される。
 * Failure modes: 保存できなくても、そのページの中では効く。
 * Side effects: ボタンとパネルを body に足す、イベントリスナーの登録、設定の保存、設定を戻すときは倍率・しおりの保存も消す。
 * @param {{ clear: () => void }} bookmark
 */
export function initSettingsMenu(bookmark) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'settings-btn';
  btn.setAttribute('aria-label', msg('settings.title'));
  btn.title = msg('settings.title');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', '_settings');
  btn.innerHTML = gearSvg();

  var panel = document.createElement('div');
  panel.id = '_settings';
  panel.className = 'settings';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', msg('settings.title'));
  panel.hidden = true;

  /** @type {Record<string, HTMLInputElement[]>} */
  var inputs = {};
  GROUPS.forEach(function (g) {
    var fs = document.createElement('fieldset');
    var lg = document.createElement('legend');
    lg.textContent = g.title;
    fs.appendChild(lg);
    if (g.options) {
      var seg = document.createElement('div');
      seg.className = 'seg';
      inputs[g.key] = [];
      g.options.forEach(function (o) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = '_set-' + g.key;
        input.value = o[0];
        var span = document.createElement('span');
        span.textContent = o[1];
        label.appendChild(input);
        label.appendChild(span);
        seg.appendChild(label);
        inputs[g.key].push(input);
        input.addEventListener('change', function () {
          if (input.checked) change(g.key, o[0]);
        });
      });
      fs.appendChild(seg);
    } else {
      g.checks.forEach(function (c) {
        var label = document.createElement('label');
        label.className = 'check';
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.name = '_set-' + c[0];
        label.appendChild(input);
        label.appendChild(document.createTextNode(c[1]));
        fs.appendChild(label);
        inputs[c[0]] = [input];
        input.addEventListener('change', function () {
          change(c[0], input.checked);
        });
      });
    }
    panel.appendChild(fs);
  });

  var actions = document.createElement('div');
  actions.className = 'settings-actions';
  var reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = msg('settings.reset');
  var clearMarks = document.createElement('button');
  clearMarks.type = 'button';
  clearMarks.textContent = msg('settings.clearmarks');
  var status = document.createElement('span');
  status.className = 'settings-status';
  status.setAttribute('aria-live', 'polite');
  actions.appendChild(reset);
  actions.appendChild(clearMarks);
  actions.appendChild(status);
  panel.appendChild(actions);

  document.body.appendChild(panel);
  document.body.appendChild(btn);

  function sync() {
    Object.keys(inputs).forEach(function (k) {
      inputs[k].forEach(function (input) {
        input.checked = input.type === 'checkbox' ? settings[k] === true : input.value === settings[k];
      });
    });
  }
  function say(msg) {
    status.textContent = msg;
  }
  function change(k, v) {
    settings[k] = v;
    setItem(KEYS.settings, JSON.stringify(settings));
    say('');
    if (LOOK.indexOf(k) >= 0) applyLook();
    else if (isChapter && (k === 'openProof' || k === 'openAnswer')) applyFolds(k);
    else if (isChapter && k === 'openOther') apply(currentField());
  }
  reset.addEventListener('click', function () {
    resetSettings();
    setItem(KEYS.settings, null);
    setItem(KEYS.zoom, null);
    sync();
    applyLook();
    if (isChapter) {
      apply(currentField());
      applyFolds();
    }
    mapResets.forEach(function (fn) {
      fn();
    });
    say(msg('settings.reset.done'));
  });
  clearMarks.addEventListener('click', function () {
    bookmark.clear();
    say(msg('settings.clearmarks.done'));
  });

  function open() {
    sync();
    say('');
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    var first = inputs[GROUPS[0].key].filter(function (i) {
      return i.checked;
    })[0];
    (first || inputs[GROUPS[0].key][0]).focus();
  }
  function close(returnFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus();
  }
  btn.addEventListener('click', function () {
    if (panel.hidden) open();
    else close(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) close(true);
  });
  document.addEventListener('pointerdown', function (e) {
    if (panel.hidden) return;
    var t = e.target instanceof Node ? e.target : null;
    if (t && (panel.contains(t) || btn.contains(t))) return;
    close(false);
  });
}
