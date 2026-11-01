// 閲覧時のスクリプト(docs/spec/site.md「閲覧時の機能」)。
// 分野の切り替え(P-05)、用語ポップアップ(P-01)、現在地バー(P-02)、路線図の章の帯の強調(P-03)。スクリプトが動かなくても、
// ページは未選択の表示のまま読める。
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
    head.appendChild(document.createTextNode(d.name));
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

  // ---------- 路線図の章の帯(docs/spec/route-map.md「リンク」) ----------
  // 帯の上には駅の札が重なるので、:hover だけでは駅の上で強調が消える。
  // ポインタの位置が帯の矩形の中にある間は、その帯に on を付けたままにする。

  all('svg.map').forEach(function (svg) {
    var bands = all('a.ch', svg).map(function (a) {
      var r = a.querySelector('rect.band');
      return {
        a: a,
        x: Number(r.getAttribute('x')),
        y: Number(r.getAttribute('y')),
        w: Number(r.getAttribute('width')),
        h: Number(r.getAttribute('height')),
      };
    });
    if (bands.length === 0) return;
    var current = null;
    function mark(a) {
      if (current === a) return;
      if (current) current.classList.remove('on');
      current = a;
      if (a) a.classList.add('on');
    }
    svg.addEventListener('pointermove', function (e) {
      var m = svg.getScreenCTM();
      if (!m) return;
      var pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      var p = pt.matrixTransform(m.inverse());
      var hit = null;
      bands.forEach(function (b) {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) hit = b.a;
      });
      mark(hit);
    });
    svg.addEventListener('pointerleave', function () {
      mark(null);
    });
  });

  if (reduceMotion) root.classList.add('reduce-motion');
})();
