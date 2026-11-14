// docs/spec/build.md「Acceptance tests」19:npm run dev のプレビュー
//
// 保存から表示が変わるまでの時間を測るので、ほかのテストと同時には動かさない。ほかのテストと CPU を取り合うと、
// 再ビルドが上限の 5 秒を超えることがある。package.json の test は、このファイルを除いたテストが終わってから
// このファイルだけを動かす。

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { chromium } from 'playwright';
import { ROOT } from '../../src/build.js';
import { CONTENT } from '../helpers/fixture.js';

/** リロードまでの上限(ms)。docs/spec/build.md「Performance/Safety」の 5 秒。 */
const RELOAD_LIMIT_MS = 5000;

const cleanups = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

async function freePort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (srv.address()).port;
  await new Promise((r) => srv.close(() => r(undefined)));
  return port;
}

test('19. 保存すると数秒以内に表示が変わり、壊した原稿では前の表示のまま', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mathenaga-dev-'));
  cleanups.push(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
  await fs.cp(CONTENT, path.join(dir, 'content'), { recursive: true });
  await fs.symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(dir, 'src/dev/server.js')], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), SITE_BASE_PATH: '/' },
  });
  cleanups.push(async () => {
    child.kill();
    await new Promise((r) => child.once('exit', r));
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  await waitFor(
    () => stdout.includes('wrote dist/'),
    20000,
    () => `起動しない:\n${stdout}\n${stderr}`,
  );

  const browser = await chromium.launch();
  cleanups.push(() => browser.close());
  const page = await browser.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`http://127.0.0.1:${port}/chapters/completeness-fixed-point/`);
  assert.equal(await page.locator('h1.ch-title').innerText(), '完備性と不動点');

  const file = path.join(dir, 'content/chapters/03-completeness-fixed-point/index.md');
  const original = await fs.readFile(file, 'utf8');
  const started = Date.now();
  await fs.writeFile(file, original.replace('title: 完備性と不動点', 'title: 完備性と不動点(改)'));
  await page.waitForFunction(
    () => document.querySelector('h1.ch-title')?.textContent === '完備性と不動点(改)',
    undefined,
    { timeout: RELOAD_LIMIT_MS },
  );
  const elapsed = Date.now() - started;
  console.log(`保存から表示が変わるまで ${elapsed} ms`);

  const failuresBefore = stderr.length;
  await fs.writeFile(file, original.replace('::: pitfall', '::: lemma'));
  await waitFor(
    () => stderr.slice(failuresBefore).includes('E02'),
    10000,
    () => `エラーが端末に出ない:\n${stderr}`,
  );
  await page.waitForTimeout(500);
  assert.equal(await page.locator('h1.ch-title').innerText(), '完備性と不動点(改)');
});

/**
 * @param {() => boolean} cond
 * @param {number} timeout
 * @param {() => string} message
 */
async function waitFor(cond, timeout, message) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(message());
}
