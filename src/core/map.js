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
 */
export function branchStations(site, drawn) {
  const trunk = new Set(site.lines.filter((l) => l.layout === null).map((l) => l.id));
  /** @type {Map<string, { branch: import('./graph.js').StationInfo, first: import('./graph.js').StationInfo }>} */
  const branches = new Map();
  /** @type {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} */
  const missing = [];
  for (const line of site.lines) {
    if (line.layout === null) continue;
    const first = site.stations.find((s) => s.lineId === line.id && drawn.has(s.id));
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
 * @property {Array<{ lineId: string, style: string, points: number[][] }>} paths
 * @property {{ x: number, y: number, w: number, h: number, text: string, tx: number, ty: number } | null} band
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @property {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} missing  E12
 * @property {Array<{ line: import('./schema.js').Line, reason: string }>} fallbacks  N03
 * @property {import('./schema.js').Line[]} linesShown
 */

/**
 * 路線図を配置する。
 * Preconditions: drawn は requires をさかのぼって閉じた駅の集合。
 * Postconditions: 駅・線・帯の座標を返す。分岐駅が決まらない支線は描かず、missing に入れる。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Set<string>} drawn
 * @param {{ goals?: import('./schema.js').Goal[], highlight?: string | null }} [opts]
 * @returns {MapLayout}
 */
export function layoutMap(site, drawn, opts = {}) {
  const goals = new Map((opts.goals ?? []).map((g) => [g.station, g]));
  const shown = site.stations.filter((s) => drawn.has(s.id));
  const byLine = new Map(site.lines.map((l) => [l.id, shown.filter((s) => s.lineId === l.id)]));
  const { branches, missing } = branchStations(site, drawn);

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
    const transfer = shown.some((t) => t.lineId !== info.lineId && t.requires.includes(info.id));
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
    if (pts.length > 1) paths.push({ lineId: line.id, style: line.style, points: pts });
  }

  for (const r of rows) {
    const { branch } = /** @type {any} */ (branches.get(r.line.id));
    const b = /** @type {PlacedStation} */ (placed.get(branch.id));
    const list = byLine.get(r.line.id) ?? [];
    const y = r.dir === 'up' ? -GEOM.row * (r.row + 1) : r.dir === 'down' ? GEOM.row * (r.row + 1) : 0;
    const pts = [[b.x, 0]];
    let x;
    if (r.dir === 'up') {
      pts.push([b.x + GEOM.upDx, y]);
      x = b.x + GEOM.upDx;
    } else if (r.dir === 'down') {
      const sx = stubFor(b);
      pts.push([b.x + sx, 0], [b.x + sx + GEOM.downDx, y]);
      x = b.x + sx + GEOM.downDx;
    } else x = b.x;
    let before = null;
    for (const info of list) {
      const p = measure(info, r.dir);
      p.y = y;
      if (before) p.x = before.x + Math.max(GEOM.minDx, before.half + p.half + GEOM.gap);
      else if (r.dir === 'right') p.x = x + Math.max(GEOM.minDx, b.half + p.half + GEOM.gap);
      else p.x = x + Math.max(p.plateW / 2 + 12, p.half - 10);
      placed.set(info.id, p);
      pts.push([p.x, y]);
      before = p;
    }
    paths.push({ lineId: r.line.id, style: r.line.style, points: pts });
  }

  const stations = site.stations.map((s) => placed.get(s.id)).filter((p) => p !== undefined);
  const band = makeBand(site, stations, opts.highlight ?? null);
  const layout = {
    stations: /** @type {PlacedStation[]} */ (stations),
    paths: paths.map((p) => ({ ...p, points: p.points.map(([x, y]) => [round(x), round(y)]) })),
    band,
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    missing,
    fallbacks,
    linesShown: site.lines.filter((l) => stations.some((s) => s && s.info.lineId === l.id)),
  };
  for (const s of layout.stations) {
    s.x = round(s.x);
    s.y = round(s.y);
  }
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
 * @param {import('./graph.js').Site} site
 * @param {Array<PlacedStation | undefined>} stations
 * @param {string | null} chapterId
 */
function makeBand(site, stations, chapterId) {
  if (!chapterId) return null;
  const list = /** @type {PlacedStation[]} */ (stations.filter((s) => s && s.info.chapter.id === chapterId));
  if (list.length === 0) return null;
  const chapter = /** @type {any} */ (site.chapterById.get(chapterId));
  const first = list[0];
  const last = list[list.length - 1];
  const y = first.y;
  const x = round(first.x - first.half - 8);
  const w = round(last.x + last.half + 8 - x);
  const text = `第${chapter.number}章 このページ`;
  const labelsH = Math.max(...list.map((s) => s.label.length)) * GEOM.lineH + GEOM.labelGap;
  const pills = list.some((s) => s.partial) ? GEOM.pillH + 4 : 0;
  if (first.above) {
    const top = y - GEOM.plateH / 2 - labelsH - pills - 8;
    const bottom = y + GEOM.plateH / 2 + 8 + GEOM.bandFont + 6;
    return {
      x,
      y: round(top),
      w,
      h: round(bottom - top),
      text,
      tx: round(first.x - first.plateW / 2),
      ty: round(y + GEOM.plateH / 2 + 8 + GEOM.bandFont),
    };
  }
  const top = y - GEOM.plateH / 2 - 8 - GEOM.bandFont - 6;
  const bottom = y + GEOM.plateH / 2 + labelsH + pills + 8;
  return {
    x,
    y: round(top),
    w,
    h: round(bottom - top),
    text,
    tx: round(first.x - first.plateW / 2),
    ty: round(y - GEOM.plateH / 2 - 8),
  };
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
  if (layout.band) {
    const b = layout.band;
    const w = textWidth(b.text, GEOM.bandFont);
    boxes.push({ kind: 'band-label', owner: '', x: b.tx, y: b.ty - GEOM.bandFont, w, h: GEOM.bandFont + 3 });
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
 * @param {{ title: string, idPrefix: string, hrefFor: (s: import('./graph.js').StationInfo) => string }} opts
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
  if (layout.band) {
    const b = layout.band;
    out.push(`<rect class="band" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>`);
  }
  for (const p of layout.paths) {
    const d = p.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
    out.push(`<path class="ln l-${p.lineId}${p.style === 'dotted' ? ' dotted' : ''}" d="${d}"/>`);
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
  if (layout.band) {
    out.push(
      `<text class="band-label" x="${layout.band.tx}" y="${layout.band.ty}">${escapeXml(layout.band.text)}</text>`,
    );
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
