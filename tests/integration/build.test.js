// docs/spec/build.md「Acceptance tests」(19 はプレビューなので tests/browser/dev.test.js)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { ROOT, analyze } from '../../src/build.js';
import { chapterInField, nextChapter, prerequisiteChapters, transferGuide } from '../../src/core/navigation.js';
import { versionOf } from '../../src/site/pages.js';
import {
  CH3,
  CONTENT,
  MERGE_LINE,
  addFigures,
  addFinalGoal,
  addMergeLine,
  analyzeIn,
  buildIn,
  countMathIn,
  definitionIdsIn,
  edit,
  errorsAfter,
  listFiles,
  readDist,
  referenceBuild,
  replaceOnce,
  statementsIn,
  tempRoot,
} from '../helpers/fixture.js';

const roots = [];
after(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

/** 正規表現の最初の括弧の中身。合わなければ例外。 @param {RegExp} re @param {string} text */
function capture(re, text) {
  const m = re.exec(text);
  if (!m) throw new Error(`${re} が合わない`);
  return m[1];
}

/** 乗換案内を比べやすい形にする。 @param {any[]} items */
function summarizeTransfers(items) {
  return items.map((t) => ({
    line: t.line.id,
    branches: t.branches.map((/** @type {any} */ b) => ({
      id: b.station.id,
      ch: b.station.chapter.number,
      here: b.here,
    })),
    firstCh: t.first.chapter.number,
  }));
}

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
      'sets-maps': 'Z03',
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

  test('2. 乗換駅は4つだけ', async () => {
    const { site } = await ref();
    assert.deepEqual([...site.transfers].sort(), ['continuous-map', 'metric-space', 'reading-proofs', 'sets-maps']);
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
      'sets-maps',
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
    assert.deepEqual(summarizeTransfers(transferGuide(site, ch(3), 'physics')), [
      { line: 'geometry', branches: [{ id: 'continuous-map', ch: 2, here: false }], firstCh: 6 },
    ]);
    assert.equal(transferGuide(site, ch(3), 'physics')[0].first.id, 'topological-space');
    assert.deepEqual(summarizeTransfers(transferGuide(site, ch(1), 'physics')), [
      { line: 'analysis', branches: [{ id: 'metric-space', ch: 1, here: true }], firstCh: 3 },
      { line: 'geometry', branches: [{ id: 'continuous-map', ch: 2, here: false }], firstCh: 6 },
    ]);
    assert.deepEqual(transferGuide(site, ch(3), 'cs'), []);
  });

  test('8. 第3章の参照がすべて解決し、原稿の数式がすべて描画される', async () => {
    const { ctx, ch, dist } = await ref();
    const c3 = ch(3);
    for (const r of c3.refs) assert.ok(ctx.resolved.has(r.token), `[[${r.token.content}]] が解決していない`);
    assert.ok(c3.maths.length > 0, '第3章に数式がない(テストの前提が崩れている)');
    let total = 0;
    for (const c of ctx.site.chapters) {
      const { inline, display } = await countMathIn(c.file);
      const n = inline + display;
      total += n;
      assert.equal(c.maths.length, n, `第${c.number}章: ビルドが読み取った数式の数が原稿と違う`);
      const html = await readDist(dist, `chapters/${c.id}/index.html`);
      assert.equal((html.match(/class="katex"/g) ?? []).length, n, `第${c.number}章: ページの KaTeX の数式の数`);
    }
    assert.equal(ctx.mathHtml.size, total);
  });

  test('9. defs.json の項目と並び', async () => {
    const { dist, site } = await ref();
    const defs = JSON.parse(await readDist(dist, 'defs.json'));
    /** @type {string[]} */
    const expected = [];
    for (const c of site.chapters) expected.push(...(await definitionIdsIn(c.file)));
    assert.ok(expected.includes('cauchy-sequence'), 'cauchy-sequence の定義がない(テストの前提が崩れている)');
    assert.deepEqual(Object.keys(defs), [...expected].sort());
    const c = defs['cauchy-sequence'];
    assert.equal(c.code, 'A01');
    assert.equal(c.chapter, 3);
    assert.equal(c.url, '/chapters/completeness-fixed-point/#def-cauchy-sequence');
    assert.ok(c.html.includes('距離空間'));
    assert.ok(!/<(button|a)\b/.test(c.html), 'html にボタンやリンクがある');
    const order = await statementsIn(CH3);
    const pos = order.findIndex((s) => s.kind === 'definition' && s.id === 'cauchy-sequence');
    assert.equal(c.number, `3.${pos + 1}`);
  });

  test('10. [[@ID]] の章と駅', async () => {
    const { dist } = await ref();
    const html = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    assert.ok(html.includes('<a class="num" href="/chapters/hilbert-spaces/">第5章</a>'));
    assert.ok(html.includes('<a class="num" href="#banach">A04</a>'));
  });

  test('11. 式番号は章ごとに (N.1) から、原稿の別行立ての式の数だけ振られる', async () => {
    const { ctx, ch } = await ref();
    const labels = ctx.equations.labels;
    const byNumber = (/** @type {string} */ a, /** @type {string} */ b) =>
      Number(a.split('.')[1]) - Number(b.split('.')[1]);
    for (const c of ctx.site.chapters) {
      const { display } = await countMathIn(c.file);
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
    const c3 = ch(3);
    const last = (await countMathIn(c3.file)).display;
    assert.ok(last >= 4, '第3章の別行立ての式が少なすぎる(テストの前提が崩れている)');
    const labelOf = (
      /** @type {string} */ blockName,
      /** @type {string} */ stationId,
      /** @type {string | null} */ field = null,
      /** @type {'first' | 'last'} */ pick = 'first',
    ) => {
      const st = c3.stations.find((s) => s.id === stationId);
      const block = st.items.find(
        (i) => i.kind === 'block' && i.block.name === blockName && i.block.field === field,
      ).block;
      const toks = c3.tokens.slice(block.start, block.end + 1).filter((t) => t.type === 'math_block');
      return labels.get(pick === 'first' ? toks[0] : toks[toks.length - 1]);
    };
    assert.equal(labelOf('definition', 'cauchy-sequence'), '3.1');
    assert.equal(labelOf('definition', 'contraction'), '3.4');
    // ノートンのドームの解は、理論物理の応用の最後の別行立ての式
    assert.equal(labelOf('application', 'picard-lindelof', 'physics', 'last'), `3.${last}`);
  });

  test('12. 式の ID と [[@ID]] による参照', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) =>
      replaceOnce(
        t,
        'd_\\infty(V_n, V^*) \\le \\frac{\\gamma^n}{1-\\gamma}\\, d_\\infty(V_1, V_0)\n$$',
        'd_\\infty(V_n, V^*) \\le \\frac{\\gamma^n}{1-\\gamma}\\, d_\\infty(V_1, V_0)\n$$ {#value-iteration-error}',
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

  test('21. 定義と定理の札には、章ごとに原稿の順で通し番号が付く', async () => {
    const { dist, ctx } = await ref();
    const NAMES = { definition: '定義', theorem: '定理' };
    let total = 0;
    for (const c of ctx.site.chapters) {
      const html = await readDist(dist, `chapters/${c.id}/index.html`);
      const got = [...html.matchAll(/<p class="tag">(定義|定理) (\d+\.\d+) · /g)].map((m) => `${m[1]} ${m[2]}`);
      const expected = (await statementsIn(c.file)).map((s, i) => `${NAMES[s.kind]} ${c.number}.${i + 1}`);
      assert.deepEqual(got, expected, `第${c.number}章`);
      total += expected.length;
    }
    assert.ok(total >= 5, '定義と定理が少なすぎる(テストの前提が崩れている)');
  });

  test('22. [[@ID]] で定理と、駅と ID を共有しない定義の番号を差し込む', async () => {
    const order = await statementsIn(CH3);
    const no = (/** @type {string} */ id) => `3.${order.findIndex((s) => s.id === id) + 1}`;
    assert.ok(order.some((s) => s.kind === 'definition' && s.id === 'lipschitz' && s.station !== 'lipschitz'));
    const root = await tempRoot();
    roots.push(root);
    await edit(root, 'chapters/04-norm-inner-product/index.md', (t) =>
      replaceOnce(
        t,
        '## ノルム空間',
        '[[@banach-fixed-point]] と [[@lipschitz]] と [[@cauchy-sequence]] を使います。\n\n## ノルム空間',
      ),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const ch4 = await readDist(path.join(root, 'dist'), 'chapters/norm-inner-product/index.html');
    const ch3 = '/chapters/completeness-fixed-point/';
    assert.ok(ch4.includes(`<a class="num" href="${ch3}#banach-fixed-point">定理 ${no('banach-fixed-point')}</a>`));
    assert.ok(ch4.includes(`<a class="num" href="${ch3}#def-lipschitz">定義 ${no('lipschitz')}</a>`));
    // 駅と ID を共有する定義は、これまでどおり駅の表示番号
    assert.ok(ch4.includes(`<a class="num" href="${ch3}#cauchy-sequence">A01</a>`));
    const errors = await errorsAfter((root) =>
      edit(root, CH3, (t) => replaceOnce(t, '## コーシー列', '[[@main]] の駅です。\n\n## コーシー列')),
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'E05');
    assert.match(errors[0].message, /路線の ID なので番号を差し込めない\(駅・章・式・定理・定義・図・応用だけ\)/);
  });

  test('23. 図番号とキャプション、[[@ID]] による図の参照', async () => {
    const root = await tempRoot();
    roots.push(root);
    await addFigures(root);
    await edit(root, 'chapters/04-norm-inner-product/index.md', (t) =>
      replaceOnce(t, '## ノルム空間', '図は [[@fig-two]] です。\n\n## ノルム空間'),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const dist = path.join(root, 'dist');
    const ch3 = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    const figs = [...ch3.matchAll(/<figure class="fig"(?: id="([^"]+)")?[^>]*>([\s\S]*?)<\/figure>/g)];
    assert.deepEqual(
      figs.map((m) => m[1]),
      ['fig-one', 'fig-two'],
    );
    assert.match(figs[0][2], /<figcaption><span class="fig-no">図 3\.1<\/span> 一枚の図<\/figcaption>/);
    assert.match(
      figs[1][2],
      /<figcaption><span class="fig-no">図 3\.2<\/span> \(a\) 左の図 \(b\) 右の図<\/figcaption>/,
    );
    assert.deepEqual(
      [...figs[1][2].matchAll(/<span class="fig-sub">([^<]*)<\/span>/g)].map((m) => m[1]),
      ['(a)', '(b)'],
    );
    assert.ok(!figs[0][2].includes('fig-sub'), '画像1つの図に (a) が付いている');
    assert.ok(!figs.some((m) => m[0].includes('title=')), '図の画像に title が残っている');
    assert.ok(!figs.some((m) => m[0].includes('{#')), '図の {#ID} が文字として出ている');
    assert.match(
      ch3,
      /<p[^>]*>文の中の画像 <img src="[^"]*\/figures\/b\.svg\?v=[0-9a-f]{10}" alt="文中" title="文中の図"> です。<\/p>/,
    );
    const ch4 = await readDist(dist, 'chapters/norm-inner-product/index.html');
    assert.ok(ch4.includes('<a class="num" href="/chapters/completeness-fixed-point/#fig-two">図 3.2</a>'));
  });

  test('24. 図の {…} の誤り', async () => {
    for (const [attrs, code] of [
      ['{#fig-one width=3}', 'E02'],
      ['{#Fig_One}', 'E03'],
    ]) {
      const errors = await errorsAfter(async (root) => {
        await addFigures(root);
        await edit(root, CH3, (t) => replaceOnce(t, '{#fig-one}', attrs));
      });
      assert.deepEqual(
        errors.map((e) => e.code),
        [code],
        attrs,
      );
    }
  });

  test('25. 図のキャプションの数式', async () => {
    const root = await tempRoot();
    roots.push(root);
    await addFigures(root);
    await edit(root, CH3, (t) =>
      replaceOnce(t, '"一枚の図"', String.raw`"点列 $(x_n)$ と集合 $\{x \mid x > 0\}$、\$5"`),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const ch3 = await readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    const caption = /<figure class="fig" id="fig-one"[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>/.exec(ch3)?.[1] ?? '';
    assert.deepEqual(
      [...caption.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((m) => m[1]),
      ['(x_n)', String.raw`\{x \mid x &gt; 0\}`],
    );
    assert.equal(caption.match(/class="katex"/g)?.length, 2);
    assert.match(caption, /、\$5$/);
    assert.ok(!caption.includes('\\$'), 'キャプションに \\$ が残っている');

    for (const title of [String.raw`"点 $x"`, String.raw`"$\frac{1}{$"`, String.raw`"$x \tag{1}$"`]) {
      const errors = await errorsAfter(async (root) => {
        await addFigures(root);
        await edit(root, CH3, (t) => replaceOnce(t, '"一枚の図"', title));
      });
      // 行内の \tag は、使えない命令としても、KaTeX が解釈できない数式としても E10 になる
      assert.deepEqual([...new Set(errors.map((e) => e.code))], ['E10'], title);
    }
  });

  test('25. 参照形式の画像(![…][名前])でも、キャプションの \\$ と \\{ を書いたとおりに読む', async () => {
    const root = await tempRoot();
    roots.push(root);
    await addFigures(root);
    await edit(root, CH3, (t) =>
      replaceOnce(
        t,
        '![一枚目の説明](figures/a.svg "一枚の図"){#fig-one}',
        String.raw`![一枚目の説明][one]{#fig-one}

[one]: figures/a.svg "集合 $\{x \mid x > 0\}$、\$5"`,
      ),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const ch3 = await readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    const caption = /<figure class="fig" id="fig-one"[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>/.exec(ch3)?.[1] ?? '';
    assert.deepEqual(
      [...caption.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((m) => m[1]),
      [String.raw`\{x \mid x &gt; 0\}`],
    );
    assert.match(caption, /、\$5$/);
  });

  test('26. ページが読むファイルの URL に、中身の版の印が付く', async () => {
    const root = await tempRoot();
    roots.push(root);
    await addFigures(root);
    const marks = async () => {
      const r = await buildIn(root);
      assert.deepEqual(r.errors, []);
      const dist = path.join(root, 'dist');
      /** @type {Map<string, string>} */
      const found = new Map();
      for (const f of (await listFiles(dist)).filter((x) => x.endsWith('.html'))) {
        const html = await readDist(dist, f);
        const urls = [...html.matchAll(/\s(?:href|src|data-defs)="([^"]+)"/g)].map((m) => m[1]);
        for (const url of urls) {
          if (url.startsWith('#') || /^https?:/.test(url) || url.endsWith('/') || /\/(#|\?field=)/.test(url)) continue;
          const m = /^\/([^?#]+)\?v=([0-9a-f]{10})$/.exec(url);
          assert.ok(m, `${f} の ${url} に版の印がない`);
          const expected = versionOf(await fs.readFile(path.join(dist, m[1])));
          assert.equal(m[2], expected, `${f} の ${url}`);
          found.set(m[1], m[2]);
        }
      }
      return found;
    };
    const before = await marks();
    for (const p of [
      'assets/style.css',
      'assets/app.js',
      'assets/lines.css',
      'assets/favicon.svg',
      'assets/favicon.png',
      'assets/katex/katex.min.css',
      'defs.json',
      'chapters/completeness-fixed-point/figures/a.svg',
    ]) {
      assert.ok(before.has(p), `${p} の URL がない`);
    }
    await fs.writeFile(
      path.join(root, 'content', path.dirname(CH3), 'figures', 'a.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#999"/></svg>\n',
    );
    const after = await marks();
    const changed = [...after.keys()].filter((k) => after.get(k) !== before.get(k));
    assert.deepEqual(changed, ['chapters/completeness-fixed-point/figures/a.svg']);
  });

  test('27. 応用の番号と、[[@ID]] による応用の参照', async () => {
    // 期待する札の並びは原稿から集める:駅の順 → 分野の並び(分野ファイルの名前の順)→ 書いた順
    const fieldFiles = (await fs.readdir(path.join(CONTENT, 'fields'))).filter((f) => f.endsWith('.yml')).sort();
    /** @type {Map<string, string>} */
    const fieldTitle = new Map();
    for (const f of fieldFiles) {
      const yml = await fs.readFile(path.join(CONTENT, 'fields', f), 'utf8');
      fieldTitle.set(f.replace(/\.yml$/, ''), capture(/^title:\s*(.+)$/m, yml).trim());
    }
    const order = [...fieldTitle.keys()];
    const { dist } = await ref();
    let total = 0;
    for (const dir of (await fs.readdir(path.join(CONTENT, 'chapters'))).sort()) {
      const m = /^(\d+)-(.+)$/.exec(dir);
      if (!m) continue;
      const src = await fs.readFile(path.join(CONTENT, 'chapters', dir, 'index.md'), 'utf8');
      const expected = [];
      let k = 0;
      for (const station of src.split(/^## /m).slice(1)) {
        const apps = [...station.matchAll(/^::: application \{([^}]*)\}$/gm)].map((a, i) => ({
          field: capture(/field=(\S+)/, a[1]),
          title: capture(/title="([^"]*)"/, a[1]),
          i,
        }));
        apps.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field) || a.i - b.i);
        for (const a of apps) expected.push(`応用 ${Number(m[1])}.${++k}(${fieldTitle.get(a.field)}) · ${a.title}`);
      }
      const html = await readDist(dist, `chapters/${m[2]}/index.html`);
      const actual = [...html.matchAll(/<summary>(応用 [^<]*)<\/summary>/g)].map((x) => x[1]);
      assert.deepEqual(actual, expected, dir);
      total += expected.length;
    }
    assert.ok(total > 0);

    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) =>
      replaceOnce(
        t,
        '::: application {field=physics title="量子力学の状態空間"}',
        '::: application {#app-function-space field=physics title="量子力学の状態空間"}',
      ),
    );
    await edit(root, 'chapters/04-norm-inner-product/index.md', (t) =>
      replaceOnce(t, '## ノルム空間', '応用は [[@app-function-space]] です。\n\n## ノルム空間'),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const ch3 = await readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    const label = capture(/<summary>応用 (3\.\d+)\(理論物理\) · 量子力学の状態空間<\/summary>/, ch3);
    assert.match(ch3, /<details class="v" id="app-function-space" data-field="physics">/);
    const ch4 = await readDist(path.join(root, 'dist'), 'chapters/norm-inner-product/index.html');
    assert.ok(
      ch4.includes(`<a class="num" href="/chapters/completeness-fixed-point/#app-function-space">応用 ${label}</a>`),
      '第4章の [[@app-function-space]] が応用の番号のリンクになっていない',
    );

    const errors = await errorsAfter(async (root2) => {
      await edit(root2, CH3, (t) =>
        replaceOnce(
          t,
          '::: application {field=physics title="量子力学の状態空間"}',
          '::: application {#app-function-space field=physics title="量子力学の状態空間"}',
        ),
      );
      await edit(root2, CH3, (t) => replaceOnce(t, '## コーシー列', '[[app-function-space]] です。\n\n## コーシー列'));
    });
    assert.deepEqual(
      errors.map((e) => e.code),
      ['E05'],
    );
    assert.match(errors[0].message, /\[\[@app-function-space\]\] で指す/);
  });

  test('28. 合流する支線の乗換案内は、分岐駅を読む順にすべて持つ', async () => {
    const root = await tempRoot();
    roots.push(root);
    await addMergeLine(root);
    await addFinalGoal(root, 'physics', 'curvature');
    const result = await buildIn(root);
    assert.deepEqual(result.errors, []);
    const r = await analyzeIn(root);
    const site = r.ctx.site;
    const ch5 = /** @type {any} */ (site.chapters.find((c) => c.number === 5));
    const item = summarizeTransfers(transferGuide(site, ch5, 'physics')).find((t) => t.line === MERGE_LINE.id);
    assert.deepEqual(item, {
      line: MERGE_LINE.id,
      branches: [
        { id: 'hilbert-space', ch: 5, here: true },
        { id: 'manifold', ch: 9, here: false },
      ],
      firstCh: 14,
    });
    // 章ページでは、この章の分岐駅とほかの章の分岐駅を「・」でつなぐ(site.md「この先」)
    const page = await readDist(path.join(root, 'dist'), 'chapters/hilbert-spaces/index.html');
    assert.match(
      page,
      /リーマン幾何線に乗り換える<\/b>この章の .*?ヒルベルト空間・.*?多様体\(<a href="\/chapters\/manifolds\/\?field=physics#manifold">第9章<\/a>\)から、/,
    );
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
