// docs/spec/site.md「Acceptance tests」(Playwright でブラウザを動かす)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { buildIn, referenceBuild, serve, tempRoot } from '../helpers/fixture.js';

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
      if (r.url().endsWith('/defs.json')) defsRequests++;
    });
    await page.goto(`${server.url}${CH3}`);
    await page.locator('#completeness .def .term').first().focus();
    const pop = page.locator('#_pop');
    await pop.locator('.pop-h').waitFor();
    const head = await pop.locator('.pop-h').innerText();
    assert.match(head, /A01/);
    assert.match(head, /コーシー列/);
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
    const expected = Array.from({ length: 14 }, (_, i) => `(3.${i + 1})`);
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
      assert.ok(s && h2 && i);
      assert.ok(Math.abs(i.x + i.width - (s.x + s.width)) <= 1, `${id}: 右端にない`);
      assert.ok(i.y < h2.y + h2.height && i.y + i.height > h2.y, `${id}: 見出しの行にない`);
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
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
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
