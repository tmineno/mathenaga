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
 * @property {boolean} start  始発の路線(route-map.md「始発の路線」)。layout が up か down の路線だけ
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
    errors.push(issue('E01', file, null, 'the lines file must be an array of lines'));
    return { lines, errors };
  }
  const allowed = ['id', 'code', 'name', 'color', 'color_dark', 'style', 'layout', 'start', 'planned'];
  const codes = new Map();
  data.forEach((item, index) => {
    const where = `line #${index + 1}`;
    if (!isObject(item)) {
      errors.push(issue('E01', file, null, `${where} is not a mapping`));
      return;
    }
    unknownKeys(item, allowed, file, where, errors);
    for (const key of ['id', 'code', 'name', 'color']) {
      if (!nonEmptyString(item[key])) errors.push(issue('E08', file, null, `${where} has no ${key}`));
    }
    if (nonEmptyString(item.id)) {
      const p = idProblem(item.id);
      if (p) errors.push(issue('E03', file, null, p));
    }
    if (nonEmptyString(item.code) && !LINE_CODE.test(item.code)) {
      errors.push(issue('E03', file, null, `${where}: code "${item.code}" must be upper-case letters`));
    }
    if (nonEmptyString(item.code)) {
      if (codes.has(item.code)) {
        errors.push(
          issue('E04', file, null, `line code ${item.code} is duplicated (${codes.get(item.code)} and ${item.id})`),
        );
      } else codes.set(item.code, item.id);
    }
    for (const key of ['color', 'color_dark']) {
      if (item[key] !== undefined && !(typeof item[key] === 'string' && COLOR.test(item[key]))) {
        errors.push(issue('E03', file, null, `${where}: ${key} "${item[key]}" must be #RRGGBB`));
      }
    }
    if (item.style !== undefined && item.style !== 'solid' && item.style !== 'dotted') {
      errors.push(issue('E02', file, null, `${where}: style "${item.style}" must be solid or dotted`));
    }
    if (item.layout !== undefined && !['up', 'down', 'right'].includes(item.layout)) {
      errors.push(issue('E02', file, null, `${where}: layout "${item.layout}" must be one of up, down, right`));
    }
    if (item.start !== undefined && typeof item.start !== 'boolean') {
      errors.push(issue('E03', file, null, `${where}: start "${item.start}" must be true or false`));
    } else if (item.start === true && item.layout !== 'up' && item.layout !== 'down') {
      errors.push(issue('E03', file, null, `${where}: start is true, so layout must be up or down`));
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
      start: item.start === true && (item.layout === 'up' || item.layout === 'down'),
      order: index,
      planned,
    });
  });
  if (lines.length > 0 && !lines.some((l) => l.layout === null)) {
    errors.push(issue('E08', file, null, 'no trunk line (a line without layout)'));
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
    errors.push(issue('E03', file, null, `${where}: planned must be an array of chapters`));
    return [];
  }
  /** @type {PlannedChapter[]} */
  const out = [];
  value.forEach((item, j) => {
    const w = `${where}, planned #${j + 1}`;
    if (!isObject(item)) {
      errors.push(issue('E01', file, null, `${w} is not a mapping`));
      return;
    }
    unknownKeys(item, ['chapter', 'title', 'stations', 'requires'], file, w, errors);
    let ok = true;
    for (const key of ['chapter', 'title', 'stations']) {
      if (item[key] === undefined || item[key] === null) {
        errors.push(issue('E08', file, null, `${w} has no ${key}`));
        ok = false;
      }
    }
    if (item.chapter !== undefined && item.chapter !== null && !(Number.isInteger(item.chapter) && item.chapter >= 0)) {
      errors.push(issue('E03', file, null, `${w}: chapter "${item.chapter}" must be an integer of 0 or more`));
      ok = false;
    }
    if (item.title !== undefined && item.title !== null && !nonEmptyString(item.title)) {
      errors.push(issue('E03', file, null, `${w}: title must be a string`));
      ok = false;
    }
    const strings = (/** @type {unknown} */ v) => Array.isArray(v) && v.every((x) => nonEmptyString(x));
    /** @type {PlannedStation[]} */
    const stations = [];
    if (item.stations !== undefined && item.stations !== null) {
      if (!Array.isArray(item.stations) || item.stations.length === 0) {
        errors.push(issue('E03', file, null, `${w}: stations must be an array of stations (at least one)`));
        ok = false;
      } else {
        item.stations.forEach((/** @type {unknown} */ st, k) => {
          const ws = `${w}, stations #${k + 1}`;
          if (nonEmptyString(st)) {
            stations.push({ name: st.trim(), requires: [] });
            return;
          }
          if (!isObject(st) || !nonEmptyString(st.name)) {
            errors.push(issue('E03', file, null, `${ws} must be a station name or a mapping with name`));
            ok = false;
            return;
          }
          unknownKeys(st, ['name', 'requires'], file, ws, errors);
          if (st.requires !== undefined && !strings(st.requires)) {
            errors.push(issue('E03', file, null, `${ws}: requires must be an array of station IDs`));
            ok = false;
            return;
          }
          stations.push({ name: st.name.trim(), requires: /** @type {string[]} */ (st.requires ?? []) });
        });
      }
    }
    if (item.requires !== undefined && !strings(item.requires)) {
      errors.push(issue('E03', file, null, `${w}: requires must be an array of station IDs`));
      ok = false;
    }
    // 章の requires は最初の駅の requires。両方に書くと、どちらを使うか決まらない
    const first = Array.isArray(item.stations) ? item.stations[0] : undefined;
    if (item.requires !== undefined && isObject(first) && first.requires !== undefined) {
      errors.push(issue('E09', file, null, `${w}: requires is given both on the chapter and on its first station`));
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
 * @typedef {object} SiteConfig  サイトの設定(content-format.md「サイトの設定」、ADR-009)
 * @property {string} name           サイト名
 * @property {string} lang           ページの言語(言語ごとの処理の ID)
 * @property {string} storagePrefix  ブラウザに保存するキーの接頭辞
 * @property {string} fonts          書体の CSS の URL。空なら書体を読み込まない
 * @property {string} repoBranch     原稿のファイルの URL に使うブランチ名
 * @property {Record<string, string>} messages  上書きする文言
 */

const STORAGE_PREFIX = /^[a-z][a-z0-9-]*$/;
const FONTS_ORIGIN = 'https://fonts.googleapis.com/';
const BRANCH = /^[A-Za-z0-9._/-]+$/;
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/**
 * サイトの設定を検査する。
 * Preconditions: data は site.yml を解釈した値。dictionaries は言語の ID → その言語の文言の辞書。
 * Postconditions: 設定を返す。誤りは errors に入れる。誤りがあっても、読めた項目で設定を作る。
 * Failure modes: 項目の組でなければ site は null。
 * Side effects: なし。
 * @param {unknown} data
 * @param {string} file
 * @param {Record<string, Record<string, string>>} dictionaries
 * @returns {{ site: SiteConfig | null, errors: import('./issues.js').Issue[] }}
 */
export function checkSite(data, file, dictionaries) {
  const errors = [];
  if (!isObject(data)) {
    errors.push(issue('E01', file, null, 'site.yml must be a mapping of keys to values'));
    return { site: null, errors };
  }
  unknownKeys(data, ['name', 'lang', 'storage_prefix', 'fonts', 'repo_branch', 'messages'], file, 'site.yml', errors);
  for (const key of ['name', 'lang', 'storage_prefix']) {
    if (data[key] === undefined || data[key] === null) errors.push(issue('E08', file, null, `${key} is missing`));
  }
  if (data.name !== undefined && data.name !== null && !nonEmptyString(data.name)) {
    errors.push(issue('E03', file, null, 'name must be a non-empty string'));
  }
  const lang = typeof data.lang === 'string' ? data.lang : '';
  const dictionary = Object.hasOwn(dictionaries, lang) ? dictionaries[lang] : null;
  if (data.lang !== undefined && data.lang !== null && !dictionary) {
    errors.push(
      issue(
        'E02',
        file,
        null,
        `lang "${data.lang}" has no language processing (available: ${Object.keys(dictionaries).join(', ')})`,
      ),
    );
  }
  const prefix = data.storage_prefix;
  if (prefix !== undefined && prefix !== null && !(typeof prefix === 'string' && STORAGE_PREFIX.test(prefix))) {
    errors.push(issue('E03', file, null, `storage_prefix "${prefix}" must start with a-z and use only a-z, 0-9 and -`));
  }
  const fonts = data.fonts;
  if (fonts !== undefined && fonts !== null && !(typeof fonts === 'string' && fonts.startsWith(FONTS_ORIGIN))) {
    errors.push(issue('E03', file, null, `fonts "${fonts}" must start with ${FONTS_ORIGIN}`));
  }
  const branch = data.repo_branch;
  if (branch !== undefined && branch !== null && !(typeof branch === 'string' && BRANCH.test(branch))) {
    errors.push(issue('E03', file, null, `repo_branch "${branch}" must be a branch name`));
  }
  /** @type {Record<string, string>} */
  const messages = {};
  if (data.messages !== undefined && data.messages !== null) {
    if (!isObject(data.messages))
      errors.push(issue('E03', file, null, 'messages must be a mapping of keys to strings'));
    else {
      for (const [key, value] of Object.entries(data.messages)) {
        if (dictionary && !Object.hasOwn(dictionary, key)) {
          errors.push(issue('E02', file, null, `messages: "${key}" is not a message of lang "${lang}"`));
          continue;
        }
        if (typeof value !== 'string') {
          errors.push(issue('E03', file, null, `messages: "${key}" must be a string`));
          continue;
        }
        if (dictionary) {
          const allowed = new Set([...dictionary[key].matchAll(PLACEHOLDER)].map((m) => m[1]));
          const extra = [...value.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((n) => !allowed.has(n));
          if (extra.length > 0) {
            errors.push(
              issue(
                'E03',
                file,
                null,
                `messages: "${key}" uses {${extra.join('}, {')}}, which the message does not have`,
              ),
            );
            continue;
          }
        }
        messages[key] = value;
      }
    }
  }
  return {
    site: {
      name: typeof data.name === 'string' ? data.name.trim() : '',
      lang,
      storagePrefix: typeof prefix === 'string' ? prefix : '',
      fonts: typeof fonts === 'string' ? fonts : '',
      repoBranch: typeof branch === 'string' ? branch : 'main',
      messages,
    },
    errors,
  };
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
  if (p) errors.push(issue('E03', file, null, `field file name: ${p}`));
  if (!isObject(data)) {
    errors.push(issue('E01', file, null, 'the field file must be a mapping'));
    return { field: null, errors };
  }
  unknownKeys(data, ['title', 'description', 'goals'], file, 'field file', errors);
  for (const key of ['title', 'description']) {
    if (!nonEmptyString(data[key])) errors.push(issue('E08', file, null, `${key} is missing`));
  }
  /** @type {Goal[]} */
  const goals = [];
  if (!Array.isArray(data.goals) || data.goals.length === 0) {
    errors.push(issue('E08', file, null, 'goals is missing (give at least one goal)'));
  } else {
    const seen = new Set();
    data.goals.forEach((g, index) => {
      const where = `goals #${index + 1}`;
      if (!isObject(g)) {
        errors.push(issue('E01', file, null, `${where} is not a mapping`));
        return;
      }
      unknownKeys(g, ['station', 'kind', 'label'], file, where, errors);
      for (const key of ['station', 'kind', 'label']) {
        if (!nonEmptyString(g[key])) errors.push(issue('E08', file, null, `${where} has no ${key}`));
      }
      if (g.kind !== undefined && g.kind !== 'final' && g.kind !== 'partial') {
        errors.push(issue('E02', file, null, `${where}: kind "${g.kind}" must be final or partial`));
      }
      if (nonEmptyString(g.station)) {
        if (seen.has(g.station)) errors.push(issue('E04', file, null, `station ${g.station} appears twice in goals`));
        seen.add(g.station);
        goals.push({
          station: g.station,
          kind: g.kind === 'partial' ? 'partial' : 'final',
          label: typeof g.label === 'string' ? g.label.trim() : '',
        });
      }
    });
    if (!data.goals.some((g) => isObject(g) && g.kind === 'final')) {
      errors.push(issue('E08', file, null, 'no goal with kind final (final goal)'));
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
    errors.push(issue('E01', file, 1, 'front matter must be a mapping'));
  }
  unknownKeys(obj, ['title', 'subtitle', 'line'], file, 'front matter', errors, 1);
  for (const key of ['title', 'line']) {
    if (!nonEmptyString(obj[key])) errors.push(issue('E08', file, 1, `front matter has no ${key}`));
  }
  if (obj.subtitle !== undefined && typeof obj.subtitle !== 'string') {
    errors.push(issue('E03', file, 1, 'subtitle must be a string'));
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
    if (!allowed.includes(key)) errors.push(issue('E02', file, line, `${where} has unknown key ${key}`));
  }
}
