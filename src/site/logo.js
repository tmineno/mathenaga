// ロゴのドット絵と favicon(docs/spec/site.md「ロゴと favicon」)。
// 元データは assets/logo.txt。1 文字が 1 ドットで、# が線、. が透明。

import zlib from 'node:zlib';

/**
 * @typedef {object} Bitmap
 * @property {number} width
 * @property {number} height
 * @property {boolean[][]} dots  dots[y][x] が true なら線のドット
 */

/** favicon の線の色(ライトテーマの本文の文字色 --ink) */
export const FAVICON_INK = '#18202e';
/** favicon の体の内側の色 */
export const FAVICON_BODY = '#ffffff';
/** ダークの favicon(SVG だけ)の線の色(ダークテーマの --ink)。体の内側は塗らない */
export const FAVICON_INK_DARK = '#e4e8ef';
/** favicon の一辺のドット数 */
export const FAVICON_SIZE = 64;

/**
 * ドットマップの文字列を読む。
 * Preconditions: なし。
 * Postconditions: 全行が同じ長さの Bitmap を返す。末尾の改行は無視する。
 * Failure modes: 空、行の長さが不ぞろい、# と . 以外の文字があれば、行番号を添えて例外。
 * Side effects: なし。
 * @param {string} text
 * @param {string} [file]  例外のメッセージに出すファイル名
 * @returns {Bitmap}
 */
export function parseBitmap(text, file = 'logo.txt') {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length === 0 || lines[0] === '') throw new Error(`${file}: ドットマップが空`);
  const width = lines[0].length;
  const dots = lines.map((line, i) => {
    if (line.length !== width) throw new Error(`${file}:${i + 1}: 行の長さが ${line.length}(1 行目は ${width})`);
    const bad = line.search(/[^#.]/);
    if (bad >= 0) throw new Error(`${file}:${i + 1}: 「${line[bad]}」は使えない(# と . だけで書く)`);
    return [...line].map((c) => c === '#');
  });
  return { width, height: dots.length, dots };
}

/**
 * 線のドットを囲む最小の長方形に切り詰める。
 * Preconditions: bm に線のドットが1つ以上ある。
 * Postconditions: 上下左右の端の行・列に、線のドットが必ずある Bitmap を返す。
 * Failure modes: 線のドットがなければ例外。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {Bitmap}
 */
export function trim(bm) {
  const ys = bm.dots.map((row, y) => (row.includes(true) ? y : -1)).filter((y) => y >= 0);
  if (ys.length === 0) throw new Error('ドットマップに線のドットがない');
  let x0 = bm.width;
  let x1 = -1;
  for (const row of bm.dots) {
    const a = row.indexOf(true);
    if (a < 0) continue;
    x0 = Math.min(x0, a);
    x1 = Math.max(x1, row.lastIndexOf(true));
  }
  const dots = bm.dots.slice(ys[0], ys[ys.length - 1] + 1).map((row) => row.slice(x0, x1 + 1));
  return { width: x1 - x0 + 1, height: dots.length, dots };
}

/**
 * 線のドットのない行で上下に区切った塊を、上から順に返す。各塊は trim() 済み。
 * Preconditions: なし。
 * Postconditions: 塊の数は0以上。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {Bitmap[]}
 */
export function blocks(bm) {
  /** @type {Bitmap[]} */
  const out = [];
  let start = -1;
  for (let y = 0; y <= bm.height; y++) {
    const blank = y === bm.height || !bm.dots[y].includes(true);
    if (!blank && start < 0) start = y;
    if (blank && start >= 0) {
      const dots = bm.dots.slice(start, y);
      out.push(trim({ width: bm.width, height: dots.length, dots }));
      start = -1;
    }
  }
  return out;
}

/**
 * 線で囲まれた内側のドット(外周から上下左右にたどって届かない、線でないドット)を返す。
 * Preconditions: なし。
 * Postconditions: 線のドットと外側は false。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {Bitmap}
 */
export function interior(bm) {
  const { width: w, height: h } = bm;
  const outside = bm.dots.map((row) => row.map(() => false));
  /** @type {[number, number][]} */
  const stack = [];
  const push = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < 0 || y < 0 || x >= w || y >= h || outside[y][x] || bm.dots[y][x]) return;
    outside[y][x] = true;
    stack.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const [x, y] = /** @type {[number, number]} */ (stack.pop());
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return { width: w, height: h, dots: bm.dots.map((row, y) => row.map((d, x) => !d && !outside[y][x])) };
}

