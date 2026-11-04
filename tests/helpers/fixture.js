// テストの補助:テスト用原稿(tests/fixtures/content/。ADR-004)を一時ディレクトリにコピーして書き換え、ビルドする。

import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { analyze, build, ROOT } from '../../src/build.js';
import { createStaticHandler } from '../../src/dev/static.js';

/** テスト用原稿。content/ の写しを固定したもの(ADR-004)。値を確かめるテストはこれを入力にする。 */
export const CONTENT = path.join(ROOT, 'tests/fixtures/content');
/** 今の原稿。値を書かない不変条件だけを確かめる(ADR-004)。 */
export const CURRENT_CONTENT = path.join(ROOT, 'content');
export const CH3 = 'chapters/03-completeness-fixed-point/index.md';

/**
 * 原稿の数式を数える。数式の個数の期待値を手で書かずに原稿から作るためのもので、
 * ビルドの字句解析(src/render/markdown.js)とは別の、単純な数え方にしてある。
 * front matter、コードブロック、行内のコードは除く。`\$` は数式にしない。
 * @param {string} text 章の Markdown
 * @returns {{ inline: number, display: number }}
 */
export function countMath(text) {
  const s = text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, '')
    .replace(/`[^`\n]*`/g, '');
  let inline = 0;
  let display = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] !== '$') continue;
    const width = s[i + 1] === '$' ? 2 : 1;
    let j = i + width;
    while (j < s.length && !(s[j] === '$' && (width === 1 || s[j + 1] === '$'))) j += s[j] === '\\' ? 2 : 1;
    if (j >= s.length) throw new Error(`閉じていない数式: ${s.slice(i, i + 30)}`);
    if (width === 2) display++;
    else inline++;
    i = j + width - 1;
  }
  return { inline, display };
}

/**
 * 原稿の定義(definition)の ID を書いた順に集める。defs.json の期待値を手で書かずに原稿から作るためのもの。
 * `{#ID}` のない定義は、その駅の ID を使う(content-format.md)。
 * @param {string} text 章の Markdown
 * @returns {string[]}
 */
export function definitionIds(text) {
  const ids = [];
  let station = null;
  for (const line of text.split('\n')) {
    const h = /^## .*\{#([^\s}]+)/.exec(line);
    if (h) station = h[1];
    const d = /^:::\s*definition\b(?:\s*\{([^}]*)\})?/.exec(line);
    if (!d) continue;
    const id = /(?:^|\s)#([^\s}]+)/.exec(d[1] ?? '')?.[1] ?? station;
    if (!id) throw new Error(`ID の決まらない定義: ${line}`);
    ids.push(id);
  }
  return ids;
}

/**
 * 原稿の定義(definition)と定理(theorem)を、書いた順に集める。番号の期待値を手で書かずに原稿から作るためのもの。
 * ID は、書いてあればその ID、定義で書いていなければ駅の ID(content-format.md)。
 * @param {string} text 章の Markdown
 * @returns {{ kind: 'definition' | 'theorem', id: string, station: string | null }[]}
 */
export function statements(text) {
  const out = [];
  let station = null;
  for (const line of text.split('\n')) {
    const h = /^## .*\{#([^\s}]+)/.exec(line);
    if (h) station = h[1];
    const b = /^:::\s*(definition|theorem)(?![\w-])(?:\s*\{([^}]*)\})?/.exec(line);
    if (!b) continue;
    const kind = /** @type {'definition' | 'theorem'} */ (b[1]);
    const id = /(?:^|\s)#([^\s}]+)/.exec(b[2] ?? '')?.[1] ?? (kind === 'definition' ? station : null);
    if (!id) throw new Error(`ID の決まらない${kind === 'theorem' ? '定理' : '定義'}: ${line}`);
    out.push({ kind, id, station });
  }
  return out;
}

/**
 * 原稿の章(content/ からの相対パス)の定義と定理を、書いた順に集める。
 * @param {string} rel @param {string} [src] 原稿の場所(既定はテスト用原稿)
 */
export async function statementsIn(rel, src = CONTENT) {
  return statements(await fs.readFile(path.join(src, rel), 'utf8'));
}

/**
 * 原稿の章(content/ からの相対パス)の定義の ID を集める。
 * @param {string} rel @param {string} [src] 原稿の場所(既定はテスト用原稿)
 */
export async function definitionIdsIn(rel, src = CONTENT) {
  return definitionIds(await fs.readFile(path.join(src, rel), 'utf8'));
}

/**
 * 原稿の章(content/ からの相対パス)の数式を数える。
 * @param {string} rel @param {string} [src] 原稿の場所(既定はテスト用原稿)
 */
