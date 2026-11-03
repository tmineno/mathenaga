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

/** テスト用原稿の路線ファイルにある、未執筆の第10章の行 */
const PLANNED_10 = '    - chapter: 10\n';
const STATIONS_10 = '      stations: [有界作用素, 双対空間, 随伴作用素]\n';

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

  test('2. テスト用原稿はエラーなしで通り、通知は N01 と N02 だけ', async () => {
    const { result } = await referenceBuild();
    assert.deepEqual(result.errors, []);
    assert.equal(result.written, true);
    const n01 = result.notices.filter((n) => n.code === 'N01');
    const physics = n01.find((n) => n.file === 'fields/physics.yml');
    const cs = n01.find((n) => n.file === 'fields/cs.yml');
    assert.match(physics.message, /9駅/);
    assert.match(physics.message, /cauchy-sequence/);
    assert.match(physics.message, /contraction/);
    assert.match(cs.message, /1駅\(cauchy-sequence\)/);
    for (const n of [physics, cs]) assert.ok(!/reading-/.test(n.message), '第0章の駅が N01 に出ている');
    const n02 = result.notices.filter((n) => n.code === 'N02').map((n) => n.file);
    assert.equal(n02.length, 5);
    for (const done of [
      CH3,
      'chapters/00-reading-basics/index.md',
      'chapters/01-convergence-metric/index.md',
      'chapters/02-open-sets-continuity/index.md',
      'chapters/04-norm-inner-product/index.md',
    ]) {
      assert.ok(!n02.includes(done), done);
    }
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
      [
        'planned の章番号が章フォルダと重複',
        'E04',
        (r) => edit(r, 'lines.yml', (t) => replaceOnce(t, PLANNED_10, '    - chapter: 3\n')),
      ],
      [
        'planned の requires の参照先がない',
        'E05',
        (r) =>
          edit(r, 'lines.yml', (t) => replaceOnce(t, STATIONS_10, `${STATIONS_10}      requires: [no-such-station]\n`)),
      ],
      ['planned の stations がない', 'E08', (r) => edit(r, 'lines.yml', (t) => replaceOnce(t, STATIONS_10, ''))],
      [
        'planned の requires が章番号の大きい章の駅を指す',
        'E06',
        async (r) => {
          await fs.rename(path.join(r, 'content/chapters/09-manifolds'), path.join(r, 'content/chapters/14-manifolds'));
          await edit(r, 'lines.yml', (t) => replaceOnce(t, STATIONS_10, `${STATIONS_10}      requires: [manifold]\n`));
        },
      ],
      [
        'planned の知らない項目',
        'E02',
        (r) => edit(r, 'lines.yml', (t) => replaceOnce(t, PLANNED_10, `${PLANNED_10}      id: operators\n`)),
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

// docs/spec/content-format.md「注」「参考文献」の受け入れテスト(4 の 26〜33、7、8)
describe('content-format: 注と参考文献', () => {
  const CH4 = 'chapters/04-norm-inner-product/index.md';
  const PROSE = '何回反復すれば';
  /** 確認の記録の JSON を書き換える。 @param {string} root @param {(v: any) => void} fn */
  const editVerified = (root, fn) =>
    edit(root, 'references.verified.json', (t) => {
      const v = JSON.parse(t);
      fn(v);
      return `${JSON.stringify(v, null, 2)}\n`;
    });
  /** @param {any[]} errors @param {string} code */
  const count = (errors, code) => errors.filter((e) => e.code === code).length;

  test('4.26 閉じていない ^[ → E14', async () => {
    const errors = await errorsAfter((r) => edit(r, CH3, (t) => replaceOnce(t, PROSE, `${PROSE}^[閉じない注`)));
    expectError(errors, 'E14', CH3);
  });
  test('4.27 definition の本文の注と文献の引用 → E14 が2件', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, CH3, (t) =>
        replaceOnce(t, 'のすべての[[コーシー列]]が', 'のすべての[[コーシー列]]^[注] [[@kreyszig-fa]] が'),
      ),
    );
    assert.equal(count(errors, 'E14'), 2, errors.map((e) => `${e.code} ${e.message}`).join('\n'));
  });
  test('4.28 注の中の注 → E14', async () => {
    const errors = await errorsAfter((r) => edit(r, CH3, (t) => replaceOnce(t, PROSE, `${PROSE}^[外 ^[中] 外]`)));
    expectError(errors, 'E14', CH3);
  });
  test('4.29 isbn のチェックディジットの誤り → E03 と E15', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'references.yml', (t) => replaceOnce(t, '978-0-471-50731-4', '978-0-471-50731-5')),
    );
    expectError(errors, 'E03', 'references.yml');
    expectError(errors, 'E15');
  });
  test('4.30 isbn を消す → E08 と E15', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'references.yml', (t) => replaceOnce(t, '  isbn: 978-0-471-50731-4\n', '')),
    );
    expectError(errors, 'E08', 'references.yml');
    expectError(errors, 'E15');
  });
  test('4.31 確認の記録から1件消す → E15', async () => {
    const errors = await errorsAfter((r) =>
      editVerified(r, (v) => {
        delete v['lecun-deep-learning'];
      }),
    );
    const e = expectError(errors, 'E15');
    assert.match(e.message, /lecun-deep-learning/);
  });
  test('4.32 [[文献ID]](@ なし)→ E05', async () => {
    const errors = await errorsAfter((r) => edit(r, CH3, (t) => replaceOnce(t, PROSE, `[[kreyszig-fa]]${PROSE}`)));
    const e = expectError(errors, 'E05', CH3);
    assert.match(e.message, /\[\[@kreyszig-fa\]\]/);
  });
  test('4.33 文献の一覧の知らない項目 url → E02', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'references.yml', (t) => replaceOnce(t, '  year: 1978\n', '  year: 1978\n  url: https://example.com/\n')),
    );
    expectError(errors, 'E02', 'references.yml');
  });
  test('文献の一覧を書き換えたら、確認の記録の fingerprint が合わず E15(年を変える)', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'references.yml', (t) => replaceOnce(t, 'year: 2015', 'year: 2016')),
    );
    assert.deepEqual(
      errors.map((e) => e.code),
      ['E15'],
    );
  });

  test('7. 引かれていない文献は N04', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH4, (t) =>
      replaceOnce(t, '^[深層学習の全体像は、総説 [[@lecun-deep-learning]] にまとまっています。]', ''),
    );
    const r = await analyzeIn(root);
    assert.deepEqual(r.errors, []);
    const n04 = r.notices.filter((n) => n.code === 'N04');
    assert.equal(n04.length, 1);
    assert.match(n04[0].message, /lecun-deep-learning/);
  });

  test('8. 注の本文の数式・文字の ]・用語。\\^[ は文字のまま', async () => {
    const root = await tempRoot();
    roots.push(root);
    await edit(root, CH3, (t) =>
      replaceOnce(t, PROSE, `\\^[文字。${PROSE}^[区間 $[0, 1]$ と、文字の \\] と、[[距離空間]]。]`),
    );
    const r = await analyzeIn(root);
    assert.deepEqual(r.errors, []);
    const ch = r.ctx.site.chapters.find((/** @type {any} */ c) => c.number === 3);
    assert.equal(ch.notes.length, 1);
    const kids = ch.notes[0].token.children.filter((/** @type {any} */ c) => c.type !== 'text');
    assert.deepEqual(
      kids.map((/** @type {any} */ c) => [c.type, c.content]),
      [
        ['math_inline', '[0, 1]'],
        ['text_special', ']'],
        ['wikiref', '距離空間'],
      ],
    );
    assert.equal(r.ctx.resolved.get(kids[2]).id, 'metric-space');
    const html = await (async () => {
      const b = await buildIn(root);
      assert.deepEqual(b.errors, []);
      return readDist(path.join(root, 'dist'), 'chapters/completeness-fixed-point/index.html');
    })();
    assert.ok(html.includes('^[文字。'), '\\^[ が文字の ^[ になっていない');
  });
});
