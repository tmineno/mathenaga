// 閲覧時のスクリプト(docs/spec/site.md「閲覧時の機能」)。
// 分野の切り替え(P-05)、用語ポップアップ(P-01)、現在地バー(P-02)、路線図の章の帯の強調(P-03)、
// 位置情報つきのコピー(P-08)、表示の設定(P-09)、しおり(P-10)、注と文献のポップアップ(P-11)、
// 選んだ文章からの起票と原稿の表示(P-12)。
// スクリプトが動かなくても、ページは未選択の表示のまま読める。
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

  // ---------- 表示の設定(P-09)とブラウザに保存するもの ----------
  // テーマ・文字の大きさ・本文の幅は、head の中のスクリプト(pages.js の LOOK_SCRIPT)が描く前に html の属性へ移す。
  // ここでは設定の読み書きと、残りの項目(折りたたみ・ポップアップ)の反映、メニューを受け持つ。

  var SETTINGS_KEY = 'mathenaga-settings';
  var ZOOM_KEY = 'mathenaga-map-zoom';
  var BOOKMARKS_KEY = 'mathenaga-bookmarks';
  /** 項目ごとの選択肢。先頭が初期値 */
  var CHOICES = {
    theme: ['auto', 'light', 'dark'],
    text: ['medium', 'small', 'large'],
    width: ['standard', 'narrow', 'wide'],
    openProof: [false, true],
    openAnswer: [false, true],
    openOther: [false, true],
    popup: ['hover', 'click'],
  };
  /** html の data-<項目> 属性で切り替える項目(CSS と LOOK_SCRIPT が読む) */
  var LOOK = ['theme', 'text', 'width'];

  function getItem(k) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function setItem(k, v) {
    try {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* 保存できなくても、そのページの中では効く */
    }
  }
  function readObject(k) {
    try {
      var v = JSON.parse(getItem(k) || 'null');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }
  function defaultSettings() {
    var d = {};
    Object.keys(CHOICES).forEach(function (k) {
      d[k] = CHOICES[k][0];
    });
    return d;
  }
  /** 選択肢にない値の項目は初期値にする(ほかの項目は使う) */
  function loadSettings() {
    var raw = readObject(SETTINGS_KEY);
    var d = defaultSettings();
    Object.keys(CHOICES).forEach(function (k) {
      if (CHOICES[k].indexOf(raw[k]) >= 0) d[k] = raw[k];
    });
    return d;
  }
  var settings = loadSettings();

  function applyLook() {
    LOOK.forEach(function (k) {
      if (settings[k] === CHOICES[k][0]) root.removeAttribute('data-' + k);
      else root.setAttribute('data-' + k, settings[k]);
    });
  }
  applyLook();

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

  var field = '';

  function apply(f) {
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
   * @param {string} [only] 'openProof' か 'openAnswer' なら、その種類の折りたたみだけ(設定を変えたとき)
   */
  function applyFolds(only) {
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
   */
  function openTarget() {
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

  var isChapter = document.body.classList.contains('page-chapter');
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

  // ---------- 用語ポップアップ(P-01)と、注と文献のポップアップ(P-11) ----------
  // 注の印(.note-ref a)と文献の印(a.cite)は、注の一覧・参考文献の項目へのリンク。スクリプトが動くときは、
  // 押しても移らずにポップアップを出す。中身はページの中の一覧から写す(site.md「注と参考文献の表示」)。
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
    if (document.getElementById(id)) {
      var go = document.createElement('a');
      go.className = 'pop-go';
      go.href = '#' + id;
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
    pop.setAttribute('aria-label', note ? '注' : '文献');
    var head = document.createElement('p');
    head.className = 'pop-h';
    head.textContent = note ? '注' + note : el.textContent;
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
      go.textContent = '参考文献へ移動';
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
    pop.setAttribute('aria-label', '用語の定義');
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
    if (t && (pop.contains(t) || t.closest(POP_TRIGGERS))) return;
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

  // ---------- 路線図の章の札(docs/spec/route-map.md「リンク」) ----------
  // 札の上には駅の行のリンクが重なるので、:hover だけでは駅の上で強調が消える。
  // ポインターが札の矩形の中にある間は、その札に on を付けたままにする。
  // 図は transform で動かすので、画面上の矩形で判定する。

  all('svg.map').forEach(function (svg) {
    var cards = all('a.ch', svg);
    if (cards.length === 0) return;
    var current = null;
    function mark(a) {
      if (current === a) return;
      if (current) current.classList.remove('on');
      current = a;
      if (a) a.classList.add('on');
    }
    svg.addEventListener('pointermove', function (e) {
      var hit = null;
      cards.forEach(function (a) {
        var r = a.querySelector('rect.card').getBoundingClientRect();
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

  /** 開き直したときに使い直す初期化(表示の設定の「元に戻す」で呼ぶ) */
  var mapResets = [];
  function savedZoom() {
    var v = Number(getItem(ZOOM_KEY));
    return isFinite(v) && v > 0 ? v : null;
  }

  var ZOOM_STEP = 1.25;
  var ZOOM_MAX = 3;
  var ZOOM_MIN = 0.3;
  var DRAG_START = 5;
  var FRAME_MAX = 600;
  /** 倍率ごとの表示(route-map.md「倍率ごとの表示」):この倍率より小さいと概要、さらに小さいと章のタイトルだけ */
  var LOD_OVERVIEW = 0.75;
  var LOD_TITLE = 0.45;
  /** ホイールの1ピクセルあたりの倍率の変化(ピンチは Ctrl 付きのホイールとして届き、1回の量が小さい) */
  var WHEEL_RATE = 0.002;
  var PINCH_RATE = 0.01;
  /** 指やボタンを離してから、この時間(ms)のうちに移ったフォーカスは、押したことによるものとみなす */
  var PRESS_GRACE = 500;

  all('.map-scroll').forEach(function (frame) {
    var svg = frame.querySelector('svg.map');
    if (!svg) return;
    var W = Number(svg.getAttribute('width'));
    var H = Number(svg.getAttribute('height'));
    var vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/\s+/).map(Number);
    var view = { s: 1, x: 0, y: 0 };
    var ready = false;

    frame.classList.add('pan');
    // 枠の内側の高さは、1 倍のときの図の高さと 600px の小さいほう(枠の線の分を足す)
    frame.style.height = Math.min(H, FRAME_MAX) + (frame.offsetHeight - frame.clientHeight) + 'px';

    function box() {
      return { w: frame.clientWidth, h: frame.clientHeight };
    }
    function fitScale() {
      var f = box();
      return Math.min(1, f.w / W, f.h / H);
    }
    /** 保存した倍率を、この図で選べる範囲(全体を表示の倍率から 3 倍まで)に収める */
    function clampZoom(s) {
      return Math.max(fitScale(), Math.min(ZOOM_MAX, s));
    }
    function draw() {
      var f = box();
      var cw = W * view.s;
      var ch = H * view.s;
      // 図が枠より大きい向きでは、図の端が枠の中央に来るところまで動かせる(端の近くの札も中央に置ける)。
      // 枠に収まる向きでは、図を枠の中央に置く
      view.x = cw <= f.w ? (f.w - cw) / 2 : Math.min(f.w / 2, Math.max(f.w / 2 - cw, view.x));
      view.y = ch <= f.h ? (f.h - ch) / 2 : Math.min(f.h / 2, Math.max(f.h / 2 - ch, view.y));
      svg.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
      var lod = view.s >= LOD_OVERVIEW ? '0' : view.s >= LOD_TITLE ? '1' : '2';
      if (svg.getAttribute('data-lod') !== lod) svg.setAttribute('data-lod', lod);
    }
    /** 枠の中の点 (px, py) を動かさずに、倍率を k 倍にする */
    function zoomAt(k, px, py) {
      // 縮小は、図全体が枠に収まる倍率(0.3 倍より小さければ 0.3 倍)まで(route-map.md「図の操作」)
      var s2 = Math.min(ZOOM_MAX, Math.max(Math.max(ZOOM_MIN, fitScale()), view.s * k));
      // 全体を表示でそれより小さくしていても、縮小で大きくはしない
      if (k < 1) s2 = Math.min(s2, view.s);
      view.x = px - ((px - view.x) * s2) / view.s;
      view.y = py - ((py - view.y) * s2) / view.s;
      view.s = s2;
      draw();
      setItem(ZOOM_KEY, String(view.s));
    }
    function zoomBy(k) {
      var f = box();
      zoomAt(k, f.w / 2, f.h / 2);
    }
    function fitAll() {
      view.s = fitScale();
      draw();
      setItem(ZOOM_KEY, String(view.s));
    }
    // 開いたとき:保存した倍率(なければ 1 倍)で、章ページの今の章の札を横と縦の中央に、ほかは左上の端から
    function init() {
      var f = box();
      if (f.w === 0) return;
      ready = true;
      view.s = clampZoom(savedZoom() || 1);
      var cur = svg.querySelector('rect.card.current');
      if (cur) {
        var cx = Number(cur.getAttribute('x')) + Number(cur.getAttribute('width')) / 2 - vb[0];
        var cy = Number(cur.getAttribute('y')) + Number(cur.getAttribute('height')) / 2 - vb[1];
        view.x = f.w / 2 - cx * view.s;
        view.y = f.h / 2 - cy * view.s;
      } else {
        view.x = 0;
        view.y = 0;
      }
      draw();
    }
    mapResets.push(function () {
      ready = false;
      init();
    });

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

    // ホイール:縦はポインタの位置を中心に拡大・縮小し、ページはスクロールしない。
    // トラックパッドの横方向のスクロールは図を横に動かす
    frame.addEventListener(
      'wheel',
      function (e) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          var before = view.x;
          view.x -= e.deltaX;
          draw();
          if (view.x !== before) e.preventDefault();
          return;
        }
        if (!e.deltaY) return;
        e.preventDefault();
        // 行単位・ページ単位の量はピクセルに直す
        var unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? box().h : 1;
        var k = Math.exp(-e.deltaY * unit * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE));
        var r = frame.getBoundingClientRect();
        zoomAt(k, e.clientX - r.left - frame.clientLeft, e.clientY - r.top - frame.clientTop);
      },
      { passive: false },
    );

    // 枠はスクロールさせず、ブラウザが枠をスクロールしたら(フォーカスやページ内の検索で見せるときなど)、
    // その分だけ図を動かしたことにする。見えている位置は変わらないので、押した駅が押しているあいだに動かない
    function absorbScroll() {
      var sx = frame.scrollLeft;
      var sy = frame.scrollTop;
      if (!sx && !sy) return;
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
      view.x -= sx;
      view.y -= sy;
      draw();
    }
    frame.addEventListener('scroll', absorbScroll);
    // マウスやタッチで押したことによるフォーカスでは図を動かさない。動かすと、離したときにポインタの下が
    // 別のものになり、枠からはみ出した札や駅を1回押しただけではリンク先へ移らない。
    // タッチでは指を離したあとにフォーカスが移るので、離してから少しのあいだも押したものとみなす
    var pressed = { down: false, at: -Infinity };
    frame.addEventListener(
      'pointerdown',
      function () {
        pressed.down = true;
        pressed.at = Date.now();
      },
      true,
    );
    function release() {
      if (!pressed.down) return;
      pressed.down = false;
      pressed.at = Date.now();
    }
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener(
      'keydown',
      function () {
        pressed.at = -Infinity;
      },
      true,
    );
    function focusedByPointer() {
      return pressed.down || Date.now() - pressed.at < PRESS_GRACE;
    }
    // キーボードで枠の外のリンクにフォーカスしたら、図を動かして見せる
    svg.addEventListener('focusin', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      absorbScroll();
      if (focusedByPointer()) return;
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

  // ---------- 位置情報つきのコピー(P-08)と、選んだ文章からの起票と原稿の表示(P-12) ----------
  // 区画(data-loc)と段落の番号(data-p)はビルドが振る。ここでは選んだ範囲から文と位置を作ってコピーする。
  // リポジトリの URL を渡したビルドでは、区画の起票の URL(data-issue)と段落の原稿の行(data-l)もビルドが書く。

  var chapterEl = document.querySelector('article.chapter[data-chapter]');
  if (chapterEl) setupCopy(chapterEl);

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
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
        ICONS[icon] +
        '</svg>';
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

  // ---------- しおり(P-10) ----------
  // 駅のしおりのボタンで駅を入れ・外し、上端のバーのボタンで一覧を開く。駅の ID の並びとして保存する。
  // 一覧の表示番号・駅名・章は、ページに埋め込んだ駅の索引(_stations)から引く。

  /** @returns {{ clear: () => void }} */
  function setupBookmarks() {
    var stations;
    try {
      stations = JSON.parse((document.getElementById('_stations') || {}).textContent || '[]');
    } catch {
      stations = [];
    }
    /** 保存した駅の ID の並び。形が違う値(古い形など)は空として扱う */
    function load() {
      try {
        var v = JSON.parse(getItem(BOOKMARKS_KEY) || '[]');
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
      setItem(BOOKMARKS_KEY, marks.length ? JSON.stringify(marks) : null);
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
      if (e.key !== BOOKMARKS_KEY && e.key !== null) return;
      marks = load();
      refresh();
    });
    refresh();

    return {
      clear: function () {
        marks = [];
        setItem(BOOKMARKS_KEY, null);
        refresh();
      },
    };
  }

  // ---------- 表示の設定のメニュー(P-09) ----------
  // 右下の歯車のボタンと、その上に開くメニュー。スクリプトが動くときだけ作る。

  var GROUPS = [
    {
      key: 'theme',
      title: 'テーマ',
      options: [
        ['light', 'ライト'],
        ['dark', 'ダーク'],
        ['auto', 'OS に合わせる'],
      ],
    },
    {
      key: 'text',
      title: '文字の大きさ',
      options: [
        ['small', '小'],
        ['medium', '中'],
        ['large', '大'],
      ],
    },
    {
      key: 'width',
      title: '本文の幅',
      options: [
        ['narrow', '狭い'],
        ['standard', '標準'],
        ['wide', '広い'],
      ],
    },
    {
      title: '最初から開く',
      checks: [
        ['openProof', '証明の詳細'],
        ['openAnswer', '確認問題の答え'],
        ['openOther', 'ほかの分野の版'],
      ],
    },
    {
      key: 'popup',
      title: '用語ポップアップ',
      options: [
        ['hover', '重ねたら出す'],
        ['click', '押したときだけ出す'],
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

  function setupSettings() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-btn';
    btn.setAttribute('aria-label', '表示の設定');
    btn.title = '表示の設定';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', '_settings');
    btn.innerHTML = gearSvg();

    var panel = document.createElement('div');
    panel.id = '_settings';
    panel.className = 'settings';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '表示の設定');
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
    reset.textContent = '元に戻す';
    var clearMarks = document.createElement('button');
    clearMarks.type = 'button';
    clearMarks.textContent = 'しおりを消す';
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
      setItem(SETTINGS_KEY, JSON.stringify(settings));
      say('');
      if (LOOK.indexOf(k) >= 0) applyLook();
      else if (isChapter && (k === 'openProof' || k === 'openAnswer')) applyFolds(k);
      else if (isChapter && k === 'openOther') apply(field);
    }
    reset.addEventListener('click', function () {
      settings = defaultSettings();
      setItem(SETTINGS_KEY, null);
      setItem(ZOOM_KEY, null);
      sync();
      applyLook();
      if (isChapter) {
        apply(field);
        applyFolds();
      }
      mapResets.forEach(function (fn) {
        fn();
      });
      say('元に戻しました');
    });
    clearMarks.addEventListener('click', function () {
      bookmark.clear();
      say('しおりを消しました');
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

  // GROUPS などの変数を使うので、それらを定めた後で作る
  var bookmark = setupBookmarks();
  setupSettings();

  if (reduceMotion) root.classList.add('reduce-motion');
})();
