// docs/spec/site.md「ロゴと favicon」の部品(ドットマップの読み取りと、SVG・favicon への変換)

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ROOT } from '../../src/build.js';
import {
  BANNER_GAP,
  BANNERS,
  bannerSvg,
  blocks,
  faviconSvg,
  interior,
  parseBitmap,
  svgPath,
  trim,
} from '../../src/site/logo.js';

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

  test('README のバナーは、鳥とサイト名を横に並べた SVG で、logo.txt から作ったものと一致する', async () => {
    const logo = trim(parseBitmap(await fs.readFile(LOGO, 'utf8')));
    const [bird, word] = blocks(logo);
    const width = bird.width + BANNER_GAP + word.width;
    assert.deepEqual(
      BANNERS.map((b) => b.ink),
      ['#18202e', '#e4e8ef'],
    );
    for (const { file, ink } of BANNERS) {
      const svg = await fs.readFile(path.join(ROOT, file), 'utf8');
      assert.equal(svg, bannerSvg(logo, ink), `${file} が古い。npm run banner で作り直す`);
      assert.match(svg, new RegExp(`viewBox="0 0 ${width} ${bird.height}"`));
    }
    const readme = await fs.readFile(path.join(ROOT, 'README.md'), 'utf8');
    assert.match(readme, /^<h1>\s*<picture>/);
    assert.match(readme, /<source media="\(prefers-color-scheme: dark\)" srcset="docs\/assets\/banner-dark\.svg">/);
    assert.match(readme, /<img src="docs\/assets\/banner-light\.svg" alt="MathEnaga"/);
  });

  test('バナーは、塊が2つない、または文字が鳥より高いロゴでは止まる', () => {
    assert.throws(() => bannerSvg(parseBitmap('##\n'), '#000000'), /2つの塊がない/);
    assert.throws(() => bannerSvg(parseBitmap('#\n.\n#\n#\n'), '#000000'), /鳥\(高さ 1\)より高い/);
  });

  test('favicon の SVG はダークで線の色を変え、体の内側を塗らない', async () => {
    const bird = blocks(trim(parseBitmap(await fs.readFile(LOGO, 'utf8'))))[0];
    const svg = faviconSvg(bird);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
    assert.match(svg, /\.b\{fill:#ffffff\}\.i\{fill:#18202e\}/);
    assert.match(svg, /@media \(prefers-color-scheme:dark\)\{\.b\{fill:none\}\.i\{fill:#e4e8ef\}\}/);
  });
});
