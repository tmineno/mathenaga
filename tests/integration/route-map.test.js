// docs/spec/route-map.md「Acceptance tests」(11 は目視。14・17〜24・35 のブラウザの部分は tests/browser/site.test.js、
// 29・30・36 の今の原稿の分は tests/integration/invariants.test.js)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { layoutBoxes, layoutMap, mapDescription, wrapText } from '../../src/core/map.js';
import { otherLineGuide } from '../../src/core/navigation.js';
import { text as jaText } from '../../src/ui/locales/ja.js';
import {
  MERGE_LINE,
  addFinalGoal,
  addLine,
  addMergeLine,
  analyzeIn,
  edit,
  errorsAfter,
  readDist,
  referenceBuild,
  replaceOnce,
  tempRoot,
} from '../helpers/fixture.js';
import { assertNoOverlap } from '../helpers/map-checks.js';

const roots = [];
after(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

async function maps() {
  const { ctx, dist } = await referenceBuild();
  const site = ctx.site;
  const all = new Set(site.stations.map((s) => s.id));
  const field = (/** @type {string} */ id) => site.fieldById.get(id);
  return {
    site,
    dist,
    all,
    overall: layoutMap(site, all, { planned: true }),
    cs: layoutMap(site, site.scope.get('cs'), { goals: field('cs').goals }),
    physics: layoutMap(site, site.scope.get('physics'), { goals: field('physics').goals }),
  };
}

/** 駅の行。 @param {any} layout @param {string} id */
const at = (layout, id) => layout.stations.find((/** @type {any} */ s) => s.info.id === id);
/** 章の札。 @param {any} layout @param {number} n */
const card = (layout, n) => layout.cards.find((/** @type {any} */ c) => c.number === n);
/** 路線の章の札(列の順)。 @param {any} layout @param {string} line */
const cardsOf = (layout, line) =>
  layout.cards
    .filter((/** @type {any} */ c) => c.lineId === line)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.col - b.col);
/** 札の中の駅の表示番号。 @param {any} c */
const codes = (c) => c.rows.map((/** @type {any} */ r) => r.info.code);
/** 分岐の線(どの章の札からどの章の札へ)。 @param {any} layout @param {string} [line] */
const branchLinks = (layout, line) =>
  layout.links
    .filter((/** @type {any} */ l) => l.kind === 'branch' && (!line || l.lineId === line))
    .map((/** @type {any} */ l) => [l.from, l.to]);
/** 前提の矢印(章番号の組とラベル)。 @param {any} layout */
const arrowsOf = (layout) => layout.arrows.map((/** @type {any} */ a) => [a.from, a.to, a.label]);

/** 未執筆の章だけでできた、下へ分かれる新しい路線(第14章) */
const PROBABILITY =
  '- id: probability\n  code: P\n  name: 確率線\n  color: "#B5562A"\n  layout: down\n  planned:\n    - chapter: 14\n      title: 測度と確率\n      stations: [測度空間, 積分, 確率空間]\n';

/**
 * テスト用原稿を書き換えた一時ディレクトリ。
 * @param {(root: string) => Promise<void>} mutate
 */
async function rootWith(mutate) {
  const root = await tempRoot();
  roots.push(root);
  await mutate(root);
  return root;
}

/** @param {(t: string) => string} fn */
const rootWithLines = (fn) => rootWith((root) => edit(root, 'lines.yml', fn));

/**
 * 駅の requires に足した一時ディレクトリ。
 * @param {Array<[string, string, string]>} edits  [章のファイル, 駅の見出しの {#…} の中身, 足す ID]
 */
const rootWithRequires = (edits) =>
  rootWith(async (root) => {
    for (const [file, head, add] of edits) {
      await edit(root, `chapters/${file}/index.md`, (t) => replaceOnce(t, `{${head}}`, `{${head},${add}}`));
    }
  });

/** 31:compact-connected の requires に completeness を足す */
const COMPACT_COMPLETENESS = /** @type {[string, string, string]} */ ([
  '07-compactness-connectedness',
  '#compact-connected requires=topological-space',
  'completeness',
]);
/** 34・37:hausdorff の requires に contraction を足す */
const HAUSDORFF_CONTRACTION = /** @type {[string, string, string]} */ ([
  '06-topological-spaces',
  '#hausdorff requires=topological-space',
  'contraction',
]);
/** 34:quotient の requires に picard-lindelof を足す */
const QUOTIENT_PICARD = /** @type {[string, string, string]} */ ([
  '08-homeomorphism-quotient',
  '#quotient requires=topological-space',
  'picard-lindelof',
]);

/** 32:路線ファイルの第12章の最初の駅を、requires を持つ項目にする */
const STATIONS_12 = '      stations: [接空間, ベクトル場, リー微分]\n';
const TANGENT_REQUIRES = (/** @type {string} */ t) =>
  replaceOnce(t, STATIONS_12, '      stations: [{name: 接空間, requires: [banach]}, ベクトル場, リー微分]\n');
const CHAPTER12_REQUIRES = (/** @type {string} */ t) =>
  replaceOnce(t, STATIONS_12, `${STATIONS_12}      requires: [banach]\n`);

/** 解析線のノルム空間などから分かれる新しい路線(10・25・26) */
const VARIATIONS = { id: 'variations', code: 'V', name: '変分線', layout: 'up' };

/**
 * 第14章に変分線を足した一時ディレクトリ。
 * @param {string} requires  最初の駅の requires
 * @param {string} [before]  路線ファイルでこの路線の前に置く(書かなければ最後)
 */
const variationsRoot = (requires, before) =>
  rootWith((root) =>
    addLine(root, { ...VARIATIONS, before }, '14-calculus-of-variations', [
      { name: '汎関数', id: 'functional', requires },
      { name: 'オイラー=ラグランジュ方程式', id: 'euler-lagrange', requires: 'functional' },
    ]),
  );

/** 26:25 の変分線の後ろに、変分線の最初の駅とノルム空間を前提にする路線(第15章)を足す。 */
async function geodesicRoot() {
  const root = await variationsRoot('normed-space,continuous-map');
  await addLine(root, { id: 'geodesic-line', code: 'Y', name: '測地線線', layout: 'up' }, '15-geodesics', [
    { name: '測地線', id: 'geodesic', requires: 'functional,normed-space' },
  ]);
  return root;
}

