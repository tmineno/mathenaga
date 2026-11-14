// 路線図の配置と SVG(docs/spec/route-map.md)。章ごとに1枚の札を格子に置き、路線の線・分岐の線・
// 前提の矢印で札どうしをつなぐ。分岐の線と前提の矢印は、札のあいだの溝(列の溝と段の溝)だけを通る。

import { escapeXml } from './text.js';

/** 寸法(px)。路線図の見た目の調整はここで行う。 */
export const GEOM = {
  cardW: 184, // 章の札の幅
  pad: 10, // 札の内側の余白
  headFont: 12, // 「第N章」の行
  headH: 14,
  headGap: 4,
  titleFont: 14, // 章のタイトル
  titleLineH: 19,
  titleGap: 6,
  stFont: 12, // 駅名
  stLineH: 17,
  codeFont: 11, // 表示番号
  plateW: 34,
  plateH: 15,
  plateGap: 6,
  rowGap: 4, // 駅の行どうしの間
  pillFont: 11, // 「途中の目標」の札
  pillH: 15,
  colGap: 40, // 列の溝の幅(既定)
  rowGap0: 44, // 段の溝の高さ(既定)
  margin: 16, // 図の端の溝(既定)
  gapPad: 10, // 溝の端から最初のトラックまで
  track: 9, // トラックの間隔
  labelFont: 11, // 前提の矢印と分岐の線のラベル
  labelH: 13,
  labelPad: 3, // ラベルと線のすき間
  port: 12, // 札の辺の上で、矢印の出入りする点の間隔
  // 縮小したときの札の文字(route-map.md「倍率ごとの表示」)。style.css の .ov1・.ov2 の文字の大きさと合わせる
  ov1HeadFont: 18, // 概要:「第N章」の行
  ov1HeadH: 22,
  ov1Gap: 4,
  ov1TitleFont: 22, // 概要:章のタイトル
  ov1TitleLineH: 27,
  ov2TitleFont: 30, // 章のタイトルだけ
  ov2TitleLineH: 36,
};

/**
 * @typedef {object} TextRules  文字の扱い。言語ごとの処理(src/ui/locales/)が決め、site.text で渡す
 * @property {(ch: string) => number} charWidth  1文字のおおよその幅(em)
 * @property {Array<(chars: string[], i: number) => boolean>} breakTiers  折り返す位置の選び方。前のものほど優先する
 */

/**
 * 文字列のおおよその幅。1文字の幅は rules.charWidth が決める。
 * @param {string} s
 * @param {number} font
 * @param {TextRules} rules
 */
export function textWidth(s, font, rules) {
  let w = 0;
  for (const ch of s) w += rules.charWidth(ch) * font;
  return w;
}

/**
 * 文字列を幅 width に収まる行に折り返す(route-map.md「配置」6)。行に入るだけ詰めたうえで、
 * rules.breakTiers の順に、折り返す位置を選ぶ。
 * Preconditions: width は1文字の幅より大きい。
 * Postconditions: 1行以上の配列を返す。行をつなぐと元の文字列になる(行頭と行末の空白を除く)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} text
 * @param {number} width
 * @param {number} font
 * @param {TextRules} rules
 * @returns {string[]}
 */
export function wrapText(text, width, font, rules) {
  const out = [];
  let rest = [...text];
  while (rest.length > 0) {
    if (textWidth(rest.join(''), font, rules) <= width) {
      out.push(rest.join(''));
      break;
    }
    let fit = 0;
    let w = 0;
    for (const ch of rest) {
      const cw = textWidth(ch, font, rules);
      if (w + cw > width) break;
      w += cw;
      fit++;
    }
    fit = Math.max(1, fit);
    const r = rest;
    const tiers = rules.breakTiers.map((t) => (/** @type {number} */ i) => t(r, i));
    // 行が短くなりすぎる位置では折り返さない
    const least = Math.max(2, Math.ceil(fit * 0.4));
    let cut = -1;
    for (const ok of tiers) {
      for (let i = Math.min(fit, rest.length - 2); i >= least; i--) {
        if (ok(i)) {
          cut = i;
          break;
        }
      }
      if (cut > 0) break;
    }
    if (cut < 0) cut = fit;
    out.push(rest.slice(0, cut).join('').trimEnd());
    rest = rest.slice(cut);
    while (rest[0] === ' ') rest = rest.slice(1);
  }
  return out;
}

/**
 * 行の数を max までにする。収まらなければ最後の行の末尾を「…」で省く。
 * @param {string[]} lines @param {number} max @param {number} width @param {number} font
 */
function clampLines(lines, max, width, font, rules) {
  if (lines.length <= max) return lines;
  const head = lines.slice(0, max - 1);
  let last = [...lines.slice(max - 1).join('')];
  while (last.length > 1 && textWidth(`${last.join('')}…`, font, rules) > width) last = last.slice(0, -1);
  return [...head, `${last.join('')}…`];
}

/**
 * @typedef {object} BranchInfo  支線の分岐駅
 * @property {import('./graph.js').StationInfo} branch     主な分岐駅(分岐駅のうち読む順で最も後ろ)
 * @property {import('./graph.js').StationInfo[]} stations 分岐駅(1つ以上、読む順)
 * @property {import('./graph.js').StationInfo} first      その図に描く、支線の最初の駅
 */

/**
 * 図ごとの分岐駅を決める(docs/spec/route-map.md「分岐駅」)。
 * Preconditions: drawn は requires をさかのぼって閉じた駅の集合。
 * Postconditions: 支線 → BranchInfo と、分岐駅が決まらない支線の一覧を返す。始発の路線は BranchInfo を持たず、
 *   starts(路線 → その図に描く最初の駅)と、最初の駅が後ろの路線の駅を前提にするもの(lateStarts、E12)に入る。候補は幹線と、
 *   路線ファイルでその支線より前にある支線の駅に限るので、支線の親子は循環しない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Set<string>} drawn
 * @param {import('./graph.js').StationInfo[]} [all]  読む順の駅(全体の図では未執筆の駅を含む。mapStations)
 */
export function branchStations(site, drawn, all = site.stations) {
  const trunk = new Set(site.lines.filter((l) => l.layout === null).map((l) => l.id));
  /** @type {Map<string, BranchInfo>} */
  const branches = new Map();
  /** @type {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} */
  const missing = [];
  /** 始発の路線と、その図に描く最初の駅 @type {Map<string, import('./graph.js').StationInfo>} */
  const starts = new Map();
  /**
   * 最初の駅が、路線ファイルで後ろにある路線の駅を前提にしている始発の路線(E12)
   * @type {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo, later: import('./graph.js').StationInfo[] }>}
   */
  const lateStarts = [];
  /** 駅から requires をさかのぼって届く駅の ID @type {Map<string, Set<string>>} */
  const memo = new Map();
  /** @param {string} id @returns {Set<string>} */
  const ancestors = (id) => {
    const known = memo.get(id);
    if (known) return known;
    const out = new Set();
    // 先に登録する。前提が輪になっている原稿(E06)でも、たどり直さずに止まる
    memo.set(id, out);
    for (const r of site.stationById.get(id)?.requires ?? []) {
      out.add(r);
      for (const a of ancestors(r)) out.add(a);
    }
    return out;
  };
  const earlier = new Set(trunk);
  for (const line of site.lines) {
    if (line.layout === null) continue;
    const first = all.find((s) => s.lineId === line.id && drawn.has(s.id));
    if (first && line.start) {
      // 始発の路線は分岐駅を持たない。最初の駅の前提は前提の矢印で描く(route-map.md「始発の路線」)
      starts.set(line.id, first);
      const later = first.requires
        .map((id) => /** @type {import('./graph.js').StationInfo} */ (site.stationById.get(id)))
        .filter((s) => s && drawn.has(s.id) && s.lineId !== line.id && !earlier.has(s.lineId));
      if (later.length > 0) lateStarts.push({ line, first, later });
    } else if (first) {
      let candidates = first.requires
        .map((id) => /** @type {import('./graph.js').StationInfo} */ (site.stationById.get(id)))
        .filter((s) => s && drawn.has(s.id) && earlier.has(s.lineId));
      // ほかの候補を通して前提がつながる候補には線を引かない(手順 3)
      candidates = candidates.filter((c) => !candidates.some((o) => o !== c && ancestors(o.id).has(c.id)));
      // 幹線はすべての支線の根なので、ほかの路線の候補があれば幹線の候補は除く(手順 4)
      if (candidates.some((c) => !trunk.has(c.lineId))) candidates = candidates.filter((c) => !trunk.has(c.lineId));
      // 路線ごとに読む順で最も後ろの駅(幹線の路線はまとめて1つ。手順 5)
      /** @type {Map<string, import('./graph.js').StationInfo>} */
      const best = new Map();
      for (const c of candidates) {
        const key = trunk.has(c.lineId) ? '' : c.lineId;
        const cur = best.get(key);
        if (!cur || c.index > cur.index) best.set(key, c);
      }
      const stations = [...best.values()].sort((a, b) => a.index - b.index);
      if (stations.length === 0) missing.push({ line, first });
      else branches.set(line.id, { branch: stations[stations.length - 1], stations, first });
    }
    earlier.add(line.id);
  }
  return { branches, missing, starts, lateStarts };
}

/**
 * @typedef {object} RowPlan  支線の置き方
 * @property {import('./schema.js').Line} line
 * @property {'up' | 'down' | 'right' | 'merge'} dir  merge は上下の両方から合流し、幹線の高さで右に置く支線
 * @property {number} row      同じ向きの段のうち幹線から何番目か(0 が最も近い)。right と merge は 0
 * @property {BranchInfo | null} info  始発の路線は null
 * @property {import('./graph.js').StationInfo | null} start  始発の路線の、その図に描く最初の駅
 */

/**
 * @typedef {object} Fallback  N03
 * @property {import('./schema.js').Line} line
 * @property {string} reason
 * @property {string} drawn  どう描いたか(「down と同じに」「主な分岐駅の側に」)
 */

