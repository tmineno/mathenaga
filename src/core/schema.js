// 路線ファイル・分野ファイル・front matter の項目の検査(docs/spec/content-format.md)。
// 入力は YAML を解釈した後の値。YAML の解釈そのものは src/io で行う。

import { idProblem } from './ids.js';
import { issue } from './issues.js';

const COLOR = /^#[0-9A-Fa-f]{6}$/;
const LINE_CODE = /^[A-Z]+$/;

/**
 * @typedef {object} Line
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} color
 * @property {string} colorDark
 * @property {'solid' | 'dotted'} style
 * @property {'up' | 'down' | 'right' | null} layout
 * @property {number} order  路線ファイルでの順
 * @property {PlannedChapter[]} planned  未執筆の章(書いた順)
 */

/**
 * @typedef {object} PlannedChapter  路線ファイルの planned に書いた、未執筆の章
 * @property {number} number   章番号
 * @property {string} title
 * @property {PlannedStation[]} stations  予定の駅(読む順)
 * @property {string} lineId
 */

/**
 * @typedef {object} PlannedStation  未執筆の章の予定の駅
 * @property {string} name
 * @property {string[]} requires  前提にする駅の ID(書いたまま。存在の検査は graph.js)。章に書いた requires は最初の駅のもの
 */

/**
 * @typedef {object} Goal
 * @property {string} station
 * @property {'final' | 'partial'} kind
 * @property {string} label
 */

/**
 * @typedef {object} Field
 * @property {string} id
 * @property {string} file
 * @property {string} title
 * @property {string} description
 * @property {Goal[]} goals
 */

/**
 * 路線ファイルを検査する。
 * Preconditions: data は lines.yml を解釈した値。
 * Postconditions: 正しく読めた路線を、ファイルの順に返す。
 * Failure modes: 誤りは errors に入れ、その路線は返さない(ID がある限りは返す)。
 * Side effects: なし。
 * @param {unknown} data
 * @param {string} file
 * @returns {{ lines: Line[], errors: import('./issues.js').Issue[] }}
 */
export function checkLines(data, file) {
  const errors = [];
  /** @type {Line[]} */
  const lines = [];
  if (!Array.isArray(data)) {
    errors.push(issue('E01', file, null, '路線ファイルは路線の配列で書く'));
    return { lines, errors };
  }
  const allowed = ['id', 'code', 'name', 'color', 'color_dark', 'style', 'layout', 'planned'];
  const codes = new Map();
  data.forEach((item, index) => {
    const where = `${index + 1}番目の路線`;
    if (!isObject(item)) {
      errors.push(issue('E01', file, null, `${where}が項目の組になっていない`));
      return;
    }
    unknownKeys(item, allowed, file, where, errors);
    for (const key of ['id', 'code', 'name', 'color']) {
      if (!nonEmptyString(item[key])) errors.push(issue('E08', file, null, `${where}に ${key} がない`));
    }
    if (nonEmptyString(item.id)) {
      const p = idProblem(item.id);
      if (p) errors.push(issue('E03', file, null, p));
    }
    if (nonEmptyString(item.code) && !LINE_CODE.test(item.code)) {
      errors.push(issue('E03', file, null, `${where}の code「${item.code}」は英大文字で書く`));
    }
    if (nonEmptyString(item.code)) {
      if (codes.has(item.code)) {
        errors.push(
          issue('E04', file, null, `路線記号 ${item.code} が重複している(${codes.get(item.code)} と ${item.id})`),
        );
      } else codes.set(item.code, item.id);
    }
    for (const key of ['color', 'color_dark']) {
      if (item[key] !== undefined && !(typeof item[key] === 'string' && COLOR.test(item[key]))) {
        errors.push(issue('E03', file, null, `${where}の ${key}「${item[key]}」は #RRGGBB で書く`));
      }
    }
    if (item.style !== undefined && item.style !== 'solid' && item.style !== 'dotted') {
      errors.push(issue('E02', file, null, `${where}の style「${item.style}」は solid か dotted`));
    }
    if (item.layout !== undefined && !['up', 'down', 'right'].includes(item.layout)) {
      errors.push(issue('E02', file, null, `${where}の layout「${item.layout}」は up・down・right のどれか`));
    }
    const planned = nonEmptyString(item.id) ? checkPlanned(item.planned, item.id, file, where, errors) : [];
    if (!nonEmptyString(item.id)) return;
    lines.push({
      id: item.id,
      code: typeof item.code === 'string' ? item.code : '?',
      name: typeof item.name === 'string' ? item.name : item.id,
      color: typeof item.color === 'string' && COLOR.test(item.color) ? item.color : '#888888',
      colorDark:
        typeof item.color_dark === 'string' && COLOR.test(item.color_dark)
          ? item.color_dark
          : typeof item.color === 'string' && COLOR.test(item.color)
            ? item.color
            : '#888888',
      style: item.style === 'dotted' ? 'dotted' : 'solid',
      layout: ['up', 'down', 'right'].includes(item.layout) ? item.layout : null,
      order: index,
      planned,
    });
  });
  if (lines.length > 0 && !lines.some((l) => l.layout === null)) {
    errors.push(issue('E08', file, null, '幹線(layout を書かない路線)が1つもない'));
  }
  return { lines, errors };
}