/**
 * 27・28:上下の両方から合流する路線(第14章)を足す。
 * @param {{ goal?: boolean, right?: boolean }} [opts]
 *   goal なら合流する路線の最後の駅を理論物理の最終目標にする。right なら、その前に right の路線(第15章)を置く
 */
const mergeRoot = (opts = {}) =>
  rootWith(async (root) => {
    if (opts.right) {
      await addLine(root, { id: 'extension', code: 'E', name: '延長線', layout: 'right' }, '15-continuation', [
        { name: '延長', id: 'prolong', requires: 'continuous-map' },
      ]);
    }
    await addMergeLine(root);
    if (opts.goal) await addFinalGoal(root, 'physics', 'curvature');
  });

/** @param {any} site */
const overallOf = (site) =>
  layoutMap(site, new Set(site.stations.map((/** @type {any} */ s) => s.id)), { planned: true });

/** @param {string} root */
async function siteOf(root) {
  const r = await analyzeIn(root);
  assert.deepEqual(
    r.errors.map((e) => `${e.code} ${e.message}`),
    [],
  );
  return r.ctx.site;
}

/**
 * 路線を足した原稿で、全体の図と、各章を強調した全体の図に重なりがないことを確かめる。
 * @param {string} name @param {(root: string) => Promise<void>} mutate
 */
async function assertClearWith(name, mutate) {
  const s = await siteOf(await rootWith(mutate));
  const all = new Set(s.stations.map((x) => x.id));
  assertNoOverlap(`${name}/全体`, layoutMap(s, all, { planned: true }));
  for (const c of s.chapters) {
    assertNoOverlap(`${name}/第${c.number}章`, layoutMap(s, all, { planned: true, highlight: c.id }));
  }
}

