// docs/spec/site.md「Acceptance tests」(Playwright でブラウザを動かす)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import {
  CH3 as CH3_SOURCE,
  CONTENT,
  addFigures,
  buildIn,
  edit,
  replaceOnce,
  countMathIn,
  referenceBuild,
  serve,
  tempRoot,
} from '../helpers/fixture.js';

/** @type {import('playwright').Browser} */
let browser;
/** @type {{ url: string, close: () => Promise<unknown> }} */
let server;
const CH3 = 'chapters/completeness-fixed-point/';

before(async () => {
  const { dist, result } = await referenceBuild();
  assert.deepEqual(result.errors, []);
  server = await serve(dist);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

/**
 * Google Fonts への通信は遮断する(テストを外部に依存させない。site.md 16 もこれで確かめる)。
 * @param {import('playwright').BrowserContextOptions} [options]
 */
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...options });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

/** @param {import('playwright').Page} page @param {string} sel */
const visible = (page, sel) => page.locator(sel).first().isVisible();
/** @param {import('playwright').Page} page @param {string} sel */
const isOpen = (page, sel) =>
  page
    .locator(sel)
    .first()
    .evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open);
/** @param {import('playwright').Page} page @param {string} sel */
const text = (page, sel) => page.locator(sel).first().innerText();

