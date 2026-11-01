// docs/spec/route-map.md「Acceptance tests」(11 は目視、12 の色は tests/browser/site.test.js でも確かめる)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { layoutBoxes, layoutMap, mapDescription, wrapLabel } from '../../src/core/map.js';
import { analyzeIn, buildIn, edit, readDist, referenceBuild, replaceOnce, tempRoot } from '../helpers/fixture.js';

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
    overall: layoutMap(site, all),
    cs: layoutMap(site, site.scope.get('cs'), { goals: field('cs').goals }),
    physics: layoutMap(site, site.scope.get('physics'), { goals: field('physics').goals }),
  };
}

/** @param {any} layout @param {string} id */
const at = (layout, id) => layout.stations.find((s) => s.info.id === id);

/** 解析線の第10章(作用素)を未執筆として足す。 */
const PLANNED_10 = '  planned:\n    - chapter: 10\n      title: 作用素\n      stations: [有界作用素, スペクトル]\n';

/**
 * 基準原稿の路線ファイルを書き換えた一時ディレクトリ。
 * @param {(t: string) => string} fn
 */
async function rootWithLines(fn) {
  const root = await tempRoot();
  roots.push(root);
  await edit(root, 'lines.yml', fn);
  return root;
}

/** @param {any} band @param {any} station */
const covers = (band, station) =>
  band.y <= station.y && station.y <= band.y + band.h && band.x <= station.x && station.x <= band.x + band.w;

