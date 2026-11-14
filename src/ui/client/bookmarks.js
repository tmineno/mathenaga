// しおり(P-10)(docs/spec/site.md「しおり」)。
// 駅のしおりのボタンで駅を入れ・外し、上端のバーのボタンで一覧を開く。駅の ID の並びとして保存する。
// 一覧の表示番号・駅名・章は、ページに埋め込んだ駅の索引(_stations)から引く。

import { KEYS } from '../shared/settings.js';
import { all, base } from './dom.js';
import { getItem, setItem } from './storage.js';

/**
 * しおりを始める(ボタン・一覧・ほかのタブとの同期)。
 * Preconditions: なし。
 * Postconditions: しおりのボタンと一覧が動き、保存した駅の ID の並びと合う。返す clear で全部消せる。
 * Failure modes: 保存した値の形が違えば空として扱う。駅の索引が壊れていれば一覧は空になる。
 * Side effects: 一覧のパネルを body に足す、イベントリスナーの登録、しおりの保存。
 * @returns {{ clear: () => void }}
 */
export function initBookmarks() {
  var stations;
  try {
    stations = JSON.parse((document.getElementById('_stations') || {}).textContent || '[]');
  } catch {
    stations = [];
  }
  /** 保存した駅の ID の並び。形が違う値(古い形など)は空として扱う */
  function load() {
    try {
      var v = JSON.parse(getItem(KEYS.bookmarks) || '[]');
      return Array.isArray(v)
        ? v.filter(function (x) {
            return typeof x === 'string';
          })
        : [];
    } catch {
      return [];
    }
  }
  var marks = load();
  function has(id) {
    return marks.indexOf(id) >= 0;
  }
  function set(id, on) {
    var i = marks.indexOf(id);
    if (on && i < 0) marks.push(id);
    if (!on && i >= 0) marks.splice(i, 1);
    setItem(KEYS.bookmarks, marks.length ? JSON.stringify(marks) : null);
    refresh();
  }

  var toggles = all('button.bm[data-bm]');
  toggles.forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      set(b.getAttribute('data-bm'), !has(b.getAttribute('data-bm')));
    });
  });

  var opener = /** @type {HTMLElement | null} */ (document.querySelector('.bar .bm-open'));
  var panel = document.createElement('div');
  panel.id = '_bookmarks';
  panel.className = 'bm-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'しおり');
  panel.tabIndex = -1;
  panel.hidden = true;
  var title = document.createElement('h2');
  title.textContent = 'しおり';
  var list = document.createElement('ol');
  list.className = 'bm-list';
  var empty = document.createElement('p');
  empty.className = 'bm-empty';
  empty.textContent = 'しおりはまだありません。駅のしおりのアイコンを押すと、ここに加わります。';
  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(empty);
  document.body.appendChild(panel);

  function label(st) {
    return '第' + st.ch + '章 ' + st.code + ' ' + st.name;
  }
  function renderList() {
    list.textContent = '';
    var items = stations.filter(function (st) {
      return has(st.id);
    });
    items.forEach(function (st) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = base + 'chapters/' + st.chapter + '/#' + st.id;
      a.textContent = label(st);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'bm-del';
      del.textContent = '×';
      del.setAttribute('aria-label', 'しおりから外す:' + label(st));
      del.title = 'しおりから外す';
      del.addEventListener('click', function () {
        set(st.id, false);
        var next = /** @type {HTMLElement | null} */ (list.querySelector('.bm-del'));
        (next || panel).focus();
      });
      li.appendChild(a);
      li.appendChild(del);
      list.appendChild(li);
    });
    list.hidden = items.length === 0;
    empty.hidden = items.length > 0;
  }
  function refresh() {
    toggles.forEach(function (b) {
      var on = has(b.getAttribute('data-bm'));
      var tip = on ? 'しおりから外す' : 'この駅をしおりに入れる';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', tip);
      b.setAttribute('data-tip', tip);
    });
    if (!panel.hidden) renderList();
  }

  function place() {
    if (!opener || panel.hidden) return;
    var r = opener.getBoundingClientRect();
    var w = panel.offsetWidth;
    panel.style.left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16)) + 'px';
    panel.style.top = r.bottom + 6 + 'px';
  }
  function open() {
    renderList();
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    place();
    var first = /** @type {HTMLElement | null} */ (list.querySelector('a'));
    (first || panel).focus();
  }
  function close(returnFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    opener.setAttribute('aria-expanded', 'false');
    if (returnFocus) opener.focus();
  }
  if (opener) {
    opener.hidden = false;
    opener.addEventListener('click', function () {
      if (panel.hidden) open();
      else close(false);
    });
    list.addEventListener('click', function (e) {
      if (e.target instanceof Element && e.target.closest('a')) close(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close(true);
    });
    document.addEventListener('pointerdown', function (e) {
      if (panel.hidden) return;
      var t = e.target instanceof Node ? e.target : null;
      if (t && (panel.contains(t) || opener.contains(t))) return;
      close(false);
    });
    window.addEventListener('resize', place);
  }
  // ほかのタブで入れ・外ししたら合わせる
  window.addEventListener('storage', function (e) {
    if (e.key !== KEYS.bookmarks && e.key !== null) return;
    marks = load();
    refresh();
  });
  refresh();

  return {
    clear: function () {
      marks = [];
      setItem(KEYS.bookmarks, null);
      refresh();
    },
  };
}