/**
 * ドットを SVG の path の d にする。横に続くドットを1つの長方形にまとめる。
 * Preconditions: なし。
 * Postconditions: 1 ドットが 1×1 の正方形。dx, dy だけずらす。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @param {number} [dx]
 * @param {number} [dy]
 */
export function svgPath(bm, dx = 0, dy = 0) {
  let d = '';
  bm.dots.forEach((row, y) => {
    for (let x = 0; x < bm.width; x++) {
      if (!row[x]) continue;
      const x0 = x;
      while (x + 1 < bm.width && row[x + 1]) x++;
      d += `M${x0 + dx} ${y + dy}h${x - x0 + 1}v1h-${x - x0 + 1}z`;
    }
  });
  return d;
}

/**
 * ページに埋め込む SVG。線の色は currentColor(本文の文字色に従う)、背景は透明。
 * Preconditions: なし。
 * Postconditions: label が空なら aria-hidden、空でなければ role="img" と aria-label を付ける。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @param {{ className: string, label?: string, crisp?: boolean }} opts
 *   crisp はドットの縁をぼかさない(整数倍で表示するとき)
 */
export function inlineSvg(bm, { className, label = '', crisp = false }) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  const render = crisp ? ' shape-rendering="crispEdges"' : '';
  return `<svg class="${className}" viewBox="0 0 ${bm.width} ${bm.height}" ${a11y}${render}><path fill="currentColor" d="${svgPath(bm)}"/></svg>`;
}

/**
 * favicon の配置:鳥を FAVICON_SIZE 四方の中央に置いたときの、左上のずれ。
 * @param {Bitmap} bird
 */
function faviconOffset(bird) {
  if (bird.width > FAVICON_SIZE || bird.height > FAVICON_SIZE) {
    throw new Error(`favicon の絵(${bird.width}×${bird.height})が ${FAVICON_SIZE}×${FAVICON_SIZE} に収まらない`);
  }
  return [Math.floor((FAVICON_SIZE - bird.width) / 2), Math.floor((FAVICON_SIZE - bird.height) / 2)];
}

/**
 * favicon の SVG。線は FAVICON_INK、体の内側は FAVICON_BODY、外側は透明。
 * ダーク(prefers-color-scheme: dark)では、線を FAVICON_INK_DARK にして体の内側を塗らない。
 * 暗いタブで、線と尾が背景に溶けないようにするため。
 * Preconditions: bird は FAVICON_SIZE 四方に収まる。
 * Postconditions: 単独のファイルとして読める SVG 文書。
 * Failure modes: 収まらなければ例外。
 * Side effects: なし。
 * @param {Bitmap} bird
 */
export function faviconSvg(bird) {
  const [dx, dy] = faviconOffset(bird);
  const n = FAVICON_SIZE;
  const style = `.b{fill:${FAVICON_BODY}}.i{fill:${FAVICON_INK}}@media (prefers-color-scheme:dark){.b{fill:none}.i{fill:${FAVICON_INK_DARK}}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><style>${style}</style><path class="b" d="${svgPath(interior(bird), dx, dy)}"/><path class="i" d="${svgPath(bird, dx, dy)}"/></svg>\n`;
}

/**
 * favicon の PNG(8 ビット RGBA)。色と配置は faviconSvg() のライトと同じ(ダークの切り替えはない)。
 * Preconditions: faviconSvg() と同じ。
 * Postconditions: 同じ入力からはバイト単位で同じ PNG を返す。
 * Failure modes: faviconSvg() と同じ。
 * Side effects: なし。
 * @param {Bitmap} bird
 * @returns {Buffer}
 */
export function faviconPng(bird) {
  const [dx, dy] = faviconOffset(bird);
  const n = FAVICON_SIZE;
  const inside = interior(bird);
  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ink = [...rgb(FAVICON_INK), 255];
  const body = [...rgb(FAVICON_BODY), 255];
  const stride = n * 4 + 1;
  const raw = Buffer.alloc(stride * n);
  for (let y = 0; y < bird.height; y++) {
    for (let x = 0; x < bird.width; x++) {
      const color = bird.dots[y][x] ? ink : inside.dots[y][x] ? body : null;
      if (color) raw.set(color, (y + dy) * stride + 1 + (x + dx) * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {string} type @param {Buffer} data */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}
