// 今の原稿で、ブラウザで確かめる値を書かない不変条件(ADR-004)。
// site.md 10、15 と 33 の個数の部分を、今の原稿の全章で確かめる。期待する個数はテストが原稿から数える。
// テスト用原稿では、同じことを tests/browser/site.test.js が確かめる。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { CURRENT_CONTENT, countMathIn, currentBuild, serve } from '../helpers/fixture.js';

/** @type {import('playwright').Browser} */
let browser;
/** @type {{ url: string, close: () => Promise<unknown> }} */
let server;
/** @type {any} */
let site;

before(async () => {
  const { dist, result, ctx } = await currentBuild();
  assert.deepEqual(result.errors, []);
  site = ctx.site;
  server = await serve(dist);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

/** @param {import('playwright').BrowserContextOptions} [options] */
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...options });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  return { context, page: await context.newPage() };
}

describe('今の原稿:ブラウザでの不変条件', () => {
  test('site 10. 幅 400px で、どのページにも横スクロールが出ない', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    const urls = ['', ...site.fields.map((/** @type {any} */ f) => `fields/${f.id}/`)];
    for (const c of site.chapters) {
      urls.push(`chapters/${c.id}/`, ...site.fields.map((/** @type {any} */ f) => `chapters/${c.id}/?field=${f.id}`));
    }
    for (const u of urls) {
      await page.goto(server.url + u);
      const [sw, cw] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      assert.ok(sw <= cw, `${u}: scrollWidth ${sw} > clientWidth ${cw}`);
    }
    await context.close();
  });

  test('site 15. 各章の式番号は (N.1) から、原稿の別行立ての式の数だけ出る', async () => {
    const { context, page } = await open();
    for (const c of site.chapters) {
      const { display } = await countMathIn(c.file, CURRENT_CONTENT);
      await page.goto(`${server.url}chapters/${c.id}/`);
      const nums = await page.locator('.eq-num').allTextContents();
      const n = (/** @type {string} */ s) => Number(s.slice(s.indexOf('.') + 1, -1));
      assert.deepEqual(
        [...nums].sort((a, b) => n(a) - n(b)),
        Array.from({ length: display }, (_, i) => `(${c.number}.${i + 1})`),
        `第${c.number}章`,
      );
    }
    await context.close();
  });

  test('site 33. 各章で、証明の骨格と証明の詳細は定理の枠の中にだけある', async () => {
    const { context, page } = await open();
    for (const c of site.chapters) {
      const source = await fs.readFile(path.join(CURRENT_CONTENT, c.file), 'utf8');
      // 要素名のあとに英数字やハイフンが続くもの(proof に対する proof-sketch)は数えない
      const count = (/** @type {string} */ name) =>
        (source.match(new RegExp(`^::: ${name}(?![\\w-])`, 'gm')) ?? []).length;
      await page.goto(`${server.url}chapters/${c.id}/`);
      const at = `第${c.number}章`;
      assert.equal(await page.locator('section.station .box.thm').count(), count('theorem'), at);
      assert.equal(await page.locator('.box.thm > .thm-part.proof-sketch').count(), count('proof-sketch'), at);
      assert.equal(await page.locator('.box.thm > details.fold').count(), count('proof'), at);
      assert.equal(await page.locator('section.station .box.proof-sketch').count(), 0, at);
      assert.equal(await page.locator('section.station > details.fold').count(), 0, at);
    }
    await context.close();
  });
});