/**
 * 支線の向きと段を決める(route-map.md「配置」3・4)。座標は使わない。
 * Preconditions: branches と starts は branchStations の結果。親の路線は路線ファイルで前にある。
 * Postconditions: 路線ファイルの順に RowPlan を返す。親の路線が描けない支線は含めない。始発の路線は layout の向きに置く。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Map<string, BranchInfo>} branches
 * @param {Map<string, import('./graph.js').StationInfo>} starts
 * @param {Set<string>} trunkIds
 * @param {import('./graph.js').StationInfo | undefined} lastTrunk  その図の幹線の最後の駅
 */
function planRows(site, branches, starts, trunkIds, lastTrunk) {
  /** @type {RowPlan[]} */
  const rows = [];
  /** @type {Fallback[]} */
  const fallbacks = [];
  /** 路線が置かれた側。幹線と、幹線の高さに置いた支線は mid @type {Map<string, 'up' | 'down' | 'mid'>} */
  const side = new Map([...trunkIds].map((id) => [id, /** @type {'mid'} */ ('mid')]));
  let ups = 0;
  let downs = 0;
  let midUsed = false;
  for (const line of site.lines) {
    const start = starts.get(line.id);
    if (start && (line.layout === 'up' || line.layout === 'down')) {
      // 始発の路線は親の路線を持たないので、layout で上か下の段に置く(配置 3)
      const dir = line.layout;
      rows.push({ line, dir, row: dir === 'up' ? ups++ : downs++, info: null, start });
      side.set(line.id, dir);
      continue;
    }
    const info = branches.get(line.id);
    if (line.layout === null || !info) continue;
    const sides = info.stations.map((s) => side.get(s.lineId));
    if (sides.some((s) => s === undefined)) continue;
    const hasUp = sides.includes('up');
    const hasDown = sides.includes('down');
    /** @type {RowPlan['dir']} */
    let dir;
    if (!hasUp && !hasDown) {
      dir = line.layout;
      if (dir === 'right') {
        if (info.branch !== lastTrunk) {
          dir = 'down';
          fallbacks.push({
            line,
            reason: `分岐駅 ${info.branch.code} がこの図の幹線の最後の駅ではない`,
            drawn: 'down と同じに',
          });
        } else if (midUsed) {
          dir = 'down';
          fallbacks.push({ line, reason: '幹線より右の場所をほかの支線が使った', drawn: 'down と同じに' });
        } else midUsed = true;
      }
    } else if (hasUp !== hasDown) {
      dir = hasUp ? 'up' : 'down';
    } else if (!midUsed) {
      dir = 'merge';
      midUsed = true;
    } else {
      dir = side.get(info.branch.lineId) === 'up' ? 'up' : 'down';
      fallbacks.push({ line, reason: '幹線より右の場所をほかの支線が使った', drawn: '主な分岐駅の側に' });
    }
    rows.push({ line, dir, row: dir === 'up' ? ups++ : dir === 'down' ? downs++ : 0, info, start: null });
    side.set(line.id, dir === 'up' || dir === 'down' ? dir : 'mid');
  }
  return { rows, fallbacks };
}

