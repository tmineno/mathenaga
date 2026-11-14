// ロゴのドット絵と favicon(docs/spec/site.md「ロゴと favicon」)。
// 元データは assets/logo.txt。1 文字が 1 ドットで、# が線、. が透明。

import zlib from 'node:zlib';

/**
 * @typedef {object} Bitmap
 * @property {number} width
 * @property {number} height
 * @property {boolean[][]} dots  dots[y][x] が true なら線のドット
 */

/** 鳥の線の色(ライトテーマの本文の文字色 --ink)。テーマによらず同じ色 */
export const BIRD_INK = '#18202e';
/** 鳥の体の内側と、線の外側 1 ドットの縁の色。暗い背景でも線と尾が溶けないようにする */
export const BIRD_BODY = '#ffffff';
/** favicon の一辺のドット数(縁を含めた鳥が収まる大きさ) */
export const FAVICON_SIZE = 66;

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
  if (lines.length === 0 || lines[0] === '') throw new Error(`${file}: dot map is empty`);
  const width = lines[0].length;
  const dots = lines.map((line, i) => {
    if (line.length !== width) throw new Error(`${file}:${i + 1}: line length is ${line.length} (line 1 is ${width})`);
    const bad = line.search(/[^#.]/);
    if (bad >= 0) throw new Error(`${file}:${i + 1}: "${line[bad]}" is not allowed (use only # and .)`);
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
  if (ys.length === 0) throw new Error('the dot map has no line dots');
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
 * 線のドットのない行で上下に区切った塊を、元の Bitmap の中での位置(左上)と一緒に、上から順に返す。
 * Preconditions: なし。
 * Postconditions: 塊の数は0以上。各 bm は trim() 済みで、元の (x + i, y + j) が bm の (i, j) にあたる。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {{ x: number, y: number, bm: Bitmap }[]}
 */
export function placedBlocks(bm) {
  /** @type {{ x: number, y: number, bm: Bitmap }[]} */
  const out = [];
  let start = -1;
  for (let y = 0; y <= bm.height; y++) {
    const blank = y === bm.height || !bm.dots[y].includes(true);
    if (!blank && start < 0) start = y;
    if (blank && start >= 0) {
      const dots = bm.dots.slice(start, y);
      const x = Math.min(...dots.map((row) => row.indexOf(true)));
      out.push({ x, y: start, bm: trim({ width: bm.width, height: dots.length, dots }) });
      start = -1;
    }
  }
  return out;
}

/**
 * 線のドットのない行で上下に区切った塊を、上から順に返す。各塊は trim() 済み。
 * Preconditions: なし。
 * Postconditions: placedBlocks() の bm を並べたもの。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {Bitmap[]}
 */
export function blocks(bm) {
  return placedBlocks(bm).map((b) => b.bm);
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

/** README のバナーで、鳥とサイト名の文字のあいだに空けるドット数 */
export const BANNER_GAP = 14;
/** README のバナーのファイル(リポジトリのルートからのパス) */
export const BANNER_FILE = 'docs/assets/banner.svg';
/** README のバナーの文字の色。白地(コントラスト 4.55)でも GitHub の暗い地 #0d1117(4.16)でも読める灰色 */
export const BANNER_TEXT = '#6e7781';

/**
 * 線と、線で囲まれた内側を、斜めの隣も含めて 1 ドット広げる。大きさは上下左右に 1 ドットずつ増える。
 * Preconditions: なし。
 * Postconditions: 返す Bitmap の (x + 1, y + 1) が bm の (x, y) にあたる。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bm
 * @returns {Bitmap}
 */
export function backing(bm) {
  const inside = interior(bm);
  const solid = (/** @type {number} */ x, /** @type {number} */ y) =>
    y >= 0 && y < bm.height && x >= 0 && x < bm.width && (bm.dots[y][x] || inside.dots[y][x]);
  const dots = Array.from({ length: bm.height + 2 }, (_, y) =>
    Array.from({ length: bm.width + 2 }, (_, x) =>
      [-1, 0, 1].some((a) => [-1, 0, 1].some((b) => solid(x - 1 + b, y - 1 + a))),
    ),
  );
  return { width: bm.width + 2, height: bm.height + 2, dots };
}

/**
 * 鳥を描く2つの path。下に BIRD_BODY で体の内側と線の外側 1 ドットの縁、上に BIRD_INK で線。
 * Preconditions: なし。
 * Postconditions: 鳥の左上を (dx, dy) に置く。縁は上下左右に 1 ドットはみ出す。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bird
 * @param {number} [dx]
 * @param {number} [dy]
 */
function birdPaths(bird, dx = 0, dy = 0) {
  return `<path fill="${BIRD_BODY}" d="${svgPath(backing(bird), dx - 1, dy - 1)}"/><path fill="${BIRD_INK}" d="${svgPath(bird, dx, dy)}"/>`;
}

/**
 * 上端のバーに出す鳥の SVG。塗りは birdPaths() で、テーマによらない。読み上げない。
 * Preconditions: なし。
 * Postconditions: viewBox は縁の分だけ上下左右に 1 ずつ広い。aria-hidden を付ける。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {Bitmap} bird
 * @param {string} className
 */
export function birdSvg(bird, className) {
  return `<svg class="${className}" viewBox="-1 -1 ${bird.width + 2} ${bird.height + 2}" aria-hidden="true" focusable="false">${birdPaths(bird)}</svg>`;
}

/**
 * トップページの見出しに出すロゴ全体の SVG。最初の塊(鳥)は birdPaths() で塗り、
 * 残りの塊(サイト名の文字)は currentColor(本文の文字色に従う)。縁の外は透明。
 * Preconditions: なし。
 * Postconditions: viewBox は縁の分だけ上下左右に 1 ずつ広い。role="img" と aria-label を付け、ドットの縁をぼかさない。
 * Failure modes: 塊がなければ例外。
 * Side effects: なし。
 * @param {Bitmap} logo  ロゴ全体
 * @param {{ className: string, label: string }} opts
 */
export function logoSvg(logo, { className, label }) {
  const [bird, ...rest] = placedBlocks(logo);
  if (!bird) throw new Error('the logo has no line dots');
  const text = rest.map((b) => svgPath(b.bm, b.x, b.y)).join('');
  return `<svg class="${className}" viewBox="-1 -1 ${logo.width + 2} ${logo.height + 2}" role="img" aria-label="${label}" shape-rendering="crispEdges">${birdPaths(bird.bm, bird.x, bird.y)}<path fill="currentColor" d="${text}"/></svg>`;
}

/**
 * README の見出しに出すバナーの SVG。ロゴの鳥(最初の塊)とサイト名の文字(2つ目の塊)を、
 * 同じドットの大きさで横に並べる。文字は鳥の高さの中央に置く。
 * 鳥は birdPaths() で塗り、文字は BANNER_TEXT。
 * 閲覧環境のテーマを判定せずに、白地でも暗い地でも読めるようにするため。縁の外は透明。
 * Preconditions: logo は blocks() で2つ以上の塊に分かれ、2つ目の塊の高さが最初の塊以下。
 * Postconditions: 単独のファイルとして読める SVG 文書。1 ドットが viewBox の 1 で、縁の分だけ上下左右に 1 ずつ広い。
 * Failure modes: 塊が2つ未満か、文字の塊が鳥より高ければ例外。
 * Side effects: なし。
 * @param {Bitmap} logo  ロゴ全体
 */
export function bannerSvg(logo) {
  const [bird, word] = blocks(logo);
  if (!word) throw new Error('the logo does not have two blobs, the bird and the site name');
  if (word.height > bird.height)
    throw new Error(`the site name (height ${word.height}) is taller than the bird (height ${bird.height})`);
  const w = bird.width + BANNER_GAP + word.width;
  const text = svgPath(word, bird.width + BANNER_GAP, Math.floor((bird.height - word.height) / 2));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${w + 2} ${bird.height + 2}" shape-rendering="crispEdges">` +
    birdPaths(bird) +
    `<path fill="${BANNER_TEXT}" d="${text}"/></svg>\n`
  );
}

/**
 * favicon の配置:縁を含めた鳥を FAVICON_SIZE 四方の中央に置いたときの、鳥の左上の位置。
 * @param {Bitmap} bird
 */
function faviconOffset(bird) {
  const [w, h] = [bird.width + 2, bird.height + 2];
  if (w > FAVICON_SIZE || h > FAVICON_SIZE) {
    throw new Error(
      `the favicon drawing (${w}×${h} including the margin) does not fit in ${FAVICON_SIZE}×${FAVICON_SIZE}`,
    );
  }
  return [Math.floor((FAVICON_SIZE - w) / 2) + 1, Math.floor((FAVICON_SIZE - h) / 2) + 1];
}

/**
 * favicon の SVG。鳥を birdPaths() で塗り、縁の外は透明。ダークでも色を切り替えない(白い縁で暗いタブでも見える)。
 * Preconditions: 縁を含めた bird が FAVICON_SIZE 四方に収まる。
 * Postconditions: 単独のファイルとして読める SVG 文書。
 * Failure modes: 収まらなければ例外。
 * Side effects: なし。
 * @param {Bitmap} bird
 */
export function faviconSvg(bird) {
  const [dx, dy] = faviconOffset(bird);
  const n = FAVICON_SIZE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${birdPaths(bird, dx, dy)}</svg>\n`;
}

/**
 * favicon の PNG(8 ビット RGBA)。色と配置は faviconSvg() と同じ。
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
  const back = backing(bird);
  const rgb = (/** @type {string} */ hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const ink = [...rgb(BIRD_INK), 255];
  const body = [...rgb(BIRD_BODY), 255];
  const stride = n * 4 + 1;
  const raw = Buffer.alloc(stride * n);
  // back の (x, y) は鳥の (x - 1, y - 1) にあたり、画像の (x + dx - 1, y + dy - 1) に置く
  for (let y = 0; y < back.height; y++) {
    for (let x = 0; x < back.width; x++) {
      const color = bird.dots[y - 1]?.[x - 1] ? ink : back.dots[y][x] ? body : null;
      if (color) raw.set(color, (y + dy - 1) * stride + 1 + (x + dx - 1) * 4);
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