describe('site: 受け入れテスト', () => {
  test('1. 第3章を ?field=physics で開く', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}?field=physics`);
    assert.ok(await visible(page, '.vgroup[data-kind=goal] > .v.common'));
    assert.ok(await isOpen(page, '.vgroup[data-kind=goal] > details[data-field=physics]'));
    assert.ok(!(await isOpen(page, '.vgroup[data-kind=goal] > details[data-field=cs]')));
    assert.ok(await visible(page, '.map-v[data-for=physics]'));
    assert.ok(!(await visible(page, '.map-v[data-for=""]')));
    assert.equal(await page.locator('.map-v[data-for=physics] rect.band.current').count(), 1);
    assert.match(await text(page, '.here-next [data-for=physics]'), /第4章/);
    assert.equal(await page.locator('.out-label:visible').count(), 0);
    assert.ok(await isOpen(page, '#completeness details[data-field=physics]'));
    assert.ok(!(await isOpen(page, '#completeness details[data-field=cs]')));
    assert.equal(await page.locator('#contraction details.v').count(), 1);
    assert.ok(!(await isOpen(page, '#contraction details[data-field=cs]')));
    assert.match(await text(page, '#picard-lindelof .goal-note[data-goal-for=physics]'), /途中下車OK/);
    const ahead = await text(page, '.next[data-for=physics]');
    assert.match(ahead, /幾何線に乗り換える/);
    assert.match(ahead, /M04 連続写像\(第2章\)から、第6章 位相空間へ/);
    await context.close();
  });

  test('2. 第3章を ?field=cs で開く', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}?field=cs`);
    assert.ok(await isOpen(page, '.vgroup[data-kind=goal] > details[data-field=cs]'));
    assert.equal(await page.locator('.map-v[data-for=cs] rect.band.current').count(), 1);
    assert.ok(await visible(page, '.map-v[data-for=cs]'));
    assert.equal(await text(page, '.here-next [data-for=cs]'), 'なし(この章の A04 が終着駅)');
    const ahead = await text(page, '.next[data-for=cs]');
    assert.match(ahead, /終着駅.*A04 で到着します/);
    assert.match(ahead, /さらに進む場合第4章 ノルムと内積\(情報科学の範囲外\)/);
    assert.ok(!ahead.includes('乗り換える'));
    assert.ok(await page.locator('#picard-lindelof').evaluate((el) => el.classList.contains('is-out')));
    assert.ok(await visible(page, '#picard-lindelof .out-label'));
    await context.close();
  });

  test('3. 保存した値がなく、?field= なしで開くと未選択', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    assert.ok(await visible(page, '.vgroup[data-kind=goal] > .v.common'));
    assert.equal(await page.locator('details.v[open]').count(), 0);
    assert.ok(await visible(page, '.map-v[data-for=""]'));
    assert.equal(await page.locator('.map-v[data-for=""] rect.band.current').count(), 1);
    assert.match(await text(page, '.here-next [data-for=""] a'), /第4章/);
    assert.ok(await visible(page, '.chooser'));
    await context.close();
  });

  test('4. 保存が physics で ?field=xyz なら理論物理', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    await page.evaluate(() => localStorage.setItem('mathenaga-field', 'physics'));
    await page.goto(`${server.url}${CH3}?field=xyz`);
    assert.equal(await page.locator('.switch [data-set-field=physics]').getAttribute('aria-pressed'), 'true');
    assert.ok(await visible(page, '.map-v[data-for=physics]'));
    await context.close();
  });

  test('5. 切り替えると URL と保存が変わり、次のページにも引き継がれる', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    await page.locator('.switch [data-set-field=cs]').click();
    assert.match(page.url(), /\?field=cs$/);
    await page.reload();
    assert.equal(await page.locator('.switch [data-set-field=cs]').getAttribute('aria-pressed'), 'true');
    await page.goto(`${server.url}chapters/norm-inner-product/`);
    assert.equal(await page.locator('.switch [data-set-field=cs]').getAttribute('aria-pressed'), 'true');
    await page.locator('.switch [data-set-field=""]').click();
    assert.ok(!page.url().includes('field='));
    await context.close();
  });

  test('6. スクリプトが動かないときは未選択の表示', async () => {
    const { context, page } = await open({ javaScriptEnabled: false });
    await page.goto(`${server.url}${CH3}?field=physics`);
    assert.equal(await page.locator('details.v[open]').count(), 0);
    assert.ok(await visible(page, '.map-v[data-for=""]'));
    assert.ok(!(await visible(page, '.map-v[data-for=physics]')));
    assert.ok(await visible(page, '.chooser'));
    await context.close();
  });

  test('7. 用語ポップアップ', async () => {
    const { context, page } = await open();
    let defsRequests = 0;
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.endsWith('/defs.json')) defsRequests++;
    });
    await page.goto(`${server.url}${CH3}`);
    await page.locator('#completeness .def .term').first().focus();
    const pop = page.locator('#_pop');
    await pop.locator('.pop-h').waitFor();
    const head = await pop.locator('.pop-h').innerText();
    assert.match(head, /A01/);
    assert.match(head, /定義 3\.\d+ · コーシー列/);
    assert.match(head, /Cauchy sequence/);
    assert.equal(await pop.locator('a.pop-go').getAttribute('href'), '#def-cauchy-sequence');
    await pop.locator('a.pop-go').click();
    await page.waitForFunction(() => location.hash === '#def-cauchy-sequence');
    const term = page.locator('#cauchy-sequence .why .term').first();
    assert.equal(await term.innerText(), '点列の収束');
    await term.focus();
    await page.waitForFunction(() => document.querySelector('#_pop .pop-s')?.textContent?.includes('第1章'));
    assert.equal(await pop.locator('a.pop-go').getAttribute('href'), '/chapters/convergence-metric/#def-convergence');
    assert.equal(defsRequests, 1);
    await context.close();
  });

  test('8. 現在地バー', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    await page.locator('#banach').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById('banach').scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.querySelector('.mini a[data-st=banach]')?.classList.contains('on'));
    await page.goto(`${server.url}${CH3}?field=cs`);
    assert.ok(await page.locator('.mini a[data-st=picard-lindelof]').evaluate((a) => a.classList.contains('off')));
    await context.close();
  });

  test('9. 全体の図の G01 から位相空間の駅へ移る', async () => {
    const { context, page } = await open();
    await page.goto(server.url);
    await page.locator('svg.map a[aria-label="G01 位相空間"]').click();
    await page.waitForURL(/\/chapters\/topological-spaces\/#topological-space$/);
    await context.close();
  });

  test('10. 幅 400px でページ全体の横スクロールが出ない', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    const urls = ['', 'fields/physics/', 'fields/cs/'];
    const { ctx } = await referenceBuild();
    for (const c of ctx.site.chapters)
      urls.push(`chapters/${c.id}/`, `chapters/${c.id}/?field=physics`, `chapters/${c.id}/?field=cs`);
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

  test('11. OS の設定がダークならダークの配色になる', async () => {
    const { context, page } = await open({ colorScheme: 'dark' });
    for (const u of ['', 'fields/physics/', CH3]) {
      await page.goto(server.url + u);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(16, 20, 27)');
    }
    await context.close();
  });

  test('12. キーボードだけで操作できる', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    await page.locator('.switch [data-set-field=physics]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.switch [data-set-field=physics]').getAttribute('aria-pressed'), 'true');
    const term = page.locator('#completeness .def .term').first();
    await term.focus();
    await page.locator('#_pop .pop-h').waitFor();
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#_pop').isHidden());
    const summary = page.locator('#banach details.fold > summary').first();
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.ok(await isOpen(page, '#banach details.fold'));
    await page.locator('.mini a[data-st=contraction]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#contraction');
    await page.locator('.map-v[data-for=physics] svg.map a[aria-label="G01 位相空間"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/chapters\/topological-spaces\/\?field=physics#topological-space$/);
    await context.close();
  });

  test('13. 分野の入口ページ', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}fields/physics/`);
    assert.equal(await page.locator('.goal-list li').count(), 4);
    const rows = await page.locator('table.chap tbody tr').allInnerTexts();
    assert.deepEqual(
      rows.map((r) => Number(/第(\d+)章/.exec(r)[1])),
      [0, 1, 2, 3, 4, 5, 6, 8, 9],
    );
    const row3 = page.locator('table.chap tbody tr', { hasText: '第3章' });
    assert.match(await row3.innerText(), /A01–A05/);
    assert.equal(await row3.locator('a').getAttribute('href'), '/chapters/completeness-fixed-point/?field=physics');
    await page.goto(`${server.url}fields/cs/`);
    assert.match(await page.locator('table.chap tbody tr', { hasText: '第3章' }).innerText(), /A01–A04/);
    await context.close();
  });

  test('14. 理論物理で第7章(範囲外の章)を開く', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}chapters/compactness-connectedness/?field=physics`);
    const next = await text(page, '.here-next [data-for=physics]');
    assert.match(next, /この章は理論物理の範囲外/);
    assert.match(next, /第8章/);
    const stations = page.locator('section.station');
    const n = await stations.count();
    assert.ok(n > 0);
    for (let i = 0; i < n; i++) assert.ok(await stations.nth(i).evaluate((el) => el.classList.contains('is-out')));
    await context.close();
  });

  test('15. 式番号', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    const { display } = await countMathIn(CH3_SOURCE);
    assert.ok(display > 0, '第3章に別行立ての式がない(テストの前提が崩れている)');
    const expected = Array.from({ length: display }, (_, i) => `(3.${i + 1})`);
    /** @type {Record<string, string[]>} */
    const byField = {};
    for (const q of ['', '?field=physics', '?field=cs']) {
      await page.goto(`${server.url}${CH3}${q}`);
      const nums = await page.locator('.eq-num').allTextContents();
      assert.deepEqual(
        [...nums].sort((a, b) => Number(a.slice(3, -1)) - Number(b.slice(3, -1))),
        expected,
      );
      byField[q] = await page.locator('.eq').evaluateAll((els) => els.map((e) => e.textContent.slice(-8)));
    }
    assert.deepEqual(byField['?field=physics'], byField['']);
    assert.deepEqual(byField['?field=cs'], byField['']);
    await page.goto(`${server.url}${CH3}`);
    await page.locator('#banach details.fold > summary').first().click();
    const eqs = page.locator('#banach details.fold .eq');
    const count = await eqs.count();
    assert.ok(count > 0);
    let scrolled = 0;
    for (let i = 0; i < count; i++) {
      const eq = eqs.nth(i);
      await eq.scrollIntoViewIfNeeded();
      const overflow = await eq.locator('.eq-body').evaluate((b) => {
        const over = b.scrollWidth > b.clientWidth;
        b.scrollLeft = b.scrollWidth;
        return over;
      });
      if (overflow) scrolled++;
      const box = await eq.locator('.eq-num').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= 400, `式番号が画面の外: ${JSON.stringify(box)}`);
    }
    assert.ok(scrolled > 0, '幅 400px で横にスクロールする式が証明の詳細にない(テストの前提が崩れている)');
    await context.close();
  });

  test('16. Google Fonts を遮断しても、スクリプトのエラーなく表示できる', async () => {
    const { context, page, errors } = await open({ viewport: { width: 400, height: 800 } });
    await page.goto(`${server.url}${CH3}`);
    assert.ok(await page.locator('.eq .katex').first().isVisible());
    const fontFamily = await page
      .locator('.eq .katex')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    assert.match(fontFamily, /KaTeX/);
    assert.deepEqual(errors, []);
    const [sw, cw] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    assert.ok(sw <= cw);
    await context.close();
  });

  test('17. 本文の段の幅が路線図の枠の幅にそろう', async () => {
    for (const width of [1580, 1200]) {
      const { context, page } = await open({ viewport: { width, height: 900 } });
      for (const u of [`${CH3}?field=physics`, 'fields/physics/', '']) {
        await page.goto(server.url + u);
        const { frame, rows } = await page.evaluate(() => {
          const edges = (/** @type {Element} */ el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, width: r.width };
          };
          const frameEl = [...document.querySelectorAll('.map-scroll')].find((el) => edges(el).width > 0);
          const column = document.querySelector('.chapter') || document.querySelector('.wrap');
          return {
            frame: frameEl ? edges(frameEl) : null,
            rows: [...(column?.children ?? [])]
              .map((el) => ({ name: `${el.tagName.toLowerCase()}.${el.className}`, ...edges(el) }))
              .filter((r) => r.width > 0),
          };
        });
        assert.ok(frame, `${u} (${width}px): 路線図の枠が見えない`);
        assert.ok(rows.length >= 3, `${u} (${width}px): 段の要素が少ない`);
        for (const r of rows) {
          assert.ok(
            Math.abs(r.left - frame.left) <= 1 && Math.abs(r.right - frame.right) <= 1,
            `${u} (${width}px): ${r.name} ${r.left}..${r.right} が路線図の枠 ${frame.left}..${frame.right} とそろわない`,
          );
        }
      }
      await context.close();
    }
  });
});

describe('site: 22. 出発点と落とし穴の札', () => {
  test('出発点の共通版は札なし、分野版は「〈分野名〉では」。pitfall は「落とし穴」', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    const start = page.locator('section#_start');
    assert.equal(await start.locator('.v.common .tag').count(), 0);
    assert.deepEqual(await start.locator('details.v > summary').allInnerTexts(), ['情報科学では', '理論物理では']);
    assert.ok(!(await start.innerText()).includes('出発点('));
    assert.equal(await page.locator('section#cauchy-sequence .box.pitfall > .tag').first().innerText(), '落とし穴');
    assert.equal(await page.locator('text=つまずきポイント').count(), 0);
    await context.close();
  });
});

describe('site: 31. 一言でいうとは地の文', () => {
  test('summary は見出しと目標の印のすぐ後にあり、枠も札もない', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    const first = await page.locator('section#banach').evaluate((s) => {
      const el = [...s.children].find((c) => c.tagName !== 'H2' && !c.classList.contains('goal-note'));
      return { cls: el?.className, text: el?.textContent ?? '' };
    });
    assert.equal(first.cls, 'summary flow');
    assert.match(first.text, /^完備な空間の縮小写像には不動点がただ一つあり/);
    assert.equal(await page.locator('.box .summary, .box.summary').count(), 0);
    assert.equal(await page.locator('section#banach .summary .tag').count(), 0);
    assert.ok(!(await page.locator('body').innerText()).includes('一言でいうと'));
    await context.close();
  });
});

