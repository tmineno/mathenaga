// 章グラフ:全章・全駅・全定義をまとめ、導出する値を求めて検査する。
// 規則は docs/spec/build.md「導出する値」と docs/spec/content-format.md「ID」「前提(requires)と読む順」。

import { issue } from './issues.js';

export const KIND_NAMES = {
  line: '路線',
  field: '分野',
  chapter: '章',
  station: '駅',
  definition: '定義',
  theorem: '定理',
  equation: '式',
  figure: '図',
  application: '応用',
  reference: '文献',
};

/**
 * @typedef {object} StationInfo
 * @property {string} id
 * @property {string} name
 * @property {import('./chapter.js').ChapterModel} chapter
 * @property {import('./chapter.js').Station} model
 * @property {string} lineId
 * @property {number} index     読む順での位置(0 から)
 * @property {string[]} requires  存在する駅の ID だけ
 * @property {string} code      表示番号(A01 など)
 * @property {boolean} [planned]  未執筆の章の駅(路線図だけで使う。map.js の mapStations)
 */

/**
 * @typedef {object} DefinitionInfo
 * @property {string} id
 * @property {string} name
 * @property {string} en
 * @property {string[]} aliases
 * @property {import('./chapter.js').Block} block
 * @property {StationInfo} station
 */

/**
 * @typedef {object} Site
 * @property {import('./schema.js').Line[]} lines
 * @property {Map<string, import('./schema.js').Line>} lineById
 * @property {import('./schema.js').Field[]} fields    ID の文字コード順
 * @property {Map<string, import('./schema.js').Field>} fieldById
 * @property {Map<string, number>} fieldOrder
 * @property {import('./chapter.js').ChapterModel[]} chapters   章番号の順
 * @property {Map<string, import('./chapter.js').ChapterModel>} chapterById
 * @property {StationInfo[]} stations   読む順
 * @property {Map<string, StationInfo>} stationById
 * @property {Map<string, DefinitionInfo>} definitions
 * @property {Map<string, { id: string, name: string, station: StationInfo }>} theorems
 * @property {Map<string, string>} kinds   ID → 種類(line、field、chapter、station、definition、theorem、equation、figure、application、reference)
 * @property {Map<string, import('./references.js').Reference>} references  文献の ID → 文献(文献の一覧の順)
 * @property {Map<string, Set<string>>} scope   分野 → 分野の範囲
 * @property {Map<string, import('./chapter.js').ChapterModel[]>} fieldChapters  分野 → 分野内の章の順序
 * @property {import('./schema.js').PlannedChapter[]} planned   未執筆の章(章番号の順。requires は存在する駅だけ)
 */

/**
 * 章グラフを作る。
 * Preconditions: lines・fields・chapters は schema.js と chapter.js で検査済みの値。
 * Postconditions: 導出する値をそろえた Site と、見つけたエラー(E04〜E06)・通知(N01)を返す。
 *   誤りがあっても、正しく読めた部分で Site を作る。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {{ lines: import('./schema.js').Line[], fields: import('./schema.js').Field[], chapters: import('./chapter.js').ChapterModel[], linesFile: string, references?: import('./references.js').Reference[], referencesFile?: string }} input
 * @returns {{ site: Site, errors: import('./issues.js').Issue[], notices: import('./issues.js').Issue[] }}
 */
