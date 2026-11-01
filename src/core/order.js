// 章ページに並ぶ順(docs/spec/site.md「章ページの構成」「駅の表示」)と、その順に振る式番号
// (docs/spec/build.md「導出する値」の式番号)。

/**
 * 分野版を分野の並びにそろえる。共通版(field なし)は先頭に置く。知らない分野は最後。
 * @param {import('./chapter.js').Block[]} blocks
 * @param {Map<string, number>} fieldOrder
 */
export function byFieldOrder(blocks, fieldOrder) {
  const rank = (/** @type {import('./chapter.js').Block} */ b) =>
    b.field === null ? -1 : (fieldOrder.get(b.field) ?? Number.MAX_SAFE_INTEGER);
  return [...blocks].sort((a, b) => rank(a) - rank(b) || a.start - b.start);
}

/**
 * 駅の中身を表示する順に並べる。application は駅の末尾に、分野の並びで置く。
 * @param {import('./chapter.js').Station} station
 * @param {Map<string, number>} fieldOrder
 */
export function stationItems(station, fieldOrder) {
  const body = station.items.filter((i) => !(i.kind === 'block' && i.block.name === 'application'));
  const apps = byFieldOrder(station.applications, fieldOrder).map((block) => ({ kind: 'block', block }));
  return [...body, ...apps];
}

/**
 * 章ページに並ぶ順に、トークンの範囲 [start, end] を並べる。
 * Preconditions: chapter は analyzeChapter の結果。
 * Postconditions: ゴール → 出発点(motivation、章頭の地の文)→ 駅 → ふりかえり → 確認問題 の順の範囲を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel} chapter
 * @param {Map<string, number>} fieldOrder
 * @returns {Array<{ start: number, end: number }>}
 */
export function displayRanges(chapter, fieldOrder) {
  const out = [];
  const add = (/** @type {{ start: number, end: number }} */ r) => out.push({ start: r.start, end: r.end });
  byFieldOrder(chapter.head.goals, fieldOrder).forEach(add);
  byFieldOrder(chapter.head.motivations, fieldOrder).forEach(add);
  chapter.head.prose.forEach(add);
  for (const st of chapter.stations) {
    for (const item of stationItems(st, fieldOrder)) {
      if (item.kind === 'block') add(/** @type {any} */ (item).block);
      else add(/** @type {any} */ (item));
    }
  }
  chapter.end.reviews.forEach(add);
  for (const q of chapter.end.questions) {
    add(q.question);
    if (q.answer) add(q.answer);
  }
  return out;
}

/**
 * 別行立ての式に、章ページに並ぶ順で式番号を振る。
 * Preconditions: chapters は章グラフの章(章番号を持つ)。
 * Postconditions: 式のトークン → 「3.1」の形の番号、と、式の ID → { label, chapter } を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 * @param {Map<string, number>} fieldOrder
 */
export function numberEquations(chapters, fieldOrder) {
  /** @type {Map<any, string>} */
  const labels = new Map();
  /** @type {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} */
  const byId = new Map();
  for (const chapter of chapters) {
    const ids = new Map(chapter.equations.map((e) => [e.token, e.id]));
    let k = 0;
    for (const r of displayRanges(chapter, fieldOrder)) {
      for (let i = r.start; i <= r.end; i++) {
        const t = chapter.tokens[i];
        if (t.type !== 'math_block' || labels.has(t)) continue;
        const label = `${chapter.number}.${++k}`;
        labels.set(t, label);
        const id = ids.get(t);
        if (id) byId.set(id, { label, chapter });
      }
    }
  }
  return { labels, byId };
}