describe('site: 33. 証明は定理の枠の中', () => {
  test('証明の骨格と証明の詳細は、直前の定理の枠の中にある', async () => {
    const source = await fs.readFile(path.join(CONTENT, CH3_SOURCE), 'utf8');
    // 要素名のあとに英数字やハイフンが続くもの(proof に対する proof-sketch)は数えない
    const count = (/** @type {string} */ name) =>
      (source.match(new RegExp(`^::: ${name}(?![\\w-])`, 'gm')) ?? []).length;
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    assert.equal(await page.locator('section.station .box.thm').count(), count('theorem'));
    assert.equal(await page.locator('.box.thm > .thm-part.proof-sketch').count(), count('proof-sketch'));
    assert.equal(await page.locator('.box.thm > details.fold').count(), count('proof'));
    assert.equal(await page.locator('section.station .box.proof-sketch').count(), 0);
    assert.equal(await page.locator('section.station > details.fold').count(), 0);
    const parts = await page
      .locator('section#banach .box.thm')
      .evaluate((box) => [...box.children].map((e) => `${e.tagName.toLowerCase()}.${e.className}`));
    assert.deepEqual(parts, ['p.tag', 'div.flow', 'div.thm-part proof-sketch', 'details.fold proof']);
    const labels = page.locator('section#banach .box.thm');
    assert.equal(await labels.locator('> .thm-part > .tag').innerText(), '証明の骨格');
    assert.equal(await labels.locator('> details.fold > summary').innerText(), '証明の詳細');
    // 証明の詳細の札は、定理の札と同じ大きさ
    const size = (/** @type {string} */ sel) =>
      labels.locator(sel).evaluate((e) => {
        const s = getComputedStyle(e);
        return [s.fontSize, s.fontWeight, s.lineHeight, s.paddingTop, s.paddingLeft];
      });
    assert.deepEqual(await size('> details.fold > summary > .tag'), await size('> p.tag'));
    await context.close();
  });
});