/**
 * 全体の図で描く駅の並び。書いた駅の読む順に、未執筆の章の駅を章番号の順で差し込む
 * (docs/spec/route-map.md「分岐駅」「配置」)。
 * Preconditions: site.planned は章番号の順。
 * Postconditions: 読む順の駅を返す。未執筆の駅は planned が true で、ID は `_planned-<章番号>-<順>`、
 *   表示番号は空、requires は路線ファイルに書いたもの(章の requires は最初の駅のもの)。
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
    pc.stations.forEach((st, i) =>
      out.push(
        /** @type {any} */ ({
          id: `_planned-${pc.number}-${i + 1}`,
          name: st.name,
          chapter: { id: null, number: pc.number, title: pc.title, planned: true },
          model: null,
          lineId: pc.lineId,
          index: -1,
          requires: st.requires,
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

/**
 * @typedef {object} Arrow  前提の矢印
 * @property {number} from  前提にされる章の章番号
 * @property {number} to    前提にする章の章番号
 * @property {import('./graph.js').StationInfo[]} stations  前提にされる駅(読む順)
 * @property {string} label
 */

/**
 * 前提の矢印を決める(route-map.md「前提の矢印」)。
 * Preconditions: shown は図に描く駅(読む順)。branches は、その図に描く支線の分岐駅。
 * Postconditions: 章の組ごとに1本の矢印を返す(前提にされる章、前提にする章の章番号の順)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./schema.js').Line[]} lines
 * @param {import('./graph.js').StationInfo[]} shown
 * @param {Map<string, BranchInfo>} branches
 * @returns {Arrow[]}
 */
export function prerequisiteArrows(lines, shown, branches) {
  const byId = new Map(shown.map((s) => [s.id, s]));
  const pos = new Map(shown.map((s, i) => [s.id, i]));
  /** 手順 3 の関係。to と、requires の辺か @type {Map<string, Array<{ to: string, req: boolean }>>} */
  const adj = new Map(shown.map((s) => [s.id, []]));
  const add = (/** @type {string} */ u, /** @type {string} */ v, /** @type {boolean} */ req) =>
    /** @type {Array<{ to: string, req: boolean }>} */ (adj.get(u)).push({ to: v, req });
  /** @type {Array<[string, string]>} */
  const cross = [];
  for (const v of shown) {
    for (const u of new Set(v.requires)) {
      const s = byId.get(u);
      if (!s) continue;
      add(u, v.id, true);
      if (s.lineId !== v.lineId) cross.push([u, v.id]);
    }
  }
  // 同じ路線で隣り合う駅と、幹線の路線どうしのつながり
  /** @type {Map<string, import('./graph.js').StationInfo[]>} */
  const perLine = new Map();
  for (const s of shown) perLine.set(s.lineId, [...(perLine.get(s.lineId) ?? []), s]);
  for (const list of perLine.values()) for (let i = 1; i < list.length; i++) add(list[i - 1].id, list[i].id, false);
  const trunk = lines.filter((l) => l.layout === null && perLine.has(l.id));
  for (let i = 1; i < trunk.length; i++) {
    const a = /** @type {import('./graph.js').StationInfo[]} */ (perLine.get(trunk[i - 1].id));
    const b = /** @type {import('./graph.js').StationInfo[]} */ (perLine.get(trunk[i].id));
    add(a[a.length - 1].id, b[0].id, false);
  }
  const branchEdges = new Set();
  for (const info of branches.values()) for (const s of info.stations) branchEdges.add(`${s.id}>${info.first.id}`);
  /** requires の辺 u → v を除いても、u から v へたどれるか @param {string} u @param {string} v */
  const reachable = (u, v) => {
    const seen = new Set([u]);
    const queue = [u];
    while (queue.length > 0) {
      const x = /** @type {string} */ (queue.shift());
      for (const e of adj.get(x) ?? []) {
        if (e.req && x === u && e.to === v) continue;
        if (e.to === v) return true;
        if (!seen.has(e.to)) {
          seen.add(e.to);
          queue.push(e.to);
        }
      }
    }
    return false;
  };
  /** @type {Map<string, Arrow>} */
  const groups = new Map();
  for (const [u, v] of cross) {
    if (branchEdges.has(`${u}>${v}`) || reachable(u, v)) continue;
    const su = /** @type {import('./graph.js').StationInfo} */ (byId.get(u));
    const sv = /** @type {import('./graph.js').StationInfo} */ (byId.get(v));
    const key = `${su.chapter.number}>${sv.chapter.number}`;
    const g = groups.get(key) ?? { from: su.chapter.number, to: sv.chapter.number, stations: [], label: '' };
    if (!g.stations.includes(su)) g.stations.push(su);
    groups.set(key, g);
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.stations.sort((a, b) => /** @type {number} */ (pos.get(a.id)) - /** @type {number} */ (pos.get(b.id)));
    g.label = g.stations.map((s) => s.name).join('・');
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {{ text: string, x: number, y: number, w: number, h: number }} TextLine  y は行の上端
 */

/**
 * @typedef {object} PlacedStation  章の札の中の駅の行
 * @property {import('./graph.js').StationInfo} info
 * @property {Card} card
 * @property {number} x      行の左端
 * @property {number} y      行の上端
 * @property {number} w
 * @property {number} h
 * @property {Box | null} plate  表示番号の札(未執筆の駅は null)
 * @property {TextLine[]} name
 * @property {Box | null} pill   「途中の目標」の札
 * @property {boolean} final
 * @property {import('./schema.js').Goal | null} partial
 * @property {import('./schema.js').Goal | null} goal
 */

/**
 * @typedef {object} Card  章の札
 * @property {number} number      章番号
 * @property {string | null} chapterId  未執筆の章は null
 * @property {string} title
 * @property {string} lineId
 * @property {boolean} planned
 * @property {boolean} current    今の章
 * @property {number} col
 * @property {number} tier        段。幹線の段が 0、上の段が負、下の段が正
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {TextLine & { textW: number }} head  「第N章」の行。textW は文字の幅(w は札の内側の幅)
 * @property {TextLine[]} titleLines
 * @property {PlacedStation[]} rows
 * @property {Overview[]} overview  縮小したときの札の文字。[0] が概要、[1] が章のタイトルだけ
 */

/**
 * @typedef {object} Overview  縮小したときの札の文字(札の左上を原点とする)
 * @property {TextLine | null} head  「第N章」の行。章のタイトルだけの段階では null
 * @property {TextLine[]} lines      章のタイトル
 */

/**
 * @typedef {object} Link  路線の線・分岐の線・前提の矢印
 * @property {'line' | 'branch' | 'arrow'} kind
 * @property {string} lineId      前提の矢印は ''
 * @property {string} style
 * @property {boolean} planned    未執筆の章へつながる線
 * @property {number[][]} points
 * @property {number} from        章番号
 * @property {number} to          章番号
 * @property {string} [id]        分岐の線と前提の矢印の、溝の中の区間を区別する名前
 * @property {string} [group]     同じ支線の最初の札へ入る分岐の線どうし、束ねた前提の矢印どうしは同じ値
 */

/**
 * @typedef {object} MapLabel
 * @property {'arrow' | 'branch'} kind
 * @property {string} text
 * @property {string} lineId
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {object} MapLayout
 * @property {Card[]} cards        章番号の順
 * @property {PlacedStation[]} stations  読む順
 * @property {Link[]} links
 * @property {MapLabel[]} labels
 * @property {Arrow[]} arrows
 * @property {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 * @property {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo }>} missing  E12
 * @property {Array<{ line: import('./schema.js').Line, first: import('./graph.js').StationInfo, later: import('./graph.js').StationInfo[] }>} lateStarts
 *   E12:最初の駅が、路線ファイルで後ろにある路線の駅を前提にしている始発の路線
 * @property {Fallback[]} fallbacks  N03
 * @property {import('./schema.js').Line[]} linesShown
 */

/** 章の札の文字。 @param {{ number: number, planned?: boolean }} chapter @param {boolean} current */
function headText(chapter, current) {
  if (chapter.planned) return `第${chapter.number}章 未執筆`;
  return current ? `第${chapter.number}章 このページ` : `第${chapter.number}章`;
}

/** @param {number} v */
function round(v) {
  return Math.round(v * 10) / 10;
}

/**
 * 章の札の大きさと、札の中の文字の位置(札の左上を原点とする)を決める(route-map.md「配置」6・12)。
 * @param {any} chapter
 * @param {import('./graph.js').StationInfo[]} stations
 * @param {Map<string, import('./schema.js').Goal>} goals
 * @param {TextRules} rules
 */
function measureCard(chapter, stations, goals, rules) {
  const g = GEOM;
  const inner = g.cardW - 2 * g.pad;
  const head = { text: '', x: g.pad, y: g.pad, w: inner, h: g.headH };
  let y = g.pad + g.headH + g.headGap;
  const titleLines = clampLines(wrapText(chapter.title, inner, g.titleFont, rules), 2, inner, g.titleFont, rules).map(
    (text) => {
      const line = { text, x: g.pad, y, w: textWidth(text, g.titleFont, rules), h: g.titleLineH };
      y += g.titleLineH;
      return line;
    },
  );
  y += g.titleGap;
  const rows = stations.map((info) => {
    const goal = goals.get(info.id) ?? null;
    const partial = goal && goal.kind === 'partial' ? goal : null;
    const nameX = info.planned ? g.pad : g.pad + g.plateW + g.plateGap;
    const lines = wrapText(info.name, g.cardW - g.pad - nameX, g.stFont, rules);
    const top = y;
    const name = lines.map((text, i) => ({
      text,
      x: nameX,
      y: top + i * g.stLineH,
      w: textWidth(text, g.stFont, rules),
      h: g.stLineH,
    }));
    let h = Math.max(g.plateH, lines.length * g.stLineH);
    const pill = partial
      ? { x: nameX, y: top + h + 2, w: Math.round(textWidth('途中の目標', g.pillFont, rules) + 12), h: g.pillH }
      : null;
    if (pill) h += 2 + g.pillH;
    const plate = info.planned ? null : { x: g.pad, y: top + (g.stLineH - g.plateH) / 2, w: g.plateW, h: g.plateH };
    y += h + g.rowGap;
    return {
      info,
      x: g.pad,
      y: top,
      w: inner,
      h,
      plate,
      name,
      pill,
      final: !!goal && goal.kind === 'final',
      partial,
      goal,
    };
  });
  y += g.pad - g.rowGap;
  // 札の高さは、縮小したときの章のタイトル(3行まで)も入る高さにする(route-map.md「配置」6)
  const lines = (/** @type {number} */ font) =>
    Math.min(OV_MAX_LINES, wrapText(chapter.title, inner, font, rules).length);
  const h = Math.max(
    y,
    2 * g.pad + g.ov1HeadH + g.ov1Gap + lines(g.ov1TitleFont) * g.ov1TitleLineH,
    2 * g.pad + lines(g.ov2TitleFont) * g.ov2TitleLineH,
  );
  return { head, titleLines, rows, h };
}

/** 縮小したときの章のタイトルの行の数の上限。札の高さはこの行数まで入るように決める */
const OV_MAX_LINES = 3;

/**
 * 縮小したときの札の文字を決める(route-map.md「倍率ごとの表示」)。札の大きさは変えず、駅の行の代わりに
 * 大きな文字で「第N章」の行と章のタイトル(概要)、または章のタイトルだけを書く。
 * Preconditions: h は札の高さで、駅の行が1つ以上ある札の高さ(80px)以上。
 * Postconditions: 2つの段階の文字を返す。どの行も札の内側に収まり、入らない行は末尾を「…」で省く。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} headText  「第N章」の行の文字
 * @param {string} title
 * @param {number} h
 * @param {TextRules} rules
 * @returns {Overview[]}
 */
function measureOverview(headText, title, h, rules) {
  const g = GEOM;
  const inner = g.cardW - 2 * g.pad;
  /** @param {number} top @param {number} font @param {number} lineH */
  const fit = (top, font, lineH) => {
    const max = Math.max(1, Math.floor((h - g.pad - top) / lineH));
    return clampLines(wrapText(title, inner, font, rules), max, inner, font, rules).map((text, i) => ({
      text,
      x: g.pad,
      y: top + i * lineH,
      w: textWidth(text, font, rules),
      h: lineH,
    }));
  };
  // 「このページ」「未執筆」を添えると入らないときは「第N章」だけにする
  const text = textWidth(headText, g.ov1HeadFont, rules) <= inner ? headText : headText.split(' ')[0];
  const head = { text, x: g.pad, y: g.pad, w: textWidth(text, g.ov1HeadFont, rules), h: g.ov1HeadH };
  return [
    { head, lines: fit(g.pad + g.ov1HeadH + g.ov1Gap, g.ov1TitleFont, g.ov1TitleLineH) },
    { head: null, lines: fit(g.pad, g.ov2TitleFont, g.ov2TitleLineH) },
  ];
}

/** 札の「第N章」の行の高さ(路線の線と分岐の線が札に入る高さ)。 @param {{ y: number }} card */
const headY = (card) => card.y + GEOM.pad + GEOM.headH / 2;

/**
 * 溝の中の区間。分岐の線と前提の矢印が、溝に沿って進む部分。
 * @typedef {object} Piece
 * @property {'row' | 'col'} axis  row は段の溝(横に進む)、col は列の溝(縦に進む)
 * @property {number} gap          溝の番号(段の溝は上の段の番号、列の溝は左の列の番号)
 * @property {number} lo           溝に沿った範囲(見積もり)
 * @property {number} hi
 * @property {number} pref         溝の中の位置の好み(-1 は上か左、+1 は下か右)
 * @property {string} id           区間を持つ線の名前
 * @property {string | null} group 同じ値の区間は、範囲が重ならなければ同じトラックに置く
 * @property {number} track        割り当てたトラック
 * @property {boolean} label       この区間の上にラベルを置く
 */

/**
 * 路線図を配置する。
 * Preconditions: drawn は requires をさかのぼって閉じた駅の集合。
 * Postconditions: 章の札・路線の線・分岐の線・前提の矢印・ラベルの座標を返す。分岐駅が決まらない支線と、
 *   親の路線が描けない支線は描かず、前者を missing に入れる。opts.planned が true なら、未執筆の章も描く(全体の図)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Set<string>} drawn
 * @param {{ goals?: import('./schema.js').Goal[], highlight?: string | null, planned?: boolean }} [opts]
 * @returns {MapLayout}
 */
export function layoutMap(site, drawn, opts = {}) {
  const g = GEOM;
  const goals = new Map((opts.goals ?? []).map((x) => [x.station, x]));
  const all = opts.planned ? mapStations(site) : site.stations;
  if (opts.planned) drawn = new Set([...drawn, ...all.filter((s) => s.planned).map((s) => s.id)]);
  const shown = all.filter((s) => drawn.has(s.id));
  const byLine = new Map(site.lines.map((l) => [l.id, shown.filter((s) => s.lineId === l.id)]));
  const { branches, missing, starts, lateStarts } = branchStations(site, drawn, all);
  const trunkLines = site.lines.filter((l) => l.layout === null);
  const trunkIds = new Set(trunkLines.map((l) => l.id));
  const trunk = trunkLines.flatMap((l) => byLine.get(l.id) ?? []);
  const { rows: plans, fallbacks } = planRows(site, branches, starts, trunkIds, trunk[trunk.length - 1]);

  // ---- 札を格子に置く(配置 1〜5) ----
  /** @param {import('./graph.js').StationInfo[]} list */
  const chaptersOf = (list) => {
    /** @type {Array<{ chapter: any, stations: import('./graph.js').StationInfo[] }>} */
    const out = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (last && last.chapter.number === s.chapter.number) last.stations.push(s);
      else out.push({ chapter: s.chapter, stations: [s] });
    }
    return out;
  };
  /** @type {Map<number, Card>} */
  const cards = new Map();
  /** @param {any} chapter @param {import('./graph.js').StationInfo[]} stations @param {string} lineId @param {number} col @param {number} tier */
  const addCard = (chapter, stations, lineId, col, tier) => {
    const m = measureCard(chapter, stations, goals, site.text);
    const current = !chapter.planned && chapter.id === (opts.highlight ?? null);
    const head = headText(chapter, current);
    /** @type {Card} */
    const card = {
      number: chapter.number,
      chapterId: chapter.planned ? null : chapter.id,
      title: chapter.title,
      lineId,
      planned: !!chapter.planned,
      current,
      col,
      tier,
      x: 0,
      y: 0,
      w: g.cardW,
      h: m.h,
      head: { ...m.head, text: head, textW: textWidth(head, GEOM.headFont, site.text) },
      titleLines: m.titleLines,
      rows: /** @type {any} */ (m.rows),
      overview: measureOverview(head, chapter.title, m.h, site.text),
    };
    for (const r of card.rows) r.card = card;
    cards.set(chapter.number, card);
  };
  let col = 0;
  for (const line of trunkLines) {
    for (const c of chaptersOf(byLine.get(line.id) ?? [])) addCard(c.chapter, c.stations, line.id, col++, 0);
  }
  const lastTrunkCol = col - 1;
  /** 描いた支線 @type {Map<string, BranchInfo>} */
  const placedBranches = new Map();
  /** @type {Array<{ line: import('./schema.js').Line, info: BranchInfo, dir: RowPlan['dir'] }>} */
  const branchPlans = [];
  for (const r of plans) {
    const groups = chaptersOf(byLine.get(r.line.id) ?? []);
    if (r.start) {
      // 始発の路線:最初の駅が前提にする駅を含む札のうち、最も右の札の次の列から(配置 5)
      if (groups.length === 0) continue;
      const cols = r.start.requires.flatMap((id) => {
        const s = site.stationById.get(id);
        const c = s && drawn.has(s.id) ? cards.get(s.chapter.number) : undefined;
        return c ? [c.col] : [];
      });
      const begin = cols.length > 0 ? Math.max(...cols) + 1 : 0;
      const tier = r.dir === 'up' ? -(r.row + 1) : r.row + 1;
      groups.forEach((c, i) => addCard(c.chapter, c.stations, r.line.id, begin + i, tier));
      continue;
    }
    const info = /** @type {BranchInfo} */ (r.info);
    const parents = info.stations.map((s) => cards.get(s.chapter.number));
    if (groups.length === 0 || parents.some((p) => !p)) continue;
    const parentCols = parents.map((p) => /** @type {Card} */ (p).col);
    let start;
    if (r.dir === 'right') start = lastTrunkCol + 1;
    else if (r.dir === 'merge') start = Math.max(lastTrunkCol, ...parentCols) + 1;
    else start = /** @type {Card} */ (cards.get(info.branch.chapter.number)).col + 1;
    const tier = r.dir === 'up' ? -(r.row + 1) : r.dir === 'down' ? r.row + 1 : 0;
    groups.forEach((c, i) => addCard(c.chapter, c.stations, r.line.id, start + i, tier));
    placedBranches.set(r.line.id, info);
    branchPlans.push({ line: r.line, info, dir: r.dir });
  }
  const cardList = [...cards.values()].sort((a, b) => a.number - b.number);
  const placedStations = all.flatMap((s) => {
    const c = cards.get(s.chapter.number);
    return c ? c.rows.filter((r) => r.info === s) : [];
  });
  const arrows = prerequisiteArrows(
    site.lines,
    placedStations.map((r) => r.info),
    placedBranches,
  );

  const tiers = cardList.map((c) => c.tier);
  const minTier = Math.min(0, ...tiers);
  const maxTier = Math.max(0, ...tiers);
  const maxCol = Math.max(0, ...cardList.map((c) => c.col));
  /** @type {Map<number, number>} */
  const rowH = new Map();
  for (const c of cardList) rowH.set(c.tier, Math.max(rowH.get(c.tier) ?? 0, c.h));
  const lineById = new Map(site.lines.map((l) => [l.id, l]));

  // ---- つなぐもの(配置 7〜9) ----
  /**
   * @typedef {object} Conn
   * @property {'line' | 'branch' | 'arrow'} kind
   * @property {Card} from
   * @property {Card} to
   * @property {string} lineId
   * @property {string} style
   * @property {boolean} planned
   * @property {string} id
   * @property {string | null} group
   * @property {boolean} main       分岐の線のうち、主な分岐駅からの線(札の左の辺まで引く)
   * @property {string} [label]
   * @property {import('./graph.js').StationInfo} [station]  分岐の線の分岐駅
   * @property {string} [bundle]  前提の矢印の、始点の章と前提にされる駅。同じ値で同じ辺から出る矢印は束ねる
   */
  /** @type {Conn[]} */
  const conns = [];
  // 路線の線:同じ路線で隣り合う札と、幹線の路線どうし(前の路線の線の描き方)
  const lineCards = (/** @type {string} */ id) => cardList.filter((c) => c.lineId === id).sort((a, b) => a.col - b.col);
  /** @param {Card} a @param {Card} b @param {import('./schema.js').Line} line */
  const lineConn = (a, b, line) =>
    conns.push({
      kind: 'line',
      from: a,
      to: b,
      lineId: line.id,
      style: line.style,
      planned: a.planned || b.planned,
      id: `line:${a.number}>${b.number}`,
      group: null,
      main: true,
    });
  for (const line of site.lines) {
    const list = lineCards(line.id);
    for (let i = 1; i < list.length; i++) lineConn(list[i - 1], list[i], line);
  }
  const trunkDrawn = trunkLines.filter((l) => lineCards(l.id).length > 0);
  for (let i = 1; i < trunkDrawn.length; i++) {
    const a = lineCards(trunkDrawn[i - 1].id);
    lineConn(a[a.length - 1], lineCards(trunkDrawn[i].id)[0], trunkDrawn[i - 1]);
  }
  // 分岐の線
  for (const bp of branchPlans) {
    const to = /** @type {Card} */ (cards.get(bp.info.first.chapter.number));
    for (const s of bp.info.stations) {
      const from = /** @type {Card} */ (cards.get(s.chapter.number));
      const line = /** @type {import('./schema.js').Line} */ (lineById.get(bp.line.id));
      if (from.tier === to.tier) {
        // 幹線と同じ高さで右へ続ける支線(right)は、路線の線と同じに描く
        conns.push({
          kind: 'branch',
          from,
          to,
          lineId: line.id,
          style: line.style,
          planned: to.planned,
          id: `branch:${s.id}>${bp.line.id}`,
          group: null,
          main: true,
          station: s,
        });
        continue;
      }
      conns.push({
        kind: 'branch',
        from,
        to,
        lineId: line.id,
        style: line.style,
        planned: to.planned,
        id: `branch:${s.id}>${bp.line.id}`,
        group: `branch:${bp.line.id}`,
        main: s === bp.info.branch,
        label: `${s.name}から`,
        station: s,
      });
    }
  }
  for (const a of arrows) {
    conns.push({
      kind: 'arrow',
      from: /** @type {Card} */ (cards.get(a.from)),
      to: /** @type {Card} */ (cards.get(a.to)),
      lineId: '',
      style: 'solid',
      planned: false,
      id: `arrow:${a.from}>${a.to}`,
      group: null,
      main: true,
      label: a.label,
      bundle: `${a.from}:${a.stations.map((s) => s.id).join(',')}`,
    });
  }

  /** 溝の大きさ(既定) @param {'row' | 'col'} axis @param {number} i */
  const defaultGap = (axis, i) => {
    if (axis === 'col') return i < 0 || i >= maxCol ? g.margin : g.colGap;
    return i < minTier || i >= maxTier ? g.margin : g.rowGap0;
  };
  /** 溝の大きさ。広げた溝だけを持つ @type {Map<string, number>} */
  const grown = new Map();
  const gapSize = (/** @type {'row' | 'col'} */ axis, /** @type {number} */ i) =>
    Math.max(defaultGap(axis, i), grown.get(`${axis}${i}`) ?? 0);

  /** 1回分の配置。溝の大きさから座標を決め、溝の中の区間にトラックを割り当てる */
  const pass = () => {
    // 座標
    /** @type {Map<number, number>} */
    const colX = new Map();
    let x = gapSize('col', -1);
    for (let c = 0; c <= maxCol; c++) {
      colX.set(c, x);
      x += g.cardW + gapSize('col', c);
    }
    const width = x;
    /** @type {Map<number, number>} */
    const rowTop = new Map();
    let y = gapSize('row', minTier - 1);
    for (let t = minTier; t <= maxTier; t++) {
      rowTop.set(t, y);
      y += (rowH.get(t) ?? 0) + gapSize('row', t);
    }
    const height = y;
    for (const c of cardList) {
      c.x = /** @type {number} */ (colX.get(c.col));
      c.y = /** @type {number} */ (rowTop.get(c.tier));
    }
    /** 溝の範囲 @param {'row' | 'col'} axis @param {number} i */
    const span = (axis, i) => {
      if (axis === 'col') {
        const lo = i < 0 ? 0 : /** @type {number} */ (colX.get(i)) + g.cardW;
        return { lo, hi: lo + gapSize('col', i) };
      }
      const lo = i < minTier ? 0 : /** @type {number} */ (rowTop.get(i)) + (rowH.get(i) ?? 0);
      return { lo, hi: lo + gapSize('row', i) };
    };
    const mid = (/** @type {'row' | 'col'} */ axis, /** @type {number} */ i) => {
      const s = span(axis, i);
      return (s.lo + s.hi) / 2;
    };
    const cx = (/** @type {Card} */ c) => c.x + c.w / 2;
    /** 札の辺の上下の溝。上の辺は上の段との溝 @param {Card} c @param {'top' | 'bottom'} edge */
    const edgeGap = (c, edge) => (edge === 'top' ? c.tier - 1 : c.tier);
    const edgeY = (/** @type {Card} */ c, /** @type {'top' | 'bottom'} */ edge) => (edge === 'top' ? c.y : c.y + c.h);

    // 経路の形(溝と、溝の中の区間)
    /**
     * @typedef {object} Route
     * @property {Conn} conn
     * @property {'top' | 'bottom'} [es]  出る辺
     * @property {'top' | 'bottom'} [et]  入る辺
     * @property {number} [g1]  出た段の溝
     * @property {number} [g2]  入る段の溝
     * @property {number} [c]   通る列の溝
     * @property {Piece[]} pieces
     * @property {number} [p1]  出る点の x
     * @property {number} [p2]  入る点の x
     * @property {Bundle} [bundle]  束ねた前提の矢印の組
     */
    /**
     * 束ねた前提の矢印(配置 9)。辺の1点から出て、出た段の溝の共通の区間(trunk)を進み、途中で枝分かれする
     * @typedef {object} Bundle
     * @property {string} id
     * @property {Route[]} members
     * @property {number} [p1]       出る点の x
     * @property {Piece | null} trunk  共通の区間
     * @property {number[]} prefs    矢印ごとの、共通の区間の溝の中の位置の好み
     */
    /** @type {Route[]} */
    const routes = [];
    /** @type {Bundle[]} */
    const bundles = [];
    /** 札の辺ごとの、出入りする前提の矢印 @type {Map<string, Array<{ route: { p1?: number, p2?: number }, end: 'p1' | 'p2', toward: number }>>} */
    const ports = new Map();
    /** 前提の矢印と、その両端の点を寄せる向き @type {Array<{ route: Route, towardFrom: number, towardTo: number }>} */
    const arrowEnds = [];
    /** 札の辺ごとの、分岐の線の出る向き @type {Map<string, Set<number>>} */
    const diag = new Map();
    const portKey = (/** @type {Card} */ c, /** @type {string} */ edge) => `${c.number}:${edge}`;
    for (const conn of conns) {
      if (conn.kind === 'line' || (conn.kind === 'branch' && conn.from.tier === conn.to.tier)) {
        routes.push({ conn, pieces: [] });
        continue;
      }
      const { from, to } = conn;
      if (conn.kind === 'branch') {
        const es = to.tier < from.tier ? 'top' : 'bottom';
        const g1 = edgeGap(from, es);
        const c = to.col - 1;
        const cMid = mid('col', c);
        const dir = cMid >= cx(from) ? 1 : -1;
        diag.set(portKey(from, es), new Set([...(diag.get(portKey(from, es)) ?? []), dir]));
        const cs = span('col', c);
        const near = dir > 0 ? from.x + from.w - 30 : from.x + 30;
        const up = es === 'top' ? 1 : -1; // 溝から見た札の側(上の辺から出れば、札は溝の下)
        const hy = headY(to);
        const g1s = span('row', g1);
        routes.push({
          conn,
          es,
          g1,
          c,
          pieces: [
            {
              axis: 'row',
              gap: g1,
              lo: Math.min(near, cs.lo),
              hi: Math.max(near, cs.hi),
              pref: (up + (to.tier < from.tier ? -1 : 1)) / 2,
              id: conn.id,
              group: conn.group,
              track: 0,
              label: false,
            },
            {
              axis: 'col',
              gap: c,
              lo: Math.min(g1s.lo, hy),
              hi: Math.max(g1s.hi, hy),
              pref: ((cx(from) < cMid ? -1 : 1) + 1) / 2,
              id: conn.id,
              group: conn.group,
              track: 0,
              label: false,
            },
          ],
        });
        continue;
      }
      // 前提の矢印(配置 9)
      const es = to.tier < from.tier ? 'top' : to.tier > from.tier ? 'bottom' : 'top';
      const et = from.tier < to.tier ? 'top' : from.tier > to.tier ? 'bottom' : 'top';
      const g1 = edgeGap(from, es);
      const g2 = edgeGap(to, et);
      /** @type {Route} */
      const route = { conn, es, et, g1, g2, pieces: [] };
      if (g1 !== g2) route.c = to.col >= from.col ? to.col - 1 : to.col;
      const towardFrom = route.c === undefined ? cx(to) : mid('col', route.c);
      const towardTo = route.c === undefined ? cx(from) : mid('col', route.c);
      arrowEnds.push({ route, towardFrom, towardTo });
      routes.push(route);
    }
    // 前提にされる駅が同じで、同じ札の同じ辺から出る矢印は束ね、辺の上の1点から出す(配置 9)
    /** @param {Card} card @param {string} edge @param {{ route: { p1?: number, p2?: number }, end: 'p1' | 'p2', toward: number }} entry */
    const addPort = (card, edge, entry) => {
      const k = portKey(card, edge);
      ports.set(k, [...(ports.get(k) ?? []), entry]);
    };
    const sourceKey = (/** @type {Route} */ r) => `${r.conn.bundle}|${r.es}`;
    /** @type {Map<string, Array<{ route: Route, towardFrom: number, towardTo: number }>>} */
    const sameSource = new Map();
    for (const e of arrowEnds) sameSource.set(sourceKey(e.route), [...(sameSource.get(sourceKey(e.route)) ?? []), e]);
    for (const e of arrowEnds) {
      const { route } = e;
      const group = /** @type {Array<{ route: Route, towardFrom: number }>} */ (sameSource.get(sourceKey(route)));
      if (group.length === 1)
        addPort(route.conn.from, /** @type {string} */ (route.es), { route, end: 'p1', toward: e.towardFrom });
      else if (group[0] === e) {
        /** @type {Bundle} */
        const b = { id: `arrows:${sourceKey(route)}`, members: group.map((x) => x.route), trunk: null, prefs: [] };
        for (const x of group) x.route.bundle = b;
        bundles.push(b);
        const toward = group.reduce((sum, x) => sum + x.towardFrom, 0) / group.length;
        addPort(route.conn.from, /** @type {string} */ (route.es), { route: b, end: 'p1', toward });
      }
      addPort(route.conn.to, /** @type {string} */ (route.et), { route, end: 'p2', toward: e.towardTo });
    }
    // 札の辺の上の、前提の矢印の出入りする点(配置 9:間をあけて並べる)
    for (const [k, list] of ports) {
      const [num, edge] = k.split(':');
      const card = /** @type {Card} */ (cards.get(Number(num)));
      const dirs = diag.get(`${num}:${edge}`) ?? new Set();
      const left0 = card.x + 18 + (dirs.has(-1) ? 44 : 0);
      const right0 = card.x + card.w - 18 - (dirs.has(1) ? 44 : 0);
      const center = cx(card);
      const L = list.filter((p) => p.toward < center).sort((a, b) => a.toward - b.toward);
      const R = list.filter((p) => p.toward >= center).sort((a, b) => a.toward - b.toward);
      const step = Math.min(g.port, (right0 - left0) / Math.max(1, list.length));
      L.forEach((p, i) => (p.route[p.end] = left0 + i * step));
      R.forEach((p, i) => (p.route[p.end] = right0 - (R.length - 1 - i) * step));
    }
    for (const b of bundles) for (const m of b.members) m.p1 = b.p1;
    // 前提の矢印の、溝の中の区間
    for (const route of routes) {
      const conn = route.conn;
      if (conn.kind !== 'arrow') continue;
      const p1 = /** @type {number} */ (route.p1);
      const p2 = /** @type {number} */ (route.p2);
      const g1 = /** @type {number} */ (route.g1);
      const g2 = /** @type {number} */ (route.g2);
      const side1 = route.es === 'bottom' ? -1 : 1; // 出る札は溝の上(-1)か下(+1)
      const side2 = route.et === 'bottom' ? -1 : 1;
      const base = { id: conn.id, group: null, track: 0, label: false };
      const b = route.bundle;
      /** 出た段の溝の区間。束ねた矢印は、1つの共通の区間を広げる @param {number} lo @param {number} hi @param {number} pref */
      const firstRow = (lo, hi, pref) => {
        if (!b) {
          route.pieces.push({ ...base, axis: 'row', gap: g1, lo, hi, pref });
          return;
        }
        b.prefs.push(pref);
        const avg = b.prefs.reduce((sum, x) => sum + x, 0) / b.prefs.length;
        if (!b.trunk)
          b.trunk = { id: b.id, group: null, track: 0, label: true, axis: 'row', gap: g1, lo, hi, pref: avg };
        else Object.assign(b.trunk, { lo: Math.min(b.trunk.lo, lo), hi: Math.max(b.trunk.hi, hi), pref: avg });
      };
      if (route.c === undefined) {
        firstRow(Math.min(p1, p2), Math.max(p1, p2), (side1 + side2) / 2);
      } else {
        const cs = span('col', route.c);
        const cMid = (cs.lo + cs.hi) / 2;
        const down = g2 > g1 ? 1 : -1;
        firstRow(Math.min(p1, cs.lo), Math.max(p1, cs.hi), (side1 + down) / 2);
        route.pieces.push(
          {
            ...base,
            axis: 'col',
            gap: route.c,
            lo: Math.min(span('row', g1).lo, span('row', g2).lo),
            hi: Math.max(span('row', g1).hi, span('row', g2).hi),
            pref: ((p1 < cMid ? -1 : 1) + (p2 < cMid ? -1 : 1)) / 2,
          },
          { ...base, axis: 'row', gap: g2, lo: Math.min(p2, cs.lo), hi: Math.max(p2, cs.hi), pref: (side2 - down) / 2 },
        );
      }
      // ラベルは、横に進む区間のうち長いほう(見積もり)の上に置く。束ねた矢印は共通の区間の上に置く
      if (b) continue;
      const rowPieces = route.pieces.filter((p) => p.axis === 'row');
      rowPieces.sort((x, y) => y.hi - y.lo - (x.hi - x.lo))[0].label = true;
    }

    // トラックの割り当て(配置 9:同じ溝で範囲が重なる区間は別のトラックに)
    /** @type {Map<string, Piece[]>} */
    const byGap = new Map();
    const pieces = [...routes.flatMap((r) => r.pieces), ...bundles.flatMap((x) => (x.trunk ? [x.trunk] : []))];
    for (const p of pieces) byGap.set(`${p.axis}${p.gap}`, [...(byGap.get(`${p.axis}${p.gap}`) ?? []), p]);
    const SEP = 8;
    /** @type {Map<string, { order: number[], lanes: number[], count: number }>} */
    const trackInfo = new Map();
    for (const [key, list] of byGap) {
      list.sort((a, b) => a.lo - b.lo || a.hi - b.hi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      /** @type {Piece[][]} */
      const tracks = [];
      const clash = (/** @type {Piece} */ a, /** @type {Piece} */ b) => {
        if (a.id === b.id) return false;
        if (a.group && a.group === b.group) return a.lo < b.hi && b.lo < a.hi;
        return a.lo < b.hi + SEP && b.lo < a.hi + SEP;
      };
      for (const p of list) {
        const groupTrack = p.group ? tracks.findIndex((t) => t.some((q) => q.group === p.group)) : -1;
        const fits = (/** @type {number} */ i) => tracks[i].every((q) => !clash(p, q));
        let t = groupTrack >= 0 && fits(groupTrack) ? groupTrack : tracks.findIndex((_, i) => fits(i));
        if (t < 0) {
          t = tracks.length;
          tracks.push([]);
        }
        tracks[t].push(p);
        p.track = t;
      }
      // 溝の中の並び:上(左)に寄せたい区間のトラックを上(左)に
      const prefOf = (/** @type {Piece[]} */ t) => t.reduce((s, p) => s + p.pref, 0) / t.length;
      const order = tracks.map((_, i) => i).sort((a, b) => prefOf(tracks[a]) - prefOf(tracks[b]) || a - b);
      const rank = new Map(order.map((t, i) => [t, i]));
      for (const p of list) p.track = /** @type {number} */ (rank.get(p.track));
      const lanes = order.map((t) => (tracks[t].some((p) => p.label) ? g.labelH + 2 * g.labelPad + 2 : g.track));
      trackInfo.set(key, { order, lanes, count: tracks.length });
    }
    // ラベルを置く、溝の端の帯(行の数)。分岐の線のラベルは、出る札の側の帯に置く。ラベルを置けなかった溝は帯を足す
    /** @type {Map<string, number>} */
    const labelBands = new Map(extraRows);
    for (const r of routes) {
      if (r.conn.kind !== 'branch' || r.es === undefined) continue;
      const key = `row${r.g1}:${r.es === 'top' ? 'bottom' : 'top'}`;
      labelBands.set(key, Math.max(labelBands.get(key) ?? 0, 1 + (extraRows.get(key) ?? 0)));
    }
    /** 溝に要る大きさ @param {string} key */
    const need = (key) => {
      const info = trackInfo.get(key);
      const band = (/** @type {string} */ side) => bandSize(labelBands, `${key}:${side}`);
      if (!info) return band('top') + band('bottom');
      if (key.startsWith('col')) return 2 * g.gapPad + (info.count - 1) * g.track;
      return (
        Math.max(g.gapPad, band('top') + 2) +
        info.lanes.reduce((s, l) => s + l, 0) +
        Math.max(g.gapPad, band('bottom') + 4)
      );
    };
    return { colX, rowTop, width, height, span, routes, trackInfo, labelBands, need, edgeY, cx };
  };

  /** ラベルを置けなかった溝に足す帯の行の数 @type {Map<string, number>} */
  const extraRows = new Map();
  /** 帯の高さ @param {Map<string, number>} bands @param {string} key */
  const bandSize = (bands, key) => {
    const n = bands.get(key) ?? 0;
    return n === 0 ? 0 : n * (g.labelH + g.labelPad) + g.labelPad;
  };
  /** @type {ReturnType<typeof draw> | null} */
  let result = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    result = draw();
    if (result.failed.length === 0) break;
    for (const key of result.failed) extraRows.set(key, (extraRows.get(key) ?? 0) + 1);
  }
  const { links, labels, out } = /** @type {ReturnType<typeof draw>} */ (result);

  /** 溝の大きさを決め、線とラベルを置く。置けなかったラベルの帯(溝と側)を failed に返す */
  function draw() {
    // 溝を広げながら配置をやり直す。溝は広がるだけなので、回数は限られる
    let out = pass();
    for (let i = 0; i < 12; i++) {
      let changed = false;
      const keys = new Set([...out.trackInfo.keys(), ...[...out.labelBands.keys()].map((b) => b.split(':')[0])]);
      for (const key of keys) {
        const axis = /** @type {'row' | 'col'} */ (key.startsWith('row') ? 'row' : 'col');
        const idx = Number(key.slice(3));
        const n = out.need(key);
        if (n > gapSize(axis, idx) + 0.01) {
          grown.set(key, n);
          changed = true;
        }
      }
      if (!changed) break;
      out = pass();
    }

    // ---- 線の座標 ----
    const { span, routes, trackInfo, labelBands, edgeY, cx } = out;
    /** トラックの座標 @param {'row' | 'col'} axis @param {number} gap @param {number} track */
    const trackPos = (axis, gap, track) => {
      const key = `${axis}${gap}`;
      const s = span(axis, gap);
      const info = /** @type {{ lanes: number[], count: number }} */ (trackInfo.get(key));
      if (axis === 'col') {
        const total = (info.count - 1) * g.track;
        return s.lo + (s.hi - s.lo - total) / 2 + track * g.track;
      }
      const top = bandSize(labelBands, `${key}:top`) + 2;
      const bottom = bandSize(labelBands, `${key}:bottom`) + 4;
      const lanesTotal = info.lanes.reduce((a, b) => a + b, 0);
      // 帯を除いた範囲の中央に、トラックの並びを置く。ラベルを置くトラックは、その上にラベルの幅をあける
      const lo = s.lo + top;
      const hi = s.hi - bottom;
      let y = lo + (hi - lo - lanesTotal) / 2;
      for (let i = 0; i < track; i++) y += info.lanes[i];
      const lane = info.lanes[track];
      return y + (lane > g.track ? lane - 2 : lane / 2);
    };
    /** @type {Link[]} */
    const links = [];
    /** 分岐の線の、斜めの区間(ラベルの位置に使う) @type {Map<string, { x: number, y: number, ex: number, ty: number, edge: 'top' | 'bottom', dir: number, gap: number }>} */
    const diagStart = new Map();
    /** 前提の矢印の横の区間(ラベルの位置に使う) @type {Map<string, Array<{ x1: number, x2: number, y: number, label: boolean, gap: number }>>} */
    const rowSegs = new Map();
    /** ラベルを置かない前提の矢印(束ねた矢印のうち、共通の区間を描かないもの) */
    const quiet = new Set();
    /** 束ねた矢印の線(組ごとに1回だけ計算する) @type {Map<object, Map<object, { pts: number[][], segs: Array<{ x1: number, x2: number, y: number, label: boolean, gap: number }>, lead: boolean }>>} */
    const bundleDrawn = new Map();
    /**
     * 束ねた矢印の線の点(配置 9)。共通の区間は、最も遠くで枝分かれする矢印(lead)の線に含め、
     * 反対の側へ枝分かれする矢印があれば、その側で最も遠いものの線を出る点の真下(真上)から始める。
     * ほかの矢印の線は、枝分かれする点から始める。
     * @param {NonNullable<(typeof routes)[number]['bundle']>} b
     */
    const bundlePaths = (b) => {
      const trunk = /** @type {Piece} */ (b.trunk);
      const T = trackPos('row', trunk.gap, trunk.track);
      const p1 = /** @type {number} */ (b.p1);
      const first = b.members[0];
      const y1 = edgeY(first.conn.from, /** @type {'top' | 'bottom'} */ (first.es));
      const info = b.members.map((m) => {
        const p2 = /** @type {number} */ (m.p2);
        const y2 = edgeY(m.conn.to, /** @type {'top' | 'bottom'} */ (m.et));
        if (m.c === undefined) return { m, turn: p2, rest: [[p2, y2]], seg: null };
        const [v, h2] = m.pieces;
        const tx = trackPos('col', v.gap, v.track);
        const t2 = trackPos('row', h2.gap, h2.track);
        return {
          m,
          turn: tx,
          rest: [
            [tx, t2],
            [p2, t2],
            [p2, y2],
          ],
          seg: { x1: Math.min(p2, tx), x2: Math.max(p2, tx), y: t2, label: false, gap: h2.gap },
        };
      });
      /** @typedef {(typeof info)[number]} Branch */
      /** @type {Branch | null} */
      let farR = null;
      /** @type {Branch | null} */
      let farL = null;
      for (const i of info) {
        if (i.turn >= p1 && (!farR || i.turn > farR.turn)) farR = i;
        if (i.turn < p1 && (!farL || i.turn < farL.turn)) farL = i;
      }
      const lead = !farL || (farR && farR.turn - p1 >= p1 - farL.turn) ? farR : farL;
      const trunkSeg = { x1: farL ? farL.turn : p1, x2: farR ? farR.turn : p1, y: T, label: true, gap: trunk.gap };
      const out = new Map();
      for (const i of info) {
        const start =
          i === lead
            ? [
                [p1, y1],
                [p1, T],
              ]
            : i === farR || i === farL
              ? [[p1, T]]
              : [];
        const pts = [...start, [i.turn, T], ...i.rest].filter(
          (q, k, all) => k === 0 || q[0] !== all[k - 1][0] || q[1] !== all[k - 1][1],
        );
        const segs = i === lead ? [trunkSeg, ...info.flatMap((x) => (x.seg ? [x.seg] : []))] : [];
        out.set(i.m, { pts, segs, lead: i === lead });
      }
      return out;
    };
    for (const route of routes) {
      const conn = route.conn;
      const base = {
        kind: conn.kind,
        lineId: conn.lineId,
        style: conn.style,
        planned: conn.planned,
        from: conn.from.number,
        to: conn.to.number,
        id: conn.id,
        ...(conn.group ? { group: conn.group } : {}),
      };
      const { from, to } = conn;
      // 区間のない線は、路線の線と同じ高さの横の線(束ねた矢印は、共通の区間を組が持つので区間がないことがある)
      if (route.pieces.length === 0 && !route.bundle) {
        const y1 = headY(from);
        links.push({
          ...base,
          points: [
            [from.x + from.w, y1],
            [to.x, headY(to)],
          ],
        });
        continue;
      }
      if (conn.kind === 'branch') {
        const [h, v] = route.pieces;
        const es = /** @type {'top' | 'bottom'} */ (route.es);
        const ty = trackPos('row', h.gap, h.track);
        const tx = trackPos('col', v.gap, v.track);
        const ey = edgeY(from, es);
        const dy = Math.abs(ty - ey);
        const dir = tx >= cx(from) ? 1 : -1;
        const adjacent = dir > 0 ? v.gap === from.col : v.gap === from.col - 1;
        let sx;
        let ex;
        if (adjacent) {
          sx = Math.min(from.x + from.w - 12, Math.max(from.x + 12, tx - dir * dy));
          ex = tx;
        } else {
          sx = dir > 0 ? from.x + from.w - 16 : from.x + 16;
          ex = sx + dir * dy;
        }
        const hy = headY(to);
        /** @type {number[][]} */
        const pts = [
          [sx, ey],
          [ex, ty],
        ];
        if (Math.abs(ex - tx) > 0.01) pts.push([tx, ty]);
        pts.push([tx, hy]);
        // 主な分岐駅からの線は札の左の辺まで。ほかの分岐駅からの線は、主な線のトラックまで
        const mainRoute = routes.find((r) => r.conn.group === conn.group && r.conn.main);
        if (conn.main) pts.push([to.x, hy]);
        else if (mainRoute) {
          const mx = trackPos('col', mainRoute.pieces[1].gap, mainRoute.pieces[1].track);
          if (mx > tx) pts.push([mx, hy]);
        }
        links.push({ ...base, points: pts });
        diagStart.set(conn.id, { x: sx, y: ey, ex, ty, edge: es, dir, gap: h.gap });
        continue;
      }
      // 前提の矢印
      if (route.bundle) {
        let paths = bundleDrawn.get(route.bundle);
        if (!paths) {
          paths = bundlePaths(route.bundle);
          bundleDrawn.set(route.bundle, paths);
        }
        const p = /** @type {{ pts: number[][], segs: any[], lead: boolean }} */ (paths.get(route));
        links.push({ ...base, group: route.bundle.id, points: p.pts });
        if (p.lead) rowSegs.set(conn.id, p.segs);
        else quiet.add(conn.id);
        continue;
      }
      const p1 = /** @type {number} */ (route.p1);
      const p2 = /** @type {number} */ (route.p2);
      const y1 = edgeY(from, /** @type {'top' | 'bottom'} */ (route.es));
      const y2 = edgeY(to, /** @type {'top' | 'bottom'} */ (route.et));
      const segs = [];
      /** @type {number[][]} */
      let pts;
      if (route.c === undefined) {
        const [h] = route.pieces;
        const ty = trackPos('row', h.gap, h.track);
        pts = [
          [p1, y1],
          [p1, ty],
          [p2, ty],
          [p2, y2],
        ];
        segs.push({ x1: Math.min(p1, p2), x2: Math.max(p1, p2), y: ty, label: h.label, gap: h.gap });
      } else {
        const [h1, v, h2] = route.pieces;
        const t1 = trackPos('row', h1.gap, h1.track);
        const tx = trackPos('col', v.gap, v.track);
        const t2 = trackPos('row', h2.gap, h2.track);
        pts = [
          [p1, y1],
          [p1, t1],
          [tx, t1],
          [tx, t2],
          [p2, t2],
          [p2, y2],
        ];
        segs.push(
          { x1: Math.min(p1, tx), x2: Math.max(p1, tx), y: t1, label: h1.label, gap: h1.gap },
          { x1: Math.min(p2, tx), x2: Math.max(p2, tx), y: t2, label: h2.label, gap: h2.gap },
        );
      }
      links.push({ ...base, points: pts });
      rowSegs.set(conn.id, segs);
    }
    for (const l of links) l.points = l.points.map(([x, y]) => [round(x), round(y)]);

    // ---- ラベル(配置 10) ----
    /** @type {MapLabel[]} */
    const labels = [];
    const cardBoxes = cardList.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }));
    /** 線分の一覧(ラベルの重なりの検査に使う) */
    const segments = links.flatMap((l) =>
      l.points.slice(1).map((p, i) => ({ x1: l.points[i][0], y1: l.points[i][1], x2: p[0], y2: p[1] })),
    );
    /** @param {Box} b */
    const free = (b) => {
      const m = 2;
      const grow = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
      if (cardBoxes.some((c) => boxesOverlap(grow, c))) return false;
      if (labels.some((l) => boxesOverlap(grow, l))) return false;
      if (segments.some((s) => segmentHitsBox(s, grow))) return false;
      return grow.x >= 0 && grow.y >= 0;
    };
    /** @type {string[]} */
    const failed = [];
    const step = g.labelH + 2;
    for (const route of routes) {
      const conn = route.conn;
      if (!conn.label || quiet.has(conn.id)) continue;
      const w = round(textWidth(conn.label, g.labelFont, site.text) + 2);
      const h = g.labelH;
      /** 候補と、近さの点数(小さいほど先に試す) @type {Array<Box & { score: number }>} */
      const candidates = [];
      let bandKey = '';
      if (conn.kind === 'branch') {
        const d = diagStart.get(conn.id);
        if (!d) continue;
        bandKey = `row${d.gap}:${d.edge === 'top' ? 'bottom' : 'top'}`;
        const gs = span('row', d.gap);
        /** 斜めの区間の、高さ y での x @param {number} y */
        const diagX = (y) => {
          const t = Math.min(1, Math.max(0, (y - d.y) / (d.ty - d.y || 1)));
          return d.x + (d.ex - d.x) * t;
        };
        // 斜めの区間のそばの段の溝に、札の辺に近い行から置く。線の内側(曲がる側の反対)を先に試す
        for (let k = 0; ; k++) {
          const y = d.edge === 'top' ? d.y - g.labelPad - h - k * step : d.y + g.labelPad + k * step;
          if (d.edge === 'top' ? y < gs.lo + 1 : y + h > gs.hi - 1) break;
          const near = diagX(d.edge === 'top' ? y + h : y);
          const far = diagX(d.edge === 'top' ? y : y + h);
          for (let j = 0; j < 60; j++) {
            const off = 4 + j * 6;
            candidates.push({ x: d.dir > 0 ? near - off - w : near + off, y, w, h, score: j * 6 + k * step * 1.5 });
            candidates.push({ x: d.dir > 0 ? far + off : far - off - w, y, w, h, score: 300 + j * 6 + k * step * 1.5 });
          }
        }
      } else {
        const segs = [...(rowSegs.get(conn.id) ?? [])].sort(
          (a, b) => Number(b.label) - Number(a.label) || b.x2 - b.x1 - (a.x2 - a.x1),
        );
        segs.forEach((sg, i) => {
          if (i === 0) bandKey = `row${sg.gap}:top`;
          const gs = span('row', sg.gap);
          const center = (sg.x1 + sg.x2) / 2 - w / 2;
          const reach = Math.max(0, (sg.x2 - sg.x1 - w) / 2) + w / 2;
          // 区間の上を先に、区間の中央から離していく。だめなら区間の下、溝の中のほかの行
          for (let k = 0; ; k++) {
            const above = sg.y - g.labelPad - h - k * step;
            const below = sg.y + g.labelPad + k * step;
            const rowsHere = [
              ...(above >= gs.lo + 1 ? [{ y: above, side: 0 }] : []),
              ...(below + h <= gs.hi - 1 ? [{ y: below, side: 1 }] : []),
            ];
            if (rowsHere.length === 0) break;
            for (const r of rowsHere) {
              for (let j = 0; j * 4 <= reach; j++) {
                const score = i * 1000 + k * step * 3 + r.side * 40 + j * 4;
                candidates.push({ x: center - j * 4, y: r.y, w, h, score });
                if (j > 0) candidates.push({ x: center + j * 4, y: r.y, w, h, score });
              }
            }
          }
        });
      }
      candidates.sort((a, b) => a.score - b.score);
      const pick = candidates.find(free);
      if (!pick) {
        failed.push(bandKey);
        continue;
      }
      labels.push({
        kind: /** @type {'arrow' | 'branch'} */ (conn.kind),
        text: conn.label,
        lineId: conn.lineId,
        x: round(pick.x),
        y: round(pick.y),
        w,
        h,
      });
    }
    return { links, labels, out, failed };
  }

  const xs = [0, out.width, ...labels.flatMap((l) => [l.x, l.x + l.w])];
  const ys = [0, out.height, ...labels.flatMap((l) => [l.y, l.y + l.h])];
  for (const l of links) for (const [x, y] of l.points) (xs.push(x), ys.push(y));
  for (const c of cardList) {
    c.x = round(c.x);
    c.y = round(c.y);
  }
  return {
    cards: cardList,
    stations: placedStations,
    links,
    labels,
    arrows,
    bounds: {
      minX: round(Math.min(...xs)),
      minY: round(Math.min(...ys)),
      maxX: round(Math.max(...xs)),
      maxY: round(Math.max(...ys)),
    },
    missing,
    lateStarts,
    fallbacks,
    linesShown: site.lines.filter((l) => cardList.some((c) => c.lineId === l.id)),
  };
}

