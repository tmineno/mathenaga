// 参照 [[キー]]・[[キー|文字]]・[[@ID]] の解決(docs/spec/content-format.md「参照」)。

import { closure, KIND_NAMES } from './graph.js';
import { issue } from './issues.js';

/**
 * @typedef {object} Resolution
 * @property {'definition' | 'theorem' | 'station' | 'chapter' | 'equation'} kind
 * @property {string} id
 * @property {string} text      表示する文字
 * @property {string} chapterId 参照先がある章の ID
 */

/**
 * すべての章の参照を解決する。
 * Preconditions: site は buildSite の結果、equations は numberEquations の byId、statements は numberStatements の byId。
 * Postconditions: 参照のトークン → Resolution を返す。解決できない参照はエラー(E05、E07)にする。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} equations
 * @param {Map<string, { label: string, kind: 'definition' | 'theorem', chapter: import('./chapter.js').ChapterModel }>} statements
 * @returns {{ resolved: Map<any, Resolution>, errors: import('./issues.js').Issue[] }}
 */
export function resolveRefs(site, equations, statements) {
  const errors = [];
  /** @type {Map<any, Resolution>} */
  const resolved = new Map();
  const names = nameIndex(site);
  for (const chapter of site.chapters) {
    const scope = closure(
      site,
      chapter.stations.map((s) => s.id).filter((id) => id !== null && site.stationById.has(id)),
    );
    for (const ref of chapter.refs) {
      const { at, key, label } = ref.token.meta;
      /** @param {string} code @param {string} msg */
      const fail = (code, msg) => errors.push(issue(code, chapter.file, ref.line, msg));
      if (key === '') {
        fail('E05', `参照 [[${ref.token.content}]] にキーがない`);
        continue;
      }
      if (at) {
        if (label !== null) {
          fail('E05', `[[@${key}]] では表示する文字を変えられない`);
          continue;
        }
        const r = resolveNumber(site, equations, statements, key);
        if (typeof r === 'string') fail('E05', r);
        else resolved.set(ref.token, r);
        continue;
      }
      const r = resolveKey(site, names, scope, key, label);
      if (typeof r === 'string') fail(r.startsWith('E07') ? 'E07' : 'E05', r.replace(/^E0[57] /, ''));
      else resolved.set(ref.token, r);
    }
  }
  return { resolved, errors };
}

/**
 * @param {import('./graph.js').Site} site
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} equations
 * @param {Map<string, { label: string, kind: 'definition' | 'theorem', chapter: import('./chapter.js').ChapterModel }>} statements
 * @param {string} id
 * @returns {Resolution | string}
 */
function resolveNumber(site, equations, statements, id) {
  const kind = site.kinds.get(id);
  if (!kind) return `[[@${id}]] の参照先 ${id} がない`;
  if (kind === 'station') {
    const st = /** @type {any} */ (site.stationById.get(id));
    return { kind: 'station', id, text: st.code, chapterId: st.chapter.id };
  }
  if (kind === 'chapter') {
    const c = /** @type {any} */ (site.chapterById.get(id));
    return { kind: 'chapter', id, text: `第${c.number}章`, chapterId: id };
  }
  if (kind === 'equation') {
    const eq = equations.get(id);
    if (!eq) return `[[@${id}]] の式に番号がない`;
    return { kind: 'equation', id, text: `(${eq.label})`, chapterId: eq.chapter.id };
  }
  const s = statements.get(id);
  if (s && s.kind === kind) {
    return { kind: s.kind, id, text: `${KIND_NAMES[s.kind]} ${s.label}`, chapterId: s.chapter.id };
  }
  return `[[@${id}]] の ${id} は${KIND_NAMES[kind]}の ID なので番号を差し込めない(駅・章・式・定理・定義だけ)`;
}

/**
 * @param {import('./graph.js').Site} site
 * @param {Map<string, Array<{ id: string, kind: 'definition' | 'station', stationId: string }>>} names
 * @param {Set<string>} scope
 * @param {string} key
 * @param {string | null} label
 * @returns {Resolution | string}
 */
function resolveKey(site, names, scope, key, label) {
  const def = site.definitions.get(key);
  if (def) return { kind: 'definition', id: key, text: label ?? def.name, chapterId: def.station.chapter.id };
  const st = site.stationById.get(key);
  if (st) return { kind: 'station', id: key, text: label ?? st.name, chapterId: st.chapter.id };
  const kind = site.kinds.get(key);
  if (kind) {
    const hint = kind === 'chapter' || kind === 'equation' ? `。${KIND_NAMES[kind]}は [[@${key}]] で指す` : '';
    return `E05 [[${key}]] の ${key} は${KIND_NAMES[kind]}の ID で、[[…]] では指せない${hint}`;
  }
  const all = names.get(key) ?? [];
  /** @type {Map<string, { id: string, kind: 'definition' | 'station', stationId: string }>} */
  const candidates = new Map();
  for (const c of all) {
    if (!scope.has(c.stationId)) continue;
    const prev = candidates.get(c.id);
    if (!prev || c.kind === 'definition') candidates.set(c.id, c);
  }
  if (candidates.size === 0) {
    const outside = [...new Set(all.map((c) => c.id))];
    const hint = outside.length > 0 ? `。参照範囲の外に候補がある(${outside.join('、')})。ID で書く` : '';
    return `E07 [[${key}]] の候補が参照範囲にない${hint}`;
  }
  if (candidates.size > 1) {
    return `E07 [[${key}]] の候補が2つ以上ある(${[...candidates.keys()].join('、')})。ID で書く`;
  }
  const only = [...candidates.values()][0];
  if (only.kind === 'definition') {
    const d = /** @type {any} */ (site.definitions.get(only.id));
    return { kind: 'definition', id: only.id, text: label ?? key, chapterId: d.station.chapter.id };
  }
  const s = /** @type {any} */ (site.stationById.get(only.id));
  return { kind: 'station', id: only.id, text: label ?? key, chapterId: s.chapter.id };
}

/**
 * 名前・別名・駅名 → 候補の一覧。
 * @param {import('./graph.js').Site} site
 */
function nameIndex(site) {
  /** @type {Map<string, Array<{ id: string, kind: 'definition' | 'station', stationId: string }>>} */
  const names = new Map();
  /** @param {string} name @param {{ id: string, kind: 'definition' | 'station', stationId: string }} entry */
  const add = (name, entry) => {
    if (!name) return;
    if (!names.has(name)) names.set(name, []);
    /** @type {any[]} */ (names.get(name)).push(entry);
  };
  for (const st of site.stations) add(st.name, { id: st.id, kind: 'station', stationId: st.id });
  for (const d of site.definitions.values()) {
    const entry = { id: d.id, kind: /** @type {'definition'} */ ('definition'), stationId: d.station.id };
    add(d.name, entry);
    for (const a of d.aliases) add(a, entry);
  }
  return names;
}
