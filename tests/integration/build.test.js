// docs/spec/build.md「Acceptance tests」(19 はプレビューなので tests/browser/dev.test.js)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { ROOT, analyze } from '../../src/build.js';
import { chapterInField, nextChapter, prerequisiteChapters, transferGuide } from '../../src/core/navigation.js';
import { CH3, buildIn, edit, listFiles, readDist, referenceBuild, replaceOnce, tempRoot } from '../helpers/fixture.js';

const roots = [];
after(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

async function ref() {
  const r = await referenceBuild();
  const site = r.ctx.site;
  const ch = (/** @type {number} */ n) => site.chapters.find((c) => c.number === n);
  return { ...r, site, ch };
}

describe('build: 受け入れテスト', () => {
  test('1. 表示番号', async () => {
    const { site } = await ref();
    const expected = {
      'reading-symbols': 'Z01',
      'metric-space': 'M02',
      'continuous-map': 'M04',
      'cauchy-sequence': 'A01',
      banach: 'A04',
      'picard-lindelof': 'A05',
      'hilbert-space': 'A08',
      torus: 'G06',
      manifold: 'G07',
    };
    for (const [id, code] of Object.entries(expected)) assert.equal(site.stationById.get(id).code, code, id);
  });

  test('2. 乗換駅は3つだけ', async () => {
    const { site } = await ref();
    assert.deepEqual([...site.transfers].sort(), ['continuous-map', 'metric-space', 'reading-proofs']);
  });

  test('3. 第3章の前提は第1章だけ', async () => {
    const { site, ch } = await ref();
    assert.deepEqual(
      prerequisiteChapters(site, ch(3)).map((c) => c.number),
      [1],
    );
  });

  test('4. 情報科学の範囲・章の順序・次の章', async () => {
    const { site, ch } = await ref();
    assert.deepEqual([...site.scope.get('cs')].sort(), [
      'banach',
      'cauchy-sequence',
      'completeness',
      'contraction',
      'convergence',
      'metric-space',
      'reading-proofs',
      'reading-symbols',
    ]);
    assert.deepEqual(
      site.fieldChapters.get('cs').map((c) => c.number),
      [0, 1, 3],
    );
    assert.equal(nextChapter(site, ch(3), 'cs'), null);
    assert.equal(chapterInField(site, ch(4), 'cs'), false);
    assert.equal(nextChapter(site, ch(4), 'cs'), null);
  });

  test('5. 理論物理の範囲・章の順序・次の章', async () => {
    const { site, ch } = await ref();
    assert.ok(!site.scope.get('physics').has('compact-connected'));
    assert.deepEqual(
      site.fieldChapters.get('physics').map((c) => c.number),
      [0, 1, 2, 3, 4, 5, 6, 8, 9],
    );
    assert.equal(nextChapter(site, ch(3), 'physics').number, 4);
    assert.equal(chapterInField(site, ch(7), 'physics'), false);
    assert.equal(nextChapter(site, ch(7), 'physics').number, 8);
  });

  test('6. 分野を選んでいないときの次の章', async () => {
    const { site, ch } = await ref();
    assert.equal(nextChapter(site, ch(3), null).number, 4);
    assert.equal(nextChapter(site, ch(9), null), null);
  });

  test('7. 乗換案内', async () => {
    const { site, ch } = await ref();
    const summary = (/** @type {any[]} */ items) =>
      items.map((t) => ({
        line: t.line.id,
        branch: t.branch.id,
        branchCh: t.branch.chapter.number,
        firstCh: t.first.chapter.number,
        here: t.here,
      }));
    assert.deepEqual(summary(transferGuide(site, ch(3), 'physics')), [
      { line: 'geometry', branch: 'continuous-map', branchCh: 2, firstCh: 6, here: false },
    ]);
    assert.equal(transferGuide(site, ch(3), 'physics')[0].first.id, 'topological-space');
    assert.deepEqual(summary(transferGuide(site, ch(1), 'physics')), [
      { line: 'analysis', branch: 'metric-space', branchCh: 1, firstCh: 3, here: true },
      { line: 'geometry', branch: 'continuous-map', branchCh: 2, firstCh: 6, here: false },
    ]);
    assert.deepEqual(transferGuide(site, ch(3), 'cs'), []);
  });

  test('8. 第3章の参照がすべて解決し、数式がすべて描画される', async () => {
    const { ctx, ch } = await ref();
    const c3 = ch(3);
    for (const r of c3.refs) assert.ok(ctx.resolved.has(r.token), `[[${r.token.content}]] が解決していない`);
    assert.equal(c3.maths.length, 178);
    const all = ctx.site.chapters.reduce((n, c) => n + c.maths.length, 0);
    assert.equal(all, 507);
    assert.equal(ctx.mathHtml.size, 507);
  });

  test('9. defs.json の項目と並び', async () => {
    const { dist } = await ref();
    const defs = JSON.parse(await readDist(dist, 'defs.json'));
    assert.deepEqual(Object.keys(defs), [
      'cauchy-sequence',
      'completeness',
      'contraction',
      'convergence',
      'lipschitz',
      'metric-space',
      'uniform-convergence',
    ]);
    const c = defs['cauchy-sequence'];
    assert.equal(c.code, 'A01');
    assert.equal(c.chapter, 3);
    assert.equal(c.url, '/chapters/completeness-fixed-point/#def-cauchy-sequence');
    assert.ok(c.html.includes('距離空間'));
    assert.ok(!/<(button|a)\b/.test(c.html), 'html にボタンやリンクがある');
  });

  test('10. [[@ID]] の章と駅', async () => {
    const { dist } = await ref();
    const html = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    assert.ok(html.includes('<a class="num" href="/chapters/hilbert-spaces/">第5章</a>'));
    assert.ok(html.includes('<a class="num" href="#banach">A04</a>'));
  });

  test('11. 式番号は第3章が (3.1)〜(3.14)、第0章が (0.1)〜(0.2)、第1章が (1.1)〜(1.7)', async () => {
    const { ctx, ch } = await ref();
    const labels = ctx.equations.labels;
    const c3 = ch(3);
    const eqs = c3.tokens.filter((t) => t.type === 'math_block').map((t) => labels.get(t));
    assert.equal(eqs.length, 14);
    assert.deepEqual(
      [...eqs].sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1])),
      Array.from({ length: 14 }, (_, i) => `3.${i + 1}`),
    );
    const labelOf = (
      /** @type {string} */ blockName,
      /** @type {string} */ stationId,
      /** @type {string | null} */ field = null,
    ) => {
      const st = c3.stations.find((s) => s.id === stationId);
      const block = st.items.find(
        (i) => i.kind === 'block' && i.block.name === blockName && i.block.field === field,
      ).block;
      const tok = c3.tokens.slice(block.start, block.end + 1).find((t) => t.type === 'math_block');
      return labels.get(tok);
    };
    assert.equal(labelOf('definition', 'cauchy-sequence'), '3.1');
    assert.equal(labelOf('definition', 'contraction'), '3.4');
    assert.equal(labelOf('application', 'picard-lindelof', 'physics'), '3.14');
    const expected = new Map([
      [0, 2],
      [1, 7],
    ]);
    for (const c of ctx.site.chapters) {
      if (c.number === 3) continue;
      const got = c.tokens
        .filter((t) => t.type === 'math_block')
        .map((t) => labels.get(t))
        .sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]));
      const n = expected.get(c.number) ?? 0;
      assert.deepEqual(
        got,
        Array.from({ length: n }, (_, i) => `${c.number}.${i + 1}`),
        `第${c.number}章`,
      );
    }
  });

  test('12. 式の ID と [[@ID]] による参照', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) =>
      replaceOnce(
        t,
        'd_\\infty(V_k, V^*) \\le \\frac{\\gamma^k}{1-\\gamma}\\, d_\\infty(V_1, V_0)\n$$',
        'd_\\infty(V_k, V^*) \\le \\frac{\\gamma^k}{1-\\gamma}\\, d_\\infty(V_1, V_0)\n$$ {#value-iteration-error}',
      ),
    );
    await edit(root, 'chapters/04-norm-inner-product/index.md', (t) =>
      replaceOnce(t, '## ノルム空間', '価値反復法の誤差評価は [[@value-iteration-error]] です。\n\n## ノルム空間'),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const ch4 = await readDist(path.join(root, 'dist'), 'chapters/norm-inner-product/index.html');
    assert.ok(
      ch4.includes('<a class="eqref" href="/chapters/completeness-fixed-point/#value-iteration-error">(3.10)</a>'),
    );
    const ch3 = await readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    // 式の要素にはほかの属性(段落の番号 data-p)も付く
    assert.match(ch3, /<div class="eq" id="value-iteration-error"[ >]/);
  });

  test('13. defs.json の定義の式にも式番号が付く', async () => {
    const { dist } = await ref();
    const defs = JSON.parse(await readDist(dist, 'defs.json'));
    assert.ok(defs['cauchy-sequence'].html.includes('<span class="eq-num">(3.1)</span>'));
  });

  test('14. ベースパス /mathenaga/ で、内部の参照がすべて実在するファイルを指す', async () => {
    const root = await tempRoot();
    roots.push(root);
    const r = await buildIn(root, '/mathenaga/');
    assert.deepEqual(r.errors, []);
    const dist = path.join(root, 'dist');
    const files = await listFiles(dist);
    const exists = new Set(files);
    const resolve = (/** @type {string} */ url) => {
      const p = url.split(/[?#]/)[0];
      assert.ok(p.startsWith('/mathenaga/'), `ベースパスが付いていない: ${url}`);
      const rel = p.slice('/mathenaga/'.length);
      return rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
    };
    for (const f of files.filter((x) => x.endsWith('.html'))) {
      const html = await readDist(dist, f);
      assert.match(html, /data-base="\/mathenaga\/"/);
      for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
        const url = m[1];
        if (url.startsWith('#') || /^https?:/.test(url)) continue;
        assert.ok(exists.has(resolve(url)), `${f} の ${url} が dist にない`);
      }
    }
    const css = await readDist(dist, 'assets/katex/katex.min.css');
    const fonts = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    assert.ok(fonts.length > 0);
    for (const font of fonts) {
      assert.match(font, /\.woff2$/);
      assert.ok(exists.has(`assets/katex/${font}`), `KaTeX のフォント ${font} がない`);
    }
    assert.ok(exists.has('defs.json'));
    const defs = JSON.parse(await readDist(dist, 'defs.json'));
    for (const d of Object.values(defs)) assert.ok(exists.has(resolve(/** @type {any} */ (d).url)));
  });

  test('15. 章フォルダを消して再ビルドすると、その章のページは残らない', async () => {
    const root = await tempRoot();
    roots.push(root);
    assert.deepEqual((await buildIn(root)).errors, []);
    await fs.access(path.join(root, 'dist/chapters/compactness-connectedness/index.html'));
    await fs.rm(path.join(root, 'content/chapters/07-compactness-connectedness'), { recursive: true });
    assert.deepEqual((await buildIn(root)).errors, []);
    await assert.rejects(fs.access(path.join(root, 'dist/chapters/compactness-connectedness')));
  });

  test('16. 同じ原稿を2回ビルドすると、dist/ はバイト単位で一致する', async () => {
    const root = await tempRoot();
    roots.push(root);
    await buildIn(root);
    const first = await snapshot(path.join(root, 'dist'));
    await buildIn(root);
    const second = await snapshot(path.join(root, 'dist'));
    assert.deepEqual([...second.keys()], [...first.keys()]);
    for (const [k, v] of first) assert.ok(v.equals(/** @type {Buffer} */ (second.get(k))), `${k} が違う`);
  });

  test('17. 壊した原稿では終了コード相当の失敗になり、dist/ は残る', async () => {
    const root = await tempRoot();
    roots.push(root);
    assert.deepEqual((await buildIn(root)).errors, []);
    const before = await snapshot(path.join(root, 'dist'));
    await edit(root, CH3, (t) => replaceOnce(t, '::: pitfall', '::: lemma'));
    const r = await buildIn(root);
    assert.equal(r.written, false);
    assert.ok(r.errors.length > 0);
    const afterSnap = await snapshot(path.join(root, 'dist'));
    assert.deepEqual([...afterSnap.keys()], [...before.keys()]);
  });

  test('18. MATHENAGA_BASE_PATH=mathenaga は E13', async () => {
    const r = await analyze({ contentDir: '/nonexistent', basePath: 'mathenaga' });
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].code, 'E13');
  });

  test('20. MATHENAGA_REPO_URL=github.com/example/mathenaga は E13', async () => {
    const r = await analyze({ contentDir: '/nonexistent', basePath: '/', repoUrl: 'github.com/example/mathenaga' });
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].code, 'E13');
    assert.match(r.errors[0].message, /MATHENAGA_REPO_URL/);
  });

  test('17・18. npm run build はエラーのとき終了コード 1 でエラーを標準エラー出力に出す', async () => {
    const r = spawnSync(process.execPath, ['src/build.js'], {
      cwd: ROOT,
      env: { ...process.env, MATHENAGA_BASE_PATH: 'mathenaga' },
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^E13 /m);
  });
});

/** @param {string} dir */
async function snapshot(dir) {
  const map = new Map();
  for (const f of await listFiles(dir)) map.set(f, await fs.readFile(path.join(dir, f)));
  return map;
}