/** @param {Box} a @param {Box} b */
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * 線分が矩形の内側を通るか(Liang–Barsky)。
 * @param {{ x1: number, y1: number, x2: number, y2: number }} s @param {Box} b
 */
export function segmentHitsBox(s, b) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, s.x1 - b.x],
    [dx, b.x + b.w - s.x1],
    [-dy, s.y1 - b.y],
    [dy, b.y + b.h - s.y1],
  ]) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 >= t1) return false;
  }
  return true;
}

/**
 * 札・札の中の文字と印・ラベルの外接矩形と、線の線分を返す(重なりの検査に使う)。
 * Preconditions: layout は layoutMap の結果。
 * Postconditions: boxes(kind と、札の中のものは持ち主の章番号と表示の段階付き)と segments(kind と線の名前付き)を返す。
 *   札の中のものの lod は、0 が駅の行のある表示、1 が概要、2 が章のタイトルだけ。段階が違うものは同時に表示しない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {MapLayout} layout
 */
export function layoutBoxes(layout) {
  /** @type {Array<{ kind: string, owner: string, card: number | null, lod: number | null, x: number, y: number, w: number, h: number }>} */
  const boxes = [];
  for (const c of layout.cards) {
    const own = `第${c.number}章`;
    boxes.push({ kind: 'card', owner: own, card: null, lod: null, x: c.x, y: c.y, w: c.w, h: c.h });
    const inCard = (
      /** @type {string} */ kind,
      /** @type {string} */ owner,
      /** @type {Box} */ b,
      /** @type {number} */ lod = 0,
    ) => boxes.push({ kind, owner, card: c.number, lod, x: c.x + b.x, y: c.y + b.y, w: b.w, h: b.h });
    inCard('head', own, { ...c.head, w: c.head.textW });
    for (const t of c.titleLines) inCard('title', own, t);
    for (const r of c.rows) {
      const owner = r.info.code || r.info.name;
      if (r.plate) inCard('plate', owner, r.plate);
      for (const t of r.name) inCard('name', owner, t);
      if (r.pill) inCard('pill', owner, r.pill);
    }
    c.overview.forEach((o, i) => {
      if (o.head) inCard('head', own, o.head, i + 1);
      for (const t of o.lines) inCard('title', own, t, i + 1);
    });
  }
  for (const l of layout.labels)
    boxes.push({ kind: 'label', owner: l.text, card: null, lod: null, x: l.x, y: l.y, w: l.w, h: l.h });
  /** @type {Array<{ kind: string, id: string, group: string | null, lineId: string, x1: number, y1: number, x2: number, y2: number }>} */
  const segments = [];
  for (const l of layout.links) {
    for (let i = 1; i < l.points.length; i++) {
      const [x1, y1] = l.points[i - 1];
      const [x2, y2] = l.points[i];
      if (x1 === x2 && y1 === y2) continue;
      segments.push({ kind: l.kind, id: l.id ?? '', group: l.group ?? null, lineId: l.lineId, x1, y1, x2, y2 });
    }
  }
  return { boxes, segments };
}