describe('route-map: 受け入れテスト', () => {
  test('1. 全体の図:書いた10章と未執筆の6章の札、幹線の段の並び、支線の段と列', async () => {
    const { overall } = await maps();
    assert.deepEqual(
      overall.cards.map((c) => c.number),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17],
    );
    assert.deepEqual(
      overall.cards.filter((c) => c.planned).map((c) => c.number),
      [10, 11, 12, 13, 16, 17],
    );
    assert.equal(overall.stations.filter((s) => !s.info.planned).length, 22);
    assert.equal(overall.stations.filter((s) => s.info.planned).length, 18);
    // 幹線の段:第0章、第1章、第2章が左から
    const trunk = overall.cards.filter((c) => c.tier === 0).sort((a, b) => a.col - b.col);
    assert.deepEqual(
      trunk.map((c) => [c.number, codes(c)]),
      [
        [0, ['Z01', 'Z02', 'Z03']],
        [1, ['M01', 'M02']],
        [2, ['M03', 'M04']],
      ],
    );
    const col = (/** @type {number} */ n) => card(overall, n).col;
    const analysis = cardsOf(overall, 'analysis');
    const geometry = cardsOf(overall, 'geometry');
    const sets = cardsOf(overall, 'set-theory');
    assert.deepEqual(
      analysis.map((c) => c.number),
      [3, 4, 5, 10, 11],
    );
    assert.deepEqual(analysis.flatMap(codes).filter(Boolean), ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08']);
    assert.deepEqual(
      geometry.map((c) => c.number),
      [6, 7, 8, 9, 12, 13],
    );
    assert.deepEqual(geometry.flatMap(codes).filter(Boolean), ['G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07']);
    assert.deepEqual(
      sets.map((c) => c.number),
      [16, 17],
    );
    // 列:支線は分岐駅の章の次の列から1列ずつ
    analysis.forEach((c, i) => assert.equal(c.col, col(1) + 1 + i, `第${c.number}章の列`));
    geometry.forEach((c, i) => assert.equal(c.col, col(2) + 1 + i, `第${c.number}章の列`));
    sets.forEach((c, i) => assert.equal(c.col, col(0) + 1 + i, `第${c.number}章の列`));
    // 段:解析線は上、幾何線は下、集合線は解析線より幹線から遠い上
    assert.ok(analysis.every((c) => c.tier === -1));
    assert.ok(geometry.every((c) => c.tier === 1));
    assert.ok(sets.every((c) => c.tier === -2));
  });

  test('2. テスト用原稿の図には前提の矢印がなく、分岐の線は3本', async () => {
    const { overall, cs, physics } = await maps();
    for (const layout of [overall, cs, physics]) assert.deepEqual(layout.arrows, []);
    assert.deepEqual(branchLinks(overall), [
      [1, 3],
      [2, 6],
      [0, 16],
    ]);
  });

  test('3. 情報科学の図', async () => {
    const { cs, dist } = await maps();
    assert.deepEqual(
      cs.cards.map((c) => c.number),
      [0, 1, 3],
    );
    assert.deepEqual(
      cs.stations.map((s) => s.info.code),
      ['Z01', 'Z02', 'Z03', 'M01', 'M02', 'A01', 'A02', 'A03', 'A04'],
    );
    assert.ok(at(cs, 'banach').final);
    assert.ok(!cs.cards.some((c) => c.lineId === 'geometry'));
    const html = await readDist(dist, 'fields/cs/index.html');
    const legend = html.match(/<ul class="legend">.*?<\/ul>/)[0];
    assert.ok(legend.includes('最終目標'));
    assert.ok(!legend.includes('途中の目標'));
    assert.ok(!legend.includes('前提の矢印'));
  });

  test('4. 理論物理の図', async () => {
    const { physics } = await maps();
    assert.equal(physics.stations.length, 21);
    assert.equal(card(physics, 7), undefined);
    assert.ok(!at(physics, 'compact-connected'));
    assert.deepEqual(
      physics.stations.filter((s) => s.final).map((s) => s.info.code),
      ['A08', 'G07'],
    );
    assert.deepEqual(
      physics.stations.filter((s) => s.partial).map((s) => s.info.code),
      ['A05', 'G06'],
    );
  });

  test('5. 理論物理の図の desc', async () => {
    const { physics } = await maps();
    const desc = mapDescription(physics);
    assert.ok(desc.includes('A08 ヒルベルト空間(最終目標)'), desc);
    assert.ok(desc.includes('A05 ピカールの定理(途中の目標)'), desc);
    assert.ok(desc.startsWith('0番線。第0章 数学の読み方:Z01 記号の読み方、'), desc);
  });

  test('6. どの図でも札・札の中の文字と印・ラベル・線が重ならない', async () => {
    const { site, all } = await maps();
    /** @type {Array<[string, any]>} */
    const layouts = [['全体', layoutMap(site, all, { planned: true })]];
    for (const f of site.fields) layouts.push([f.id, layoutMap(site, site.scope.get(f.id), { goals: f.goals })]);
    for (const c of site.chapters) {
      layouts.push([`第${c.number}章/全体`, layoutMap(site, all, { planned: true, highlight: c.id })]);
      for (const f of site.fields) {
        layouts.push([
          `第${c.number}章/${f.id}`,
          layoutMap(site, site.scope.get(f.id), { goals: f.goals, highlight: c.id }),
        ]);
      }
    }
    // 16 の新しい路線(未執筆の章だけ)を足した全体の図
    const ps = await siteOf(await rootWithLines((t) => `${t + PROBABILITY}      requires: [metric-space]\n`));
    const pall = new Set(ps.stations.map((s) => s.id));
    layouts.push(['16/全体', layoutMap(ps, pall, { planned: true })]);
    for (const c of ps.chapters) {
      layouts.push([`16/第${c.number}章/全体`, layoutMap(ps, pall, { planned: true, highlight: c.id })]);
    }
    // 10・25・26・27・28・31・32・34・37 で路線や前提を足した全体の図(27 は理論物理の図も)
    for (const [name, root] of /** @type {Array<[string, string]>} */ ([
      ['10', await variationsRoot('hilbert-space')],
      ['25', await variationsRoot('normed-space,continuous-map')],
      ['26', await geodesicRoot()],
      ['27', await mergeRoot({ goal: true })],
      ['28', await mergeRoot({ right: true })],
      ['31', await rootWithRequires([COMPACT_COMPLETENESS])],
      ['32', await rootWithLines(TANGENT_REQUIRES)],
      ['34', await rootWithRequires([HAUSDORFF_CONTRACTION, QUOTIENT_PICARD])],
      ['37', await rootWithRequires([COMPACT_COMPLETENESS, HAUSDORFF_CONTRACTION])],
    ])) {
      const s = await siteOf(root);
      layouts.push([`${name}/全体`, overallOf(s)]);
      if (name === '27') {
        const f = /** @type {any} */ (s.fieldById.get('physics'));
        layouts.push([`${name}/physics`, layoutMap(s, s.scope.get(f.id), { goals: f.goals })]);
      }
    }
    for (const [name, layout] of layouts) assertNoOverlap(name, layout);
  });

  test('7. 章ページの図の、今の章の札', async () => {
    const { site } = await maps();
    const map = (/** @type {string} */ field, /** @type {string} */ chapter) =>
      layoutMap(site, site.scope.get(field), { goals: site.fieldById.get(field).goals, highlight: chapter });
    const current = (/** @type {any} */ layout) => layout.cards.filter((/** @type {any} */ c) => c.current);
    const [p3] = current(map('physics', 'completeness-fixed-point'));
    assert.equal(p3.number, 3);
    assert.equal(p3.head.text, '第3章 このページ');
    assert.deepEqual(codes(p3), ['A01', 'A02', 'A03', 'A04', 'A05']);
    const [c3] = current(map('cs', 'completeness-fixed-point'));
    assert.deepEqual(codes(c3), ['A01', 'A02', 'A03', 'A04']);
    assert.deepEqual(current(map('physics', 'compactness-connectedness')), []);
  });

  test('8. 駅のリンク', async () => {
    const { dist } = await maps();
    const top = await readDist(dist, 'index.html');
    assert.ok(
      top.includes('<a href="/chapters/topological-spaces/#topological-space" class="st" aria-label="G01 位相空間">'),
    );
    const physics = await readDist(dist, 'fields/physics/index.html');
    assert.ok(
      physics.includes(
        '<a href="/chapters/topological-spaces/?field=physics#topological-space" class="st" aria-label="G01 位相空間">',
      ),
    );
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    assert.ok(ch3.includes('<a href="#banach" class="st" aria-label="A04 バナッハの不動点定理">'));
  });

  test('9. 解析線を right にすると、全体と理論物理の図では下に描き N03 を2件出す', async () => {
    const root = await rootWithLines((t) => replaceOnce(t, 'layout: up', 'layout: right'));
    const r = await analyzeIn(root);
    assert.deepEqual(r.errors, []);
    const n03 = r.notices.filter((n) => n.code === 'N03');
    assert.equal(n03.length, 2);
    assert.ok(n03.some((n) => n.message.startsWith('全体の図')));
    assert.ok(n03.some((n) => n.message.startsWith('理論物理の図')));
    const site = r.ctx.site;
    const overall = overallOf(site);
    assert.ok(cardsOf(overall, 'analysis').every((c) => c.tier > 0));
    const physics = layoutMap(site, site.scope.get('physics'));
    assert.ok(cardsOf(physics, 'analysis').every((c) => c.tier > 0));
    const cs = layoutMap(site, site.scope.get('cs'));
    const ch1 = card(cs, 1);
    assert.deepEqual(
      cardsOf(cs, 'analysis').map((c) => [c.tier, c.col]),
      [[0, ch1.col + 1]],
    );
  });

  test('10. 解析線の駅だけを前提にする支線は第5章の札から分かれ、路線ファイルで解析線より前に置くと E12', async () => {
    const overall = overallOf(await siteOf(await variationsRoot('hilbert-space')));
    const [v] = cardsOf(overall, 'variations');
    assert.equal(v.number, 14);
    assert.deepEqual(
      v.rows.map((r) => r.info.id),
      ['functional', 'euler-lagrange'],
    );
    assert.deepEqual(branchLinks(overall, 'variations'), [[5, 14]]);
    assert.equal(v.col, card(overall, 5).col + 1);
    assert.ok(v.tier < card(overall, 3).tier, '解析線より幹線から遠い上の段');

    const before = await analyzeIn(await variationsRoot('hilbert-space', 'analysis'));
    const e12 = before.errors.filter((e) => e.code === 'E12');
    assert.ok(e12.length > 0, before.errors.map((e) => `${e.code} ${e.message}`).join('\n'));
    assert.match(e12[0].message, /変分線/);
  });

  test('12. 0番線から本線への線は点線、本線は実線、ダークテーマでは color_dark を使う', async () => {
    const { dist, overall } = await maps();
    const link = (/** @type {number} */ a, /** @type {number} */ b) =>
      overall.links.find((l) => l.kind === 'line' && l.from === a && l.to === b);
    assert.equal(link(0, 1)?.style, 'dotted');
    assert.equal(link(0, 1)?.lineId, 'reading');
    assert.equal(link(1, 2)?.style, 'solid');
    const top = await readDist(dist, 'index.html');
    assert.match(top, /<path class="ln l-reading dotted"/);
    assert.match(top, /<path class="ln l-main" /);
    const css = await readDist(dist, 'assets/lines.css');
    assert.match(css, /\.l-analysis\{--lc:#5B45B8\}/);
    const dark = css.slice(css.indexOf('@media'));
    assert.match(dark, /\.l-analysis\{--lc:#AA98F2\}/);
    assert.match(dark, /\.l-main\{--lc:#8790A1\}/);
  });
});

describe('route-map: 章の札と未執筆の章', () => {
  test('13. 章の札の中の駅', async () => {
    const { overall, cs, physics } = await maps();
    assert.deepEqual(codes(card(overall, 0)), ['Z01', 'Z02', 'Z03']);
    assert.deepEqual(codes(card(overall, 3)), ['A01', 'A02', 'A03', 'A04', 'A05']);
    assert.deepEqual(codes(card(overall, 7)), ['G03']);
    assert.deepEqual(
      cs.cards.map((c) => c.number),
      [0, 1, 3],
    );
    assert.deepEqual(codes(card(cs, 3)), ['A01', 'A02', 'A03', 'A04']);
    assert.equal(card(physics, 7), undefined);
  });

  test('14. 章の札のリンク', async () => {
    const { dist } = await maps();
    const top = await readDist(dist, 'index.html');
    assert.ok(
      top.includes(
        '<a href="/chapters/completeness-fixed-point/" class="ch" aria-label="第3章 完備性と不動点"><rect class="card l-analysis"',
      ),
    );
    const physics = await readDist(dist, 'fields/physics/index.html');
    assert.ok(
      physics.includes(
        '<a href="/chapters/completeness-fixed-point/?field=physics" class="ch" aria-label="第3章 完備性と不動点">',
      ),
    );
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    assert.ok(
      ch3.includes('<a href="#" class="ch" aria-label="第3章 完備性と不動点"><rect class="card l-analysis current"'),
    );
    assert.ok(ch3.includes('>第3章 このページ</text>'));
    assert.ok(ch3.includes('<a href="/chapters/norm-inner-product/?field=physics" class="ch"'));
  });

  test('15. 未執筆の章は全体の図にだけ、破線の札でリンクなしで描く', async () => {
    const { site, dist, overall } = await maps();
    assert.deepEqual(
      site.stations.filter((s) => s.lineId === 'analysis').map((s) => s.code),
      ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08'],
    );
    assert.equal(site.stations.filter((s) => s.lineId === 'geometry').at(-1).code, 'G07');
    const names = (/** @type {number} */ n) => card(overall, n).rows.map((/** @type {any} */ r) => r.info.name);
    assert.deepEqual(names(10), ['有界作用素', '双対空間', '随伴作用素']);
    assert.deepEqual(names(11), ['スペクトル', 'コンパクト作用素', 'スペクトル分解']);
    for (const [n, after] of [
      [10, 5],
      [11, 10],
      [12, 9],
      [13, 12],
    ]) {
      const c = card(overall, n);
      assert.ok(c.planned, `第${n}章`);
      assert.equal(c.head.text, `第${n}章 未執筆`);
      assert.equal(c.tier, card(overall, after).tier);
      assert.equal(c.col, card(overall, after).col + 1, `第${n}章は第${after}章の右`);
      assert.ok(c.rows.every((/** @type {any} */ r) => r.info.code === '' && !r.plate));
    }
    assert.ok(mapDescription(overall).includes('第10章 有界作用素(未執筆):有界作用素、双対空間、随伴作用素'));

    const top = await readDist(dist, 'index.html');
    assert.ok(top.includes('<g class="ch"><rect class="card l-analysis planned"'));
    assert.ok(top.includes('<text class="label planned">'));
    assert.ok(!/<a [^>]*>[^<]*<rect class="card[^"]*planned/.test(top));
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    const overallMap = ch3.slice(ch3.indexOf('data-for=""><ul class="legend">'));
    assert.ok(overallMap.includes('第10章 未執筆'));
    for (const f of ['physics', 'cs']) {
      const page = await readDist(dist, `fields/${f}/index.html`);
      assert.ok(!page.includes('有界作用素'), f);
    }
    assert.equal((await fs.readdir(path.join(dist, 'chapters'))).length, 10);
  });

  test('16. 未執筆の章だけの支線は、planned の requires で分岐駅を決める', async () => {
    const without = await analyzeIn(await rootWithLines((t) => t + PROBABILITY));
    const e12 = without.errors.filter((e) => e.code === 'E12');
    assert.equal(e12.length, 1, without.errors.map((e) => `${e.code} ${e.message}`).join('\n'));
    assert.match(e12[0].message, /確率線/);
    assert.equal(e12[0].file, 'lines.yml');

    const overall = overallOf(
      await siteOf(await rootWithLines((t) => `${t + PROBABILITY}      requires: [metric-space]\n`)),
    );
    const [p] = cardsOf(overall, 'probability');
    assert.equal(p.number, 14);
    assert.equal(p.rows.length, 3);
    assert.deepEqual(branchLinks(overall, 'probability'), [[1, 14]]);
    assert.equal(p.col, card(overall, 1).col + 1);
    assert.ok(p.tier > card(overall, 6).tier, '幾何線より幹線から遠い下の段');
  });
});

describe('route-map: 始発の路線', () => {
  /** 幾何線の layout の行(テスト用原稿の路線ファイルで、layout が down の路線は幾何線だけ) */
  const GEOMETRY_LAYOUT = '  layout: down\n  planned:\n    - chapter: 12\n';
  /** @param {string} t */
  const startGeometry = (t) =>
    replaceOnce(t, GEOMETRY_LAYOUT, '  layout: down\n  start: true\n  planned:\n    - chapter: 12\n');
  /** 45:始発の幾何線の多様体から分かれる路線(第14章、未執筆) */
  const FRAME =
    '- id: frame\n  code: F\n  name: 枠線\n  color: "#B5562A"\n  layout: down\n  planned:\n    - chapter: 14\n      title: ファイバー束\n      stations: [ファイバー束, 接続]\n      requires: [manifold]\n';

  test('42. 幾何線を始発の路線にすると、分岐の線の代わりに第2章から第6章への前提の矢印ができる', async () => {
    const r = await analyzeIn(await rootWithLines(startGeometry));
    assert.deepEqual(
      r.errors.map((e) => `${e.code} ${e.message}`),
      [],
    );
    assert.deepEqual(
      r.notices.filter((n) => n.code === 'N03').map((n) => n.message),
      [],
    );
    const site = r.ctx.site;
    const overall = overallOf(site);
    assert.deepEqual(branchLinks(overall, 'geometry'), []);
    assert.deepEqual(arrowsOf(overall), [[2, 6, '連続写像']]);
    assert.equal(card(overall, 6).col, card(overall, 2).col + 1);
    assert.ok(card(overall, 6).tier > 0, '幹線の下の段');
    assert.ok(mapDescription(overall).includes('第6章は、第2章の M04 連続写像を前提にする。'));
    const physics = layoutMap(site, site.scope.get('physics'), { goals: site.fieldById.get('physics').goals });
    assert.deepEqual(arrowsOf(physics), [[2, 6, '連続写像']]);
    assert.deepEqual(branchLinks(physics, 'geometry'), []);
    const ch2 = site.chapters.find((/** @type {any} */ c) => c.number === 2);
    assert.deepEqual(
      otherLineGuide(site, ch2, 'physics').map((/** @type {any} */ x) => x.line.id),
      ['analysis'],
    );
    assertNoOverlap('42/全体', overall);
    assertNoOverlap('42/理論物理', physics);
  });

  test('43. 始発の路線の最初の駅が、路線ファイルで後ろにある路線の駅を前提にすると E12', async () => {
    const root = await rootWith(async (r) => {
      await edit(r, 'lines.yml', (t) => {
        const t2 = startGeometry(t);
        const block = t2.slice(t2.indexOf('- id: geometry'), t2.indexOf('- id: set-theory'));
        return replaceOnce(t2.replace(block, ''), '- id: analysis', `${block}- id: analysis`);
      });
      await edit(r, 'chapters/06-topological-spaces/index.md', (t) =>
        replaceOnce(
          t,
          '{#topological-space requires=continuous-map}',
          '{#topological-space requires=continuous-map,completeness}',
        ),
      );
    });
    const r = await analyzeIn(root);
    const e12 = r.errors.filter((e) => e.code === 'E12');
    assert.ok(e12.length > 0, r.errors.map((e) => `${e.code} ${e.message}`).join('\n'));
    assert.match(e12[0].message, /始発の路線 幾何線/);
    assert.match(e12[0].message, /completeness/);
  });

  test('44. requires のない始発の路線は、左端の列から描き、線も矢印も引かない', async () => {
    const start = PROBABILITY.replace('  layout: down\n', '  layout: down\n  start: true\n');
    const overall = overallOf(await siteOf(await rootWithLines((t) => t + start)));
    const [p] = cardsOf(overall, 'probability');
    assert.equal(p.number, 14);
    assert.equal(p.col, 0);
    assert.ok(p.tier > card(overall, 6).tier, '幾何線より幹線から遠い下の段');
    assert.deepEqual(branchLinks(overall, 'probability'), []);
    assert.ok(!overall.links.some((/** @type {any} */ l) => l.to === 14 && l.kind !== 'line'));
    assertNoOverlap('44/全体', overall);
  });

  test('45. 始発の路線の駅から、後ろの支線が分かれる', async () => {
    const overall = overallOf(await siteOf(await rootWithLines((t) => startGeometry(t) + FRAME)));
    // 幾何線は始発の路線のまま(分岐の線がない)で、その駅から枠線が分かれる
    assert.deepEqual(branchLinks(overall, 'geometry'), []);
    const [f] = cardsOf(overall, 'frame');
    assert.equal(f.number, 14);
    assert.deepEqual(branchLinks(overall, 'frame'), [[9, 14]]);
    assert.equal(f.col, card(overall, 9).col + 1);
    assert.ok(f.tier > card(overall, 9).tier, '幾何線より幹線から遠い下の段');
    assertNoOverlap('45/全体', overall);
  });

  test('46. start の値と、start を書ける路線', async () => {
    const bad = await errorsAfter((r) =>
      edit(r, 'lines.yml', (t) =>
        replaceOnce(t, GEOMETRY_LAYOUT, '  layout: down\n  start: yes\n  planned:\n    - chapter: 12\n'),
      ),
    );
    assert.ok(
      bad.some((e) => e.code === 'E03' && /start/.test(e.message)),
      bad.map((e) => e.message).join('\n'),
    );
    const trunk = await errorsAfter((r) =>
      edit(r, 'lines.yml', (t) => replaceOnce(t, '  name: 本線\n', '  name: 本線\n  start: true\n')),
    );
    assert.ok(
      trunk.some((e) => e.code === 'E03' && /start/.test(e.message)),
      trunk.map((e) => e.message).join('\n'),
    );
    const right = await errorsAfter((r) =>
      edit(r, 'lines.yml', (t) =>
        replaceOnce(t, GEOMETRY_LAYOUT, '  layout: right\n  start: true\n  planned:\n    - chapter: 12\n'),
      ),
    );
    assert.ok(
      right.some((e) => e.code === 'E03' && /start/.test(e.message)),
      right.map((e) => e.message).join('\n'),
    );
  });
});

describe('route-map: 支線からの分岐と合流', () => {
  test('25. 幹線の候補は、ほかの路線の候補があれば分岐駅にしない', async () => {
    const overall = overallOf(await siteOf(await variationsRoot('normed-space,continuous-map')));
    assert.deepEqual(branchLinks(overall, 'variations'), [[4, 14]], '第4章(A06)の札からの線1本だけ');
    assert.ok(card(overall, 14).tier < card(overall, 3).tier);
  });

  test('26. ほかの候補から requires をさかのぼって届く候補は、分岐駅にしない', async () => {
    const overall = overallOf(await siteOf(await geodesicRoot()));
    assert.deepEqual(branchLinks(overall, 'geodesic-line'), [[14, 15]], '変分線の第14章の札からの線1本だけ');
    assert.ok(card(overall, 15).tier < card(overall, 14).tier, '変分線より幹線から遠い上の段');
  });

  test('27. 上下の両方から合流する支線は、幹線の段で右に置き、両方の分岐駅の札から線を引く', async () => {
    const r = await analyzeIn(await mergeRoot());
    assert.deepEqual(r.errors, []);
    assert.deepEqual(
      r.notices.filter((n) => n.code === 'N03'),
      [],
    );
    /** @param {any} layout */
    const check = (layout) => {
      const [m] = cardsOf(layout, MERGE_LINE.id);
      assert.equal(m.number, 14);
      assert.equal(m.tier, 0);
      assert.ok(m.col > Math.max(card(layout, 2).col, card(layout, 5).col, card(layout, 9).col));
      assert.deepEqual(
        branchLinks(layout, MERGE_LINE.id).sort((a, b) => a[0] - b[0]),
        [
          [5, 14],
          [9, 14],
        ],
      );
      // 主な分岐駅(G07)からの線は、札の左の辺まで引く
      const main = layout.links.find((/** @type {any} */ l) => l.kind === 'branch' && l.from === 9);
      assert.deepEqual(main.points.at(-1)[0], m.x);
    };
    check(overallOf(r.ctx.site));

    const s = await siteOf(await mergeRoot({ goal: true }));
    const physics = /** @type {any} */ (s.fieldById.get('physics'));
    check(layoutMap(s, s.scope.get('physics'), { goals: physics.goals }));
  });

  test('28. 幹線より右の場所を right の路線が使うと、合流する支線は主な分岐駅の側に描き N03', async () => {
    const r = await analyzeIn(await mergeRoot({ right: true }));
    assert.deepEqual(r.errors, []);
    const n03 = r.notices.filter((n) => n.code === 'N03');
    assert.equal(n03.length, 1, n03.map((n) => n.message).join('\n'));
    assert.ok(n03[0].message.startsWith('全体の図'));
    assert.match(n03[0].message, /リーマン幾何線/);
    const overall = overallOf(r.ctx.site);
    const [e] = cardsOf(overall, 'extension');
    assert.deepEqual([e.tier, e.col], [0, card(overall, 2).col + 1], 'right の路線は幹線の段で、第2章の右');
    assert.ok(card(overall, 14).tier > card(overall, 6).tier, '幾何線より幹線から遠い下の段');
  });

  test('合流する支線の最初の駅名が長くても、重ならない', async () => {
    await assertClearWith('長い駅名の合流', (root) =>
      addLine(root, MERGE_LINE, '14-riemannian-geometry', [
        { name: '概念の名前と長い定理の名前をもつ駅', id: 'geodesic', requires: 'hilbert-space,manifold' },
        { name: '曲率', id: 'curvature', requires: 'geodesic' },
      ]),
    );
  });
});

describe('route-map: 前提の矢印', () => {
  test('31. compact-connected が completeness を前提にすると、第3章の札から第7章の札への矢印', async () => {
    const s = await siteOf(await rootWithRequires([COMPACT_COMPLETENESS]));
    const overall = overallOf(s);
    assert.deepEqual(arrowsOf(overall), [[3, 7, '完備性']]);
    assert.ok(mapDescription(overall).includes('第7章は、第3章の A02 完備性を前提にする。'), mapDescription(overall));
    for (const f of s.fields) assert.deepEqual(layoutMap(s, s.scope.get(f.id), { goals: f.goals }).arrows, [], f.id);
    // 矢印は第3章の札の下の辺から出て、第7章の札の上の辺に入る
    const link = overall.links.find((l) => l.kind === 'arrow');
    const [c3, c7] = [card(overall, 3), card(overall, 7)];
    assert.deepEqual(link?.points[0][1], c3.y + c3.h);
    assert.deepEqual(link?.points.at(-1)?.[1], c7.y);
  });

  test('32. 未執筆の駅の requires からも矢印ができる(駅ごとの requires と、章の requires)', async () => {
    for (const fn of [TANGENT_REQUIRES, CHAPTER12_REQUIRES]) {
      const overall = overallOf(await siteOf(await rootWithLines(fn)));
      assert.deepEqual(arrowsOf(overall), [[3, 12, 'バナッハの不動点定理']]);
    }
  });

  test('33. 分岐の線と路線の並びをたどって届く前提は、矢印にしない', async () => {
    const overall = overallOf(
      await siteOf(
        await rootWithRequires([['04-norm-inner-product', '#inner-product requires=normed-space', 'metric-space']]),
      ),
    );
    assert.deepEqual(overall.arrows, []);
  });

  test('34. 同じ段の溝を通る2本の矢印は、溝の中で重ならない', async () => {
    const overall = overallOf(await siteOf(await rootWithRequires([HAUSDORFF_CONTRACTION, QUOTIENT_PICARD])));
    assert.deepEqual(arrowsOf(overall), [
      [3, 6, '縮小写像'],
      [3, 8, 'ピカールの定理'],
    ]);
    const c3 = card(overall, 3);
    const links = overall.links.filter((l) => l.kind === 'arrow');
    // どちらも第3章の札の下の辺から出て、第3章の下の段の溝を横に進む
    const rowSegs = links.map((l) => {
      assert.equal(l.points[0][1], c3.y + c3.h);
      const [, [x1, y], [x2]] = l.points;
      return { y, lo: Math.min(x1, x2), hi: Math.max(x1, x2) };
    });
    const gapTop = Math.max(...overall.cards.filter((c) => c.tier === c3.tier).map((c) => c.y + c.h));
    const gapBottom = Math.min(...overall.cards.filter((c) => c.tier === c3.tier + 1).map((c) => c.y));
    for (const s of rowSegs) assert.ok(s.y > gapTop && s.y < gapBottom, '段の溝の中');
    const [a, b] = rowSegs;
    assert.ok(a.y !== b.y || a.hi <= b.lo || b.hi <= a.lo, '溝の中で重なる');
    assertNoOverlap('34', overall);
  });

  test('37. ほかの矢印をたどって届く前提は、矢印にしない', async () => {
    const overall = overallOf(await siteOf(await rootWithRequires([COMPACT_COMPLETENESS, HAUSDORFF_CONTRACTION])));
    assert.deepEqual(arrowsOf(overall), [[3, 6, '縮小写像']]);
  });

  test('47. 前提にされる駅が同じ矢印は、同じ札の辺から1本で出て、途中で枝分かれする', async () => {
    /** 始発の確率線(第14章)。2番目の駅が completeness を前提にする @param {string} layout */
    const probability = (layout) =>
      `- id: probability\n  code: P\n  name: 確率線\n  color: "#B5562A"\n  layout: ${layout}\n  start: true\n  planned:\n` +
      '    - chapter: 14\n      title: 測度と確率\n' +
      '      stations: [{name: 測度空間, requires: [open-set]}, {name: 積分, requires: [completeness]}, 確率空間]\n';
    /** @type {Array<[string, (t: string) => string]>} */
    const variants = [
      ['down', (t) => t + probability('down')],
      ['up', (t) => replaceOnce(t, '- id: analysis\n', `${probability('up')}- id: analysis\n`)],
    ];
    for (const [name, fn] of variants) {
      const root = await rootWith(async (r) => {
        await edit(r, 'lines.yml', fn);
        const [file, head, add] = COMPACT_COMPLETENESS;
        await edit(r, `chapters/${file}/index.md`, (t) => replaceOnce(t, `{${head}}`, `{${head},${add}}`));
      });
      const overall = overallOf(await siteOf(root));
      assert.deepEqual(
        arrowsOf(overall),
        [
          [2, 14, '開集合'],
          [3, 7, '完備性'],
          [3, 14, '完備性'],
        ],
        name,
      );
      const [c3, c7, c14] = [3, 7, 14].map((n) => card(overall, n));
      // up では、第14章の札の上の辺と第3章の札の下の辺が同じ段の溝に接する(終点の札の辺の上で枝分かれする)
      if (name === 'up') assert.equal(c14.tier, c3.tier + 1, 'up: 第14章は第3章のすぐ下の段');
      const pair = overall.links.filter((l) => l.kind === 'arrow' && l.from === 3);
      assert.equal(pair.length, 2, name);
      const startsOnEdge = (/** @type {any} */ l) =>
        l.points[0][1] === c3.y + c3.h && l.points[0][0] > c3.x && l.points[0][0] < c3.x + c3.w;
      const lead = pair.filter(startsOnEdge);
      assert.equal(lead.length, 1, `${name}: 第3章の札の下の辺から始まる線の数`);
      const other = /** @type {any} */ (pair.find((l) => l !== lead[0]));
      const [sx, sy] = other.points[0];
      const onLead = lead[0].points
        .slice(1)
        .some(
          (/** @type {number[]} */ p, /** @type {number} */ i) =>
            lead[0].points[i][1] === p[1] &&
            sy === p[1] &&
            sx >= Math.min(lead[0].points[i][0], p[0]) &&
            sx <= Math.max(lead[0].points[i][0], p[0]),
        );
      assert.ok(onLead, `${name}: 枝分かれした線が、共通の区間の上の点から始まらない ${JSON.stringify(other.points)}`);
      for (const [n, c] of /** @type {const} */ ([
        [7, c7],
        [14, c14],
      ])) {
        const end = pair.find((l) => l.to === n)?.points.at(-1);
        assert.equal(end?.[1], c.y, `${name}: 第${n}章の札の上の辺で終わる`);
        assert.ok(end[0] > c.x && end[0] < c.x + c.w, `${name}: 第${n}章の札の幅の中で終わる`);
      }
      assert.equal(overall.labels.filter((l) => l.kind === 'arrow' && l.text === '完備性').length, 1, name);
      const desc = mapDescription(overall);
      for (const t of ['第7章は、第3章の A02 完備性を前提にする。', '第14章は、第3章の A02 完備性を前提にする。']) {
        assert.ok(desc.includes(t), `${name}: ${t}`);
      }
      assertNoOverlap(`47/${name}`, overall);
    }
  });
});

describe('route-map: 2段目より遠い段へ分かれる支線', () => {
  test('2段目・3段目へ上る線も、下りる線も、札とラベルに重ならない', async () => {
    for (const [a, b] of [
      ['reading-symbols', 'reading-proofs'],
      ['reading-proofs', 'reading-symbols'],
    ]) {
      await assertClearWith(`上へ ${a}/${b}`, async (root) => {
        await addLine(root, { id: 'skyline', code: 'U', name: '上線', layout: 'up' }, '14-sky', [
          { name: '上の駅', id: 'upper-a', requires: a },
        ]);
        await addLine(root, { id: 'skyline-two', code: 'V', name: '上二線', layout: 'up' }, '15-sky-two', [
          { name: '上の駅二', id: 'upper-b', requires: b },
        ]);
      });
    }
    for (const [a, b] of [
      ['reading-proofs', 'metric-space'],
      ['metric-space', 'reading-proofs'],
    ]) {
      await assertClearWith(`下へ ${a}/${b}`, async (root) => {
        await addLine(root, { id: 'deepline', code: 'D', name: '下線', layout: 'down' }, '14-deep', [
          { name: '下の駅', id: 'lower-a', requires: a },
        ]);
        await addLine(root, { id: 'deepline-two', code: 'E', name: '下二線', layout: 'down' }, '15-deep-two', [
          { name: '下の駅二', id: 'lower-b', requires: b },
        ]);
      });
    }
  });
});

describe('route-map: 重なりの検査そのもの', () => {
  // 検査が失敗しうることを確かめる(重ねた配置を渡すと失敗する)
  /** @param {(layout: any) => void} breakIt */
  const broken = async (breakIt) => {
    const overall = overallOf(await siteOf(await rootWithRequires([COMPACT_COMPLETENESS])));
    const copy = structuredClone(overall);
    breakIt(copy);
    return copy;
  };
  test('札を重ねると失敗する', async () => {
    const l = await broken((x) => (card(x, 4).x = card(x, 3).x + 20));
    assert.throws(() => assertNoOverlap('test', l), /札が重なる/);
  });
  test('矢印が札の中を通ると失敗する', async () => {
    const l = await broken((x) => {
      const a = x.links.find((/** @type {any} */ k) => k.kind === 'arrow');
      const c4 = card(x, 4);
      a.points[1][1] = c4.y + 30;
      a.points[2][1] = c4.y + 30;
    });
    assert.throws(() => assertNoOverlap('test', l), /札の中を通る/);
  });
  test('ラベルを線に重ねると失敗する', async () => {
    const l = await broken((x) => {
      const a = x.links.find((/** @type {any} */ k) => k.kind === 'arrow');
      x.labels[x.labels.length - 1].y = a.points[1][1] - 5;
      x.labels[x.labels.length - 1].x = Math.min(a.points[1][0], a.points[2][0]) + 4;
    });
    assert.throws(() => assertNoOverlap('test', l), /ラベル/);
  });
  test('同じトラックで2本の矢印が重なって進むと失敗する', async () => {
    const l = await broken((x) => {
      const a = x.links.find((/** @type {any} */ k) => k.kind === 'arrow');
      x.links.push({ ...a, id: 'arrow:copy', points: a.points.map((/** @type {number[]} */ p) => [...p]) });
    });
    assert.throws(() => assertNoOverlap('test', l), /重なって進む/);
  });
  test('縮小したときの章のタイトルが札からはみ出すと失敗する', async () => {
    const l = await broken((x) => {
      const c = card(x, 3);
      c.overview[1].lines[0].y = c.h - 5;
    });
    assert.throws(() => assertNoOverlap('test', l), /title\(第3章、段階 2\) が第3章の札からはみ出す/);
  });
  test('同じ段階の文字どうしが重なると失敗する', async () => {
    const l = await broken((x) => {
      const ov = card(x, 3).overview[0];
      ov.lines[0].y = ov.head.y + 4;
    });
    assert.throws(() => assertNoOverlap('test', l), /段階 1 で重なる/);
  });
  test('段階の違う文字どうしは、重なっていても比べない', async () => {
    const l = await broken(() => {});
    // 比べないことを確かめるには、段階の違う文字が実際に重なっている必要がある
    const { boxes } = layoutBoxes(l);
    const inner = boxes.filter((b) => b.card === 3);
    const crossed = inner.some((a) =>
      inner.some((b) => a.lod !== b.lod && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
    );
    assert.ok(crossed, '段階の違う文字が重なっていない');
    assertNoOverlap('test', l);
  });
  test('layoutBoxes は札・札の中の文字・ラベル・線を返す', async () => {
    const l = await broken(() => {});
    const { boxes, segments } = layoutBoxes(l);
    for (const kind of ['card', 'head', 'title', 'plate', 'name', 'label']) {
      assert.ok(
        boxes.some((b) => b.kind === kind),
        kind,
      );
    }
    for (const lod of [0, 1, 2])
      assert.ok(
        boxes.some((b) => b.lod === lod && b.kind === 'title'),
        `段階 ${lod}`,
      );
    for (const kind of ['line', 'branch', 'arrow']) {
      assert.ok(
        segments.some((s) => s.kind === kind),
        kind,
      );
    }
  });
});

describe('route-map: 駅名の折り返し', () => {
  test('行に入るだけ詰め、「の」「・」の後ろ、文字の種類の変わり目で折り返す', () => {
    assert.deepEqual(wrapText('バナッハの不動点定理', 78, 13, jaText), ['バナッハの', '不動点定理']);
    assert.deepEqual(wrapText('リース・フィッシャーの定理', 124, 12, jaText), ['リース・', 'フィッシャーの定理']);
    assert.deepEqual(wrapText('ヒルベルト空間', 78, 13, jaText), ['ヒルベルト', '空間']);
    assert.deepEqual(wrapText('コンパクト性と連結性', 100, 13, jaText), ['コンパクト性と', '連結性']);
    assert.deepEqual(wrapText('記号の読み方', 124, 12, jaText), ['記号の読み方']);
  });
});

describe('route-map: 倍率ごとの表示(札の中の文字)', () => {
  /** @param {string} t */
  const squash = (t) => t.replace(/ /g, '');
  test('概要は「第N章」の行と章のタイトルを、章のタイトルだけの段階はタイトルを、駅の行の段階より大きな文字で書く', async () => {
    const { site, all } = await maps();
    const page = layoutMap(site, all, { planned: true, highlight: 'completeness-fixed-point' });
    for (const c of page.cards) {
      const [ov1, ov2] = c.overview;
      const name = `第${c.number}章`;
      assert.equal(ov1.head?.text, c.head.text, name);
      assert.equal(ov2.head, null, name);
      for (const ov of [ov1, ov2]) {
        const text = ov.lines.map((/** @type {any} */ t) => t.text).join('');
        assert.equal(squash(text), squash(c.title), name);
      }
      assert.ok(ov1.lines[0].h > c.titleLines[0].h, name);
      assert.ok(ov2.lines[0].h > ov1.lines[0].h, name);
    }
    assert.equal(card(page, 3).overview[0].head.text, '第3章 このページ');
    assert.equal(card(page, 10).overview[0].head.text, '第10章 未執筆');
  });
  test('札の高さに入らない章のタイトルは、末尾を「…」で省く', async () => {
    const root = await rootWith((r) =>
      edit(r, 'chapters/09-manifolds/index.md', (t) =>
        replaceOnce(t, 'title: 多様体', 'title: 曲がった空間の上で微分と積分を行うための多様体の基礎'),
      ),
    );
    const overall = overallOf(await siteOf(root));
    for (const ov of card(overall, 9).overview) {
      assert.ok(
        ov.lines[ov.lines.length - 1].text.endsWith('…'),
        ov.lines.map((/** @type {any} */ t) => t.text).join('/'),
      );
    }
    assertNoOverlap('長い章のタイトル', overall);
  });
});

describe('route-map: 前提の輪', () => {
  test('前提が輪になった原稿でも、分岐駅を決めるところで止まらず E06 を返す', async () => {
    // 第1章の2駅が互いを前提にし、その2駅の先の駅を2つ前提にする路線を足す
    const errors = await errorsAfter(async (root) => {
      await edit(root, 'chapters/01-convergence-metric/index.md', (t) =>
        replaceOnce(
          t,
          '{#convergence requires=reading-proofs,sets-maps}',
          '{#convergence requires=reading-proofs,sets-maps,metric-space}',
        ),
      );
      await addLine(root, { id: 'skyline', code: 'U', name: '上線', layout: 'up' }, '14-sky', [
        { name: '上の駅', id: 'upper-a', requires: 'convergence,open-set' },
      ]);
    });
    assert.ok(errors.length > 0);
    assert.deepEqual([...new Set(errors.map((e) => e.code))], ['E06']);
  });
});