describe('route-map: 受け入れテスト', () => {
  test('1. 全体の図:21駅、幹線の並び、分岐', async () => {
    const { overall } = await maps();
    assert.equal(overall.stations.length, 21);
    const trunk = overall.stations
      .filter((s) => s.y === 0)
      .sort((a, b) => a.x - b.x)
      .map((s) => s.info.code);
    assert.deepEqual(trunk, ['Z01', 'Z02', 'M01', 'M02', 'M03', 'M04']);
    const analysis = overall.stations.filter((s) => s.info.lineId === 'analysis');
    const geometry = overall.stations.filter((s) => s.info.lineId === 'geometry');
    assert.equal(analysis.length, 8);
    assert.equal(geometry.length, 7);
    assert.ok(
      analysis.every((s) => s.y < 0),
      '解析線は上',
    );
    assert.ok(
      geometry.every((s) => s.y > 0),
      '幾何線は下',
    );
    const start = (/** @type {string} */ line) => overall.paths.find((p) => p.lineId === line).points[0];
    assert.deepEqual(start('analysis'), [at(overall, 'metric-space').x, 0]);
    assert.deepEqual(start('geometry'), [at(overall, 'continuous-map').x, 0]);
  });

  test('2. 全体の図の乗換駅は Z02・M02・M04', async () => {
    const { overall } = await maps();
    assert.deepEqual(
      overall.stations.filter((s) => s.transfer).map((s) => s.info.code),
      ['Z02', 'M02', 'M04'],
    );
  });

  test('3. 情報科学の図', async () => {
    const { cs, dist } = await maps();
    assert.deepEqual(
      cs.stations.map((s) => s.info.code),
      ['Z01', 'Z02', 'M01', 'M02', 'A01', 'A02', 'A03', 'A04'],
    );
    assert.ok(at(cs, 'banach').final);
    assert.ok(!cs.stations.some((s) => s.info.lineId === 'geometry'));
    const html = await readDist(dist, 'fields/cs/index.html');
    const legend = html.match(/<ul class="legend">.*?<\/ul>/)[0];
    assert.ok(!legend.includes('途中下車OK'));
  });

  test('4. 理論物理の図', async () => {
    const { physics } = await maps();
    assert.equal(physics.stations.length, 20);
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
    assert.ok(mapDescription(physics).includes('A08 ヒルベルト空間(終着)'));
  });

  test('6. どの図でも札・駅名・印・帯の文字・線が重ならない', async () => {
    const { site, all } = await maps();
    const layouts = [['全体', layoutMap(site, all)]];
    for (const f of site.fields) layouts.push([f.id, layoutMap(site, site.scope.get(f.id), { goals: f.goals })]);
    for (const c of site.chapters) {
      layouts.push([`第${c.number}章/全体`, layoutMap(site, all, { highlight: c.id })]);
      for (const f of site.fields) {
        layouts.push([
          `第${c.number}章/${f.id}`,
          layoutMap(site, site.scope.get(f.id), { goals: f.goals, highlight: c.id }),
        ]);
      }
    }
    // 未執筆の章(解析線の続きと、新しい路線)を足した全体の図
    const root = await rootWithLines(
      (t) =>
        replaceOnce(t, '  layout: up\n', `  layout: up\n${PLANNED_10}`) +
        '- id: probability\n  code: P\n  name: 確率線\n  color: "#B5562A"\n  layout: down\n  planned:\n    - chapter: 11\n      title: 測度と確率\n      stations: [測度空間, 積分, 確率空間]\n      requires: [metric-space]\n',
    );
    const r = await analyzeIn(root);
    assert.deepEqual(r.errors, []);
    const ps = r.ctx.site;
    const pall = new Set(ps.stations.map((s) => s.id));
    layouts.push(['未執筆あり/全体', layoutMap(ps, pall, { planned: true })]);
    for (const c of ps.chapters) {
      layouts.push([`未執筆あり/第${c.number}章/全体`, layoutMap(ps, pall, { planned: true, highlight: c.id })]);
    }
    for (const [name, layout] of layouts) assertNoOverlap(/** @type {string} */ (name), layout);
  });

  test('7. 章ページの図の、今の章の帯', async () => {
    const { site } = await maps();
    const map = (/** @type {string} */ field, /** @type {string} */ chapter) =>
      layoutMap(site, site.scope.get(field), { goals: site.fieldById.get(field).goals, highlight: chapter });
    const current = (/** @type {any} */ layout) => layout.bands.filter((b) => b.current);
    const p3 = map('physics', 'completeness-fixed-point');
    assert.equal(current(p3).length, 1);
    const [b3] = current(p3);
    assert.equal(b3.text, '第3章 このページ');
    for (const id of ['cauchy-sequence', 'picard-lindelof']) assert.ok(covers(b3, at(p3, id)), id);
    assert.ok(!covers(b3, at(p3, 'normed-space')));
    const c3 = map('cs', 'completeness-fixed-point');
    const [cb] = current(c3);
    for (const id of ['cauchy-sequence', 'banach']) assert.ok(covers(cb, at(c3, id)), id);
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
    const root = await tempRoot();
    roots.push(root);
    await edit(root, 'lines.yml', (t) => replaceOnce(t, 'layout: up', 'layout: right'));
    const r = await analyzeIn(root);
    assert.deepEqual(r.errors, []);
    const n03 = r.notices.filter((n) => n.code === 'N03');
    assert.equal(n03.length, 2);
    assert.ok(n03.some((n) => n.message.startsWith('全体の図')));
    assert.ok(n03.some((n) => n.message.startsWith('理論物理の図')));
    const site = r.ctx.site;
    const overall = layoutMap(site, new Set(site.stations.map((s) => s.id)));
    assert.ok(overall.stations.filter((s) => s.info.lineId === 'analysis').every((s) => s.y > 0));
    const cs = layoutMap(site, site.scope.get('cs'));
    const m02 = at(cs, 'metric-space');
    assert.ok(cs.stations.filter((s) => s.info.lineId === 'analysis').every((s) => s.y === 0 && s.x > m02.x));
  });

  test('10. 幹線を前提にしない支線は E12', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(
      root,
      'lines.yml',
      (t) => `${t}- id: functional\n  code: F\n  name: 関数解析線\n  color: "#AA5500"\n  layout: up\n`,
    );
    const dir = path.join(root, 'content/chapters/10-functional');
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, 'index.md'),
      '---\ntitle: 関数解析\nline: functional\n---\n\n::: goal\nx\n:::\n\n::: motivation\nx\n:::\n\n## 有界作用素 {#bounded-operator requires=hilbert-space}\n\n::: summary\nx\n:::\n\n::: review\n- x\n:::\n',
    );
    const r = await analyzeIn(root);
    const e12 = r.errors.filter((e) => e.code === 'E12');
    assert.ok(e12.length > 0, r.errors.map((e) => `${e.code} ${e.message}`).join('\n'));
    assert.match(e12[0].message, /関数解析線/);
  });

  test('12. 0番線は点線、ダークテーマでは color_dark を使う', async () => {
    const { dist } = await maps();
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

describe('route-map: 章の帯と未執筆の章', () => {
  test('13. 全章の帯', async () => {
    const { overall, cs, physics } = await maps();
    assert.deepEqual(
      overall.bands.map((b) => b.number),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    const band = (/** @type {any} */ layout, /** @type {number} */ n) => layout.bands.find((b) => b.number === n);
    const expect = (
      /** @type {any} */ layout,
      /** @type {number} */ n,
      /** @type {string[]} */ inside,
      /** @type {string[]} */ outside,
    ) => {
      const b = band(layout, n);
      for (const id of inside) assert.ok(covers(b, at(layout, id)), `第${n}章の帯が ${id} にかからない`);
      for (const id of outside) assert.ok(!covers(b, at(layout, id)), `第${n}章の帯が ${id} にかかる`);
    };
    expect(overall, 0, ['reading-symbols', 'reading-proofs'], ['convergence']);
    expect(overall, 3, ['cauchy-sequence', 'picard-lindelof'], ['normed-space', 'metric-space']);
    expect(overall, 7, ['compact-connected'], ['hausdorff', 'homeomorphism']);
    assert.deepEqual(
      cs.bands.map((b) => b.number),
      [0, 1, 3],
    );
    expect(cs, 3, ['cauchy-sequence', 'banach'], []);
    assert.equal(band(physics, 7), undefined);
    for (const layout of [overall, cs, physics]) {
      for (const a of layout.bands) {
        for (const b of layout.bands) {
          if (a === b || a.y !== b.y) continue;
          assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, `第${a.number}章と第${b.number}章の帯が重なる`);
        }
      }
    }
  });

  test('14. 章の帯のリンク', async () => {
    const { dist } = await maps();
    const top = await readDist(dist, 'index.html');
    assert.ok(
      top.includes(
        '<a href="/chapters/completeness-fixed-point/" class="ch" aria-label="第3章 完備性と不動点"><rect class="band"',
      ),
    );
    const physics = await readDist(dist, 'fields/physics/index.html');
    assert.ok(
      physics.includes(
        '<a href="/chapters/completeness-fixed-point/?field=physics" class="ch" aria-label="第3章 完備性と不動点">',
      ),
    );
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    assert.ok(ch3.includes('<a href="#" class="ch" aria-label="第3章 完備性と不動点"><rect class="band current"'));
    assert.ok(ch3.includes('>第3章 このページ</text>'));
    assert.ok(ch3.includes('<a href="/chapters/norm-inner-product/?field=physics" class="ch"'));
  });

  test('15. 未執筆の章は全体の図にだけ、灰色でリンクなしで描く', async () => {
    const root = await rootWithLines((t) => replaceOnce(t, '  layout: up\n', `  layout: up\n${PLANNED_10}`));
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const { ctx } = await analyzeIn(root);
    const site = ctx.site;
    assert.deepEqual(
      site.stations.filter((s) => s.lineId === 'analysis').map((s) => s.code),
      ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08'],
    );
    const overall = layoutMap(site, new Set(site.stations.map((s) => s.id)), { planned: true });
    const plannedSt = overall.stations.filter((s) => s.info.planned);
    assert.deepEqual(
      plannedSt.map((s) => s.info.name),
      ['有界作用素', 'スペクトル'],
    );
    const a08 = at(overall, 'hilbert-space');
    assert.ok(plannedSt.every((s) => s.y === a08.y && s.x > a08.x && s.info.code === ''));
    const b10 = overall.bands.find((b) => b.number === 10);
    assert.ok(b10 && b10.planned && b10.text === '第10章 未執筆');
    assert.ok(mapDescription(overall).includes('有界作用素(未執筆)'));

    const dist = path.join(root, 'dist');
    const top = await readDist(dist, 'index.html');
    assert.ok(top.includes('<g class="ch"><rect class="band planned"'));
    assert.ok(top.includes('<g class="st planned">'));
    assert.ok(!/<a [^>]*>[^<]*<rect class="(band|plate) planned/.test(top));
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    const overallMap = ch3.slice(ch3.indexOf('data-for=""><ul class="legend">'));
    assert.ok(overallMap.includes('第10章 未執筆'));
    for (const f of ['physics', 'cs']) {
      const page = await readDist(dist, `fields/${f}/index.html`);
      assert.ok(!page.includes('有界作用素'), f);
    }
    await assert.rejects(fs.access(path.join(dist, 'chapters/operators')));
    assert.equal((await fs.readdir(path.join(dist, 'chapters'))).length, 10);
  });

  test('16. 未執筆の章だけの支線は、planned の requires で分岐駅を決める', async () => {
    const line =
      '- id: probability\n  code: P\n  name: 確率線\n  color: "#B5562A"\n  layout: down\n  planned:\n    - chapter: 10\n      title: 測度と確率\n      stations: [測度空間, 確率空間]\n';
    const without = await analyzeIn(await rootWithLines((t) => t + line));
    const e12 = without.errors.filter((e) => e.code === 'E12');
    assert.equal(e12.length, 1, without.errors.map((e) => `${e.code} ${e.message}`).join('\n'));
    assert.match(e12[0].message, /確率線/);
    assert.equal(e12[0].file, 'lines.yml');

    const withReq = await analyzeIn(await rootWithLines((t) => `${t + line}      requires: [metric-space]\n`));
    assert.deepEqual(withReq.errors, []);
    const site = withReq.ctx.site;
    const overall = layoutMap(site, new Set(site.stations.map((s) => s.id)), { planned: true });
    const m02 = at(overall, 'metric-space');
    const prob = overall.stations.filter((s) => s.info.lineId === 'probability');
    assert.equal(prob.length, 2);
    assert.ok(prob.every((s) => s.y > 0 && s.x > m02.x));
    const path0 = overall.paths.find((p) => p.lineId === 'probability');
    assert.deepEqual(path0.points[0], [m02.x, 0]);
  });
});

describe('route-map: 重なりの検査そのもの', () => {
  test('駅を重ねた配置では失敗する', async () => {
    const { overall } = await maps();
    const moved = { ...overall, stations: overall.stations.map((s) => ({ ...s })) };
    const a1 = at(moved, 'cauchy-sequence');
    at(moved, 'completeness').x = a1.x + 10;
    assert.throws(() => assertNoOverlap('test', moved), /重なる/);
  });
});

describe('route-map: 駅名の折り返し', () => {
  test('「の」の後ろ、文字の種類の変わり目で折り返す', () => {
    assert.deepEqual(wrapLabel('バナッハの不動点定理'), ['バナッハの', '不動点定理']);
    assert.deepEqual(wrapLabel('定義と証明の読み方'), ['定義と証明の', '読み方']);
    assert.deepEqual(wrapLabel('ヒルベルト空間'), ['ヒルベルト', '空間']);
    assert.deepEqual(wrapLabel('コンパクト性と連結性'), ['コンパクト性と', '連結性']);
    assert.deepEqual(wrapLabel('記号の読み方'), ['記号の読み方']);
  });
});

/**
 * @param {string} name
 * @param {any} layout
 */
function assertNoOverlap(name, layout) {
  const { boxes, segments } = layoutBoxes(layout);
  const shrink = (/** @type {any} */ b) => ({ ...b, x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 });
  const hit = (/** @type {any} */ a, /** @type {any} */ b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = shrink(boxes[i]);
      const b = shrink(boxes[j]);
      assert.ok(!hit(a, b), `${name}: ${a.kind}(${a.owner}) と ${b.kind}(${b.owner}) が重なる`);
    }
  }
  const stationAt = new Map(layout.stations.map((s) => [`${s.x},${s.y}`, s.info.id]));
  for (const seg of segments) {
    const ends = new Set([stationAt.get(`${seg.x1},${seg.y1}`), stationAt.get(`${seg.x2},${seg.y2}`)]);
    for (const b of boxes) {
      if (b.kind === 'plate' && ends.has(b.owner)) continue;
      if (b.kind === 'plate' && seg.y1 === seg.y2 && seg.y1 === b.y + b.h / 2 && onRow(layout, b.owner, seg)) continue;
      assert.ok(!segmentHitsBox(seg, shrink(b)), `${name}: 線(${seg.lineId}) が ${b.kind}(${b.owner}) に重なる`);
    }
  }
}

/** 水平の線が、同じ段の自分の路線の駅を通るのはよい。 @param {any} layout @param {string} id @param {any} seg */
function onRow(layout, id, seg) {
  const s = layout.stations.find((x) => x.info.id === id);
  return s && s.info.lineId === seg.lineId;
}

/** @param {{ x1: number, y1: number, x2: number, y2: number }} s @param {{ x: number, y: number, w: number, h: number }} b */
function segmentHitsBox(s, b) {
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const x = s.x1 + ((s.x2 - s.x1) * i) / steps;
    const y = s.y1 + ((s.y2 - s.y1) * i) / steps;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