/** 前提の矢印の矢じりの長さと、半分の幅 */
const HEAD_LEN = 7;
const HEAD_HALF = 4;

/**
 * 路線図の SVG を書く。
 * Preconditions: layout は layoutMap の結果。
 * Postconditions: SVG の文字列を返す。駅の行と章の札はリンクにし、title と desc を付ける。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {MapLayout} layout
 * @param {{ title: string, idPrefix: string, hrefFor: (s: import('./graph.js').StationInfo) => string, chapterHref?: (chapterId: string) => string | null }} opts
 *   章の札は chapterHref のリンクにする。null を返す章と、未執筆の章の札はリンクにしない。
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
  const d = (/** @type {number[][]} */ pts) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  // 路線の線と分岐の線は札より下に描く(線の端の丸みを札で隠す)
  for (const l of layout.links) {
    if (l.kind === 'arrow') continue;
    const cls = [
      'ln',
      `l-${l.lineId}`,
      ...(l.kind === 'branch' ? ['branch'] : []),
      ...(l.style === 'dotted' ? ['dotted'] : []),
      ...(l.planned ? ['planned'] : []),
    ];
    out.push(`<path class="${cls.join(' ')}" d="${d(l.points)}"/>`);
  }
  for (const c of layout.cards) {
    const flags = [...(c.current ? ['current'] : []), ...(c.planned ? ['planned'] : [])];
    const at = (/** @type {Box} */ b) => ({ x: round(c.x + b.x), y: round(c.y + b.y) });
    const head = at(c.head);
    const title = c.titleLines
      .map((t) => {
        const p = at(t);
        return `<tspan x="${p.x}" y="${round(p.y + GEOM.titleFont)}">${escapeXml(t.text)}</tspan>`;
      })
      .join('');
    // 縮小したときの文字(route-map.md「倍率ごとの表示」)。スクリプトが段階を決めるまでは出さない
    const fonts = [
      { head: GEOM.ov1HeadFont, title: GEOM.ov1TitleFont },
      { head: 0, title: GEOM.ov2TitleFont },
    ];
    const overview = c.overview
      .map((o, i) => {
        const cls = `ov ov${i + 1}`;
        const lines = o.lines
          .map((t) => {
            const p = at(t);
            return `<tspan x="${p.x}" y="${round(p.y + fonts[i].title)}">${escapeXml(t.text)}</tspan>`;
          })
          .join('');
        const h = o.head ? at(o.head) : null;
        return (
          (o.head && h
            ? `<text class="${[cls, 'card-head', `l-${c.lineId}`, ...flags].join(' ')}" x="${h.x}" y="${round(h.y + fonts[i].head - 1)}">${escapeXml(o.head.text)}</text>`
            : '') + `<text class="${cls} card-title${c.planned ? ' planned' : ''}">${lines}</text>`
        );
      })
      .join('');
    const body =
      `<rect class="${['card', `l-${c.lineId}`, ...flags].join(' ')}" x="${c.x}" y="${c.y}" width="${c.w}" height="${round(c.h)}" rx="6"/>` +
      `<text class="${['card-head', `l-${c.lineId}`, ...flags].join(' ')}" x="${head.x}" y="${round(head.y + GEOM.headFont - 1)}">${escapeXml(c.head.text)}</text>` +
      `<text class="card-title${c.planned ? ' planned' : ''}">${title}</text>` +
      overview;
    const href = !c.planned && c.chapterId && opts.chapterHref ? opts.chapterHref(c.chapterId) : null;
    out.push(
      href
        ? `<a href="${escapeXml(href)}" class="ch" aria-label="${escapeXml(`第${c.number}章 ${c.title}`)}">${body}</a>`
        : `<g class="ch">${body}</g>`,
    );
    for (const r of c.rows) {
      const names = r.name
        .map((t) => {
          const p = at(t);
          return `<tspan x="${p.x}" y="${round(p.y + GEOM.stFont)}">${escapeXml(t.text)}</tspan>`;
        })
        .join('');
      if (r.info.planned) {
        out.push(`<text class="label planned">${names}</text>`);
        continue;
      }
      const row = at(r);
      const plate = /** @type {Box} */ (r.plate);
      const pp = at(plate);
      const tip = r.goal ? `<title>${escapeXml(`${r.final ? '最終目標' : '途中の目標'}:${r.goal.label}`)}</title>` : '';
      out.push(
        `<a href="${escapeXml(opts.hrefFor(r.info))}" class="st" aria-label="${escapeXml(`${r.info.code} ${r.info.name}`)}">${r.final ? tip : ''}`,
        `<rect class="hit" x="${row.x}" y="${row.y}" width="${round(r.w)}" height="${round(r.name.length * GEOM.stLineH)}"/>`,
        `<rect class="${['plate', `l-${c.lineId}`, ...(r.final ? ['final'] : [])].join(' ')}" x="${pp.x}" y="${pp.y}" width="${plate.w}" height="${plate.h}" rx="4"/>`,
        `<text class="code l-${c.lineId}${r.final ? ' inv' : ''}" x="${round(pp.x + plate.w / 2)}" y="${round(pp.y + plate.h / 2)}">${escapeXml(r.info.code)}</text>`,
        `<text class="label">${names}</text>`,
        `</a>`,
      );
      if (r.pill && r.partial) {
        const p = at(r.pill);
        out.push(
          `<g class="pill"><title>${escapeXml(`途中の目標:${r.partial.label}`)}</title><rect x="${p.x}" y="${p.y}" width="${r.pill.w}" height="${r.pill.h}" rx="7.5"/><text x="${round(p.x + r.pill.w / 2)}" y="${round(p.y + r.pill.h / 2)}">途中の目標</text></g>`,
        );
      }
    }
  }
  // 前提の矢印は札より上に描く(矢じりを札の辺に重ねる)
  for (const l of layout.links) {
    if (l.kind !== 'arrow') continue;
    const pts = l.points.map((p) => [...p]);
    const [tx, ty] = pts[pts.length - 1];
    const py = pts[pts.length - 2][1];
    const s = Math.sign(ty - py) || 1;
    pts[pts.length - 1] = [tx, round(ty - s * HEAD_LEN)];
    const head = `M${tx} ${ty} L${tx - HEAD_HALF} ${round(ty - s * HEAD_LEN)} L${tx + HEAD_HALF} ${round(ty - s * HEAD_LEN)} Z`;
    out.push(`<path class="arrow" d="${d(pts)}"/><path class="arrow-head" d="${head}"/>`);
  }
  for (const lb of layout.labels) {
    const cls = lb.kind === 'arrow' ? 'arrow-label' : `branch-label l-${lb.lineId}`;
    out.push(
      `<text class="${cls}" x="${round(lb.x + 1)}" y="${round(lb.y + GEOM.labelFont)}">${escapeXml(lb.text)}</text>`,
    );
  }
  out.push('</svg>');
  return out.join('');
}

