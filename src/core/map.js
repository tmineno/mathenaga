// 路線図の配置と SVG(docs/spec/route-map.md)。

import { escapeXml } from './text.js';

/** 寸法(px)。路線図の見た目の調整はここで行う。 */
export const GEOM = {
  plateH: 24,
  minPlateW: 40,
  row: 100, // 段と段の間隔
  labelGap: 6,
  lineH: 17,
  font: 13,
  gap: 14, // 駅名どうしの最小のすき間
  minDx: 64,
  upDx: 50, // 上の段への斜線の横幅
  downDx: 40, // 下の段への斜線の横幅
  pillW: 84,
  pillH: 20,
  bandFont: 12,
  margin: 16,
  maxLabelWidth: 6 * 13, // これより長い駅名は2行に折り返す
};

/**
 * 文字列のおおよその幅。全角は 1em、それ以外は 0.58em とみなす。
 * @param {string} s
 * @param {number} [font]
 */
export function textWidth(s, font = GEOM.font) {
  let w = 0;
  for (const ch of s) w += /** @type {number} */ (ch.codePointAt(0)) >= 0x2e80 ? font : font * 0.58;
  return w;
}

/** @param {string} ch */
function script(ch) {
  const cp = /** @type {number} */ (ch.codePointAt(0));
  if (cp >= 0x30a0 && cp <= 0x30ff) return 'kata';
  if (cp >= 0x3040 && cp <= 0x309f) return 'hira';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'kanji';
  return 'other';
}

/**
 * 駅名を2行までに折り返す。「の」「・」の後ろ、「と」「や」の後ろ、文字の種類の変わり目の順に優先する。
 * Preconditions: なし。
 * Postconditions: 1行か2行の配列を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} name
 */