describe('site: 34. 図の表示', () => {
  test('図は本文の段の中央に置き、狭い画面では画像を縦に積む', async () => {
    const root = await tempRoot();
    try {
      await addFigures(root);
      const r = await buildIn(root);
      assert.deepEqual(r.errors, []);
      const s = await serve(path.join(root, 'dist'));
      try {
        for (const width of [1200, 400]) {
          const { context, page } = await open({ viewport: { width, height: 900 } });
          await page.goto(`${s.url}${CH3}`);
          const fig = page.locator('figure#fig-two');
          const items = await fig
            .locator('.fig-item')
            .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
          const box = await fig.evaluate((f) => f.getBoundingClientRect().toJSON());
          if (width === 1200) {
            assert.equal(items[0].top, items[1].top, '1200px で横に並んでいない');
            const mid = (items[0].left + items[1].right) / 2;
            assert.ok(Math.abs(mid - (box.left + box.width / 2)) <= 1, '画像の組が段の中央にない');
          } else {
            assert.ok(items[1].top > items[0].top, '400px で縦に積まれていない');
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
          assert.match(await fig.locator('figcaption').innerText(), /^図 3\.2/);
          await context.close();
        }
      } finally {
        await s.close();
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('site: 改善案の起票(P-07)', () => {
  test('18. 各駅の起票のリンクと、Issue フォームの欄', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    assert.equal(await page.locator('section.station a.issue').count(), 5);
    for (const id of ['cauchy-sequence', 'completeness', 'contraction', 'banach', 'picard-lindelof']) {
      assert.equal(await page.locator(`section.station#${id} a.issue`).count(), 1, id);
    }
    const a = page.locator('section.station#banach a.issue');
    const url = new URL(/** @type {string} */ (await a.getAttribute('href')));
    assert.equal(`${url.origin}${url.pathname}`, 'https://github.com/example/mathenaga/issues/new');
    assert.equal(url.searchParams.get('template'), 'station.yml');
    assert.equal(url.searchParams.get('title'), '[改善案] 第3章 A04 バナッハの不動点定理');
    assert.equal(url.searchParams.get('station'), '第3章 完備性と不動点 / A04 バナッハの不動点定理(banach)');
    assert.equal(
      url.searchParams.get('page'),
      `${new URL(server.url).origin}/chapters/completeness-fixed-point/#banach`,
    );
    assert.equal(await a.getAttribute('target'), '_blank');
    await context.close();
  });

  test('19. 幅 1580px では駅の右の余白にあり、駅の中でだけ見え、読み進めても見えている', async () => {
    const { context, page } = await open({ viewport: { width: 1580, height: 900 } });
    await page.goto(`${server.url}${CH3}`);
    const section = page.locator('section.station#banach');
    const icon = section.locator('a.issue');
    const opacity = () => icon.evaluate((el) => Number(getComputedStyle(el).opacity));
    await section.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(100);
    const sbox = await section.boundingBox();
    assert.ok(sbox);
    await page.mouse.move(sbox.x + 40, sbox.y + 40);
    await page.waitForTimeout(250);
    assert.equal(await opacity(), 1);
    const ibox = await icon.boundingBox();
    assert.ok(ibox && ibox.x >= sbox.x + sbox.width, 'アイコンが駅の右端より右にない');
    const bbox = await section.locator('button.bm').boundingBox();
    assert.ok(bbox && bbox.x >= sbox.x + sbox.width, 'しおりのアイコンが駅の右端より右にない');
    assert.ok(bbox.x + bbox.width <= ibox.x && bbox.y === ibox.y, 'しおりのアイコンが起票のアイコンの左に並んでいない');
    assert.equal(await section.locator('button.bm').evaluate((el) => Number(getComputedStyle(el).opacity)), 1);
    await icon.hover();
    const tip = await icon.evaluate((el) => getComputedStyle(el, '::after').content);
    assert.equal(tip, '"この駅についてGitHub Issueに起票する"');
    assert.equal(await icon.getAttribute('aria-label'), 'この駅についてGitHub Issueに起票する');
    // 駅の外(左の余白)へ出すと見えなくなる
    await page.mouse.move(2, sbox.y + 40);
    await page.waitForTimeout(250);
    assert.equal(await opacity(), 0);
    // 駅の途中までスクロールしても、アイコンは上端のバーの下に見えている
    await page.mouse.wheel(0, sbox.height / 2);
    await page.waitForTimeout(300);
    const after = await icon.boundingBox();
    const barBottom = await page.locator('header.bar').evaluate((el) => el.getBoundingClientRect().bottom);
    assert.ok(after && after.y >= barBottom && after.y + after.height <= 900, `アイコンが画面にない(${after?.y})`);
    await context.close();
  });

  test('20. 幅 400px では見出しの行の右端にあり、横スクロールは出ない', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    await page.goto(`${server.url}${CH3}`);
    for (const id of ['cauchy-sequence', 'banach']) {
      const s = await page.locator(`section.station#${id}`).boundingBox();
      const h2 = await page.locator(`section.station#${id} > h2`).boundingBox();
      const i = await page.locator(`section.station#${id} a.issue`).boundingBox();
      const b = await page.locator(`section.station#${id} button.bm`).boundingBox();
      const name = await page.locator(`section.station#${id} .st-name`).boundingBox();
      assert.ok(s && h2 && i && b && name);
      assert.ok(Math.abs(i.x + i.width - (s.x + s.width)) <= 1, `${id}: 右端にない`);
      assert.ok(i.y < h2.y + h2.height && i.y + i.height > h2.y, `${id}: 見出しの行にない`);
      assert.ok(b.x + b.width <= i.x && b.y === i.y, `${id}: しおりのアイコンが起票の左に並んでいない`);
      assert.ok(name.x + name.width <= b.x, `${id}: 駅名がアイコンにかかる`);
    }
    const [sw, cw] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    assert.ok(sw <= cw);
    await context.close();
  });

  test('21. MATHENAGA_REPO_URL を渡さなければ起票のリンクはない', async () => {
    const root = await tempRoot();
    try {
      const r = await buildIn(root, '/', '');
      assert.deepEqual(r.errors, []);
      const html = await fs.readFile(path.join(root, 'dist/chapters/completeness-fixed-point/index.html'), 'utf8');
      assert.ok(!html.includes('class="issue'));
      const stations = (html.match(/<section class="station/g) ?? []).length;
      assert.ok(stations > 0);
      assert.equal((html.match(/<button type="button" class="bm" data-bm=/g) ?? []).length, stations);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('29. トップページの見出しはロゴの SVG で、鳥の塗りはテーマによらず、文字は本文の文字色', async () => {
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      const { context, page } = await open({ colorScheme: scheme });
      await page.goto(server.url);
      const h1 = page.getByRole('heading', { level: 1, name: 'MathEnaga' });
      assert.equal(await h1.count(), 1);
      const logo = h1.getByRole('img', { name: 'MathEnaga' });
      const box = await logo.boundingBox();
      assert.deepEqual([box?.width, box?.height], [264, 240]);
      const [fills, ink] = await page.evaluate(() => [
        [...document.querySelectorAll('h1 svg path')].map((p) => getComputedStyle(p).fill),
        getComputedStyle(document.body).color,
      ]);
      assert.equal(ink, scheme === 'dark' ? 'rgb(228, 232, 239)' : 'rgb(24, 32, 46)');
      assert.deepEqual(fills, ['rgb(255, 255, 255)', 'rgb(24, 32, 46)', ink], scheme);
      await context.close();
    }
  });

  test('30. 全ページのバーに鳥のアイコンがあり、favicon の SVG と PNG を指定する', async () => {
    const { context, page } = await open();
    const urls = ['', 'fields/physics/', 'fields/cs/'];
    const { ctx } = await referenceBuild();
    for (const c of ctx.site.chapters) urls.push(`chapters/${c.id}/`);
    /** @type {string[][]} */
    let icons = [];
    for (const u of urls) {
      await page.goto(server.url + u);
      const mark = page.locator('.bar a.mark');
      assert.equal(await mark.locator('> svg.mark-icon:first-child').getAttribute('aria-hidden'), 'true', u);
      assert.equal(await mark.innerText(), 'MathEnaga', u);
      icons = await page
        .locator('link[rel=icon]')
        .evaluateAll((ls) => ls.map((l) => [l.getAttribute('type') ?? '', /** @type {HTMLLinkElement} */ (l).href]));
      assert.deepEqual(
        icons.map((i) => i[0]),
        ['image/png', 'image/svg+xml'],
        u,
      );
    }
    for (const [type, href] of icons) {
      const res = await page.request.get(href);
      assert.equal(res.status(), 200, href);
      assert.equal(res.headers()['content-type'], type, href);
    }
    const png = await page.evaluate(async (href) => {
      const img = new Image();
      img.src = href;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const at = (/** @type {number} */ x, /** @type {number} */ y) =>
        [...data.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4)].join(',');
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) colors.add([...data.slice(i, i + 4)].join(','));
      return {
        size: [c.width, c.height],
        corners: [at(0, 0), at(c.width - 1, 0), at(0, c.height - 1), at(c.width - 1, c.height - 1)],
        center: at(c.width / 2, c.height / 2),
        colors: [...colors].sort(),
      };
    }, icons[0][1]);
    assert.deepEqual(png.size, [66, 66]);
    assert.deepEqual(png.corners, Array(4).fill('0,0,0,0'));
    assert.equal(png.center, '255,255,255,255');
    assert.deepEqual(png.colors, ['0,0,0,0', '24,32,46,255', '255,255,255,255']);
    await context.close();
  });
});

describe('site: 位置情報つきのコピー(P-08)', () => {
  const BANACH_PROSE = '#banach > p';
  const BANACH_THM = '#banach .box.thm .flow > p';
  const PLAIN = 'button[data-copy=plain]';
  const LOC = 'button[data-copy=loc]';

  /** クリップボードを使えるページ。 @param {import('playwright').BrowserContextOptions} [options] */
  async function openCopy(options = {}) {
    return open({ permissions: ['clipboard-read', 'clipboard-write'], ...options });
  }

  /**
   * sel に合い from を含む最初の要素を画面に出し、その中で文字列 from の始まりから to の終わりまでを選ぶ
   * (数式の中の文字は探さない)。
   * @param {import('playwright').Page} page @param {string} sel @param {string} from @param {string} to
   */
  async function selectText(page, sel, from, to) {
    await page.evaluate(
      ([sel, from, to]) => {
        const root = [...document.querySelectorAll(sel)].find((el) => el.textContent?.includes(from));
        if (!root) throw new Error(`${sel} に ${from} がない`);
        root.scrollIntoView({ block: 'center' });
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.parentElement?.closest('.katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        /** @type {[Node, number] | null} */
        let start = null;
        /** @type {[Node, number] | null} */
        let end = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const data = /** @type {Text} */ (n).data;
          if (!start) {
            const i = data.indexOf(from);
            if (i < 0) continue;
            start = [n, i];
          }
          const j = data.indexOf(to, n === start[0] ? start[1] : 0);
          if (j >= 0) {
            end = [n, j + to.length];
            break;
          }
        }
        if (!start || !end) throw new Error(`${sel} に ${from}…${to} がない`);
        const r = document.createRange();
        r.setStart(start[0], start[1]);
        r.setEnd(end[0], end[1]);
        const s = /** @type {Selection} */ (window.getSelection());
        s.removeAllRanges();
        s.addRange(r);
      },
      [sel, from, to],
    );
  }

  /** sel に合う最初の要素を画面に出し、その中身を全部選ぶ。 @param {import('playwright').Page} page @param {string} sel */
  async function selectAll(page, sel) {
    await page
      .locator(sel)
      .first()
      .evaluate((el) => {
        el.scrollIntoView({ block: 'center' });
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = /** @type {Selection} */ (window.getSelection());
        s.removeAllRanges();
        s.addRange(r);
      });
  }

  /** @param {import('playwright').Page} page */
  const menu = (page) => page.locator('.copy-menu');
  /** @param {import('playwright').Page} page */
  const clip = (page) => page.evaluate(() => navigator.clipboard.readText());
  /** @param {import('playwright').Page} page @param {string} button */
  async function copyWith(page, button) {
    await menu(page).waitFor({ state: 'visible' });
    await menu(page).locator(button).click();
    await page.locator('.copy-menu .copy-status', { hasText: /コピー/ }).waitFor();
    return clip(page);
  }

  test('23. 地の文を選ぶと2つのボタンが出て、位置つき・そのままでコピーできる', async () => {
    const { context, page, errors } = await openCopy();
    await page.goto(`${server.url}${CH3}`);
    await selectText(page, BANACH_PROSE, '何回反復すれば', '何回反復すれば');
    await menu(page).waitFor({ state: 'visible' });
    assert.deepEqual(await menu(page).locator('button').allInnerTexts(), [
      'そのままコピー',
      'この文章の位置情報を含んでコピー',
    ]);
    assert.equal(await copyWith(page, LOC), '[3:A04:17:13]\n何回反復すれば');
    assert.equal(await page.locator('.copy-menu .copy-status').innerText(), 'コピーしました');
    await selectText(page, BANACH_PROSE, '何回反復すれば', '何回反復すれば');
    assert.equal(await copyWith(page, PLAIN), '何回反復すれば');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('24. 行内の数式は TeX に戻し、数式の途中から選んでも数式全体を含める', async () => {
    const { context, page } = await openCopy();
    await page.goto(`${server.url}${CH3}`);
    await selectText(page, BANACH_THM, '縮小率', '縮小写像');
    assert.equal(await copyWith(page, LOC), '[3:A04:2:36]\n縮小率 $k$ の縮小写像');
    // $k$ の描画の中から、その後ろの「の」まで
    await page
      .locator(BANACH_THM)
      .first()
      .evaluate((p) => {
        p.scrollIntoView({ block: 'center' });
        const k = /** @type {Element} */ (
          [...p.querySelectorAll('.katex')].find((el) => el.querySelector('annotation')?.textContent === 'k')
        );
        const inner = /** @type {Text} */ (
          document
            .createTreeWalker(/** @type {Node} */ (k.querySelector('.katex-html')), NodeFilter.SHOW_TEXT)
            .nextNode()
        );
        const after = /** @type {Text} */ (k.nextSibling);
        const r = document.createRange();
        r.setStart(inner, 0);
        r.setEnd(after, after.data.indexOf('の') + 1);
        const s = /** @type {Selection} */ (window.getSelection());
        s.removeAllRanges();
        s.addRange(r);
      });
    assert.equal(await copyWith(page, LOC), '[3:A04:2:40]\n$k$ の');
    await context.close();
  });

  test('25. 別行立ての式は $$…$$ にし、式番号を含めない', async () => {
    const { context, page } = await openCopy();
    await page.goto(`${server.url}${CH3}`);
    await selectAll(page, '#banach .box.drop-assumption .eq');
    assert.equal(
      await copyWith(page, LOC),
      '[3:A04:20:1]\n$$|T(x) - T(y)| = |x - y|\\left(1 - \\frac{1}{xy}\\right) < |x - y|$$',
    );
    await context.close();
  });

  test('26. 駅の外の節は節の名前。分野を選んでも段落の番号は変わらない。見出しは 0', async () => {
    for (const q of ['', '?field=physics']) {
      const { context, page } = await openCopy();
      await page.goto(`${server.url}${CH3}${q}`);
      await selectText(page, '#_start', 'この章では', '導入します');
      assert.match(await copyWith(page, LOC), /^\[3:出発点:7:1\]\nこの章では、1 を防ぐ条件として完備性を/);
      await context.close();
    }
    const { context, page } = await openCopy();
    await page.goto(`${server.url}${CH3}`);
    await selectAll(page, '#banach > h2 .st-name');
    assert.match(await copyWith(page, LOC), /^\[3:A04:0:\d+\]\nバナッハの不動点定理/);
    await context.close();
  });

  test('27. 本文の外ではボタンを出さない。Tab でボタンへ、Esc で閉じる', async () => {
    const { context, page } = await openCopy();
    await page.goto(`${server.url}${CH3}`);
    for (const sel of ['.map-v[data-for=""] svg text', 'header.bar', '#banach .box.thm > .tag']) {
      await selectAll(page, sel);
      await page.waitForTimeout(400);
      assert.ok(!(await menu(page).isVisible()), `${sel} でボタンが出た`);
    }
    await selectText(page, BANACH_PROSE, '何回反復すれば', '何回反復すれば');
    await menu(page).waitFor({ state: 'visible' });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'そのままコピー');
    await page.keyboard.press('Enter');
    await page.locator('.copy-menu .copy-status', { hasText: 'コピーしました' }).waitFor();
    assert.equal(await clip(page), '何回反復すれば');
    await selectText(page, BANACH_PROSE, '何回反復すれば', '何回反復すれば');
    await menu(page).waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await menu(page).waitFor({ state: 'hidden' });
    await context.close();
  });

  test('28. クリップボードに書けなければ「コピーできませんでした」', async () => {
    const { context, page } = await open();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
      document.execCommand = () => false;
    });
    await page.goto(`${server.url}${CH3}`);
    await selectText(page, BANACH_PROSE, '何回反復すれば', '何回反復すれば');
    await menu(page).waitFor({ state: 'visible' });
    await menu(page).locator(LOC).click();
    await page.locator('.copy-menu .copy-status', { hasText: 'コピーできませんでした' }).waitFor();
    await context.close();
  });
});

describe('route-map: 14. 章の帯を押すと章のページの先頭へ移る(ブラウザ)', () => {
  test('全体の図の第3章の帯の、駅のない部分を押す', async () => {
    const { context, page } = await open();
    await page.goto(server.url);
    const band = page.locator('svg.map a.ch[aria-label="第3章 完備性と不動点"] rect.band');
    const box = await band.boundingBox();
    assert.ok(box);
    // 帯の右下の隅(駅の札と駅名のない場所)を押す
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4);
    await page.waitForURL(/\/chapters\/completeness-fixed-point\/$/);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await context.close();
  });
});

describe('route-map: 17. ポインタが帯の中にある間は帯を強調し続ける(ブラウザ)', () => {
  test('駅の札の上でも第3章の帯は強調のまま。線の上を押すと章へ移る', async () => {
    const { context, page } = await open();
    await page.goto(server.url);
    const link = page.locator('svg.map a.ch[aria-label="第3章 完備性と不動点"]');
    const band = link.locator('rect.band');
    const fill = () => band.evaluate((r) => getComputedStyle(r).fill);
    const normal = await fill();
    const box = await band.boundingBox();
    const plate = await page.locator('svg.map a.st[aria-label="A02 完備性"] rect.plate').boundingBox();
    const next = await page.locator('svg.map a.st[aria-label="A03 縮小写像"] rect.plate').boundingBox();
    assert.ok(box && plate && next);
    // 帯の右下の隅(駅のない場所)に入れる
    await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 4 });
    const highlighted = await fill();
    assert.notEqual(highlighted, normal);
    // A02 の札の上へ動かしても強調のまま
    await page.mouse.move(plate.x + plate.width / 2, plate.y + plate.height / 2, { steps: 6 });
    assert.equal(await fill(), highlighted);
    assert.ok(await link.evaluate((a) => a.classList.contains('on')));
    // 帯の外へ出すと元に戻る
    await page.mouse.move(2, 2, { steps: 6 });
    assert.equal(await fill(), normal);
    // A02 と A03 の間の線の上を押すと、第3章のページの先頭へ
    await page.mouse.click((plate.x + plate.width + next.x) / 2, plate.y + plate.height / 2);
    await page.waitForURL(/\/chapters\/completeness-fixed-point\/$/);
    await context.close();
  });
});

describe('route-map: 図の操作(ブラウザ)', () => {
  /** @param {import('playwright').Page} page */
  const frameOf = (page) => page.locator('.map-v:visible .map-scroll').first();
  /** @param {import('playwright').Page} page */
  const svgBox = async (page) => /** @type {any} */ (await frameOf(page).locator('svg.map').boundingBox());

  test('18. スクロールバーはなく、ドラッグで動く。駅の上からのドラッグでは移らない', async () => {
    const { context, page } = await open();
    await page.goto(server.url);
    const frame = frameOf(page);
    assert.equal(await frame.evaluate((el) => getComputedStyle(el).overflowX), 'hidden');
    const before = await svgBox(page);
    const a02 = /** @type {any} */ (await frame.locator('a.st[aria-label="A02 完備性"] rect.plate').boundingBox());
    await page.mouse.move(a02.x + a02.width / 2, a02.y + a02.height / 2);
    await page.mouse.down();
    await page.mouse.move(a02.x - 150, a02.y + a02.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await svgBox(page);
    assert.ok(after.x < before.x - 100, `図が左へ動いていない(${before.x} → ${after.x})`);
    assert.equal(new URL(page.url()).pathname, '/');
    await context.close();
  });

  test('19. 拡大・縮小・全体を表示', async () => {
    const { context, page } = await open();
    await page.goto(server.url);
    const w0 = (await svgBox(page)).width;
    await page.locator('.map-tools button[aria-label="拡大"]').first().click();
    const w1 = (await svgBox(page)).width;
    assert.ok(Math.abs(w1 / w0 - 1.25) < 0.01, `拡大 ${w0} → ${w1}`);
    await page.locator('.map-tools button[aria-label="縮小"]').first().click();
    await page.locator('.map-tools button[aria-label="縮小"]').first().click();
    const w2 = (await svgBox(page)).width;
    assert.ok(w2 < w0, `縮小 ${w0} → ${w2}`);
    await page.locator('.map-tools button[aria-label="全体を表示"]').first().click();
    const f = /** @type {any} */ (await frameOf(page).boundingBox());
    const b = await svgBox(page);
    assert.ok(b.x >= f.x - 1 && b.x + b.width <= f.x + f.width + 1, '横が枠に収まらない');
    assert.ok(b.y >= f.y - 1 && b.y + b.height <= f.y + f.height + 1, '縦が枠に収まらない');
    await context.close();
  });

  test('20. 幅 400px の第3章では、今の章の帯の中央が枠の中に見える', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    await page.goto(`${server.url}${CH3}`);
    const frame = frameOf(page);
    const f = /** @type {any} */ (await frame.boundingBox());
    const band = /** @type {any} */ (await frame.locator('rect.band.current').boundingBox());
    const cx = band.x + band.width / 2;
    assert.ok(cx > f.x && cx < f.x + f.width, `帯の中央 ${cx} が枠 ${f.x}..${f.x + f.width} の外`);
    await context.close();
  });

  test('21. 枠の外の駅にフォーカスすると、枠の中に見える', async () => {
    const { context, page } = await open({ viewport: { width: 400, height: 800 } });
    await page.goto(server.url);
    const frame = frameOf(page);
    const link = frame.locator('a.st[aria-label="G07 多様体"]');
    const f = /** @type {any} */ (await frame.boundingBox());
    const before = /** @type {any} */ (await link.boundingBox());
    assert.ok(before.x > f.x + f.width, '最初から枠の中にある');
    await link.focus();
    await page.waitForTimeout(100);
    const r = /** @type {any} */ (await link.boundingBox());
    assert.ok(r.x >= f.x && r.x + r.width <= f.x + f.width, `フォーカスした駅が枠の外(${r.x})`);
    await context.close();
  });

  test('22. スクリプトを止めると、ボタンはなく横スクロールになる', async () => {
    const { context, page } = await open({ javaScriptEnabled: false });
    await page.goto(server.url);
    assert.equal(await page.locator('.map-tools').count(), 0);
    const frame = page.locator('.map-scroll').first();
    assert.equal(await frame.evaluate((el) => getComputedStyle(el).overflowX), 'auto');
    assert.ok(await frame.evaluate((el) => el.scrollWidth > el.clientWidth));
    await context.close();
  });
});

describe('route-map: 23. 強調した帯の色(ブラウザ)', () => {
  test('今の章の帯とポインタを重ねた帯は、ライトとダークで決めた強調の色', async () => {
    for (const [scheme, hl] of /** @type {const} */ ([
      ['light', 'rgb(236, 232, 250)'],
      ['dark', 'rgb(64, 54, 111)'],
    ])) {
      const { context, page } = await open({ colorScheme: scheme });
      await page.goto(`${server.url}${CH3}`);
      const map = page.locator('.map:visible').first();
      const fill = (/** @type {import('playwright').Locator} */ l) => l.evaluate((e) => getComputedStyle(e).fill);
      assert.equal(await fill(map.locator('.band.current')), hl, scheme);
      const other = map
        .locator('a.ch')
        .filter({ hasNot: page.locator('.band.current') })
        .first();
      const plain = await fill(other.locator('.band'));
      assert.notEqual(plain, hl, scheme);
      await other.hover({ force: true });
      assert.equal(await fill(other.locator('.band')), hl, scheme);
      await context.close();
    }
  });
});

describe('route-map: 12. ダークテーマの路線の色(ブラウザ)', () => {
  test('解析線は color_dark、本線は color のまま', async () => {
    const stroke = async (/** @type {'light' | 'dark'} */ scheme) => {
      const { context, page } = await open({ colorScheme: scheme });
      await page.goto(server.url);
      const r = await page.evaluate(() => ({
        analysis: getComputedStyle(document.querySelector('path.l-analysis')).stroke,
        main: getComputedStyle(document.querySelector('path.l-main')).stroke,
      }));
      await context.close();
      return r;
    };
    const light = await stroke('light');
    const dark = await stroke('dark');
    assert.equal(light.analysis, 'rgb(91, 69, 184)');
    assert.equal(dark.analysis, 'rgb(170, 152, 242)');
    assert.equal(light.main, 'rgb(135, 144, 161)');
    assert.equal(dark.main, 'rgb(135, 144, 161)');
  });
});

// ---------- 表示の設定(P-09)としおり(P-10) ----------

/**
 * 設定のメニューを開き(閉じていれば)、項目を選ぶ。checks の項目は value に true/false を渡す。
 * @param {import('playwright').Page} page @param {string} key @param {string | boolean} value
 */
async function choose(page, key, value) {
  if (await page.locator('#_settings').isHidden()) await page.locator('.settings-btn').click();
  if (typeof value === 'boolean') {
    const box = page.locator(`#_settings input[name="_set-${key}"]`);
    if (value) await box.check();
    else await box.uncheck();
  } else {
    await page.locator(`#_settings input[name="_set-${key}"][value="${value}"]`).check();
  }
}

/** @param {import('playwright').Page} page */
const look = (page) =>
  page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    text: document.documentElement.getAttribute('data-text'),
    width: document.documentElement.getAttribute('data-width'),
    bg: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.body).color,
  }));

