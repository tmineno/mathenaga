// 用語ポップアップ(P-01)と、注と文献のポップアップ(P-11)(docs/spec/site.md「用語ポップアップ」「注と参考文献の表示」)。
// 注の印(.note-ref a)と文献の印(a.cite)は、注の一覧・参考文献の項目へのリンク。スクリプトが動くときは、
// 押しても移らずにポップアップを出す。中身はページの中の一覧から写す(site.md「注と参考文献の表示」)。

import { all, root, base } from './dom.js';
import { msg } from './site.js';
import { settings } from './settings.js';

var POP_TRIGGERS = '.term, .note-ref a, a.cite';

var pop = document.getElementById('_pop');
var defsPromise = null;
var current = null;
var timer = null;
var shownAt = 0;
/** 閉じたポップアップの用語へフォーカスを戻している間(その focus では開き直さない) */
var refocusing = false;

function loadDefs() {
  if (!defsPromise) {
    // 版の印の付いた URL(build.md「出力」)。古いページでは印のない URL
    defsPromise = fetch(root.getAttribute('data-defs') || base + 'defs.json')
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .catch(function (err) {
        defsPromise = null;
        throw err;
      });
  }
  return defsPromise;
}

function place(el) {
  var r = el.getBoundingClientRect();
  var w = pop.offsetWidth;
  var hgt = pop.offsetHeight;
  var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
  var top = r.bottom + 8;
  if (top + hgt > window.innerHeight - 8) top = r.top - hgt - 8;
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = Math.max(8, top) + 'px';
}

function render(el, d, id) {
  pop.textContent = '';
  var head = document.createElement('p');
  head.className = 'pop-h';
  var badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = d.code;
  var en = document.createElement('span');
  en.className = 'pop-en';
  en.textContent = d.en;
  head.appendChild(badge);
  head.appendChild(document.createTextNode(msg('statement.definition', { number: d.number }) + ' · ' + d.name));
  head.appendChild(en);
  var body = document.createElement('div');
  body.className = 'pop-body flow';
  body.innerHTML = d.html;
  var foot = document.createElement('p');
  foot.className = 'pop-s';
  foot.appendChild(
    document.createTextNode(
      msg('popup.definition.place', {
        chapter: msg('chapter.number', { n: d.chapter }),
        title: d.chapterTitle,
        code: d.code,
        station: d.stationName,
      }),
    ),
  );
  if (document.getElementById(id)) {
    var go = document.createElement('a');
    go.className = 'pop-go';
    go.href = '#' + id;
    go.textContent = msg('popup.definition.here');
    foot.appendChild(go);
  } else {
    var link = document.createElement('a');
    link.className = 'pop-go';
    link.href = d.url;
    link.textContent = msg('popup.definition.chapter');
    foot.appendChild(link);
  }
  pop.appendChild(head);
  pop.appendChild(body);
  pop.appendChild(foot);
  place(el);
}

/**
 * 注か文献のポップアップの中身を、ページの中の一覧の項目から作る。用語はボタンにせず文字だけにする。
 * @param {Element} el  注の印か文献の印
 */
function renderLocal(el) {
  var note = el.getAttribute('data-note');
  var cite = el.getAttribute('data-cite');
  var src = note
    ? document.querySelector('#_note-' + note + '-text .note-body')
    : document.querySelector('#' + CSS.escape(cite || '') + ' .ref-body');
  pop.textContent = '';
  pop.setAttribute('aria-label', note ? msg('note.title') : msg('popup.reference.title'));
  var head = document.createElement('p');
  head.className = 'pop-h';
  head.textContent = note ? msg('note.ref', { n: note }) : el.textContent;
  var body = document.createElement('div');
  body.className = 'pop-body flow';
  if (src) body.innerHTML = src.innerHTML;
  all('.term', body).forEach(function (t) {
    t.replaceWith(document.createTextNode(t.textContent || ''));
  });
  all('[id]', body).forEach(function (t) {
    t.removeAttribute('id');
  });
  pop.appendChild(head);
  pop.appendChild(body);
  if (cite) {
    var foot = document.createElement('p');
    foot.className = 'pop-s';
    var go = document.createElement('a');
    go.className = 'pop-go';
    go.href = '#' + cite;
    go.textContent = msg('popup.reference.go');
    foot.appendChild(go);
    pop.appendChild(foot);
  }
  place(el);
}

