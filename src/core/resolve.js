// 参照 [[キー]]・[[キー|文字]]・[[@ID]] の解決(docs/spec/content-format.md「参照」)。

import { closure, KIND_NAMES } from './graph.js';
import { DEF_PREFIX } from './ids.js';
import { issue } from './issues.js';

/**
 * @typedef {object} Resolution
 * @property {'definition' | 'theorem' | 'station' | 'chapter' | 'equation' | 'figure' | 'application' | 'reference'} kind
 * @property {string} id
 * @property {string} text      表示する文字
 * @property {string} chapterId 参照先がある章の ID
 */

/**
 * すべての章の参照を解決する。
 * Preconditions: site は buildSite の結果、equations は numberEquations の byId、statements は numberStatements の byId、
 *   figures は numberFigures の byId。citations は numberCitations の結果(章の ID → 文献の ID → 文献番号)。
 * Postconditions: 参照のトークン → Resolution を返す。解決できない参照はエラー(E05、E07)にする。
 *   文献の引用は、引いた章の文献番号「[N]」になり、参照先はその章(参考文献の項目)にする。
 *   definition の本文の中の文献の引用は E14 にする。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} equations
 * @param {Map<string, { label: string, kind: 'definition' | 'theorem', chapter: import('./chapter.js').ChapterModel }>} statements
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} figures
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} applications
 * @param {Map<string, Map<string, number>>} [citations]
 * @returns {{ resolved: Map<any, Resolution>, errors: import('./issues.js').Issue[] }}
 */
export function resolveRefs(site, equations, statements, figures, applications, citations = new Map()) {
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
        if (site.kinds.get(key) === 'reference') {
          if (ref.inDefinition) {
            fail('E14', `definition の本文には文献の引用 [[@${key}]] を書けない(定義はほかの章のポップアップにも出る)`);
            continue;
          }
          const n = citations.get(chapter.id)?.get(key);
          if (n === undefined) fail('E05', `[[@${key}]] の文献に番号がない`);
          else resolved.set(ref.token, { kind: 'reference', id: key, text: `[${n}]`, chapterId: chapter.id });
          continue;
        }
        const r = resolveNumber(site, equations, statements, figures, applications, key);
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
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} figures
 * @param {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} applications
 * @param {string} id
 * @returns {Resolution | string}
 */
function resolveNumber(site, equations, statements, figures, applications, id) {
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
  if (kind === 'figure') {
    const f = figures.get(id);
    if (!f) return `[[@${id}]] の図に番号がない`;
    return { kind: 'figure', id, text: `図 ${f.label}`, chapterId: f.chapter.id };
  }
  if (kind === 'application') {
    const a = applications.get(id);
    if (!a) return `[[@${id}]] の応用に番号がない`;
    return { kind: 'application', id, text: `応用 ${a.label}`, chapterId: a.chapter.id };
  }
  const s = statements.get(id);
  if (s && s.kind === kind) {
    return { kind: s.kind, id, text: `${KIND_NAMES[s.kind]} ${s.label}`, chapterId: s.chapter.id };
  }
  return `[[@${id}]] の ${id} は${KIND_NAMES[kind]}の ID なので番号を差し込めない(駅・章・式・定理・定義・図・応用・文献だけ)`;
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
    const hint =
      kind === 'chapter' || kind === 'equation' || kind === 'figure' || kind === 'application' || kind === 'reference'
        ? `。${KIND_NAMES[kind]}は [[@${key}]] で指す`
        : '';
    return `E05 [[${key}]] の ${key} は${KIND_NAMES[kind]}の ID で、[[…]] では指せない${hint}`;
  }
  const all = names.get(key) ?? [];
  /** @type {Map<string, { id: string, kind: 'definition' | 'station', stationId: string }>} */
  const candidates = new Map();
  for (const c of all) {
    if (!scope.has(c.stationId)) continue;
    const k = candidateKey(site, c);
    const prev = candidates.get(k);
    if (!prev || c.kind === 'definition') candidates.set(k, c);
  }
  if (candidates.size === 0) {
    const outside = [...new Set(all.map((c) => candidateKey(site, c)))];
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
 * 名前で探した候補を数えるときのキー。駅と、その駅の中の ID が def-<駅ID> の定義は1つの候補として数え、
 * 定義の ID をキーにする(docs/spec/content-format.md「参照」の 4。ADR-008)。
 * @param {import('./graph.js').Site} site
 * @param {{ id: string, kind: 'definition' | 'station', stationId: string }} c
 * @returns {string}
 */
function candidateKey(site, c) {
  if (c.kind !== 'station') return c.id;
  const id = `${DEF_PREFIX}${c.id}`;
  return site.definitions.get(id)?.station.id === c.id ? id : c.id;
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
