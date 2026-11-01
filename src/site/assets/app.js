// 閲覧時のスクリプト(docs/spec/site.md「閲覧時の機能」)。
// 分野の切り替え(P-05)、用語ポップアップ(P-01)、現在地バー(P-02)、路線図の章の帯の強調(P-03)、
// 位置情報つきのコピー(P-08)。スクリプトが動かなくても、ページは未選択の表示のまま読める。
(function () {
  'use strict';
  var KEY = 'mathenaga-field';
  var root = document.documentElement;
  var base = root.getAttribute('data-base') || '/';
  var fields;
  try {
    fields = JSON.parse((document.getElementById('_fields') || {}).textContent || '[]');
  } catch {
    fields = [];
  }
  var ids = fields.map(function (f) {
    return f.id;
  });
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function all(sel, el) {
    return Array.prototype.slice.call((el || document).querySelectorAll(sel));
  }

  // ---------- 分野の切り替え ----------

  function readStored() {
    try {
      var v = window.localStorage.getItem(KEY);
      if (v === '') return '';
      return ids.indexOf(v) >= 0 ? v : null;
    } catch {
      return null;
    }
  }

  function store(v) {
    try {
      window.localStorage.setItem(KEY, v);
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

  function apply(f) {
    all('[data-for]').forEach(function (el) {
      el.hidden = el.getAttribute('data-for') !== f;
    });
    all('[data-goal-for]').forEach(function (el) {
      el.hidden = !(f === '' || el.getAttribute('data-goal-for') === f);
    });
    all('details.v[data-field]').forEach(function (d) {
      var primary = f !== '' && d.getAttribute('data-field') === f;
      d.classList.toggle('primary', primary);
      d.open = primary;
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

  var isChapter = document.body.classList.contains('page-chapter');
  if (isChapter) apply(initialField());

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

  // ---------- 用語ポップアップ ----------

  var pop = document.getElementById('_pop');
  var defsPromise = null;
  var current = null;
  var timer = null;
  var shownAt = 0;

  function loadDefs() {
    if (!defsPromise) {
      defsPromise = fetch(base + 'defs.json')
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
    head.appendChild(document.createTextNode('定義 ' + d.number + ' · ' + d.name));
    head.appendChild(en);
    var body = document.createElement('div');
    body.className = 'pop-body flow';
    body.innerHTML = d.html;
    var foot = document.createElement('p');
    foot.className = 'pop-s';
    foot.appendChild(
      document.createTextNode(
        '定義の場所:第' + d.chapter + '章 ' + d.chapterTitle + ' · ' + d.code + ' ' + d.stationName + ' ',
      ),
    );
    if (document.getElementById('def-' + id)) {
      var go = document.createElement('a');
      go.className = 'pop-go';
      go.href = '#def-' + id;
      go.textContent = 'この定義へ移動';
      foot.appendChild(go);
    } else {
      var link = document.createElement('a');
      link.className = 'pop-go';
      link.href = d.url;
      link.textContent = '定義の章へ';
      foot.appendChild(link);
    }
    pop.appendChild(head);
    pop.appendChild(body);
    pop.appendChild(foot);
    place(el);
  }

  function show(el, focusPop) {
    if (!pop) return;
    window.clearTimeout(timer);
    if (current && current !== el) current.setAttribute('aria-expanded', 'false');
    current = el;
    el.setAttribute('aria-expanded', 'true');
    shownAt = Date.now();
    var id = el.getAttribute('data-def');
    pop.textContent = '読み込み中…';
    pop.hidden = false;
    place(el);
    loadDefs().then(
      function (defs) {
        if (current !== el) return;
        var d = defs[id];
        if (d) render(el, d, id);
        else pop.textContent = '定義が索引にありません';
        if (focusPop) pop.focus();
      },
      function () {
        if (current !== el) return;
        pop.textContent = '定義を読み込めませんでした';
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
    if (returnFocus && el) el.focus();
  }

  function hideSoon() {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      if (pop && pop.contains(document.activeElement)) return;
      hide(false);
    }, 200);
  }

  all('.term').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      show(el, false);
    });
    el.addEventListener('mouseleave', hideSoon);
    el.addEventListener('focus', function () {
      show(el, false);
    });
    el.addEventListener('click', function () {
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
  function follow() {
    if (current && pop && !pop.hidden) place(current);
  }
  window.addEventListener('scroll', follow, { passive: true });
  window.addEventListener('resize', follow);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) hide(true);
  });
  document.addEventListener('pointerdown', function (e) {
    if (!current || !pop) return;
    var t = e.target instanceof Element ? e.target : null;
    if (t && (pop.contains(t) || t.closest('.term'))) return;
    hide(false);
  });

  // ---------- 現在地バー ----------

  var miniLinks = all('.mini a');
  if (miniLinks.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute('data-station');
          miniLinks.forEach(function (a) {
            var on = a.getAttribute('data-st') === id;
            a.classList.toggle('on', on);
            if (on) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    all('section.station').forEach(function (s) {
      io.observe(s);
    });
  }

  // ---------- 改善案の起票(P-07) ----------
  // ページの欄にオリジンを足して、完全な URL にする。

  all('a.issue[data-page]').forEach(function (a) {
    try {
      var url = new URL(a.href);
      url.searchParams.set('page', window.location.origin + a.getAttribute('data-page'));
      a.href = url.toString().replace(/\+/g, '%20');
    } catch {
      // URL が扱えない環境では、パスのまま
    }
  });

  // ---------- 路線図の章の帯(docs/spec/route-map.md「リンク」) ----------
  // 帯の上には駅の札が重なるので、:hover だけでは駅の上で強調が消える。
  // ポインターが帯の矩形の中にある間は、その帯に on を付けたままにする。
  // 図は transform で動かすので、画面上の矩形で判定する。

  all('svg.map').forEach(function (svg) {
    var bands = all('a.ch', svg);
    if (bands.length === 0) return;
    var current = null;
    function mark(a) {
      if (current === a) return;
      if (current) current.classList.remove('on');
      current = a;
      if (a) a.classList.add('on');
    }
    svg.addEventListener('pointermove', function (e) {
      var hit = null;
      bands.forEach(function (a) {
        var r = a.querySelector('rect.band').getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) hit = a;
      });
      mark(hit);
    });
    svg.addEventListener('pointerleave', function () {
      mark(null);
    });
  });

  // ---------- 路線図の操作(docs/spec/route-map.md「図の操作」) ----------
  // スクリプトが動くときだけ、枠のスクロールをやめてドラッグとボタンで動かす。

  var ZOOM_STEP = 1.25;
  var ZOOM_MAX = 3;
  var ZOOM_MIN = 0.3;
  var DRAG_START = 5;

  all('.map-scroll').forEach(function (frame) {
    var svg = frame.querySelector('svg.map');
    if (!svg) return;
    var W = Number(svg.getAttribute('width'));
    var H = Number(svg.getAttribute('height'));
    var vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number);
    var view = { s: 1, x: 0, y: 0 };
    var ready = false;

    frame.classList.add('pan');
    frame.style.height = H + 'px';

    function box() {
      return { w: frame.clientWidth, h: frame.clientHeight };
    }
    function fitScale() {
      var f = box();
      return Math.min(1, f.w / W, f.h / H);
    }
    function clampZoom(s) {
      return Math.max(Math.min(ZOOM_MIN, fitScale()), Math.min(ZOOM_MAX, s));
    }
    function draw() {
      var f = box();
      var cw = W * view.s;
      var ch = H * view.s;
      view.x = cw <= f.w ? (f.w - cw) / 2 : Math.min(0, Math.max(f.w - cw, view.x));
      view.y = ch <= f.h ? (f.h - ch) / 2 : Math.min(0, Math.max(f.h - ch, view.y));
      svg.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
    }
    function zoomBy(k) {
      var f = box();
      var s2 = clampZoom(view.s * k);
      view.x = f.w / 2 - ((f.w / 2 - view.x) * s2) / view.s;
      view.y = f.h / 2 - ((f.h / 2 - view.y) * s2) / view.s;
      view.s = s2;
      draw();
    }
    function fitAll() {
      view.s = fitScale();
      draw();
    }
    // 開いたとき:章ページの今の章の帯を横の中央に、ほかは左端から
    function init() {
      var f = box();
      if (f.w === 0) return;
      ready = true;
      view.s = 1;
      view.y = 0;
      var cur = svg.querySelector('rect.band.current');
      if (cur) {
        var cx = Number(cur.getAttribute('x')) + Number(cur.getAttribute('width')) / 2 - vb[0];
        view.x = f.w / 2 - cx;
      } else view.x = 0;
      draw();
    }

    // ボタン
    var tools = document.createElement('div');
    tools.className = 'map-tools';
    [
      {
        text: '+',
        label: '拡大',
        act: function () {
          zoomBy(ZOOM_STEP);
        },
      },
      {
        text: '−',
        label: '縮小',
        act: function () {
          zoomBy(1 / ZOOM_STEP);
        },
      },
      { text: '全体', label: '全体を表示', act: fitAll },
    ].forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.text;
      btn.setAttribute('aria-label', b.label);
      btn.title = b.label;
      btn.addEventListener('click', b.act);
      tools.appendChild(btn);
    });
    frame.parentNode.insertBefore(tools, frame);

    // ドラッグ。動かし始めてから pointer capture を取る(押しただけならリンクがそのまま働く)
    var drag = null;
    var suppressClick = false;
    frame.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    });
    frame.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_START) return;
        drag.moved = true;
        frame.classList.add('dragging');
        try {
          frame.setPointerCapture(e.pointerId);
        } catch {
          // 取れなくても動かせる
        }
      }
      view.x = drag.vx + dx;
      view.y = drag.vy + (e.pointerType === 'touch' ? 0 : dy);
      draw();
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        suppressClick = true;
        frame.classList.remove('dragging');
      }
      drag = null;
    }
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);
    // ドラッグのあとのクリックでリンク先へ移らないようにする
    frame.addEventListener(
      'click',
      function (e) {
        if (!suppressClick) return;
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    frame.addEventListener('dragstart', function (e) {
      e.preventDefault();
    });

    // トラックパッドの横方向のスクロール
    frame.addEventListener(
      'wheel',
      function (e) {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        var before = view.x;
        view.x -= e.deltaX;
        draw();
        if (view.x !== before) e.preventDefault();
      },
      { passive: false },
    );

    // フォーカスで枠がスクロールしないようにし、代わりに図を動かして見せる
    frame.addEventListener('scroll', function () {
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
    });
    svg.addEventListener('focusin', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
      var r = a.getBoundingClientRect();
      var f = frame.getBoundingClientRect();
      if (r.left >= f.left && r.right <= f.right && r.top >= f.top && r.bottom <= f.bottom) return;
      view.x += f.left + f.width / 2 - (r.left + r.width / 2);
      view.y += f.top + f.height / 2 - (r.top + r.height / 2);
      draw();
    });

    // 隠れていた図(分野の図)が見えたときや、幅が変わったときに合わせ直す
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (!ready) init();
        else draw();
      }).observe(frame);
    }
    init();
  });

  // ---------- 位置情報つきのコピー(P-08) ----------
  // 区画(data-loc)と段落の番号(data-p)はビルドが振る。ここでは選んだ範囲から文と位置を作ってコピーする。

  var chapterEl = document.querySelector('article.chapter[data-chapter]');
  if (chapterEl) setupCopy(chapterEl);

  /** @param {Element} article */
  function setupCopy(article) {
    var chapterNo = article.getAttribute('data-chapter');
    var BLOCK =
      /^(block|flex|grid|flow-root|list-item|table|table-row|table-row-group|table-header-group|table-footer-group|table-caption)$/;
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    var menu = document.createElement('div');
    menu.className = 'copy-menu';
    menu.setAttribute('role', 'group');
    menu.setAttribute('aria-label', '選んだ文章のコピー');
    menu.hidden = true;
    var buttons = [
      { mode: 'plain', label: 'そのままコピー' },
      { mode: 'loc', label: 'この文章の位置情報を含んでコピー' },
    ].map(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('data-copy', b.mode);
      el.textContent = b.label;
      menu.appendChild(el);
      return el;
    });
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
      if (el.hidden || el.classList.contains('eq-num') || el.classList.contains('issue-rail')) return true;
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
          out += pre ? s : s.replace(/[ \t\n\r\f]+/g, ' ');
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
      out = out.replace(/ *\n[ \n]*/g, '\n').replace(/^\s+/, '');
      return keepEnd ? out : out.replace(/\s+$/, '');
    }

    /**
     * 範囲の位置 [章番号, 駅番号, 段落, 文字]。区画の段落に1つもかからなければ null。
     * @param {Range} range 数式に合わせて広げた範囲
     */
    function locate(range) {
      var el = elementOf(range.startContainer);
      var p = el ? el.closest('[data-p]') : null;
      var sec = p ? p.closest('[data-loc]') : null;
      if (p && sec && article.contains(sec)) {
        var head = document.createRange();
        head.setStart(p, 0);
        head.setEnd(range.startContainer, range.startOffset);
        return [
          chapterNo,
          sec.getAttribute('data-loc'),
          p.getAttribute('data-p'),
          Array.from(textOf(head, true)).length + 1,
        ];
      }
      // 段落の外(札など)から選び始めたときは、範囲にかかる最初の段落の 1 文字目
      var list = all('[data-loc] [data-p], [data-loc][data-p]', article);
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        if (!range.intersectsNode(q) || !q.getClientRects().length) continue;
        return [chapterNo, q.closest('[data-loc]').getAttribute('data-loc'), q.getAttribute('data-p'), 1];
      }
      return null;
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
        if (b.getAttribute('data-copy') === 'loc') {
          var loc = locate(r);
          if (loc) text = '[' + loc.join(':') + ']\n' + text;
        }
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

  if (reduceMotion) root.classList.add('reduce-motion');
})();