/**
 * 1×1 の PNG の画素(R, G, B)。画素が1つなら、どの filter でも生の値と同じになる。
 * @param {Buffer} png
 */
function pixelOf(png) {
  /** @type {Buffer[]} */
  const idat = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i);
    if (png.toString('ascii', i + 4, i + 8) === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return [raw[1], raw[2], raw[3]];
}

/** @param {import('playwright').Page} page */
const mapScale = (page) =>
  page
    .locator('.map-v:visible svg.map')
    .first()
    .evaluate((svg) => Number(/scale\(([^)]+)\)/.exec(/** @type {SVGElement} */ (svg).style.transform)?.[1]));

describe('site: 表示の設定(P-09)', () => {
  test('35. 右下の設定のボタンとメニュー', async () => {
    const { context, page } = await open();
    for (const u of ['', 'fields/physics/']) {
      await page.goto(server.url + u);
      assert.ok(await page.locator('.settings-btn').isVisible(), u);
    }
    await page.goto(`${server.url}${CH3}`);
    const btn = page.locator('.settings-btn');
    assert.equal(await btn.getAttribute('aria-label'), '表示の設定');
    const before = await btn.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100);
    assert.deepEqual(await btn.boundingBox(), before);
    const vp = /** @type {{ width: number, height: number }} */ (page.viewportSize());
    assert.ok(before && before.x + before.width > vp.width - 40 && before.y + before.height > vp.height - 40);

    await btn.click();
    const panel = page.locator('#_settings');
    assert.ok(await panel.isVisible());
    assert.ok(await page.evaluate(() => document.activeElement?.matches('#_settings input')));
    await page.keyboard.press('Escape');
    assert.ok(await panel.isHidden());
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('settings-btn')));
    await btn.click();
    assert.ok(await panel.isVisible());
    await page.mouse.click(40, 400);
    assert.ok(await panel.isHidden());
    await context.close();

    const off = await open({ javaScriptEnabled: false });
    await off.page.goto(`${server.url}${CH3}`);
    assert.equal(await off.page.locator('.settings-btn').count(), 0);
    await off.context.close();
  });

  test('36. テーマを選ぶと OS の設定によらずその配色になり、図の SVG も合わせる', async () => {
    const root = await tempRoot();
    try {
      await addFigures(root);
      // 画像の中の prefers-color-scheme で塗りを変える SVG(ライトは白、ダークは黒)
      await fs.writeFile(
        path.join(root, 'content', path.dirname(CH3_SOURCE), 'figures', 'a.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><style>rect{fill:#ffffff}@media (prefers-color-scheme: dark){rect{fill:#000000}}</style><rect width="300" height="200"/></svg>\n',
      );
      const r = await buildIn(root);
      assert.deepEqual(r.errors, []);
      const s = await serve(path.join(root, 'dist'));
      try {
        /** @param {import('playwright').Page} page */
        const figPixel = async (page) => {
          const img = page.locator('figure#fig-one img');
          await img.scrollIntoViewIfNeeded();
          await page.waitForFunction(
            () => /** @type {HTMLImageElement} */ (document.querySelector('#fig-one img'))?.complete,
          );
          const b = /** @type {any} */ (await img.boundingBox());
          return pixelOf(
            await page.screenshot({
              clip: { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), width: 1, height: 1 },
            }),
          );
        };
        const osDark = await open({ colorScheme: 'dark' });
        await osDark.page.goto(`${s.url}${CH3}`);
        const dark = await look(osDark.page);
        assert.deepEqual(await figPixel(osDark.page), [0, 0, 0]);

        const { context, page } = await open({ colorScheme: 'light' });
        await page.goto(`${s.url}${CH3}`);
        const light = await look(page);
        assert.notEqual(light.bg, dark.bg);
        await choose(page, 'theme', 'dark');
        assert.deepEqual([(await look(page)).bg, (await look(page)).ink], [dark.bg, dark.ink]);
        await page.keyboard.press('Escape');
        assert.deepEqual(await figPixel(page), [0, 0, 0]);
        await page.reload();
        assert.equal((await look(page)).bg, dark.bg);
        assert.deepEqual(await figPixel(page), [0, 0, 0]);
        await page.goto(s.url);
        assert.equal((await look(page)).bg, dark.bg);
        await choose(page, 'theme', 'auto');
        assert.equal((await look(page)).bg, light.bg);

        await choose(osDark.page, 'theme', 'light');
        assert.equal((await look(osDark.page)).bg, light.bg);
        await osDark.page.keyboard.press('Escape');
        assert.deepEqual(await figPixel(osDark.page), [255, 255, 255]);
        await context.close();
        await osDark.context.close();
      } finally {
        await s.close();
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('37. 文字の大きさは本文の段だけを変え、バーと路線図は変えない', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    const sizes = () =>
      page.evaluate(() => {
        const fs = (/** @type {string} */ sel) =>
          getComputedStyle(/** @type {Element} */ (document.querySelector(sel))).fontSize;
        const label = [...document.querySelectorAll('.map .label')].find((e) => e.getBoundingClientRect().width > 0);
        return {
          body: fs('#banach > p[data-p]'),
          mark: fs('.bar .mark'),
          map: label ? getComputedStyle(label).fontSize : '',
        };
      });
    const medium = await sizes();
    assert.equal(medium.body, '16px');
    await choose(page, 'text', 'large');
    assert.deepEqual(await sizes(), { ...medium, body: '18px' });
    await choose(page, 'text', 'small');
    assert.deepEqual(await sizes(), { ...medium, body: '14px' });
    await context.close();
  });

  test('38. 本文の幅で段と路線図の枠の幅が変わり、広くしても横スクロールは出ない', async () => {
    const { context, page } = await open({ viewport: { width: 1580, height: 900 } });
    await page.goto(`${server.url}${CH3}`);
    for (const [value, page_] of /** @type {const} */ ([
      ['narrow', 860],
      ['wide', 1400],
    ])) {
      await choose(page, 'width', value);
      const m = await page.evaluate(() => {
        const wrap = getComputedStyle(/** @type {Element} */ (document.querySelector('.wrap')));
        const col = /** @type {Element} */ (document.querySelector('.chapter')).getBoundingClientRect();
        const frame = /** @type {Element} */ (
          [...document.querySelectorAll('.map-scroll')].find((el) => el.getBoundingClientRect().width > 0)
        ).getBoundingClientRect();
        return {
          max: wrap.maxWidth,
          pad: parseFloat(wrap.paddingLeft) + parseFloat(wrap.paddingRight),
          col: { left: col.left, right: col.right, width: col.width },
          frame: { left: frame.left, right: frame.right },
        };
      });
      assert.equal(m.max, `${page_}px`, value);
      assert.ok(Math.abs(m.col.width - (page_ - m.pad)) <= 1, `${value}: 段の幅 ${m.col.width}`);
      assert.ok(Math.abs(m.col.left - m.frame.left) <= 1 && Math.abs(m.col.right - m.frame.right) <= 1, value);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    assert.equal((await look(page)).width, 'wide');
    assert.equal(await page.locator('section.station a.issue').count(), 5);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      false,
    );
    await context.close();
  });

  test('39. 最初から開く', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    const states = (/** @type {string} */ sel) =>
      page.locator(sel).evaluateAll((els) => els.map((d) => /** @type {HTMLDetailsElement} */ (d).open));
    assert.ok((await states('details.fold.proof')).length > 0);
    assert.ok((await states('details.fold.answer')).length > 0);
    await choose(page, 'openProof', true);
    await choose(page, 'openAnswer', true);
    assert.ok((await states('details.fold.proof')).every(Boolean), '選んだときに開かない');
    await page.reload();
    assert.ok((await states('details.fold.proof')).every(Boolean));
    assert.ok((await states('details.fold.answer')).every(Boolean));
    await choose(page, 'openOther', true);
    await page.goto(`${server.url}${CH3}?field=physics`);
    assert.ok((await states('details.v[data-field=cs]')).every(Boolean));
    await choose(page, 'openProof', false);
    await choose(page, 'openAnswer', false);
    await choose(page, 'openOther', false);
    await page.reload();
    assert.ok(!(await states('details.fold.proof')).some(Boolean));
    assert.ok(!(await states('details.fold.answer')).some(Boolean));
    assert.ok(!(await states('details.v[data-field=cs]')).some(Boolean));
    assert.ok((await states('details.v[data-field=physics]')).every(Boolean));
    await context.close();
  });

  test('40. 用語ポップアップを押したときだけ出す', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    await choose(page, 'popup', 'click');
    await page.keyboard.press('Escape');
    const term = page.locator('#completeness .def .term').first();
    const pop = page.locator('#_pop');
    await term.hover();
    await page.waitForTimeout(300);
    assert.ok(await pop.isHidden(), '重ねただけで出た');
    await term.focus();
    await page.waitForTimeout(300);
    assert.ok(await pop.isHidden(), 'フォーカスだけで出た');
    await term.click();
    await pop.locator('.pop-h').waitFor();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    assert.ok(await pop.isVisible(), 'ポインターを離すと閉じた');
    await page.keyboard.press('Escape');
    assert.ok(await pop.isHidden());
    await context.close();
  });

  test('42. 壊れた値は初期値として扱い、保存できなくても効き、元に戻せる', async () => {
    const a = await open();
    await a.page.goto(`${server.url}${CH3}`);
    await a.page.evaluate(() => localStorage.setItem('mathenaga-settings', '{"theme":"neon","text":"large"}'));
    await a.page.reload();
    const v = await look(a.page);
    assert.deepEqual([v.theme, v.text], [null, 'large']);
    assert.equal(
      await a.page
        .locator('#banach > p[data-p]')
        .first()
        .evaluate((e) => getComputedStyle(e).fontSize),
      '18px',
    );
    assert.deepEqual(a.errors, []);
    await a.context.close();

    const b = await open();
    await b.context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('denied');
        },
      });
    });
    await b.page.goto(`${server.url}${CH3}`);
    await choose(b.page, 'theme', 'dark');
    assert.equal((await look(b.page)).theme, 'dark');
    assert.deepEqual(b.errors, []);
    await b.context.close();

    const c = await open();
    await c.page.goto(`${server.url}${CH3}?field=physics`);
    await c.page.locator('.map-v:visible .map-tools button[aria-label="拡大"]').click();
    await choose(c.page, 'theme', 'dark');
    await choose(c.page, 'text', 'large');
    await choose(c.page, 'openProof', true);
    await c.page.locator('#_settings button', { hasText: '元に戻す' }).click();
    const after = await look(c.page);
    assert.deepEqual([after.theme, after.text, after.width], [null, null, null]);
    assert.ok(await c.page.locator('#_settings input[name="_set-theme"][value="auto"]').isChecked());
    assert.equal(await mapScale(c.page), 1);
    assert.ok(
      !(await c.page
        .locator('details.fold.proof')
        .evaluateAll((els) => els.some((d) => /** @type {HTMLDetailsElement} */ (d).open))),
    );
    const stored = await c.page.evaluate(() => ({
      settings: localStorage.getItem('mathenaga-settings'),
      zoom: localStorage.getItem('mathenaga-map-zoom'),
      field: localStorage.getItem('mathenaga-field'),
    }));
    assert.deepEqual(stored, { settings: null, zoom: null, field: 'physics' });
    await c.context.close();
  });
});