/**
 * 路線の planned(未執筆の章)を検査する。
 * @param {unknown} value
 * @param {string} lineId
 * @param {string} file
 * @param {string} where
 * @param {import('./issues.js').Issue[]} errors
 * @returns {PlannedChapter[]}
 */
function checkPlanned(value, lineId, file, where, errors) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(issue('E03', file, null, `${where}の planned は章の配列で書く`));
    return [];
  }
  /** @type {PlannedChapter[]} */
  const out = [];
  value.forEach((item, j) => {
    const w = `${where}の planned の${j + 1}番目`;
    if (!isObject(item)) {
      errors.push(issue('E01', file, null, `${w}が項目の組になっていない`));
      return;
    }
    unknownKeys(item, ['chapter', 'title', 'stations', 'requires'], file, w, errors);
    let ok = true;
    for (const key of ['chapter', 'title', 'stations']) {
      if (item[key] === undefined || item[key] === null) {
        errors.push(issue('E08', file, null, `${w}に ${key} がない`));
        ok = false;
      }
    }
    if (item.chapter !== undefined && item.chapter !== null && !(Number.isInteger(item.chapter) && item.chapter >= 0)) {
      errors.push(issue('E03', file, null, `${w}の chapter「${item.chapter}」は 0 以上の整数で書く`));
      ok = false;
    }
    if (item.title !== undefined && item.title !== null && !nonEmptyString(item.title)) {
      errors.push(issue('E03', file, null, `${w}の title は文字列で書く`));
      ok = false;
    }
    const strings = (/** @type {unknown} */ v) => Array.isArray(v) && v.every((x) => nonEmptyString(x));
    /** @type {PlannedStation[]} */
    const stations = [];
    if (item.stations !== undefined && item.stations !== null) {
      if (!Array.isArray(item.stations) || item.stations.length === 0) {
        errors.push(issue('E03', file, null, `${w}の stations は駅の配列で、1つ以上書く`));
        ok = false;
      } else {
        item.stations.forEach((/** @type {unknown} */ st, k) => {
          const ws = `${w}の stations の${k + 1}番目`;
          if (nonEmptyString(st)) {
            stations.push({ name: st.trim(), requires: [] });
            return;
          }
          if (!isObject(st) || !nonEmptyString(st.name)) {
            errors.push(issue('E03', file, null, `${ws}は、駅名か、name を持つ項目で書く`));
            ok = false;
            return;
          }
          unknownKeys(st, ['name', 'requires'], file, ws, errors);
          if (st.requires !== undefined && !strings(st.requires)) {
            errors.push(issue('E03', file, null, `${ws}の requires は駅の ID の配列で書く`));
            ok = false;
            return;
          }
          stations.push({ name: st.name.trim(), requires: /** @type {string[]} */ (st.requires ?? []) });
        });
      }
    }
    if (item.requires !== undefined && !strings(item.requires)) {
      errors.push(issue('E03', file, null, `${w}の requires は駅の ID の配列で書く`));
      ok = false;
    }
    // 章の requires は最初の駅の requires。両方に書くと、どちらを使うか決まらない
    const first = Array.isArray(item.stations) ? item.stations[0] : undefined;
    if (item.requires !== undefined && isObject(first) && first.requires !== undefined) {
      errors.push(issue('E09', file, null, `${w}の requires と、stations の最初の駅の requires の両方が書かれている`));
      ok = false;
    }
    if (!ok) return;
    if (item.requires !== undefined) stations[0].requires = item.requires;
    out.push({
      number: item.chapter,
      title: item.title,
      stations,
      lineId,
    });
  });
  return out;
}

/**
 * 分野ファイルを検査する。
 * Preconditions: data は fields/<id>.yml を解釈した値、id はファイル名から拡張子を除いたもの。
 * Postconditions: 分野を返す。誤りは errors に入れる。
 * Failure modes: 項目の組でなければ field は null。
 * Side effects: なし。
 * @param {unknown} data
 * @param {string} id
 * @param {string} file
 * @returns {{ field: Field | null, errors: import('./issues.js').Issue[] }}
 */