export function wrapLabel(name) {
  if (textWidth(name) <= GEOM.maxLabelWidth) return [name];
  const chars = [...name];
  const n = chars.length;
  const tiers = [
    (/** @type {number} */ i) => 'の・'.includes(chars[i - 1]),
    (/** @type {number} */ i) => 'とや'.includes(chars[i - 1]),
    (/** @type {number} */ i) => script(chars[i - 1]) !== script(chars[i]),
  ];
  for (const ok of tiers) {
    let best = -1;
    for (let i = 2; i <= n - 2; i++) {
      if (!ok(i)) continue;
      if (best < 0 || Math.abs(i - n / 2) < Math.abs(best - n / 2)) best = i;
    }
    if (best > 0) return [chars.slice(0, best).join(''), chars.slice(best).join('')];
  }
  const mid = Math.ceil(n / 2);
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

/**
 * 図ごとの分岐駅を決める(docs/spec/route-map.md「分岐駅」)。
 * Preconditions: drawn は requires をさかのぼって閉じた駅の集合。
 * Postconditions: 支線 → { branch, first } と、分岐駅が決まらない支線の一覧を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Set<string>} drawn
 * @param {import('./graph.js').StationInfo[]} [all]  読む順の駅(全体の図では未執筆の駅を含む。mapStations)
 */
export function branchStations(site, drawn, all = site.stations) {
  const trunk = new Set(site.lines.filter((l) => l.layout === null).map((l) => l.id));
  /** @type {Map<string, { branch: import('./graph.js').StationInfo, first: import('./graph.js').StationInfo }>} */
  const branches = new Map();
  /** @type {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} */
  const missing = [];
  for (const line of site.lines) {
    if (line.layout === null) continue;
    const first = all.find((s) => s.lineId === line.id && drawn.has(s.id));
    if (!first) continue;
    const candidates = first.requires
      .map((id) => /** @type {import('./graph.js').StationInfo} */ (site.stationById.get(id)))
      .filter((s) => s && drawn.has(s.id) && trunk.has(s.lineId))
      .sort((a, b) => b.index - a.index);
    if (candidates.length === 0) missing.push({ line, first });
    else branches.set(line.id, { branch: candidates[0], first });
  }
  return { branches, missing };
}

/**
 * 全体の図で描く駅の並び。書いた駅の読む順に、未執筆の章の駅を章番号の順で差し込む
 * (docs/spec/route-map.md「分岐駅」「配置」)。
 * Preconditions: site.planned は章番号の順。
 * Postconditions: 読む順の駅を返す。未執筆の駅は planned が true で、ID は `_planned-<章番号>-<順>`、
 *   表示番号は空、requires は章の最初の駅だけが planned の requires を持つ。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @returns {import('./graph.js').StationInfo[]}
 */
export function mapStations(site) {
  const planned = site.planned ?? [];
  if (planned.length === 0) return site.stations;
  /** @type {import('./graph.js').StationInfo[]} */
  const out = [];
  const queue = [...planned];
  const push = (/** @type {import('./schema.js').PlannedChapter} */ pc) =>
    pc.stations.forEach((name, i) =>
      out.push(
        /** @type {any} */ ({
          id: `_planned-${pc.number}-${i + 1}`,
          name,
          chapter: { id: null, number: pc.number, title: pc.title, planned: true },
          model: null,
          lineId: pc.lineId,
          index: -1,
          requires: i === 0 ? pc.requires : [],
          code: '',
          planned: true,
        }),
      ),
    );
  for (const st of site.stations) {
    while (queue.length > 0 && queue[0].number < st.chapter.number) push(/** @type {any} */ (queue.shift()));
    out.push(st);
  }
  while (queue.length > 0) push(/** @type {any} */ (queue.shift()));
  return out;
}

/** 章の札の文字。 @param {any} chapter @param {boolean} current */
function bandText(chapter, current) {
  if (chapter.planned) return `第${chapter.number}章 未執筆`;
  return current ? `第${chapter.number}章 このページ` : `第${chapter.number}章`;
}

/** 配置で見積もる章の札の幅。どのページでも同じ配置にするため、長い方の文字で測る。 @param {any} chapter */
function reservedLabelW(chapter) {
  return textWidth(bandText(chapter, true), GEOM.bandFont);
}

/** 幹線の上の章の札と、上の段へ分かれる線との間合い(分岐駅からの横の距離)。 */
const UP_CLEAR_TOP = (GEOM.upDx * (GEOM.plateH / 2 + 8 + GEOM.bandFont)) / GEOM.row;
const UP_CLEAR_BOTTOM = (GEOM.upDx * (GEOM.plateH / 2 + 8 - 3)) / GEOM.row;

/**
 * @typedef {object} Band  章の帯
 * @property {number} number      章番号
 * @property {string | null} chapterId  未執筆の章は null
 * @property {string} title
 * @property {boolean} planned
 * @property {boolean} current    今の章
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string} text        札の文字
 * @property {number} tx          札の左端
 * @property {number} ty          札の文字の基線
 */

/**
 * @typedef {object} PlacedStation
 * @property {import('./graph.js').StationInfo} info
 * @property {number} x
 * @property {number} y
 * @property {'trunk' | 'up' | 'down' | 'right'} dir
 * @property {string[]} label
 * @property {number} plateW
 * @property {number} labelW
 * @property {number} half      札・駅名・印のうち最も広いものの半分の幅
 * @property {boolean} above    駅名を札の上に書く
 * @property {boolean} final
 * @property {import('./schema.js').Goal | null} partial
 * @property {import('./schema.js').Goal | null} goal
 * @property {boolean} transfer
 */

/**
 * @typedef {object} MapLayout
 * @property {PlacedStation[]} stations
 * @property {Array<{ lineId: string, style: string, points: number[][], planned: boolean[] }>} paths  planned は点ごとの、未執筆の駅へつながるか
 * @property {Band[]} bands  章の帯(章番号の順)
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @property {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} missing  E12
 * @property {Array<{ line: import('./schema.js').Line, reason: string }>} fallbacks  N03
 * @property {import('./schema.js').Line[]} linesShown
 */

/**
 * 路線図を配置する。
 * Preconditions: drawn は requires をさかのぼって閉じた駅の集合。
 * Postconditions: 駅・線・章の帯の座標を返す。分岐駅が決まらない支線は描かず、missing に入れる。
 *   opts.planned が true なら、未執筆の章の駅も描く(全体の図)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Set<string>} drawn
 * @param {{ goals?: import('./schema.js').Goal[], highlight?: string | null, planned?: boolean }} [opts]
 * @returns {MapLayout}
 */
export function layoutMap(site, drawn, opts = {}) {
  const goals = new Map((opts.goals ?? []).map((g) => [g.station, g]));
  const all = opts.planned ? mapStations(site) : site.stations;
  if (opts.planned) drawn = new Set([...drawn, ...all.filter((s) => s.planned).map((s) => s.id)]);
  const shown = all.filter((s) => drawn.has(s.id));
  const byLine = new Map(site.lines.map((l) => [l.id, shown.filter((s) => s.lineId === l.id)]));
  const { branches, missing } = branchStations(site, drawn, all);

  /** @type {Map<string, PlacedStation>} */
  const placed = new Map();
  /** @param {import('./graph.js').StationInfo} info @param {'trunk' | 'up' | 'down' | 'right'} dir */
  const measure = (info, dir) => {
    const label = wrapLabel(info.name);
    const plateW = Math.max(GEOM.minPlateW, Math.round(textWidth(info.code) + 14));
    const labelW = Math.max(...label.map((l) => textWidth(l)));
    const goal = goals.get(info.id) ?? null;
    const partial = goal && goal.kind === 'partial' ? goal : null;
    const half = Math.max(plateW, labelW, partial ? GEOM.pillW : 0) / 2;
    const transfer =
      !info.planned && shown.some((t) => !t.planned && t.lineId !== info.lineId && t.requires.includes(info.id));
    return {
      info,
      x: 0,
      y: 0,
      dir,
      label,
      plateW,
      labelW,
      half,
      above: dir === 'up',
      final: !!goal && goal.kind === 'final',
      partial,
      goal,
      transfer,
    };
  };

  // 幹線
  const trunkLines = site.lines.filter((l) => l.layout === null);
  const trunk = trunkLines.flatMap((l) => byLine.get(l.id) ?? []);
  const lastTrunk = trunk[trunk.length - 1];
  // 支線の向きと段
  /** @type {Array<{ line: import('./schema.js').Line, dir: 'up' | 'down' | 'right', row: number }>} */
  const rows = [];
  /** @type {Array<{ line: import('./schema.js').Line, reason: string }>} */
  const fallbacks = [];
  let ups = 0;
  let downs = 0;
  let rightUsed = false;
  for (const line of site.lines) {
    if (line.layout === null || !branches.has(line.id)) continue;
    const b = /** @type {any} */ (branches.get(line.id)).branch;
    /** @type {'up' | 'down' | 'right'} */
    let dir = line.layout;
    if (dir === 'right') {
      if (b !== lastTrunk) {
        dir = 'down';
        fallbacks.push({ line, reason: `分岐駅 ${b.code} がこの図の幹線の最後の駅ではない` });
      } else if (rightUsed) {
        dir = 'down';
        fallbacks.push({ line, reason: '右へ続ける支線がすでにある' });
      } else rightUsed = true;
    }
    rows.push({ line, dir, row: dir === 'up' ? ups++ : dir === 'down' ? downs++ : 0 });
  }
  const downFrom = new Set(
    rows.filter((r) => r.dir === 'down').map((r) => /** @type {any} */ (branches.get(r.line.id)).branch.id),
  );
  const upFrom = new Set(
    rows.filter((r) => r.dir === 'up').map((r) => /** @type {any} */ (branches.get(r.line.id)).branch.id),
  );

  // 章の札(route-map.md「配置」7)。段ごとに直前の章の札を覚え、札が重ならないように駅を右へずらす。
  /** @type {Map<number, { number: number, start: number, w: number }>} */
  const lastLabel = new Map();
  /** 章番号 → 章の札の左端 @type {Map<number, number>} */
  const labelStart = new Map();
  /** 章の札の左端の、章の最初の駅からの差。上へ分かれる線の出る幹線の駅なら、その線の右に置く。 @param {PlacedStation} p */
  const labelOffset = (p) => (p.dir === 'trunk' && upFrom.has(p.info.id) ? UP_CLEAR_TOP + 2 : -p.plateW / 2);
  /** @param {PlacedStation} p */
  const settle = (p) => {
    const n = p.info.chapter.number;
    const last = lastLabel.get(p.y);
    if (last && last.number !== n) {
      p.x = Math.max(p.x, last.start + last.w + GEOM.gap - labelOffset(p));
    } else if (last && p.dir === 'trunk' && upFrom.has(p.info.id)) {
      // 同じ章の途中から上へ分かれるときは、章の札がその線に届かないところまで駅を離す
      p.x = Math.max(p.x, last.start + last.w - UP_CLEAR_BOTTOM + 2);
    }
    if (!last || last.number !== n) {
      const start = p.x + labelOffset(p);
      lastLabel.set(p.y, { number: n, start, w: reservedLabelW(p.info.chapter) });
      labelStart.set(n, start);
    }
  };

  let prev = null;
  for (const info of trunk) {
    const p = measure(info, 'trunk');
    if (prev) {
      let dx = Math.max(GEOM.minDx, prev.half + p.half + GEOM.gap);
      if (downFrom.has(prev.info.id)) {
        const sx = stubFor(prev);
        dx = Math.max(dx, sx + GEOM.downDx * 0.55 + p.half + GEOM.gap);
      }
      p.x = prev.x + dx;
    }
    settle(p);
    placed.set(info.id, p);
    prev = p;
  }

  const paths = [];
  // 幹線の線:前の幹線の駅を前提にしていれば、そこから引く
  for (const line of trunkLines) {
    const list = (byLine.get(line.id) ?? []).map((s) => /** @type {PlacedStation} */ (placed.get(s.id)));
    if (list.length === 0) continue;
    const from = list[0].info.requires
      .map((id) => placed.get(id))
      .filter((s) => s && s.dir === 'trunk' && s.info.lineId !== line.id)
      .sort((a, b) => b.x - a.x)[0];
    const pts = [...(from ? [[from.x, 0]] : []), ...list.map((s) => [s.x, 0])];
    const flags = [...(from ? [false] : []), ...list.map((s) => !!s.info.planned)];
    if (pts.length > 1) paths.push({ lineId: line.id, style: line.style, points: pts, planned: flags });
  }

  for (const r of rows) {
    const { branch } = /** @type {any} */ (branches.get(r.line.id));
    const b = /** @type {PlacedStation} */ (placed.get(branch.id));
    const list = byLine.get(r.line.id) ?? [];
    const y = r.dir === 'up' ? -GEOM.row * (r.row + 1) : r.dir === 'down' ? GEOM.row * (r.row + 1) : 0;
    const pts = [[b.x, 0]];
    const firstPlanned = !!list[0]?.planned;
    const flags = [false];
    let x;
    if (r.dir === 'up') {
      pts.push([b.x + GEOM.upDx, y]);
      flags.push(firstPlanned);
      x = b.x + GEOM.upDx;
    } else if (r.dir === 'down') {
      const sx = stubFor(b);
      pts.push([b.x + sx, 0], [b.x + sx + GEOM.downDx, y]);
      flags.push(firstPlanned, firstPlanned);
      x = b.x + sx + GEOM.downDx;
    } else x = b.x;
    let before = null;
    for (const info of list) {
      const p = measure(info, r.dir);
      p.y = y;
      if (before) p.x = before.x + Math.max(GEOM.minDx, before.half + p.half + GEOM.gap);
      else if (r.dir === 'right') p.x = x + Math.max(GEOM.minDx, b.half + p.half + GEOM.gap);
      else p.x = x + Math.max(p.plateW / 2 + 12, p.half - 10);
      settle(p);
      placed.set(info.id, p);
      pts.push([p.x, y]);
      flags.push(!!info.planned);
      before = p;
    }
    paths.push({ lineId: r.line.id, style: r.line.style, points: pts, planned: flags });
  }

  const stations = /** @type {PlacedStation[]} */ (all.map((s) => placed.get(s.id)).filter((p) => p !== undefined));
  for (const st of stations) {
    st.x = round(st.x);
    st.y = round(st.y);
  }
  const bands = makeBands(stations, opts.highlight ?? null, labelStart);
  const layout = {
    stations,
    paths: paths.map((p) => ({ ...p, points: p.points.map(([x, y]) => [round(x), round(y)]) })),
    bands,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    missing,
    fallbacks,
    linesShown: site.lines.filter((l) => stations.some((s) => s && s.info.lineId === l.id)),
  };
  const { boxes } = layoutBoxes(layout);
  const xs = boxes.flatMap((b) => [b.x, b.x + b.w]);
  const ys = boxes.flatMap((b) => [b.y, b.y + b.h]);
  for (const p of layout.paths) for (const [x, y] of p.points) (xs.push(x), ys.push(y));
  layout.bounds = {
    minX: round(Math.min(...xs) - GEOM.margin),
    minY: round(Math.min(...ys) - GEOM.margin),
    maxX: round(Math.max(...xs) + GEOM.margin),
    maxY: round(Math.max(...ys) + GEOM.margin),
  };
  return layout;
}

/** 下の段への線が、幹線を右へ少し進んでから下りる長さ。 @param {PlacedStation} b */
function stubFor(b) {
  return Math.max(10, b.labelW / 2 + 4 - GEOM.downDx * 0.18);
}

/** @param {number} v */
function round(v) {
  return Math.round(v * 10) / 10;
}

/**
 * 章の帯を作る(route-map.md「配置」7、「印と凡例」)。章は1つの段の上で続いた駅の区間になる。
 * @param {PlacedStation[]} stations
 * @param {string | null} highlight  今の章の ID
 * @param {Map<number, number>} labelStart  章番号 → 章の札の左端
 * @returns {Band[]}
 */
function makeBands(stations, highlight, labelStart) {
  /** @type {Map<number, PlacedStation[]>} */
  const rows = new Map();
  for (const st of stations) {
    if (!rows.has(st.y)) rows.set(st.y, []);
    /** @type {PlacedStation[]} */ (rows.get(st.y)).push(st);
  }
  /** @type {Band[]} */
  const bands = [];
  for (const [y, list] of rows) {
    list.sort((a, b) => a.x - b.x);
    const above = list[0].above;
    const labelsH = Math.max(...list.map((st) => st.label.length)) * GEOM.lineH + GEOM.labelGap;
    const pills = list.some((st) => st.partial) ? GEOM.pillH + 4 : 0;
    const top = above ? y - GEOM.plateH / 2 - labelsH - pills - 8 : y - GEOM.plateH / 2 - 8 - GEOM.bandFont - 6;
    const bottom = above ? y + GEOM.plateH / 2 + 8 + GEOM.bandFont + 6 : y + GEOM.plateH / 2 + labelsH + pills + 8;
    const ty = above ? y + GEOM.plateH / 2 + 8 + GEOM.bandFont : y - GEOM.plateH / 2 - 8;
    /** @type {Array<{ chapter: any, items: PlacedStation[] }>} */
    const runs = [];
    for (const st of list) {
      const last = runs[runs.length - 1];
      if (last && last.chapter.number === st.info.chapter.number) last.items.push(st);
      else runs.push({ chapter: st.info.chapter, items: [st] });
    }
    const spans = runs.map(({ chapter, items }) => {
      const first = items[0];
      const last = items[items.length - 1];
      const current = !chapter.planned && chapter.id === highlight;
      const text = bandText(chapter, current);
      const tx = labelStart.get(chapter.number) ?? first.x - first.plateW / 2;
      return {
        chapter,
        current,
        text,
        tx,
        left: Math.min(first.x - first.half - 8, tx - 6),
        right: Math.max(last.x + last.half + 8, tx + textWidth(text, GEOM.bandFont) + 6),
      };
    });
    // 同じ段で隣り合う帯は重ねない
    for (let i = 1; i < spans.length; i++) {
      const a = spans[i - 1];
      const b = spans[i];
      if (a.right + 3 > b.left) {
        const m = (a.right + b.left) / 2;
        a.right = m - 1.5;
        b.left = m + 1.5;
      }
    }
    for (const sp of spans) {
      bands.push({
        number: sp.chapter.number,
        chapterId: sp.chapter.planned ? null : sp.chapter.id,
        title: sp.chapter.title,
        planned: !!sp.chapter.planned,
        current: sp.current,
        x: round(sp.left),
        y: round(top),
        w: round(sp.right - sp.left),
        h: round(bottom - top),
        text: sp.text,
        tx: round(sp.tx),
        ty: round(ty),
      });
    }
  }
  return bands.sort((a, b) => a.number - b.number);
}

/**
 * 駅の札・駅名・印・帯の文字の外接矩形と、線の線分を返す(重なりの検査に使う)。
 * Preconditions: layout は layoutMap の結果。
 * Postconditions: boxes(kind と持ち主の駅 ID 付き)と segments を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {MapLayout} layout
 */
export function layoutBoxes(layout) {
  /** @type {Array<{ kind: string, owner: string, x: number, y: number, w: number, h: number }>} */
  const boxes = [];
  for (const s of layout.stations) {
    const id = s.info.id;
    boxes.push({
      kind: 'plate',
      owner: id,
      x: s.x - s.plateW / 2,
      y: s.y - GEOM.plateH / 2,
      w: s.plateW,
      h: GEOM.plateH,
    });
    const lh = s.label.length * GEOM.lineH;
    const ly = s.above ? s.y - GEOM.plateH / 2 - GEOM.labelGap - lh : s.y + GEOM.plateH / 2 + GEOM.labelGap;
    boxes.push({ kind: 'label', owner: id, x: s.x - s.labelW / 2, y: ly, w: s.labelW, h: lh });
    if (s.partial) {
      const py = s.above ? ly - 4 - GEOM.pillH : ly + lh + 4;
      boxes.push({ kind: 'pill', owner: id, x: s.x - GEOM.pillW / 2, y: py, w: GEOM.pillW, h: GEOM.pillH });
    }
  }
  for (const b of layout.bands) {
    const w = textWidth(b.text, GEOM.bandFont);
    boxes.push({
      kind: 'band-label',
      owner: `第${b.number}章`,
      x: b.tx,
      y: b.ty - GEOM.bandFont,
      w,
      h: GEOM.bandFont + 3,
    });
  }
  /** @type {Array<{ lineId: string, x1: number, y1: number, x2: number, y2: number }>} */
  const segments = [];
  for (const p of layout.paths) {
    for (let i = 1; i < p.points.length; i++) {
      const [x1, y1] = p.points[i - 1];
      const [x2, y2] = p.points[i];
      segments.push({ lineId: p.lineId, x1, y1, x2, y2 });
    }
  }
  return { boxes, segments };
}

/**
 * 路線図の SVG を書く。
 * Preconditions: layout は layoutMap の結果。
 * Postconditions: SVG の文字列を返す。駅はリンクにし、title と desc を付ける。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {MapLayout} layout
 * @param {{ title: string, idPrefix: string, hrefFor: (s: import('./graph.js').StationInfo) => string, chapterHref?: (chapterId: string) => string | null }} opts
 *   章の帯(札を含む)は chapterHref のリンクにする。null を返す章と、未執筆の章の帯はリンクにしない。
 */
export function renderMapSvg(layout, opts) {
  const { minX, minY, maxX, maxY } = layout.bounds;
  const w = round(maxX - minX);
  const h = round(maxY - minY);
  const tid = `${opts.idPrefix}-title`;
  const did = `${opts.idPrefix}-desc`;
  const out = [];
  out.push(
    `<svg class="map" xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" role="group" aria-labelledby="${tid} ${did}">`,
    `<title id="${tid}">${escapeXml(opts.title)}</title>`,
    `<desc id="${did}">${escapeXml(mapDescription(layout))}</desc>`,
  );
  // 章の帯。帯と札をひとまとまりのリンクにし、駅より下に描く(帯の中の駅は駅へのリンクのまま)
  for (const b of layout.bands) {
    const flags = [...(b.current ? ['current'] : []), ...(b.planned ? ['planned'] : [])];
    const rect = `<rect class="${['band', ...flags].join(' ')}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>`;
    const text = `<text class="${['band-label', ...flags].join(' ')}" x="${b.tx}" y="${b.ty}">${escapeXml(b.text)}</text>`;
    const href = !b.planned && b.chapterId && opts.chapterHref ? opts.chapterHref(b.chapterId) : null;
    out.push(
      href
        ? `<a href="${escapeXml(href)}" class="ch" aria-label="${escapeXml(`第${b.number}章 ${b.title}`)}">${rect}${text}</a>`
        : `<g class="ch">${rect}${text}</g>`,
    );
  }
  for (const p of layout.paths) {
    // 未執筆の駅へつながる区間は、別の灰色の線にする
    /** @type {Array<{ planned: boolean, points: number[][] }>} */
    const runs = [];
    for (let i = 1; i < p.points.length; i++) {
      const planned = !!(p.planned?.[i] || p.planned?.[i - 1]);
      const last = runs[runs.length - 1];
      if (last && last.planned === planned) last.points.push(p.points[i]);
      else runs.push({ planned, points: [p.points[i - 1], p.points[i]] });
    }
    for (const r of runs) {
      const d = r.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
      const cls = [
        'ln',
        `l-${p.lineId}`,
        ...(p.style === 'dotted' ? ['dotted'] : []),
        ...(r.planned ? ['planned'] : []),
      ];
      out.push(`<path class="${cls.join(' ')}" d="${d}"/>`);
    }
  }
  const { boxes } = layoutBoxes(layout);
  for (const s of layout.stations) {
    const cls = ['plate', `l-${s.info.lineId}`];
    if (s.final) cls.push('final');
    if (s.transfer) cls.push('transfer');
    const tip = s.goal ? `<title>${escapeXml(`${s.final ? '終着駅' : '途中下車駅'}:${s.goal.label}`)}</title>` : '';
    const label = /** @type {any} */ (boxes.find((b) => b.kind === 'label' && b.owner === s.info.id));
    const lines = s.label
      .map((t, i) => `<tspan x="${s.x}" y="${round(label.y + GEOM.font + i * GEOM.lineH - 1)}">${escapeXml(t)}</tspan>`)
      .join('');
    if (s.info.planned) {
      out.push(
        `<g class="st planned">`,
        `<rect class="plate planned" x="${round(s.x - s.plateW / 2)}" y="${round(s.y - GEOM.plateH / 2)}" width="${s.plateW}" height="${GEOM.plateH}" rx="5"/>`,
        `<text class="label planned">${lines}</text>`,
        `</g>`,
      );
      continue;
    }
    out.push(
      `<a href="${escapeXml(opts.hrefFor(s.info))}" class="st" aria-label="${escapeXml(`${s.info.code} ${s.info.name}`)}">${tip}`,
      `<rect class="${cls.join(' ')}" x="${round(s.x - s.plateW / 2)}" y="${round(s.y - GEOM.plateH / 2)}" width="${s.plateW}" height="${GEOM.plateH}" rx="5"/>`,
      `<text class="code l-${s.info.lineId}${s.final ? ' inv' : ''}" x="${s.x}" y="${s.y}">${escapeXml(s.info.code)}</text>`,
      `<text class="label">${lines}</text>`,
      `</a>`,
    );
    if (s.partial) {
      const pill = /** @type {any} */ (boxes.find((b) => b.kind === 'pill' && b.owner === s.info.id));
      out.push(
        `<g class="pill"><title>${escapeXml(`途中下車駅:${s.partial.label}`)}</title><rect x="${round(pill.x)}" y="${round(pill.y)}" width="${GEOM.pillW}" height="${GEOM.pillH}" rx="10"/><text x="${s.x}" y="${round(pill.y + GEOM.pillH / 2)}">途中下車OK</text></g>`,
      );
    }
  }
  out.push('</svg>');
  return out.join('');
}

/**
 * 図の説明(desc)。路線ごとに、駅を表示番号・駅名・印の順で並べる。
 * @param {MapLayout} layout
 */
export function mapDescription(layout) {
  return layout.linesShown
    .map((line) => {
      const list = layout.stations.filter((s) => s.info.lineId === line.id);
      const items = list.map((s) => {
        if (s.info.planned) return `${s.info.name}(未執筆)`;
        const marks = [];
        if (s.final) marks.push('終着');
        if (s.partial) marks.push('途中下車OK');
        if (s.transfer) marks.push('乗換');
        return `${s.info.code} ${s.info.name}${marks.length ? `(${marks.join('・')})` : ''}`;
      });
      return `${line.name}:${items.join('、')}。`;
    })
    .join('');
}
