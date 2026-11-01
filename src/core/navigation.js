// 章ページの案内:次の章、章の前提、乗換案内(docs/spec/build.md「導出する値」)と、
// 図ごとの分岐駅の検査(docs/spec/route-map.md の E12・N03)。

import { issue } from './issues.js';
import { branchStations, layoutMap } from './map.js';

/**
 * 次の章。
 * Preconditions: fieldId は分野の ID か null(未選択)。
 * Postconditions: 次の章、なければ null を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {import('./chapter.js').ChapterModel} chapter
 * @param {string | null} fieldId
 */
export function nextChapter(site, chapter, fieldId) {
  if (!fieldId) {
    const i = site.chapters.indexOf(chapter);
    return site.chapters[i + 1] ?? null;
  }
  const order = site.fieldChapters.get(fieldId) ?? [];
  const i = order.indexOf(chapter);
  if (i >= 0) return order[i + 1] ?? null;
  return order.find((c) => c.number > chapter.number) ?? null;
}

/**
 * 章が分野の章の順序に入るか(入らなければ範囲外の章)。
 * @param {import('./graph.js').Site} site
 * @param {import('./chapter.js').ChapterModel} chapter
 * @param {string} fieldId
 */
export function chapterInField(site, chapter, fieldId) {
  return (site.fieldChapters.get(fieldId) ?? []).includes(chapter);
}

/**
 * 章の前提:章の駅の requires が指す駅を含む、ほかの章(章番号の順)。
 * @param {import('./graph.js').Site} site
 * @param {import('./chapter.js').ChapterModel} chapter
 */
export function prerequisiteChapters(site, chapter) {
  const set = new Set();
  for (const st of site.stations.filter((s) => s.chapter === chapter)) {
    for (const r of st.requires) {
      const target = /** @type {import('./graph.js').StationInfo} */ (site.stationById.get(r));
      if (target.chapter !== chapter) set.add(target.chapter);
    }
  }
  return site.chapters.filter((c) => set.has(c));
}

/**
 * 章の駅(読む順)。
 * @param {import('./graph.js').Site} site
 * @param {import('./chapter.js').ChapterModel} chapter
 */
export function chapterStations(site, chapter) {
  return site.stations.filter((s) => s.chapter === chapter);
}

/**
 * @typedef {object} TransferItem
 * @property {import('./schema.js').Line} line
 * @property {import('./graph.js').StationInfo} branch
 * @property {import('./graph.js').StationInfo} first
 * @property {boolean} here   分岐駅がこの章にある
 */

/**
 * 乗換案内。分野を選んだ章で、章の路線と違い、分野の範囲に駅がある支線ごとに1項目。
 * Preconditions: fieldId は分野の ID。
 * Postconditions: 路線ファイルの順に項目を返す。分岐駅が決まらない支線は含めない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {import('./chapter.js').ChapterModel} chapter
 * @param {string} fieldId
 * @returns {TransferItem[]}
 */
export function transferGuide(site, chapter, fieldId) {
  const scope = site.scope.get(fieldId) ?? new Set();
  const { branches } = branchStations(site, scope);
  const items = [];
  for (const line of site.lines) {
    if (line.layout === null || line.id === chapter.lineId) continue;
    const info = branches.get(line.id);
    if (!info) continue;
    items.push({ line, branch: info.branch, first: info.first, here: info.branch.chapter === chapter });
  }
  return items;
}

/**
 * 全体の図と分野ごとの図で、分岐駅の検査(E12)と right の扱い(N03)を行う。
 * Preconditions: site は buildSite の結果。
 * Postconditions: E12 のエラーと N03 の通知を返す。章ページの図は全体の図・分野の図と配置が同じなので数えない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./graph.js').Site} site
 * @param {string} linesFile
 */
export function checkMaps(site, linesFile) {
  const errors = [];
  const notices = [];
  const maps = [
    { name: '全体の図', drawn: new Set(site.stations.map((s) => s.id)) },
    ...site.fields.map((f) => ({ name: `${f.title}の図`, drawn: site.scope.get(f.id) ?? new Set() })),
  ];
  for (const m of maps) {
    const layout = layoutMap(site, m.drawn);
    for (const x of layout.missing) {
      errors.push(
        issue(
          'E12',
          x.first.chapter.file,
          x.first.model.line,
          `${m.name}:支線 ${x.line.name} の最初の駅 ${x.first.id} が、幹線の駅を前提にしていない`,
        ),
      );
    }
    for (const f of layout.fallbacks) {
      notices.push(issue('N03', linesFile, null, `${m.name}:支線 ${f.line.name} を down と同じに描いた(${f.reason})`));
    }
  }
  return { errors, notices };
}