describe('site: しおり(P-10)', () => {
  test('41. 駅をしおりに入れ、上端のバーの一覧から戻る', async () => {
    const { context, page, errors } = await open();
    await page.goto(`${server.url}${CH3}`);
    const bm = page.locator('#banach button.bm');
    assert.equal(await bm.getAttribute('aria-pressed'), 'false');
    assert.equal(await bm.getAttribute('aria-label'), 'この駅をしおりに入れる');
    await bm.click();
    assert.equal(await bm.getAttribute('aria-pressed'), 'true');
    assert.equal(await bm.getAttribute('aria-label'), 'しおりから外す');
    await page.mouse.move(2, 400);
    await page.waitForTimeout(250);
    assert.equal(await bm.evaluate((el) => Number(getComputedStyle(el).opacity)), 1, '入れた駅のアイコンが見えない');

    const opener = page.locator('.bar .bm-open');
    const list = page.locator('#_bookmarks');
    await opener.click();
    assert.deepEqual(await list.locator('.bm-list a').allInnerTexts(), ['第3章 A04 バナッハの不動点定理']);
    assert.ok(await page.evaluate(() => document.activeElement?.matches('#_bookmarks .bm-list a')));
    await page.keyboard.press('Escape');
    assert.ok(await list.isHidden());
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('bm-open')));

    await page.goto(`${server.url}chapters/convergence-metric/`);
    const first = page.locator('section.station button.bm').first();
    const firstName = await page.locator('section.station').first().locator('.st-name').innerText();
    const firstCode = await page.locator('section.station').first().getAttribute('data-loc');
    await first.click();
    await page.goto(server.url);
    await page.locator('.bar .bm-open').click();
    assert.deepEqual(await list.locator('.bm-list a').allInnerTexts(), [
      `第1章 ${firstCode} ${firstName}`,
      '第3章 A04 バナッハの不動点定理',
    ]);
    await list.locator('.bm-list a', { hasText: 'バナッハ' }).click();
    await page.waitForURL(/\/chapters\/completeness-fixed-point\/#banach$/);

    await page.locator('.bar .bm-open').click();
    await list.locator('.bm-list li', { hasText: 'バナッハ' }).locator('.bm-del').click();
    assert.deepEqual(await list.locator('.bm-list a').allInnerTexts(), [`第1章 ${firstCode} ${firstName}`]);
    assert.equal(await bm.getAttribute('aria-pressed'), 'false');
    await bm.click();
    await bm.click();
    assert.equal(await bm.getAttribute('aria-pressed'), 'false', 'もう一度押しても外れない');

    await choose(page, 'theme', 'auto');
    await page.locator('#_settings button', { hasText: 'しおりを消す' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.bar .bm-open').click();
    assert.equal(await list.locator('.bm-list a').count(), 0);
    assert.match(await list.locator('.bm-empty').innerText(), /しおりはまだありません/);

    await page.evaluate(() =>
      localStorage.setItem('mathenaga-bookmarks', '{"completeness-fixed-point":{"loc":"A04","p":5}}'),
    );
    await page.reload();
    await page.locator('.bar .bm-open').click();
    assert.equal(await list.locator('.bm-list a').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();

    const off = await open({ javaScriptEnabled: false });
    await off.page.goto(`${server.url}${CH3}`);
    assert.equal(await off.page.locator('button.bm:visible, .bm-open:visible').count(), 0);
    await off.context.close();
  });
});

describe('route-map: 24. 倍率を覚える(ブラウザ)', () => {
  test('拡大した倍率でほかの章の図も開き、元に戻すと 1 倍', async () => {
    const { context, page } = await open();
    await page.goto(`${server.url}${CH3}`);
    const zoomIn = page.locator('.map-v:visible .map-tools button[aria-label="拡大"]');
    await zoomIn.click();
    await zoomIn.click();
    await page.goto(`${server.url}chapters/norm-inner-product/`);
    assert.equal(await mapScale(page), 1.5625);
    const frame = /** @type {any} */ (await page.locator('.map-v:visible .map-scroll').boundingBox());
    const band = /** @type {any} */ (await page.locator('.map-v:visible rect.band.current').boundingBox());
    assert.ok(Math.abs(band.x + band.width / 2 - (frame.x + frame.width / 2)) <= 1, '今の章の帯が枠の横の中央にない');
    await choose(page, 'theme', 'auto');
    await page.locator('#_settings button', { hasText: '元に戻す' }).click();
    await page.goto(`${server.url}chapters/norm-inner-product/`);
    assert.equal(await mapScale(page), 1);
    await context.close();
  });
});

describe('site: 43. 同じ分野の応用が2つある駅', () => {
  test('選んだ分野の最初の応用だけを開き、2つ目は折りたたむ', async () => {
    const root = await tempRoot();
    try {
      await edit(root, CH3_SOURCE, (t) =>
        replaceOnce(
          t,
          '## 縮小写像',
          '::: application {field=physics title="二つ目の応用"}\n二つ目の応用の本文です。\n:::\n\n## 縮小写像',
        ),
      );
      const r = await buildIn(root);
      assert.deepEqual(r.errors, []);
      const s = await serve(path.join(root, 'dist'));
      try {
        const { context, page } = await open();
        const physics = (/** @type {import('playwright').Page} */ p) =>
          p.locator('#completeness details.v[data-field=physics]').evaluateAll((els) =>
            els.map((d) => ({
              title: /** @type {HTMLElement} */ (d.querySelector('summary')).innerText,
              open: /** @type {HTMLDetailsElement} */ (d).open,
            })),
          );
        await page.goto(`${s.url}${CH3}?field=physics`);
        const v = await physics(page);
        assert.equal(v.length, 2);
        assert.match(v[0].title, /関数の空間/);
        assert.match(v[1].title, /二つ目の応用/);
        assert.deepEqual(
          v.map((x) => x.open),
          [true, false],
        );
        // 1つ目は閉じられず、2つ目は開ける
        const summaries = page.locator('#completeness details.v[data-field=physics] > summary');
        await summaries.nth(0).click();
        await summaries.nth(1).click();
        assert.deepEqual(
          (await physics(page)).map((x) => x.open),
          [true, true],
        );
        await page.goto(`${s.url}${CH3}?field=cs`);
        assert.deepEqual(
          (await physics(page)).map((x) => x.open),
          [false, false],
        );
        await context.close();
      } finally {
        await s.close();
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
