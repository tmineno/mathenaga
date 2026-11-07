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
 * 定義と定理に、章ごとの通し番号を振る(docs/spec/build.md「導出する値」)。
 * 定義と定理をまとめて、原稿に書いた順に 1 から数える。式番号とは別に数える。
 * Preconditions: chapters は章グラフの章(章番号を持つ)。
 * Postconditions: ブロック → 「3.1」の形の番号と、[[@ID]] で指せる ID → { label, kind, chapter } を返す。
 *   [[@ID]] で指せるのは、定理と定義(定義の ID は def- で始まり、駅と ID を共有しない。ADR-008)。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 */
export function numberStatements(chapters) {
  /** @type {Map<import('./chapter.js').Block, string>} */
  const labels = new Map();
  /** @type {Map<string, { label: string, kind: 'definition' | 'theorem', chapter: import('./chapter.js').ChapterModel }>} */
  const byId = new Map();
  for (const chapter of chapters) {
    let k = 0;
    for (const st of chapter.stations) {
      for (const item of st.items) {
        if (item.kind !== 'block') continue;
        const b = item.block;
        if (b.name !== 'definition' && b.name !== 'theorem') continue;
        const label = `${chapter.number}.${++k}`;
        labels.set(b, label);
        if (b.id === null || byId.has(b.id)) continue;
        byId.set(b.id, { label, kind: b.name, chapter });
      }
    }
  }
  return { labels, byId };
}

/**
 * 図に、章ページに並ぶ順で図番号を振る(docs/spec/build.md「導出する値」)。式番号とは別に数える。
 * Preconditions: chapters は章グラフの章(章番号を持つ)。
 * Postconditions: 図の段落のトークン → 「3.1」の形の番号、と、図の ID → { label, chapter } を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 * @param {Map<string, number>} fieldOrder
 */
export function numberFigures(chapters, fieldOrder) {
  /** @type {Map<any, string>} */
  const labels = new Map();
  /** @type {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} */
  const byId = new Map();
  for (const chapter of chapters) {
    const figs = new Map(chapter.figures.map((f) => [f.token, f]));
    let k = 0;
    for (const r of displayRanges(chapter, fieldOrder)) {
      for (let i = r.start; i <= r.end; i++) {
        const f = figs.get(chapter.tokens[i]);
        if (!f || labels.has(f.token)) continue;
        const label = `${chapter.number}.${++k}`;
        labels.set(f.token, label);
        if (f.id) byId.set(f.id, { label, chapter });
      }
    }
  }
  return { labels, byId };
}

/**
 * 分野での応用に、章ごとの通し番号を振る(docs/spec/build.md「導出する値」)。
 * 全分野をまとめて、章ページに並ぶ順(駅の順 → 分野の並び → 書いた順)に 1 から数える。
 * 分野の選択では変わらない。定義・定理・式・図とは別に数える。
 * Preconditions: chapters は章グラフの章(章番号を持つ)。
 * Postconditions: application のブロック → 「3.1」の形の番号、と、応用の ID → { label, chapter } を返す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 * @param {Map<string, number>} fieldOrder
 */
export function numberApplications(chapters, fieldOrder) {
  /** @type {Map<import('./chapter.js').Block, string>} */
  const labels = new Map();
  /** @type {Map<string, { label: string, chapter: import('./chapter.js').ChapterModel }>} */
  const byId = new Map();
  for (const chapter of chapters) {
    let k = 0;
    for (const st of chapter.stations) {
      for (const a of byFieldOrder(st.applications, fieldOrder)) {
        const label = `${chapter.number}.${++k}`;
        labels.set(a, label);
        if (a.id && !byId.has(a.id)) byId.set(a.id, { label, chapter });
      }
    }
  }
  return { labels, byId };
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

/**
 * 範囲の中の行内のトークンを、章ページに並ぶ順にたどる。注(note)の中身は、注の印の位置でたどる。
 * Preconditions: ranges は displayRanges の結果か、その一部。
 * Postconditions: 行内の子のトークンごとに visit を呼ぶ。2つ目の引数は、その子を含む行内のトークン(inline)。
 * Failure modes: なし。
 * Side effects: visit が起こすものだけ。
 * @param {import('./chapter.js').ChapterModel} chapter
 * @param {Array<{ start: number, end: number }>} ranges
 * @param {(token: any, inline: any) => void} visit
 */
export function walkInline(chapter, ranges, visit) {
  /** @param {any[]} children @param {any} inline */
  const walk = (children, inline) => {
    for (const c of children) {
      visit(c, inline);
      if (c.type === 'note' && c.children) walk(c.children, inline);
    }
  };
  for (const r of ranges) {
    for (let i = r.start; i <= r.end; i++) {
      const t = chapter.tokens[i];
      if (t.type === 'inline' && t.children) walk(t.children, t);
    }
  }
}

/**
 * 注に、章ページに並ぶ順で注番号を振る(docs/spec/build.md「導出する値」)。ほかの番号とは別に数える。
 * Preconditions: chapters は章グラフの章。注は chapter.notes に集めてある。
 * Postconditions: 注のトークン → 番号(章ごとに 1 から)を返す。入れ子の注(エラー)には振らない。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 * @param {Map<string, number>} fieldOrder
 */
export function numberNotes(chapters, fieldOrder) {
  /** @type {Map<any, number>} */
  const labels = new Map();
  for (const chapter of chapters) {
    const notes = new Set(chapter.notes.map((n) => n.token));
    let k = 0;
    walkInline(chapter, displayRanges(chapter, fieldOrder), (t) => {
      if (notes.has(t) && !labels.has(t)) labels.set(t, ++k);
    });
  }
  return { labels };
}

/**
 * 章で引いた文献に、章ごとの文献番号を振る(docs/spec/build.md「導出する値」)。
 * その文献を章で初めて引いた位置が、章ページに並ぶ順に 1 から数える。注の中の引用は注の印の位置で数える。
 * Preconditions: chapters は章グラフの章。kinds は ID → 種類(文献は 'reference')。
 * Postconditions: 章の ID → (文献の ID → 番号)を返す。並びは番号の順。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('./chapter.js').ChapterModel[]} chapters
 * @param {Map<string, number>} fieldOrder
 * @param {Map<string, string>} kinds
 */
export function numberCitations(chapters, fieldOrder, kinds) {
  /** @type {Map<string, Map<string, number>>} */
  const byChapter = new Map();
  for (const chapter of chapters) {
    /** @type {Map<string, number>} */
    const numbers = new Map();
    walkInline(chapter, displayRanges(chapter, fieldOrder), (t) => {
      if (t.type !== 'wikiref' || !t.meta?.at || t.meta.label !== null) return;
      const key = t.meta.key;
      if (kinds.get(key) === 'reference' && !numbers.has(key)) numbers.set(key, numbers.size + 1);
    });
    byChapter.set(chapter.id, numbers);
  }
  return byChapter;
}
