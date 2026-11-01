// docs/spec/content-format.md「Acceptance tests」

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import {
  CH3,
  analyzeIn,
  buildIn,
  edit,
  errorsAfter,
  readDist,
  referenceBuild,
  replaceOnce,
  tempRoot,
} from '../helpers/fixture.js';

const roots = [];
after(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

/** @param {any[]} errors @param {string} code @param {string} [file] */
function expectError(errors, code, file) {
  const hit = errors.find((e) => e.code === code && (!file || e.file === file));
  assert.ok(
    hit,
    `${code}${file ? ` (${file})` : ''} が出ていない。出たもの:\n${errors.map((e) => `${e.code} ${e.file}:${e.line} ${e.message}`).join('\n')}`,
  );
  return hit;
}

describe('content-format: 受け入れテスト', () => {
  test('1. banach 駅から proof-sketch を消すと E08 の1件だけで止まり、dist/ は変わらない', async () => {
    const root = await tempRoot();
    roots.push(root);
    await fs.mkdir(path.join(root, 'dist'));
    await fs.writeFile(path.join(root, 'dist', 'marker.txt'), 'before');
    await edit(root, CH3, (t) => t.replace(/::: proof-sketch\n1\. 一歩の移動距離[\s\S]*?\n:::\n/, ''));
    const r = await buildIn(root);
    assert.equal(r.written, false);
    assert.equal(r.errors.length, 1, r.errors.map((e) => e.message).join('\n'));
    assert.equal(r.errors[0].code, 'E08');
    assert.equal(r.errors[0].file, CH3);
    assert.match(r.errors[0].message, /バナッハの不動点定理/);
    assert.equal(await fs.readFile(path.join(root, 'dist', 'marker.txt'), 'utf8'), 'before');
  });

  test('2. 基準原稿はエラーなしで通り、通知は N01 と N02 だけ', async () => {
    const { result } = await referenceBuild();
    assert.deepEqual(result.errors, []);
    assert.equal(result.written, true);
    const n01 = result.notices.filter((n) => n.code === 'N01');
    const physics = n01.find((n) => n.file === 'fields/physics.yml');
    const cs = n01.find((n) => n.file === 'fields/cs.yml');
    assert.match(physics.message, /17駅/);
    assert.match(physics.message, /cauchy-sequence/);
    assert.match(physics.message, /contraction/);
    assert.match(cs.message, /5駅\(reading-symbols、reading-proofs、convergence、metric-space、cauchy-sequence\)/);
    const n02 = result.notices.filter((n) => n.code === 'N02').map((n) => n.file);
    assert.equal(n02.length, 9);
    assert.ok(!n02.includes(CH3));
    assert.deepEqual(
      result.notices.map((n) => n.code).filter((c) => c !== 'N01' && c !== 'N02'),
      [],
    );
  });

  test('3. 第3章の参照が仕様どおりに解決する', async () => {
    const { ctx } = await referenceBuild();
    const ch3 = ctx.site.chapterById.get('completeness-fixed-point');
    const find = (/** @type {string} */ content) => {
      const ref = ch3.refs.find((r) => r.token.content === content);
      assert.ok(ref, `参照 [[${content}]] がない`);
      return ctx.resolved.get(ref.token);
    };
    assert.deepEqual(pick(find('コーシー列')), { kind: 'definition', id: 'cauchy-sequence' });
    assert.deepEqual(pick(find('banach|バナッハの不動点定理')), { kind: 'station', id: 'banach' });
    assert.deepEqual(pick(find('completeness|完備')), { kind: 'definition', id: 'completeness' });
    assert.deepEqual(pick(find('一様収束')), { kind: 'definition', id: 'uniform-convergence' });
    assert.equal(find('一様収束').chapterId, 'convergence-metric');
  });

  describe('4. 壊した原稿でそれぞれのエラーが出る', () => {
    const cases = [
      [
        '存在しない requires',
        'E05',
        (r) => edit(r, CH3, (t) => replaceOnce(t, 'requires=metric-space}', 'requires=no-such-station}')),
      ],
      [
        '駅の ID の重複',
        'E04',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(t, '{#contraction requires=metric-space}', '{#metric-space requires=metric-space}'),
          ),
      ],
      [
        'requires の循環',
        'E06',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(
              t,
              '{#completeness requires=cauchy-sequence}',
              '{#completeness requires=cauchy-sequence,banach}',
            ),
          ),
      ],
      [
        '後ろの駅を前提にする',
        'E06',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(
              t,
              '{#cauchy-sequence requires=metric-space}',
              '{#cauchy-sequence requires=metric-space,topological-space}',
            ),
          ),
      ],
      [
        '名前の曖昧さ',
        'E07',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(
              t,
              '::: definition {name="縮小写像" en="contraction mapping"}',
              '::: definition {#contraction-2 name="完備" en="x"}\nx\n:::\n\n[[完備]]\n\n::: definition {name="縮小写像" en="contraction mapping"}',
            ),
          ),
      ],
      [
        '参照範囲の外の名前',
        'E07',
        (r) => edit(r, CH3, (t) => replaceOnce(t, 'この章では、1 を防ぐ', '[[位相空間]]。この章では、1 を防ぐ')),
      ],
      [
        '定理と章の ID を [[…]] で指す',
        'E05',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(t, 'この章では、1 を防ぐ', '[[banach-fixed-point]] [[hilbert-spaces]]。この章では、1 を防ぐ'),
          ),
      ],
      [
        '共通版のゴールの欠落',
        'E08',
        (r) => edit(r, CH3, (t) => t.replace(/::: goal\n逐次近似が必ず[^\n]*\n:::\n/, '')),
      ],
      ['知らないブロック', 'E02', (r) => edit(r, CH3, (t) => replaceOnce(t, '::: pitfall', '::: lemma'))],
      [
        'ID のない駅の見出し',
        'E09',
        (r) => edit(r, CH3, (t) => replaceOnce(t, '## 縮小写像 {#contraction requires=metric-space}', '## 縮小写像')),
      ],
      [
        '閉じていない $',
        'E10',
        (r) => edit(r, CH3, (t) => replaceOnce(t, 'この章では、1 を防ぐ', '値段は $5 です。この章では、1 を防ぐ')),
      ],
      [
        'KaTeX が解釈できない数式',
        'E10',
        (r) => edit(r, CH3, (t) => replaceOnce(t, 'この章では、1 を防ぐ', '$\\frac{1}{$ この章では、1 を防ぐ')),
      ],
      [
        '存在しない図',
        'E11',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(t, 'この章では、1 を防ぐ', '![図](figures/none.svg)\n\nこの章では、1 を防ぐ'),
          ),
      ],
      [
        '章番号の重複',
        'E04',
        (r) =>
          fs.rename(
            path.join(r, 'content/chapters/04-norm-inner-product'),
            path.join(r, 'content/chapters/3-norm-inner-product'),
          ),
      ],
      ['分野ファイルの知らない項目', 'E02', (r) => edit(r, 'fields/physics.yml', (t) => `id: physics\n${t}`)],
      [
        '式の \\tag',
        'E10',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(t, 'd(T(x), T(y)) \\le k\\, d(x, y)', 'd(T(x), T(y)) \\le k\\, d(x, y) \\tag{1}'),
          ),
      ],
      [
        '式の知らない属性',
        'E02',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(
              t,
              'd(T(x), T(y)) \\le k\\, d(x, y)\n$$',
              'd(T(x), T(y)) \\le k\\, d(x, y)\n$$ {#contraction-ineq name="誤差"}',
            ),
          ),
      ],
      [
        '式の ID の重複',
        'E04',
        (r) =>
          edit(r, CH3, (t) =>
            replaceOnce(t, 'd(T(x), T(y)) \\le k\\, d(x, y)\n$$', 'd(T(x), T(y)) \\le k\\, d(x, y)\n$$ {#banach}'),
          ),
      ],
      [
        '路線ファイルの style と color_dark の誤り',
        'E02',
        (r) => edit(r, 'lines.yml', (t) => replaceOnce(t, 'style: dotted', 'style: dashed\n  color_dark: purple')),
      ],
      [
        '章フォルダ名に接頭辞がない',
        'E03',
        (r) =>
          fs.rename(
            path.join(r, 'content/chapters/05-hilbert-spaces'),
            path.join(r, 'content/chapters/hilbert-spaces'),
          ),
      ],
      [
        'front matter の chapter',
        'E02',
        (r) => edit(r, CH3, (t) => replaceOnce(t, '---\ntitle:', '---\nchapter: 3\ntitle:')),
      ],
    ];
    for (const [name, code, mutate] of cases) {
      test(`${name} → ${code}`, async () => {
        const errors = await errorsAfter(/** @type {any} */ (mutate));
        const hit = expectError(errors, /** @type {string} */ (code));
        assert.ok(hit.file, 'ファイルが出ていない');
      });
    }
    test('路線ファイルの color_dark の形式 → E03', async () => {
      const errors = await errorsAfter((r) =>
        edit(r, 'lines.yml', (t) => replaceOnce(t, 'style: dotted', 'color_dark: purple')),
      );
      expectError(errors, 'E03', 'lines.yml');
    });
    test('requires の循環には循環の一覧が付く', async () => {
      const errors = await errorsAfter((r) =>
        edit(r, CH3, (t) =>
          replaceOnce(t, '{#completeness requires=cauchy-sequence}', '{#completeness requires=cauchy-sequence,banach}'),
        ),
      );
      const cycle = errors.find((e) => e.code === 'E06' && e.message.includes('循環'));
      assert.ok(cycle);
      assert.match(cycle.message, /completeness/);
      assert.match(cycle.message, /banach/);
    });
    test('後ろの駅を前提にするエラーは行番号を持つ', async () => {
      const errors = await errorsAfter((r) =>
        edit(r, CH3, (t) =>
          replaceOnce(
            t,
            '{#cauchy-sequence requires=metric-space}',
            '{#cauchy-sequence requires=metric-space,topological-space}',
          ),
        ),
      );
      const e = expectError(errors, 'E06', CH3);
      assert.equal(e.line, 38);
    });
  });

  test('5. 別々のファイルの誤り2つが、1回のビルドで両方出る', async () => {
    const errors = await errorsAfter(async (r) => {
      await edit(r, CH3, (t) => replaceOnce(t, '::: pitfall', '::: lemma'));
      await edit(r, 'fields/physics.yml', (t) => `id: physics\n${t}`);
    });
    expectError(errors, 'E02', CH3);
    expectError(errors, 'E02', 'fields/physics.yml');
  });

  test('6. 本文の <script> は文字として出て、script 要素はできない', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) =>
      replaceOnce(t, 'この章では、1 を防ぐ', '<script>alert(1)</script>\n\nこの章では、1 を防ぐ'),
    );
    const r = await buildIn(root);
    assert.deepEqual(r.errors, []);
    const html = await readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
  });

  test('参照範囲の外にだけ候補があるとき、エラーにその ID が出る', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) => replaceOnce(t, 'この章では、1 を防ぐ', '[[位相空間]]。この章では、1 を防ぐ'));
    const r = await analyzeIn(root);
    const e = expectError(r.errors, 'E07', CH3);
    assert.match(e.message, /topological-space/);
  });
});

/** @param {any} r */
function pick(r) {
  return { kind: r.kind, id: r.id };
}