function show(el, focusPop) {
  if (!pop) return;
  window.clearTimeout(timer);
  if (current && current !== el) current.setAttribute('aria-expanded', 'false');
  current = el;
  el.setAttribute('aria-expanded', 'true');
  shownAt = Date.now();
  if (!el.classList.contains('term')) {
    pop.hidden = false;
    renderLocal(el);
    if (focusPop) pop.focus();
    return;
  }
  pop.setAttribute('aria-label', msg('popup.definition.title'));
  var id = el.getAttribute('data-def');
  pop.textContent = msg('popup.loading');
  pop.hidden = false;
  place(el);
  loadDefs().then(
    function (defs) {
      if (current !== el) return;
      var d = defs[id];
      if (d) render(el, d, id);
      else pop.textContent = msg('popup.definition.missing');
      if (focusPop) pop.focus();
    },
    function () {
      if (current !== el) return;
      pop.textContent = msg('popup.definition.failed');
      place(el);
    },
  );
}

function hide(returnFocus) {
  window.clearTimeout(timer);
  var el = current;
  if (el) el.setAttribute('aria-expanded', 'false');
  current = null;
  if (pop) pop.hidden = true;
  if (returnFocus && el) {
    refocusing = true;
    try {
      el.focus();
    } finally {
      refocusing = false;
    }
  }
}

/** 表示の設定で「押したときだけ出す」なら、重ねる・フォーカスする・離れるでは開け閉めしない */
function clickOnly() {
  return settings.popup === 'click';
}

function hideSoon() {
  if (clickOnly()) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(function () {
    if (pop && pop.contains(document.activeElement)) return;
    hide(false);
  }, 200);
}

function follow() {
  if (current && pop && !pop.hidden) place(current);
}

/**
 * 用語・注・文献の印にポップアップを結びつける。
 * Preconditions: 表示の設定(settings)を読み込んである。
 * Postconditions: 印の重ね・フォーカス・押下でポップアップが開閉する(設定が「押したときだけ」なら押下だけ)。Esc・外側の押下・スクロールにも従う。
 * Failure modes: ポップアップの要素(#_pop)がなければ、リスナーは付くが表示はしない。定義の索引を読み込めなければ、その旨を表示する。
 * Side effects: イベントリスナーの登録、ポップアップの表示、定義の索引(defs.json)の取得。
 */
export function initPopups() {
  all(POP_TRIGGERS).forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      if (!clickOnly()) show(el, false);
    });
    el.addEventListener('mouseleave', hideSoon);
    el.addEventListener('focus', function () {
      if (!clickOnly() && !refocusing) show(el, false);
    });
    el.addEventListener('click', function (e) {
      // 注と文献の印はリンクだが、スクリプトが動くときは移らずにポップアップを出す
      if (el.tagName === 'A') e.preventDefault();
      if (current === el && Date.now() - shownAt > 400) hide(false);
      else show(el, true);
    });
  });
  if (pop) {
    pop.addEventListener('mouseenter', function () {
      window.clearTimeout(timer);
    });
    pop.addEventListener('mouseleave', hideSoon);
    pop.addEventListener('click', function (e) {
      var a = e.target instanceof Element ? e.target.closest('a.pop-go') : null;
      if (a && a.getAttribute('href').charAt(0) === '#') hide(false);
    });
  }
  window.addEventListener('scroll', follow, { passive: true });
  window.addEventListener('resize', follow);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) hide(true);
  });
  document.addEventListener('pointerdown', function (e) {
    if (!current || !pop) return;
    var t = e.target instanceof Element ? e.target : null;
    if (t && (pop.contains(t) || t.closest(POP_TRIGGERS))) return;
    hide(false);
  });
}
