// docs/spec/site.md「ロゴと favicon」の部品(ドットマップの読み取りと、SVG・favicon への変換)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ROOT } from '../../src/build.js';
import {
  BANNER_FILE,
  BANNER_GAP,
  backing,
  bannerSvg,
  birdSvg,
  blocks,
  faviconSvg,
  interior,
  logoSvg,
  parseBitmap,
  placedBlocks,
  svgPath,
  trim,
} from '../../src/ui/html/logo.js';

const LOGO = path.join(ROOT, 'src/site/assets/logo.txt');

describe('logo: ドットマップ', () => {
  test('行の長さが不ぞろいなら、ファイル名と行番号を出して止まる', () => {
    assert.throws(() => parseBitmap('#.#\n##\n', 'x.txt'), /^Error: x\.txt:2: 行の長さが 2\(1 行目は 3\)$/);
  });

  test('# と . 以外の文字があれば、その行で止まる', () => {
    assert.throws(() => parseBitmap('#.\n#o\n', 'x.txt'), /^Error: x\.txt:2: 「o」は使えない/);
  });

  test('空なら止まる', () => {
    assert.throws(() => parseBitmap('\n', 'x.txt'), /ドットマップが空/);
  });

  test('末尾の改行は無視し、trim は線のドットを囲む長方形に切り詰める', () => {
    const bm = trim(parseBitmap('....\n.#..\n..#.\n....\n'));
    assert.deepEqual([bm.width, bm.height], [2, 2]);
    assert.deepEqual(bm.dots, [
      [true, false],
      [false, true],
    ]);
  });

  test('blocks は空行で区切った塊を上から返す', () => {
    const bs = blocks(parseBitmap('.#.\n...\n#.#\n.#.\n'));
    assert.deepEqual(
      bs.map((b) => [b.width, b.height]),
      [
        [1, 1],
        [3, 2],
      ],
    );
  });

  test('interior は線で囲まれた内側だけを返す(斜めの隙間からは外に出ない)', () => {
    const ring = parseBitmap('.#.\n#.#\n.#.\n');
    assert.deepEqual(interior(ring).dots, [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ]);
    const open = parseBitmap('##.\n#.#\n.##\n');
    assert.equal(interior(open).dots[1][1], true);
    const leak = parseBitmap('#.#\n#.#\n###\n');
    assert.equal(interior(leak).dots[1][1], false);
  });

  test('placedBlocks は塊を元の位置と一緒に返し、その位置に置き直すと元に戻る', () => {
    const bm = parseBitmap('..#.\n.##.\n....\n#..#\n');
    const placed = placedBlocks(bm);
    assert.deepEqual(
      placed.map((b) => [b.x, b.y]),
      [
        [1, 0],
        [0, 3],
      ],
    );
    assert.deepEqual(
      placed.map((b) => b.bm),
      blocks(bm),
    );
    const back = bm.dots.map((row) => row.map(() => false));
    for (const { x, y, bm: b } of placed)
      b.dots.forEach((row, j) => row.forEach((d, i) => d && (back[y + j][x + i] = true)));
    assert.deepEqual(back, bm.dots);
  });

  test('svgPath は横に続くドットを1つの長方形にまとめる', () => {
    assert.equal(svgPath(parseBitmap('##.#\n')), 'M0 0h2v1h-2zM3 0h1v1h-1z');
    assert.equal(svgPath(parseBitmap('#\n'), 5, 7), 'M5 7h1v1h-1z');
  });
});

