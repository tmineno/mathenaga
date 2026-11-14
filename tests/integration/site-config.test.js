// サイトの設定(site.yml とロゴ・テーマ。docs/spec/content-format.md「サイトの設定」、ADR-009)の受け入れテスト。
// content-format.md の 4.41〜4.44 と、build.md の 33・34。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  buildIn,
  edit,
  errorsAfter,
  listFiles,
  readDist,
  referenceBuild,
  replaceOnce,
  tempRoot,
} from '../helpers/fixture.js';

/**
 * @param {any[]} errors @param {string} code @param {string} file
 */
function expectError(errors, code, file) {
  const hit = errors.find((e) => e.code === code && e.file === file);
  assert.ok(hit, `${code}(${file})がない: ${JSON.stringify(errors.map((e) => [e.code, e.file, e.message]))}`);
  return hit;
}

describe('content-format 4.41〜4.44: サイトの設定の誤り', () => {
  test('4.41 site.yml を消す → E01', async () => {
    const errors = await errorsAfter((r) => fs.rm(path.join(r, 'content/site.yml')));
    expectError(errors, 'E01', 'site.yml');
  });
  test('4.41 assets/logo.txt を消す → E01', async () => {
    const errors = await errorsAfter((r) => fs.rm(path.join(r, 'content/assets/logo.txt')));
    expectError(errors, 'E01', 'assets/logo.txt');
  });
  test('4.42 storage_prefix を消す → E08', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'site.yml', (t) => replaceOnce(t, 'storage_prefix: mathenaga\n', '')),
    );
    expectError(errors, 'E08', 'site.yml');
  });
  test('4.43 lang を xx にする → E02', async () => {
    const errors = await errorsAfter((r) => edit(r, 'site.yml', (t) => replaceOnce(t, 'lang: ja', 'lang: xx')));
    expectError(errors, 'E02', 'site.yml');
  });
  test('4.43 messages に辞書にない項目を書く → E02', async () => {
    const errors = await errorsAfter((r) => edit(r, 'site.yml', (t) => `${t}messages:\n  no-such-message: x\n`));
    expectError(errors, 'E02', 'site.yml');
  });
  test('4.44 storage_prefix を Math_Enaga にする → E03', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'site.yml', (t) => replaceOnce(t, 'storage_prefix: mathenaga', 'storage_prefix: Math_Enaga')),
    );
    expectError(errors, 'E03', 'site.yml');
  });
  test('4.44 fonts を https://example.com/fonts.css にする → E03', async () => {
    const errors = await errorsAfter((r) =>
      edit(r, 'site.yml', (t) => t.replace(/^fonts: .*$/m, 'fonts: https://example.com/fonts.css')),
    );
    expectError(errors, 'E03', 'site.yml');
  });
});

describe('build 33・34: サイトの設定がページに届く', () => {
  test('33. name・storage_prefix・theme.css を変えると、タイトル・バー・保存キー・CSS が変わる', async () => {
    const root = await tempRoot();
    try {
      await edit(root, 'site.yml', (t) =>
        replaceOnce(
          replaceOnce(t, 'name: MathEnaga', 'name: TestSite'),
          'storage_prefix: mathenaga',
          'storage_prefix: testsite',
        ),
      );
      await fs.writeFile(path.join(root, 'content/assets/theme.css'), ':root{--ink:#123456}');
      const r = await buildIn(root);
      assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
      const dist = path.join(root, 'dist');
      const pages = (await listFiles(dist)).filter((f) => f.endsWith('.html'));
      assert.ok(pages.length > 3);
      for (const p of pages) {
        const html = await readDist(dist, p);
        assert.match(html, /<title>([^<]*\| )?TestSite<\/title>/, `${p} のタイトル`);
        assert.match(html, /<a class="mark" href="[^"]*">[\s\S]*?TestSite<\/a>/, `${p} のバー`);
        assert.ok(!html.includes('mathenaga-'), `${p} に mathenaga- がある`);
      }
      const app = await readDist(dist, 'assets/app.js');
      // 保存キーは閲覧時に接頭辞から作る(src/ui/shared/settings.js の storageKeys)。app.js には接頭辞が埋め込まれる
      assert.match(app, /storagePrefix:\s*"testsite"/, 'app.js に接頭辞 testsite がない');
      assert.ok(!app.includes('mathenaga'), 'app.js に mathenaga がある');
      const css = await readDist(dist, 'assets/style.css');
      assert.ok(css.endsWith(':root{--ink:#123456}'), 'style.css が theme.css で終わらない');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('34. 章ページが読み込むスクリプトは head の中のものと assets/app.js だけで、app.js に import 文がない', async () => {
    const { dist } = await referenceBuild();
    const html = await readDist(dist, 'chapters/completeness-fixed-point/index.html');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((m) => m[1])
      .filter((a) => !/type="application\/json"/.test(a));
    assert.equal(scripts.length, 2, JSON.stringify(scripts));
    assert.equal(scripts.filter((a) => !/\bsrc=/.test(a)).length, 1, 'head の中のスクリプトが1つでない');
    assert.ok(
      scripts.some((a) => /src="\/assets\/app\.js\?v=[0-9a-f]{10}"/.test(a)),
      'assets/app.js がない',
    );
    const app = await readDist(dist, 'assets/app.js');
    assert.ok(!/^\s*import\b/m.test(app), 'app.js に import 文がある');
  });
});
