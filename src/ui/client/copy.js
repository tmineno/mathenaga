// 位置情報つきのコピー(P-08)と、選んだ文章からの起票と原稿の表示(P-12)(docs/spec/site.md「位置情報つきのコピー」)。
// 区画(data-loc)と段落の番号(data-p)はビルドが振る。ここでは選んだ範囲から文と位置を作ってコピーする。
// リポジトリの URL を渡したビルドでは、区画の起票の URL(data-issue)と段落の原稿の行(data-l)もビルドが書く。

import { all } from './dom.js';

/**
 * 章の本文(article.chapter[data-chapter])で、選んだ文章の操作メニューを始める。
 * Preconditions: なし。
 * Postconditions: 章のページなら、文章を選ぶとコピー(と、起票・編集)のメニューが出る。
 * Failure modes: 章の本文がなければ何もしない。クリップボードに書けなければ「コピーできませんでした」と表示する。
 * Side effects: メニューを body に足す、イベントリスナーの登録、クリップボードへの書き込み。
 */
export function initCopy() {
  var chapterEl = document.querySelector('article.chapter[data-chapter]');
  if (chapterEl) setupCopy(chapterEl);
}

/** @param {Element} article */
function setupCopy(article) {
  var chapterNo = article.getAttribute('data-chapter');
  /** コードなどの空白と改行の印(Unicode の私用領域の文字。本文には現れない) */
  var PRE_SP = '\uE000';
  var PRE_NL = '\uE001';
  var BLOCK =
    /^(block|flex|grid|flow-root|list-item|table|table-row|table-row-group|table-header-group|table-footer-group|table-caption)$/;
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  /** 原稿のファイルの GitHub の URL。MATHENAGA_REPO_URL を渡したビルドだけにある(site.md P-12) */
  var source = article.getAttribute('data-source');
  /** 「起票」の該当箇所に入れる、選んだ文の文字数の上限(Issue 作成画面の URL を長くしすぎない) */
  var EXCERPT_MAX = 500;
  /** 選択メニューのアイコン(24 の格子に描いた線) */
  var ICONS = {
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.5"/><path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/>',
    loc: '<path d="M12 20.5s-6-5.3-6-10.5a6 6 0 0 1 12 0c0 5.2-6 10.5-6 10.5z"/><circle cx="12" cy="10" r="2.2"/>',
    issue:
      '<path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
    edit: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M13 7l4 4"/>',
  };

  var menu = document.createElement('div');
  menu.className = 'copy-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', '選んだ文章の操作');
  menu.hidden = true;
  /**
   * アイコンと短い文言を付けて選択メニューに足す。重ねたときの文と読み上げは tip(site.md「位置情報つきのコピー」)。
   * @template {HTMLElement} T @param {T} el @param {string} icon @param {string} label @param {string} tip @returns {T}
   */
  function addItem(el, icon, label, tip) {
    el.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' + ICONS[icon] + '</svg>';
    var text = document.createElement('span');
    text.textContent = label;
    el.appendChild(text);
    el.setAttribute('aria-label', tip);
    el.setAttribute('data-tip', tip);
    menu.appendChild(el);
    return el;
  }
  var buttons = [
    { mode: 'plain', label: 'コピー', tip: 'そのままコピー' },
    { mode: 'loc', label: '位置つき', tip: '位置つきでコピー(1行目に位置情報を付ける)' },
  ].map(function (b) {
    var el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('data-copy', b.mode);
    return addItem(el, b.mode === 'plain' ? 'copy' : 'loc', b.label, b.tip);
  });
  /** @param {string} act @param {string} label @param {string} tip */
  function addLink(act, label, tip) {
    var a = document.createElement('a');
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('data-act', act);
    return addItem(a, act === 'issue' ? 'issue' : 'edit', label, tip);
  }
  /** @type {HTMLAnchorElement | null} 「起票」(site.md「選んだ文章からの起票と原稿の表示」) */
  var issueLink = null;
  /** @type {HTMLAnchorElement | null} 「編集」 */
  var sourceLink = null;
  if (source) {
    var sep = document.createElement('span');
    sep.className = 'copy-sep';
    sep.setAttribute('aria-hidden', 'true');
    menu.appendChild(sep);
    issueLink = addLink('issue', '起票', 'この記述についてGitHub Issueに起票する');
    sourceLink = addLink('source', '編集', 'この段落の原稿をGitHubで開いて編集する');
  }
  var status = document.createElement('span');
  status.className = 'copy-status';
  status.setAttribute('role', 'status');
  menu.appendChild(status);
  document.body.appendChild(menu);

  /** @type {Range | null} ボタンを出したときの選択範囲 */
  var saved = null;
  var timer = 0;
  var closeTimer = 0;
  var pointerDown = false;

  /** @param {Node | null} node */
  function elementOf(node) {
    if (!node) return null;
    return node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
  }
  /** @param {Node} node */
  function katexOf(node) {
    var el = elementOf(node);
    return el ? el.closest('.katex') : null;
  }
  /** 数式を TeX に戻す。 @param {Element} k */
  function texOf(k) {
    var a = k.querySelector('annotation[encoding="application/x-tex"]');
    var tex = (a ? a.textContent : k.textContent).trim();
    var display = k.parentElement && k.parentElement.classList.contains('katex-display');
    return display ? '$$' + tex + '$$' : '$' + tex + '$';
  }
  /** 数式の途中で始まる・終わる範囲を、数式全体に広げる。 @param {Range} range */
  function snapped(range) {
    var r = range.cloneRange();
    var ks = katexOf(r.startContainer);
    if (ks) r.setStartBefore(ks);
    var ke = katexOf(r.endContainer);
    if (ke) r.setEndAfter(ke);
    return r;
  }
  /** コピーに含めない要素。 @param {HTMLElement} el */
  function skipped(el) {
    if (el.hidden || el.classList.contains('eq-num') || el.classList.contains('st-tools')) return true;
    // 注の印と、注の一覧の「↩」は含めず、文字の位置にも数えない(site.md「位置情報つきのコピー」)
    if (el.classList.contains('note-ref') || el.classList.contains('note-back')) return true;
    var p = el.parentElement;
    if (p && p.tagName === 'DETAILS' && !(/** @type {HTMLDetailsElement} */ (p).open) && el.tagName !== 'SUMMARY') {
      return true;
    }
    return getComputedStyle(el).display === 'none';
  }

  /**
   * 範囲の文を site.md「位置情報つきのコピー」の形にする。keepEnd なら末尾の空白を残す(文字の数え方に使う)。
   * @param {Range} range @param {boolean} keepEnd
   */
  function textOf(range, keepEnd) {
    var out = '';
    /** @param {Node} node */
    function walk(node) {
      if (!range.intersectsNode(node)) return;
      if (node.nodeType === 3) {
        var s = /** @type {Text} */ (node).data;
        var to = node === range.endContainer ? range.endOffset : s.length;
        s = s.slice(node === range.startContainer ? range.startOffset : 0, to);
        var pre = /^pre/.test(getComputedStyle(node.parentElement).whiteSpace);
        // コードなどの空白と改行は、下の区切りの整理に巻き込まないよう、印に置き換えておく
        out += pre ? s.replace(/ /g, PRE_SP).replace(/\n/g, PRE_NL) : s.replace(/[ \t\n\r\f]+/g, ' ');
        return;
      }
      if (node.nodeType !== 1) return;
      var el = /** @type {HTMLElement} */ (node);
      if (skipped(el)) return;
      if (el.classList.contains('katex')) {
        out += texOf(el);
        return;
      }
      if (el.tagName === 'BR') {
        out += '\n';
        return;
      }
      var display = getComputedStyle(el).display;
      var block = BLOCK.test(display);
      // 区切りは、要素の始まり・終わりが範囲の中にあるときだけ書く(範囲が要素の途中で終わるなら閉じない)
      var opens = range.comparePoint(el, 0) >= 0;
      if (display === 'table-cell' && opens && el.previousElementSibling) out += '\t';
      if (block && opens) out += '\n';
      for (var c = el.firstChild; c; c = c.nextSibling) walk(c);
      if (block && range.comparePoint(el, el.childNodes.length) <= 0) out += '\n';
    }
    walk(range.commonAncestorContainer);
    // 区切りの改行のまわりの空白と、続く改行を1つにまとめる。コードの末尾の改行は区切りの改行に含める
    out = out
      .replace(/ *\n[ \n]*/g, '\n')
      .replace(/^\s+/, '')
      .replace(/\uE001(?=\n)/g, '')
      .replace(/\uE000/g, ' ')
      .replace(/\uE001/g, '\n');
    return keepEnd ? out : out.replace(/\s+$/, '');
  }

  /**
   * 範囲の位置。sec は区画、at は [章番号, 駅番号, 段落, 文字]。区画の段落に1つもかからなければ null。
   * @param {Range} range 数式に合わせて広げた範囲
   * @returns {{ sec: Element, at: Array<string | number | null> } | null}
   */
  function locate(range) {
    var el = elementOf(range.startContainer);
    var p = el ? el.closest('[data-p]') : null;
    var sec = p ? p.closest('[data-loc]') : null;
    if (p && sec && article.contains(sec)) {
      var head = document.createRange();
      head.setStart(p, 0);
      head.setEnd(range.startContainer, range.startOffset);
      return {
        sec: sec,
        at: [
          chapterNo,
          sec.getAttribute('data-loc'),
          p.getAttribute('data-p'),
          Array.from(textOf(head, true)).length + 1,
        ],
      };
    }
    // 段落の外(札など)から選び始めたときは、範囲にかかる最初の段落の 1 文字目
    var list = all('[data-loc] [data-p], [data-loc][data-p]', article);
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (!range.intersectsNode(q) || !q.getClientRects().length) continue;
      var s = /** @type {Element} */ (q.closest('[data-loc]'));
      return { sec: s, at: [chapterNo, s.getAttribute('data-loc'), q.getAttribute('data-p'), 1] };
    }
    return null;
  }

  /** 「位置つき」でコピーする文。 @param {Range} r 数式に合わせて広げた範囲 @param {string} text 選んだ文 */
  function withLocation(r, text) {
    var where = locate(r);
    return where ? '[' + where.at.join(':') + ']\n' + text : text;
  }

  /**
   * 範囲にかかる段落の原稿の行 [始め, 終わり](site.md「選んだ文章からの起票と原稿の表示」)。行はビルドが data-l に書く。
   * 文字を1つも選んでいない段落(3回押して段落を選んだときの、次の段落の頭など)は数えない。行のある段落がなければ null。
   * @param {Range} r
   */
  function linesOf(r) {
    var root = elementOf(r.commonAncestorContainer);
    if (!root) return null;
    var list = all('[data-l]', root);
    var up = root.closest('[data-l]');
    if (up) list.push(up);
    var lo = Infinity;
    var hi = -Infinity;
    list.forEach(function (el) {
      if (!article.contains(el) || !r.intersectsNode(el) || !el.getClientRects().length) return;
      var part = document.createRange();
      part.selectNodeContents(el);
      if (r.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(r.startContainer, r.startOffset);
      if (r.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(r.endContainer, r.endOffset);
      if (!part.toString().trim()) return;
      var m = /^(\d+)(?:-(\d+))?$/.exec(el.getAttribute('data-l') || '');
      if (!m) return;
      lo = Math.min(lo, Number(m[1]));
      hi = Math.max(hi, Number(m[2] || m[1]));
    });
    return lo === Infinity ? null : [lo, hi];
  }

  /** 「起票」と「編集」のリンクを、選んだ範囲に合わせる。 @param {Range} range */
  function linkTo(range) {
    if (!issueLink || !sourceLink) return;
    var r = snapped(range);
    var where = locate(r);
    var base = where ? where.sec.getAttribute('data-issue') : null;
    issueLink.hidden = !base;
    if (where && base) {
      var chars = Array.from(textOf(r, false));
      var text = chars.length > EXCERPT_MAX ? chars.slice(0, EXCERPT_MAX).join('') + '…' : chars.join('');
      var excerpt = '[' + where.at.join(':') + ']\n' + text;
      try {
        var url = new URL(base, window.location.href);
        var page = url.searchParams.get('page');
        if (page) url.searchParams.set('page', window.location.origin + page);
        url.searchParams.set('excerpt', excerpt);
        issueLink.href = url.toString().replace(/\+/g, '%20');
      } catch {
        // URL が扱えない環境では、ページの欄はパスのまま
        issueLink.href = base + '&excerpt=' + encodeURIComponent(excerpt);
      }
    }
    var lines = linesOf(r);
    sourceLink.hidden = !lines;
    if (lines) sourceLink.href = source + '?plain=1#L' + lines[0] + (lines[1] > lines[0] ? '-L' + lines[1] : '');
  }

  function place() {
    if (!saved || menu.hidden) return;
    var rects = saved.getClientRects();
    var last = rects.length ? rects[rects.length - 1] : saved.getBoundingClientRect();
    var first = rects.length ? rects[0] : last;
    // 選んだ範囲が画面の外へ出たら、ボタンも見せない
    menu.style.visibility = last.bottom < 0 || first.top > window.innerHeight ? 'hidden' : '';
    var w = menu.offsetWidth;
    var hgt = menu.offsetHeight;
    var top = last.bottom + (coarse ? 28 : 8);
    if (top + hgt > window.innerHeight - 8) top = first.top - hgt - 8;
    var left = Math.min(Math.max(8, last.right - w), window.innerWidth - w - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }
  /** @param {Range} range */
  function show(range) {
    window.clearTimeout(closeTimer);
    saved = range;
    status.textContent = '';
    linkTo(range);
    menu.hidden = false;
    place();
  }
  function hide() {
    window.clearTimeout(closeTimer);
    if (menu.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur();
    saved = null;
    status.textContent = '';
    menu.hidden = true;
  }
  /** 今の選択がボタンを出したときの範囲と同じか。 */
  function selectionIsSaved() {
    var sel = window.getSelection();
    if (!saved || !sel || !sel.rangeCount || sel.isCollapsed) return false;
    var range = sel.getRangeAt(0);
    return (
      range.compareBoundaryPoints(Range.START_TO_START, saved) === 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, saved) === 0
    );
  }
  function update() {
    if (menu.contains(document.activeElement)) return; // キーボードでボタンを操作している
    if (selectionIsSaved()) {
      place();
      return;
    }
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      hide();
      return;
    }
    var range = sel.getRangeAt(0);
    if (!locate(snapped(range))) hide();
    else show(range.cloneRange());
  }

  /** @param {string} text */
  function writeText(text) {
    function legacy() {
      var keep = saved ? saved.cloneRange() : null;
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      ta.remove();
      var sel = window.getSelection();
      if (keep && sel) {
        sel.removeAllRanges();
        sel.addRange(keep);
      }
      return ok;
    }
    var clip = navigator.clipboard;
    var first = clip && clip.writeText ? clip.writeText(text) : Promise.reject(new Error('no clipboard'));
    return first.catch(function () {
      if (!legacy()) throw new Error('copy failed');
    });
  }
  /** @param {string} msg @param {boolean} ok */
  function done(msg, ok) {
    status.textContent = msg;
    place();
    window.clearTimeout(closeTimer);
    if (ok) closeTimer = window.setTimeout(hide, 1200);
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!saved) return;
      status.textContent = '';
      var r = snapped(saved);
      var text = textOf(r, false);
      if (b.getAttribute('data-copy') === 'loc') text = withLocation(r, text);
      writeText(text).then(
        function () {
          done('コピーしました', true);
        },
        function () {
          done('コピーできませんでした', false);
        },
      );
    });
  });
  // 「起票」「編集」は新しいタブで開き、選択メニューを閉じる(閉じるのは開く動作の後)
  [issueLink, sourceLink].forEach(function (a) {
    if (!a) return;
    a.addEventListener('click', function () {
      window.setTimeout(hide, 0);
    });
  });
  // ボタンを押しても選択が外れないようにする
  menu.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });
  menu.addEventListener('focusout', function (e) {
    var to = /** @type {Node | null} */ (e.relatedTarget);
    if (to && menu.contains(to)) return;
    if (to) hide();
  });

  document.addEventListener('selectionchange', function () {
    window.clearTimeout(timer);
    // 選び直している間は、前の範囲のボタンを残さない
    if (saved && !menu.contains(document.activeElement) && !selectionIsSaved()) hide();
    if (!pointerDown) timer = window.setTimeout(update, 120);
  });
  document.addEventListener('pointerdown', function (e) {
    if (e.target instanceof Node && menu.contains(e.target)) return;
    pointerDown = true;
  });
  function release() {
    if (!pointerDown) return;
    pointerDown = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 0);
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('keydown', function (e) {
    if (menu.hidden) return;
    if (e.key === 'Escape') {
      hide();
      return;
    }
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && !menu.contains(document.activeElement)) {
      e.preventDefault();
      buttons[0].focus();
    }
  });
  window.addEventListener('scroll', place, { passive: true });
  window.addEventListener('resize', place);
}