describe('logo: リポジトリのロゴ', () => {
  test('ロゴは 86×78 で、鳥(64×57)とサイト名(86×16)の2つの塊に分かれる', async () => {
    const logo = trim(parseBitmap(await fs.readFile(LOGO, 'utf8')));
    assert.deepEqual([logo.width, logo.height], [86, 78]);
    assert.deepEqual(
      blocks(logo).map((b) => [b.width, b.height]),
      [
        [64, 57],
        [86, 16],
      ],
    );
  });

  test('README のバナーは、鳥とサイト名を横に並べた1枚の SVG で、logo.txt から作ったものと一致する', async () => {
    const logo = trim(parseBitmap(await fs.readFile(LOGO, 'utf8')));
    const [bird, word] = blocks(logo);
    const svg = await fs.readFile(path.join(ROOT, BANNER_FILE), 'utf8');
    assert.equal(svg, bannerSvg(logo), `${BANNER_FILE} が古い。npm run banner で作り直す`);
    assert.match(svg, new RegExp(`viewBox="-1 -1 ${bird.width + BANNER_GAP + word.width + 2} ${bird.height + 2}"`));
    assert.deepEqual(
      [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]),
      ['#ffffff', '#18202e', '#6e7781'],
    );
    const readme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
    assert.match(readme, /^<h1><img src="docs\/assets\/banner\.svg" alt="MathEnaga"[^>]*><\/h1>\n/);
    assert.doesNotMatch(readme, /<picture>|banner-(light|dark)/);
  });

  test('バナーの白い下地は、線と内側を斜めの隣も含めて 1 ドット広げたもの', () => {
    const ring = parseBitmap('###\n#.#\n###\n');
    assert.deepEqual(
      backing(ring).dots.map((r) => r.map((d) => (d ? '#' : '.')).join('')),
      Array(5).fill('#####'),
    );
    const dot = parseBitmap('...\n.#.\n...\n');
    assert.deepEqual(
      backing(dot).dots.map((r) => r.map((d) => (d ? '#' : '.')).join('')),
      ['.....', '.###.', '.###.', '.###.', '.....'],
    );
  });

  test('バナーは、塊が2つない、または文字が鳥より高いロゴでは止まる', () => {
    assert.throws(() => bannerSvg(parseBitmap('##\n')), /2つの塊がない/);
    assert.throws(() => bannerSvg(parseBitmap('#\n.\n#\n#\n')), /鳥\(高さ 1\)より高い/);
  });

  test('サイトの鳥は、白(体の内側と縁)と #18202e(線)で塗り、縁の分だけ広い', async () => {
    const logo = trim(parseBitmap(await fs.readFile(LOGO, 'utf8')));
    const [bird, word] = placedBlocks(logo);
    const fills = (/** @type {string} */ svg) => [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    const icon = birdSvg(bird.bm, 'mark-icon');
    assert.match(icon, new RegExp(`viewBox="-1 -1 ${bird.bm.width + 2} ${bird.bm.height + 2}" aria-hidden="true"`));
    assert.deepEqual(fills(icon), ['#ffffff', '#18202e']);
    const head = logoSvg(logo, { className: 'logo', label: 'MathEnaga' });
    assert.match(
      head,
      new RegExp(`viewBox="-1 -1 ${logo.width + 2} ${logo.height + 2}" role="img" aria-label="MathEnaga"`),
    );
    assert.deepEqual(fills(head), ['#ffffff', '#18202e', 'currentColor']);
    assert.ok(head.includes(`d="${svgPath(word.bm, word.x, word.y)}"`), 'サイト名の文字は元の位置に置く');
    assert.ok(head.includes(`d="${svgPath(bird.bm, bird.x, bird.y)}"`), '鳥は元の位置に置く');
  });

  test('favicon の SVG は、縁を含めた鳥を 66 四方の中央に置き、ダークでも色を変えない', async () => {
    const bird = blocks(trim(parseBitmap(await fs.readFile(LOGO, 'utf8'))))[0];
    const svg = faviconSvg(bird);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 66 66"/);
    assert.deepEqual(
      [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]),
      ['#ffffff', '#18202e'],
    );
    assert.doesNotMatch(svg, /prefers-color-scheme|<style/);
    const [dx, dy] = [(66 - (bird.width + 2)) >> 1, (66 - (bird.height + 2)) >> 1];
    assert.ok(svg.includes(`d="${svgPath(bird, dx + 1, dy + 1)}"`), '鳥は縁を含めて中央に置く');
  });

  test('縁を含めた鳥が favicon に収まらなければ止まる', () => {
    assert.throws(() => faviconSvg(parseBitmap(`${'#'.repeat(65)}\n`)), /縁を含めて 67×3\)が 66×66 に収まらない/);
  });
});