export async function countMathIn(rel, src = CONTENT) {
  return countMath(await fs.readFile(path.join(src, rel), 'utf8'));
}

/** 正規表現の最初の括弧の中身。合わなければ例外。 @param {RegExp} re @param {string} text */
function capture(re, text) {
  const m = re.exec(text);
  if (!m) throw new Error(`${re} が合わない`);
  return m[1];
}

/**
 * 応用の札の、章ごとの期待する並びを原稿から集める(build.md 受け入れテスト 27)。
 * 並びは、駅の順 → 分野の並び(分野ファイルの名前の順)→ 書いた順。
 * @param {string} [src] 原稿の場所(既定はテスト用原稿)
 * @returns {Promise<Map<string, string[]>>} 章の ID → 「応用 N.k(分野名) · title」の並び
 */
export async function applicationLabels(src = CONTENT) {
  const fieldFiles = (await fs.readdir(path.join(src, 'fields'))).filter((f) => f.endsWith('.yml')).sort();
  /** @type {Map<string, string>} */
  const fieldTitle = new Map();
  for (const f of fieldFiles) {
    const yml = await fs.readFile(path.join(src, 'fields', f), 'utf8');
    fieldTitle.set(f.replace(/\.yml$/, ''), capture(/^title:\s*(.+)$/m, yml).trim());
  }
  const order = [...fieldTitle.keys()];
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const dir of (await fs.readdir(path.join(src, 'chapters'))).sort()) {
    const m = /^(\d+)-(.+)$/.exec(dir);
    if (!m) continue;
    const text = await fs.readFile(path.join(src, 'chapters', dir, 'index.md'), 'utf8');
    const expected = [];
    let k = 0;
    for (const station of text.split(/^## /m).slice(1)) {
      const apps = [...station.matchAll(/^::: application \{([^}]*)\}$/gm)].map((a, i) => ({
        field: capture(/field=(\S+)/, a[1]),
        title: capture(/title="([^"]*)"/, a[1]),
        i,
      }));
      apps.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field) || a.i - b.i);
      for (const a of apps) expected.push(`応用 ${Number(m[1])}.${++k}(${fieldTitle.get(a.field)}) · ${a.title}`);
    }
    out.set(m[2], expected);
  }
  return out;
}

/**
 * 原稿をコピーした一時ディレクトリを作る。中に content/ がある。
 * @param {string} [src] 原稿の場所(既定はテスト用原稿)
 */
export async function tempRoot(src = CONTENT) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mathenaga-test-'));
  await fs.cp(src, path.join(dir, 'content'), { recursive: true });
  return dir;
}

/**
 * content/ の下のファイルを書き換える。
 * @param {string} root
 * @param {string} rel
 * @param {(text: string) => string} fn
 */
export async function edit(root, rel, fn) {
  const p = path.join(root, 'content', rel);
  const before = await fs.readFile(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`書き換えが効かなかった: ${rel}`);
  await fs.writeFile(p, after);
}

/**
 * 文字列の置き換え(1回だけ。見つからなければ例外)。
 * @param {string} text @param {string} from @param {string} to
 */
export function replaceOnce(text, from, to) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`置き換え元が見つからない: ${from}`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

/**
 * 図のテスト用に、第3章の banach 駅の終わりへ図を書き足す(build.md 23・24、site.md 34)。
 * 画像1つの図 {#fig-one}、画像2つの図 {#fig-two}、文の中の画像を1つずつ足す。
 * @param {string} root  tempRoot() の結果
 */
export async function addFigures(root) {
  const dir = path.join(root, 'content', path.dirname(CH3), 'figures');
  await fs.mkdir(dir, { recursive: true });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#ccc"/></svg>\n';
  await fs.writeFile(path.join(dir, 'a.svg'), svg);
  await fs.writeFile(path.join(dir, 'b.svg'), svg);
  await edit(root, CH3, (t) =>
    replaceOnce(
      t,
      '## ピカールの定理',
      [
        '![一枚目の説明](figures/a.svg "一枚の図"){#fig-one}',
        '',
        '![左の説明](figures/a.svg "左の図") ![右の説明](figures/b.svg "右の図"){#fig-two}',
        '',
        '文の中の画像 ![文中](figures/b.svg "文中の図") です。',
        '',
        '## ピカールの定理',
      ].join('\n'),
    ),
  );
}

/**
 * 路線図のテスト用に、路線と、その路線に載る章を足す(route-map.md 10・25〜28、build.md 28)。
 * 章の駅には要約(summary)だけを書く。
 * @param {string} root  tempRoot() の結果
 * @param {{ id: string, code: string, name: string, layout: string, before?: string }} line
 *   before に路線の ID を書けば、路線ファイルでその路線の前に置く(書かなければ最後)
 * @param {string} folder  章フォルダ名(例:14-variations)
 * @param {Array<{ name: string, id: string, requires?: string }>} stations
 */
