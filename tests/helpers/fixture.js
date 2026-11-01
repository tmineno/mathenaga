// テストの補助:基準原稿を一時ディレクトリにコピーして書き換え、ビルドする。

import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { analyze, build, ROOT } from '../../src/build.js';
import { createStaticHandler } from '../../src/dev/static.js';

export const CONTENT = path.join(ROOT, 'content');
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

/** 基準原稿の章(content/ からの相対パス)の定義と定理を、書いた順に集める。 @param {string} rel */
export async function statementsIn(rel) {
  return statements(await fs.readFile(path.join(CONTENT, rel), 'utf8'));
}

/** 基準原稿の章(content/ からの相対パス)の定義の ID を集める。 @param {string} rel */
export async function definitionIdsIn(rel) {
  return definitionIds(await fs.readFile(path.join(CONTENT, rel), 'utf8'));
}

/** 基準原稿の章(content/ からの相対パス)の数式を数える。 @param {string} rel */
export async function countMathIn(rel) {
  return countMath(await fs.readFile(path.join(CONTENT, rel), 'utf8'));
}

/** 基準原稿をコピーした一時ディレクトリを作る。中に content/ がある。 */
export async function tempRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mathenaga-test-'));
  await fs.cp(CONTENT, path.join(dir, 'content'), { recursive: true });
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

/** 基準原稿のビルド結果(テストのあいだ共有する)。 */
let shared = null;
/** @param {string} [basePath] */
export async function referenceBuild(basePath = '/') {
  if (shared && shared.basePath === basePath) return shared;
  const root = await tempRoot();
  const result = await buildIn(root, basePath);
  const a = await analyzeIn(root, basePath);
  shared = { root, dist: path.join(root, 'dist'), result, ctx: a.ctx, basePath };
  return shared;
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
