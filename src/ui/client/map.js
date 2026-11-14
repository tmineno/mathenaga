// 路線図の章の札の強調(P-03)と、図の拡大・縮小・ドラッグ(docs/spec/route-map.md「リンク」「図の操作」)。

import { KEYS } from './site.js';
import { all } from './dom.js';
import { getItem, setItem } from './storage.js';

/** 開き直したときに使い直す初期化(表示の設定の「元に戻す」で呼ぶ) */
export var mapResets = [];

function savedZoom() {
  var v = Number(getItem(KEYS.zoom));
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

/**
 * 路線図の章の札の強調を始める(docs/spec/route-map.md「リンク」)。
 * 札の上には駅の行のリンクが重なるので、:hover だけでは駅の上で強調が消える。
 * ポインターが札の矩形の中にある間は、その札に on を付けたままにする。
 * 図は transform で動かすので、画面上の矩形で判定する。
 * Preconditions: なし。
 * Postconditions: 各路線図(svg.map)で、ポインターが札(a.ch)の矩形の中にある間、その札に on が付く。
 * Failure modes: 札のない図は何もしない。
 * Side effects: イベントリスナーの登録、札のクラスの書き換え。
 */
export function initMapCards() {
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
}

/**
 * 路線図の操作を始める(docs/spec/route-map.md「図の操作」)。
 * スクリプトが動くときだけ、枠のスクロールをやめてドラッグとボタンで動かす。
 * Preconditions: なし。
 * Postconditions: 各路線図の枠(.map-scroll)に、拡大・縮小・全体のボタンとドラッグ・ホイールの操作がつく。倍率を保存する。
 *   「元に戻す」用の初期化を mapResets に足す。
 * Failure modes: 図(svg.map)のない枠は何もしない。倍率を保存できなくても操作は効く。
 * Side effects: DOM の追加と書き換え、イベントリスナーと ResizeObserver の登録、倍率の保存。
 */
export function initMapPan() {
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
      setItem(KEYS.zoom, String(view.s));
    }
    function zoomBy(k) {
      var f = box();
      zoomAt(k, f.w / 2, f.h / 2);
    }
    function fitAll() {
      view.s = fitScale();
      draw();
      setItem(KEYS.zoom, String(view.s));
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
}