/**
 * 図の説明(desc)。路線ごとに、章を読む順に並べ、章ごとに駅を表示番号・駅名・印の順で並べる。
 * そのあとに、前提の矢印ごとに1文を書く(route-map.md「代替テキスト」)。
 * @param {MapLayout} layout
 */
export function mapDescription(layout) {
  const lines = layout.linesShown.map((line) => {
    const cards = layout.cards.filter((c) => c.lineId === line.id).sort((a, b) => a.col - b.col);
    const parts = cards.map((c) => {
      const items = c.rows.map((r) => {
        if (r.info.planned) return r.info.name;
        const marks = [...(r.final ? ['最終目標'] : []), ...(r.partial ? ['途中の目標'] : [])];
        return `${r.info.code} ${r.info.name}${marks.map((m) => `(${m})`).join('')}`;
      });
      return `第${c.number}章 ${c.title}${c.planned ? '(未執筆)' : ''}:${items.join('、')}。`;
    });
    return `${line.name}。${parts.join('')}`;
  });
  const arrows = layout.arrows.map(
    (a) =>
      `第${a.to}章は、第${a.from}章の ${a.stations.map((s) => (s.code ? `${s.code} ${s.name}` : s.name)).join('、')}を前提にする。`,
  );
  return [...lines, ...arrows].join('');
}