export async function addLine(root, line, folder, stations) {
  const block = `- id: ${line.id}\n  code: ${line.code}\n  name: ${line.name}\n  color: "#AA5500"\n  layout: ${line.layout}\n`;
  await edit(root, 'lines.yml', (t) =>
    line.before ? replaceOnce(t, `- id: ${line.before}\n`, `${block}- id: ${line.before}\n`) : t + block,
  );
  const dir = path.join(root, 'content/chapters', folder);
  await fs.mkdir(dir);
  const body = stations
    .map((s) => `## ${s.name} {#${s.id}${s.requires ? ` requires=${s.requires}` : ''}}\n\n::: summary\nx\n:::\n`)
    .join('\n');
  await fs.writeFile(
    path.join(dir, 'index.md'),
    `---\ntitle: ${line.name}\nline: ${line.id}\n---\n\n::: goal\nx\n:::\n\n::: motivation\nx\n:::\n\n${body}\n::: review\n- x\n:::\n`,
  );
}

/**
 * 分野の目標に最終目標を足す。
 * @param {string} root @param {string} field @param {string} station
 */
export async function addFinalGoal(root, field, station) {
  await edit(root, `fields/${field}.yml`, (t) => `${t}  - station: ${station}\n    kind: final\n    label: テスト\n`);
}

/** 上下の両方の路線(解析線の A08 と幾何線の G07)から合流する支線(route-map.md 27) */
export const MERGE_LINE = { id: 'riemann', code: 'R', name: 'リーマン幾何線', layout: 'up' };

/**
 * route-map.md 27 の路線(第14章)を足す。
 * @param {string} root
 */
export async function addMergeLine(root) {
  await addLine(root, MERGE_LINE, '14-riemannian-geometry', [
    { name: '測地線', id: 'geodesic', requires: 'hilbert-space,manifold' },
    { name: '曲率', id: 'curvature', requires: 'geodesic' },
  ]);
}

/** テストのビルドに渡す、改善案の起票先(site.md「改善案の起票」) */
export const TEST_REPO_URL = 'https://github.com/example/mathenaga';

/** @param {string} root @param {string} [basePath] @param {string} [repoUrl] */
export function analyzeIn(root, basePath = '/', repoUrl = TEST_REPO_URL) {
  return analyze({ contentDir: path.join(root, 'content'), basePath, repoUrl });
}

/** @param {string} root @param {string} [basePath] @param {string} [repoUrl] */
export function buildIn(root, basePath = '/', repoUrl = TEST_REPO_URL) {
  return build({ contentDir: path.join(root, 'content'), outDir: path.join(root, 'dist'), basePath, repoUrl });
}

/**
 * 原稿を書き換えて1段目だけを実行し、エラーを返す。
 * @param {(root: string) => Promise<void>} mutate
 */
export async function errorsAfter(mutate) {
  const root = await tempRoot();
  try {
    await mutate(root);
    const r = await analyzeIn(root);
    return r.errors;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

/** テスト用原稿のビルド結果(テストのあいだ共有する)。 */
let shared = null;
/** @param {string} [basePath] */
export async function referenceBuild(basePath = '/') {
  if (shared && shared.basePath === basePath) return shared;
  shared = await buildFrom(CONTENT, basePath);
  return shared;
}

/** 今の原稿のビルド結果(テストのあいだ共有する)。 */
let sharedCurrent = null;
export async function currentBuild() {
  sharedCurrent ??= await buildFrom(CURRENT_CONTENT, '/');
  return sharedCurrent;
}

/** @param {string} src @param {string} basePath */
async function buildFrom(src, basePath) {
  const root = await tempRoot(src);
  const result = await buildIn(root, basePath);
  const a = await analyzeIn(root, basePath);
  return { root, dist: path.join(root, 'dist'), result, ctx: a.ctx, basePath };
}

/** @param {string} dist @param {string} rel */
export function readDist(dist, rel) {
  return fs.readFile(path.join(dist, rel), 'utf8');
}

/**
 * dist/ をベースパスの下に配信する。
 * @param {string} dist
 * @param {string} [basePath]
 */
export async function serve(dist, basePath = '/') {
  const server = http.createServer(createStaticHandler(dist, basePath));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}${basePath}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

/** dist/ の下のファイルを、相対パスで列挙する。 @param {string} dir @returns {Promise<string[]>} */
export async function listFiles(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) for (const f of await listFiles(full)) out.push(`${e.name}/${f}`);
    else out.push(e.name);
  }
  return out.sort();
}