export function buildSite(input) {
  const errors = [];
  const notices = [];
  const lines = [...input.lines].sort((a, b) => a.order - b.order);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const fields = [...input.fields].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const fieldOrder = new Map(fields.map((f, i) => [f.id, i]));
  const chapters = [...input.chapters].sort((a, b) => a.number - b.number || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // ID の名前空間
  /** @type {Map<string, string>} */
  const kinds = new Map();
  /** @type {Map<string, string>} */
  const firstSeen = new Map();
  /** @param {string} id @param {string} kind @param {string} file @param {number | null} line */
  const register = (id, kind, file, line) => {
    if (id === null || id === undefined || id === '') return false;
    if (kinds.has(id)) {
      errors.push(
        issue(
          'E04',
          file,
          line,
          `ID「${id}」が重複している(${KIND_NAMES[kind]}。最初は ${firstSeen.get(id)} の${KIND_NAMES[kinds.get(id)]})`,
        ),
      );
      return false;
    }
    kinds.set(id, kind);
    firstSeen.set(id, line ? `${file}:${line}` : file);
    return true;
  };
  for (const l of lines) register(l.id, 'line', input.linesFile, null);
  /** @type {Map<string, import('./references.js').Reference>} */
  const references = new Map();
  for (const r of input.references ?? []) {
    if (register(r.id, 'reference', input.referencesFile ?? 'references.yml', null)) references.set(r.id, r);
  }
  for (const f of fields) register(f.id, 'field', f.file, null);
  const chapterById = new Map();
  const numbers = new Map();
  for (const c of chapters) {
    if (register(c.id, 'chapter', c.file, null)) chapterById.set(c.id, c);
    if (numbers.has(c.number)) {
      errors.push(issue('E04', c.file, null, `章番号 ${c.number} が重複している(${numbers.get(c.number)} と同じ)`));
    } else numbers.set(c.number, c.file);
    if (c.lineId && !lineById.has(c.lineId)) {
      errors.push(issue('E05', c.file, 1, `line の参照先 ${c.lineId} が路線ファイルにない`));
    }
  }
  /** @type {import('./schema.js').PlannedChapter[]} */
  const planned = [];
  /** 未執筆の駅 → 書いた requires @type {Map<object, string[]>} */
  const declared = new Map();
  for (const l of lines) {
    for (const pc of l.planned ?? []) {
      if (numbers.has(pc.number)) {
        errors.push(
          issue(
            'E04',
            input.linesFile,
            null,
            `planned の章番号 ${pc.number}(${pc.title})が重複している(${numbers.get(pc.number)} と同じ)`,
          ),
        );
      } else {
        numbers.set(pc.number, `${input.linesFile} の planned`);
        const copy = {
          ...pc,
          stations: pc.stations.map((st) => ({ name: st.name, requires: /** @type {string[]} */ ([]) })),
        };
        copy.stations.forEach((st, i) => declared.set(st, pc.stations[i].requires));
        planned.push(copy);
      }
    }
  }
  planned.sort((a, b) => a.number - b.number);

  // 駅(読む順)
  /** @type {StationInfo[]} */
  const stations = [];
  /** @type {Map<string, StationInfo>} */
  const stationById = new Map();
  /** @type {Map<string, DefinitionInfo>} */
  const definitions = new Map();
  const theorems = new Map();
  for (const c of chapters) {
    for (const st of c.stations) {
      if (st.id === null) continue;
      if (!register(st.id, 'station', c.file, st.line)) continue;
      /** @type {StationInfo} */
      const info = {
        id: st.id,
        name: st.name,
        chapter: c,
        model: st,
        lineId: c.lineId,
        index: stations.length,
        requires: [],
        code: '?',
      };
      stations.push(info);
      stationById.set(st.id, info);
    }
  }
  for (const info of stations) {
    const c = info.chapter;
    for (const d of info.model.definitions) {
      if (d.id === null) continue;
      if (d.id !== info.id && !register(d.id, 'definition', c.file, d.line)) continue;
      if (d.id === info.id && definitions.has(d.id)) continue;
      definitions.set(d.id, {
        id: d.id,
        name: d.attrs.name ?? '',
        en: d.attrs.en ?? '',
        aliases: d.attrs.aliases
          ? d.attrs.aliases
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        block: d,
        station: info,
      });
    }
    for (const t of info.model.theorems) {
      if (t.id === null || !register(t.id, 'theorem', c.file, t.line)) continue;
      theorems.set(t.id, { id: t.id, name: t.attrs.name ?? '', station: info });
    }
    for (const a of info.model.applications) if (a.id !== null) register(a.id, 'application', c.file, a.line);
  }
  for (const c of chapters) {
    for (const eq of c.equations) if (eq.id !== null) register(eq.id, 'equation', c.file, eq.line);
    for (const f of c.figures) if (f.id !== null) register(f.id, 'figure', c.file, f.line);
  }

  // requires
  for (const info of stations) {
    for (const r of info.model.requires) {
      const kind = kinds.get(r);
      const file = info.chapter.file;
      if (!kind) {
        errors.push(issue('E05', file, info.model.line, `駅 ${info.id} の requires の参照先 ${r} がない`));
        continue;
      }
      if (kind !== 'station') {
        errors.push(
          issue('E05', file, info.model.line, `駅 ${info.id} の requires の ${r} は駅ではない(${KIND_NAMES[kind]})`),
        );
        continue;
      }
      const target = /** @type {StationInfo} */ (stationById.get(r));
      if (target.index >= info.index) {
        errors.push(
          issue(
            'E06',
            file,
            info.model.line,
            `駅 ${info.id} の requires の ${r} は、読む順で後ろの駅${target === info ? '(自分自身)' : ''}を指している`,
          ),
        );
      }
      info.requires.push(r);
    }
  }
  // 未執筆の駅の requires(章に書いた requires は、最初の駅のもの)
  for (const pc of planned) {
    for (const [i, st] of pc.stations.entries()) {
      const where = `planned の第${pc.number}章(${pc.title})${i === 0 ? '' : `の駅「${st.name}」`}`;
      for (const r of declared.get(st) ?? []) {
        const kind = kinds.get(r);
        if (!kind) {
          errors.push(issue('E05', input.linesFile, null, `${where}の requires の参照先 ${r} がない`));
          continue;
        }
        if (kind !== 'station') {
          errors.push(
            issue('E05', input.linesFile, null, `${where}の requires の ${r} は駅ではない(${KIND_NAMES[kind]})`),
          );
          continue;
        }
        const target = /** @type {StationInfo} */ (stationById.get(r));
        if (target.chapter.number > pc.number) {
          errors.push(
            issue(
              'E06',
              input.linesFile,
              null,
              `${where}の requires の ${r} は、章番号の大きい第${target.chapter.number}章の駅を指している`,
            ),
          );
          continue;
        }
        st.requires.push(r);
      }
    }
  }
  for (const cycle of findCycles(stations, stationById)) {
    const head = /** @type {StationInfo} */ (stationById.get(cycle[0]));
    errors.push(
      issue('E06', head.chapter.file, head.model.line, `requires が循環している:${[...cycle, cycle[0]].join(' → ')}`),
    );
  }

  // 表示番号
  for (const l of lines) {
    let n = 0;
    for (const info of stations) {
      if (info.lineId === l.id) info.code = `${l.code}${String(++n).padStart(2, '0')}`;
    }
  }

  // field 属性と目標の参照先
  for (const c of chapters) {
    const blocks = [...c.head.goals, ...c.head.motivations, ...c.stations.flatMap((s) => s.applications)];
    for (const b of blocks) {
      if (b.field && !fieldById.has(b.field)) {
        errors.push(issue('E05', c.file, b.line, `field の参照先 ${b.field} が分野ファイルにない`));
      }
    }
  }
  for (const f of fields) {
    for (const g of f.goals) {
      const kind = kinds.get(g.station);
      if (!kind) errors.push(issue('E05', f.file, null, `goals の station ${g.station} がない`));
      else if (kind !== 'station') {
        errors.push(issue('E05', f.file, null, `goals の station ${g.station} は駅ではない(${KIND_NAMES[kind]})`));
      }
    }
  }

  /** @type {Site} */
  const site = {
    lines,
    lineById,
    fields,
    fieldById,
    fieldOrder,
    chapters,
    chapterById,
    stations,
    stationById,
    definitions,
    theorems,
    kinds,
    references,
    scope: new Map(),
    fieldChapters: new Map(),
    planned,
  };

  // 分野の範囲と章の順序
  for (const f of fields) {
    const goals = f.goals.map((g) => g.station).filter((id) => stationById.has(id));
    const scope = closure(site, goals);
    site.scope.set(f.id, scope);
    site.fieldChapters.set(
      f.id,
      chapters.filter((c) => c.stations.some((s) => s.id !== null && scope.has(s.id))),
    );
    // 第0章は分野に共通の章なので、N01 の対象にしない(content-format.md「分野版」)
    const missing = stations.filter(
      (s) => s.chapter.number !== 0 && scope.has(s.id) && !s.model.applications.some((a) => a.field === f.id),
    );
    if (missing.length > 0) {
      notices.push(
        issue(
          'N01',
          f.file,
          null,
          `${f.title}:分野での応用がない駅 ${missing.length}駅(${missing.map((s) => s.id).join('、')})`,
        ),
      );
    }
  }
  return { site, errors, notices };
}

/**
 * 駅の集合から requires をさかのぼって集める(起点を含む)。
 * Preconditions: ids は存在する駅の ID。
 * Postconditions: 起点と、そこからたどれる駅の ID の集合を返す。
 * Failure modes: なし(循環していても止まる)。
 * Side effects: なし。
 * @param {Site} site
 * @param {Iterable<string>} ids
 */
export function closure(site, ids) {
  const out = new Set();
  const stack = [...ids];
  while (stack.length > 0) {
    const id = /** @type {string} */ (stack.pop());
    if (out.has(id)) continue;
    const st = site.stationById.get(id);
    if (!st) continue;
    out.add(id);
    stack.push(...st.requires);
  }
  return out;
}

/**
 * requires の循環を、強連結成分として見つける(Tarjan の方法)。
 * @param {StationInfo[]} stations
 * @param {Map<string, StationInfo>} byId
 * @returns {string[][]} 循環ごとの駅 ID(読む順)
 */
function findCycles(stations, byId) {
  let counter = 0;
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  /** @param {string} v */
  const visit = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of byId.get(v)?.requires ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      const self = byId.get(v)?.requires.includes(v);
      if (comp.length > 1 || self) {
        comp.sort((a, b) => /** @type {any} */ (byId.get(a)).index - /** @type {any} */ (byId.get(b)).index);
        cycles.push(comp);
      }
    }
  };
  for (const s of stations) if (!index.has(s.id)) visit(s.id);
  return cycles.sort((a, b) => /** @type {any} */ (byId.get(a[0])).index - /** @type {any} */ (byId.get(b[0])).index);
}