export function checkField(data, id, file) {
  const errors = [];
  const p = idProblem(id);
  if (p) errors.push(issue('E03', file, null, `分野ファイル名:${p}`));
  if (!isObject(data)) {
    errors.push(issue('E01', file, null, '分野ファイルは項目の組で書く'));
    return { field: null, errors };
  }
  unknownKeys(data, ['title', 'description', 'goals'], file, '分野ファイル', errors);
  for (const key of ['title', 'description']) {
    if (!nonEmptyString(data[key])) errors.push(issue('E08', file, null, `${key} がない`));
  }
  /** @type {Goal[]} */
  const goals = [];
  if (!Array.isArray(data.goals) || data.goals.length === 0) {
    errors.push(issue('E08', file, null, 'goals がない(目標を1つ以上書く)'));
  } else {
    const seen = new Set();
    data.goals.forEach((g, index) => {
      const where = `goals の${index + 1}番目`;
      if (!isObject(g)) {
        errors.push(issue('E01', file, null, `${where}が項目の組になっていない`));
        return;
      }
      unknownKeys(g, ['station', 'kind', 'label'], file, where, errors);
      for (const key of ['station', 'kind', 'label']) {
        if (!nonEmptyString(g[key])) errors.push(issue('E08', file, null, `${where}に ${key} がない`));
      }
      if (g.kind !== undefined && g.kind !== 'final' && g.kind !== 'partial') {
        errors.push(issue('E02', file, null, `${where}の kind「${g.kind}」は final か partial`));
      }
      if (nonEmptyString(g.station)) {
        if (seen.has(g.station)) errors.push(issue('E04', file, null, `goals に駅 ${g.station} が2回ある`));
        seen.add(g.station);
        goals.push({
          station: g.station,
          kind: g.kind === 'partial' ? 'partial' : 'final',
          label: typeof g.label === 'string' ? g.label.trim() : '',
        });
      }
    });
    if (!data.goals.some((g) => isObject(g) && g.kind === 'final')) {
      errors.push(issue('E08', file, null, 'kind が final の目標(終着駅)がない'));
    }
  }
  return {
    field: {
      id,
      file,
      title: typeof data.title === 'string' ? data.title : id,
      description: typeof data.description === 'string' ? joinJapaneseLines(data.description) : '',
      goals,
    },
    errors,
  };
}

/**
 * 章の front matter を検査する。
 * Preconditions: data は front matter を解釈した値(front matter がなければ undefined)。
 * Postconditions: title・subtitle・line を返す。誤りは errors に入れる。
 * Failure modes: なし(足りない値は空文字にする)。
 * Side effects: なし。
 * @param {unknown} data
 * @param {string} file
 */
export function checkFrontMatter(data, file) {
  const errors = [];
  const obj = isObject(data) ? data : {};
  if (data !== undefined && data !== null && !isObject(data)) {
    errors.push(issue('E01', file, 1, 'front matter は項目の組で書く'));
  }
  unknownKeys(obj, ['title', 'subtitle', 'line'], file, 'front matter', errors, 1);
  for (const key of ['title', 'line']) {
    if (!nonEmptyString(obj[key])) errors.push(issue('E08', file, 1, `front matter に ${key} がない`));
  }
  if (obj.subtitle !== undefined && typeof obj.subtitle !== 'string') {
    errors.push(issue('E03', file, 1, 'subtitle は文字列で書く'));
  }
  return {
    title: typeof obj.title === 'string' ? obj.title.trim() : '',
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle.trim() : null,
    lineId: typeof obj.line === 'string' ? obj.line : '',
    errors,
  };
}

/**
 * YAML の折り返し(>)が行をつなぐときに入れた空白のうち、全角の文字どうしの間のものを取り除く。
 * @param {string} s
 */
export function joinJapaneseLines(s) {
  return s.trim().replace(/([\u3000-\u9fff\uff00-\uffef])[ \n]+(?=[\u3000-\u9fff\uff00-\uffef])/g, '$1');
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {v is string} */
function nonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * @param {Record<string, any>} obj
 * @param {string[]} allowed
 * @param {string} file
 * @param {string} where
 * @param {import('./issues.js').Issue[]} errors
 * @param {number | null} [line]
 */
function unknownKeys(obj, allowed, file, where, errors, line = null) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(issue('E02', file, line, `${where}に知らない項目 ${key} がある`));
  }
}
