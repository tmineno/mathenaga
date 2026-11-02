// 値を書かない不変条件(ADR-004)。テスト用原稿と今の原稿の両方で確かめる。
// 期待値はどれも、ビルドとは別の単純な読み方で原稿から作り、具体的な値は書かない。
// build.md 8・9・11・16・21・26・27、content-format.md 2、route-map.md 6・29・30 のうち、値によらない部分。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import * as yaml from 'js-yaml';
import { layoutMap } from '../../src/core/map.js';
import { versionOf } from '../../src/site/pages.js';
import {
  CONTENT,
  CURRENT_CONTENT,
  applicationLabels,
  buildIn,
  countMathIn,
  currentBuild,
  definitionIdsIn,
  listFiles,
  readDist,
  referenceBuild,
  statementsIn,
  tempRoot,
} from '../helpers/fixture.js';
import { assertNoOverlap } from '../helpers/map-checks.js';

const roots = [];
after(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

/**
 * 原稿の章を、章番号の順に読む。
 * @param {string} src
 * @returns {Promise<Array<{ number: number, line: string, stations: string[] }>>}
 */
async function chaptersOf(src) {
  const out = [];
  for (const dir of await fs.readdir(path.join(src, 'chapters'))) {
    const m = /^(\d+)-/.exec(dir);
    if (!m) continue;
    const text = await fs.readFile(path.join(src, 'chapters', dir, 'index.md'), 'utf8');
    out.push({
      number: Number(m[1]),
      line: /^line:\s*(\S+)/m.exec(text)[1],
      stations: [...text.matchAll(/^## .*\{#([A-Za-z0-9-]+)[ }]/gm)].map((x) => x[1]),
    });
  }
  return out.sort((a, b) => a.number - b.number);
}

/** @param {string} src @returns {Promise<any[]>} */
async function linesOf(src) {
  return /** @type {any[]} */ (yaml.load(await fs.readFile(path.join(src, 'lines.yml'), 'utf8')));
}

/** @param {string} dir */
async function snapshot(dir) {
  const map = new Map();
  for (const f of await listFiles(dir)) map.set(f, await fs.readFile(path.join(dir, f)));
  return map;
}

const MANUSCRIPTS = /** @type {const} */ ([
  ['テスト用原稿', CONTENT, () => referenceBuild()],
  ['今の原稿', CURRENT_CONTENT, () => currentBuild()],
]);

for (const [name, src, load] of MANUSCRIPTS) {
  describe(`不変条件:${name}`, () => {
    test('content-format 2. エラーがなく、通知は N01 と N02 だけで、第0章の駅は N01 に入らない', async () => {
      const { result, ctx } = await load();
      assert.deepEqual(result.errors, []);
      assert.equal(result.written, true);
      assert.deepEqual(
        result.notices.map((n) => n.code).filter((c) => c !== 'N01' && c !== 'N02'),
        [],
      );
      const zero = ctx.site.stations.filter((s) => s.chapter.number === 0).map((s) => s.id);
      for (const n of result.notices.filter((x) => x.code === 'N01')) {
        const m = /\(([^)]*)\)$/.exec(n.message);
        assert.ok(m, `N01 の駅の一覧が読めない:${n.message}`);
        for (const id of zero) assert.ok(!m[1].split('、').includes(id), `第0章の駅 ${id} が N01 に出ている`);
      }
    });

    test('build 8. 参照がすべて解決し、数式の個数が原稿・ビルド・ページで一致する', async () => {
      const { ctx, dist } = await load();
      let total = 0;
      for (const c of ctx.site.chapters) {
        for (const r of c.refs) {
          assert.ok(ctx.resolved.has(r.token), `第${c.number}章: [[${r.token.content}]] が解決していない`);
        }
        const { inline, display } = await countMathIn(c.file, src);
        const n = inline + display;
        total += n;
        assert.equal(c.maths.length, n, `第${c.number}章: ビルドが読み取った数式の数が原稿と違う`);
        const html = await readDist(dist, `chapters/${c.id}/index.html`);
        assert.equal((html.match(/class="katex"/g) ?? []).length, n, `第${c.number}章: ページの KaTeX の数式の数`);
      }
      assert.equal(ctx.mathHtml.size, total);
    });

    test('build 9. defs.json には原稿の全定義が1項目ずつ、ID の順に並ぶ', async () => {
      const { ctx, dist } = await load();
      const defs = JSON.parse(await readDist(dist, 'defs.json'));
      /** @type {string[]} */
      const expected = [];
      for (const c of ctx.site.chapters) expected.push(...(await definitionIdsIn(c.file, src)));
      assert.deepEqual(Object.keys(defs), [...expected].sort());
    });

    test('build 11. 式番号は章ごとに (N.1) から、原稿の別行立ての式の数だけ振られる', async () => {
      const { ctx } = await load();
      const labels = ctx.equations.labels;
      const byNumber = (/** @type {string} */ a, /** @type {string} */ b) =>
        Number(a.split('.')[1]) - Number(b.split('.')[1]);
      for (const c of ctx.site.chapters) {
        const { display } = await countMathIn(c.file, src);
        const got = c.tokens
          .filter((t) => t.type === 'math_block')
          .map((t) => labels.get(t))
          .sort(byNumber);
        assert.deepEqual(
          got,
          Array.from({ length: display }, (_, i) => `${c.number}.${i + 1}`),
          `第${c.number}章`,
        );
      }
    });

    test('build 21. 定義と定理の札には、章ごとに原稿の順で通し番号が付く', async () => {
      const { ctx, dist } = await load();
      const NAMES = { definition: '定義', theorem: '定理' };
      for (const c of ctx.site.chapters) {
        const html = await readDist(dist, `chapters/${c.id}/index.html`);
        const got = [...html.matchAll(/<p class="tag">(定義|定理) (\d+\.\d+) · /g)].map((m) => `${m[1]} ${m[2]}`);
        const expected = (await statementsIn(c.file, src)).map((s, i) => `${NAMES[s.kind]} ${c.number}.${i + 1}`);
        assert.deepEqual(got, expected, `第${c.number}章`);
      }
    });

    test('build 27. 応用の札は、章ごとに並ぶ順で 1 から番号が振られる', async () => {
      const { dist } = await load();
      for (const [id, expected] of await applicationLabels(src)) {
        const html = await readDist(dist, `chapters/${id}/index.html`);
        const actual = [...html.matchAll(/<summary>(応用 [^<]*)<\/summary>/g)].map((x) => x[1]);
        assert.deepEqual(actual, expected, id);
      }
    });

    test('build 26. ページが読むファイルの URL の版の印は、そのファイルの中身のハッシュと一致する', async () => {
      const { dist } = await load();
      for (const f of (await listFiles(dist)).filter((x) => x.endsWith('.html'))) {
        const html = await readDist(dist, f);
        const urls = [...html.matchAll(/\s(?:href|src|data-defs)="([^"]+)"/g)].map((m) => m[1]);
        for (const url of urls) {
          if (url.startsWith('#') || /^https?:/.test(url) || url.endsWith('/') || /\/(#|\?field=)/.test(url)) continue;
          const m = /^\/([^?#]+)\?v=([0-9a-f]{10})$/.exec(url);
          assert.ok(m, `${f} の ${url} に版の印がない`);
          assert.equal(m[2], versionOf(await fs.readFile(path.join(dist, m[1]))), `${f} の ${url}`);
        }
      }
    });

    test('build 16. 同じ原稿を2回ビルドすると、dist/ はバイト単位で一致する', async () => {
      const root = await tempRoot(src);
      roots.push(root);
      await buildIn(root);
      const first = await snapshot(path.join(root, 'dist'));
      await buildIn(root);
      const second = await snapshot(path.join(root, 'dist'));
      assert.deepEqual([...second.keys()], [...first.keys()]);
      for (const [k, v] of first) assert.ok(v.equals(/** @type {Buffer} */ (second.get(k))), `${k} が違う`);
    });

    test('route-map 6. どの図でも札・駅名・印・帯の文字・線が重ならない', async () => {
      const { ctx } = await load();
      const site = ctx.site;
      const all = new Set(site.stations.map((s) => s.id));
      assertNoOverlap('全体', layoutMap(site, all, { planned: true }));
      for (const f of site.fields) assertNoOverlap(f.id, layoutMap(site, site.scope.get(f.id), { goals: f.goals }));
      for (const c of site.chapters) {
        assertNoOverlap(`第${c.number}章/全体`, layoutMap(site, all, { planned: true, highlight: c.id }));
        for (const f of site.fields) {
          assertNoOverlap(
            `第${c.number}章/${f.id}`,
            layoutMap(site, site.scope.get(f.id), { goals: f.goals, highlight: c.id }),
          );
        }
      }
    });

    test('route-map 29. 全体の図には書いた駅が1回ずつと未執筆の駅のすべて、分野の図には未執筆の駅がない', async () => {
      const { ctx } = await load();
      const site = ctx.site;
      const overall = layoutMap(site, new Set(site.stations.map((s) => s.id)), { planned: true });
      const written = (await chaptersOf(src)).flatMap((c) => c.stations);
      assert.ok(written.length > 0);
      assert.deepEqual(
        overall.stations
          .filter((s) => !s.info.planned)
          .map((s) => s.info.id)
          .sort(),
        [...written].sort(),
      );
      const planned = (await linesOf(src)).flatMap((l) => (l.planned ?? []).flatMap((p) => p.stations));
      assert.equal(overall.stations.filter((s) => s.info.planned).length, planned.length);
      for (const f of site.fields) {
        const map = layoutMap(site, site.scope.get(f.id), { goals: f.goals });
        assert.ok(!map.stations.some((s) => s.info.planned), `${f.id} の図に未執筆の駅がある`);
      }
    });

    test('route-map 30. 幹線の路線の書いた駅は、幹線の高さに読む順で左から並ぶ', async () => {
      const { ctx } = await load();
      const site = ctx.site;
      const trunk = new Set((await linesOf(src)).filter((l) => !l.layout).map((l) => l.id));
      const expected = (await chaptersOf(src)).filter((c) => trunk.has(c.line)).flatMap((c) => c.stations);
      assert.ok(expected.length > 0);
      const overall = layoutMap(site, new Set(site.stations.map((s) => s.id)), { planned: true });
      const drawn = overall.stations.filter((s) => !s.info.planned && trunk.has(s.info.lineId));
      assert.ok(
        drawn.every((s) => s.y === 0),
        '幹線の駅が幹線の高さにない',
      );
      assert.deepEqual(
        [...drawn].sort((a, b) => a.x - b.x).map((s) => s.info.id),
        expected,
      );
    });
  });
}
