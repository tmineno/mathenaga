// `npm run refs:verify` の本体(docs/spec/reference-check.md「公開する入口」)。
// 入出力と時間は引数で受け取るので、テストは記録した応答と空の sleep で動かせる。

import fs from 'node:fs/promises';
import path from 'node:path';
import { formatIssue } from '../core/issues.js';
import { checkReferences, fingerprint, toIsbn13 } from '../core/references.js';
import { normalizeNewlines } from '../core/source.js';
import { parseYaml } from '../io/content.js';
import { createHttp, lookupDoi, lookupIsbn } from './lookup.js';
import { matchRecord } from './match.js';

/**
 * @typedef {object} Check
 * @property {string} identifier  `doi:<DOI>` か `isbn:<ISBN-13>`
 * @property {string} source
 * @property {{ type: string, title: string, authors: string[], year: number | null, volume?: string }} record
 */

/**
 * @typedef {{ kind: 'ok', checks: Check[] }
 *   | { kind: 'mismatch', lines: string[] }
 *   | { kind: 'unavailable', reason: string }} Outcome
 */

/**
 * @typedef {object} RunOptions
 * @property {string[]} argv  `--all` か `--check`、`--content <dir>`
 * @property {string} contentDir  既定の content/ のディレクトリ
 * @property {import('./lookup.js').FetchLike} fetch
 * @property {(ms: number) => Promise<void>} sleep
 * @property {() => Date} now
 * @property {(line: string) => void} log
 * @property {number} [timeoutMs]
 */

const USAGE = '使い方: npm run refs:verify -- [--all | --check] [--content <dir>]';

/**
 * 文献の一覧を検査し、確認の記録がない・古い文献を問い合わせて、確認の記録を更新する。
 * Preconditions: contentDir か --content の指すディレクトリが読める(references.yml と
 *   references.verified.json はなくてもよい)。--check 以外のときは、そのディレクトリに書ける。
 * Postconditions: 終了コードを返す。0 はすべて一致、1 は一致しない文献か記録のずれがある、2 は確かめられなかった
 *   文献がある(1 と 2 の両方があれば 1)、64 は引数の誤り。--check 以外では、一致した文献の記録と、
 *   問い合わせずに済んだ有効な記録を書き、一覧にない文献と、一致しなかった文献の記録は消す。
 *   確かめられなかった文献は、有効な記録があればそのまま残し、なければ書かない。
 * Failure modes: 一覧の形式が違うときは、ビルドと同じエラーを出して問い合わせずに 1 を返す。読めない確認の記録は、
 *   --check では 1、ほかでは空として扱う。ファイルを書けないときは例外。
 * Side effects: ネットワークへの問い合わせ(1 件ずつ、1 秒あけて)。--check 以外では references.verified.json を書く。
 * @param {RunOptions} options
 * @returns {Promise<number>}
 */
export async function runRefsVerify(options) {
  const { log } = options;
  const args = parseArgs(options.argv);
  if (typeof args === 'string') {
    log(args);
    log(USAGE);
    return 64;
  }
  const contentDir = args.content ? path.resolve(args.content) : options.contentDir;
  const mode = args.check ? 'check' : args.all ? 'all' : 'default';

  const yamlText = await readOptional(path.join(contentDir, 'references.yml'));
  const parsed =
    yamlText === null ? { value: null, error: null } : parseYaml(normalizeNewlines(yamlText), 'references.yml');
  if (parsed.error) {
    log(formatIssue(parsed.error));
    return 1;
  }
  const { references, errors } = checkReferences(parsed.value, 'references.yml');
  if (errors.length > 0) {
    for (const e of errors) log(formatIssue(e));
    return 1;
  }

  const verifiedPath = path.join(contentDir, 'references.verified.json');
  const verifiedText = await readOptional(verifiedPath);
  /** @type {Record<string, any>} */
  let existing = {};
  let unreadable = false;
  if (verifiedText !== null) {
    try {
      const v = JSON.parse(verifiedText);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not an object');
      existing = v;
    } catch {
      unreadable = true;
      log('references.verified.json を読めない(文献の ID をキーにした JSON のオブジェクトでない)');
    }
  }
  if (unreadable && mode === 'check') return 1;

  const http = createHttp({ fetch: options.fetch, sleep: options.sleep, timeoutMs: options.timeoutMs });
  const today = formatDate(options.now());
  /** @type {Record<string, any>} */
  const next = {};
  let mismatched = false;
  let unavailable = false;

  for (const ref of references) {
    const fp = fingerprint(ref.raw);
    const old = existing[ref.id];
    const valid = old !== undefined && old !== null && old.fingerprint === fp;
    if (mode === 'default' && valid) {
      next[ref.id] = old;
      log(`${ref.id}: 一致(記録あり。問い合わせなし)`);
      continue;
    }
    const outcome = await verifyReference(ref, http);
    if (outcome.kind === 'ok') {
      const record = { fingerprint: fp, checks: outcome.checks, checked: today };
      if (mode === 'check') {
        if (!valid) {
          mismatched = true;
          log(
            `${ref.id}: 一致しない(今の記録と合わない。${old === undefined ? '記録がない' : '項目を書き換えた後に確かめていない'})`,
          );
        } else if (JSON.stringify(old.checks) !== JSON.stringify(outcome.checks)) {
          mismatched = true;
          log(`${ref.id}: 一致しない(今の記録と合わない。記録の checks が今の問い合わせの結果と違う)`);
        } else {
          log(`${ref.id}: 一致`);
        }
      } else {
        next[ref.id] = record;
        log(`${ref.id}: 一致 (${outcome.checks.map((c) => `${c.identifier} / ${c.source}`).join(', ')})`);
      }
    } else if (outcome.kind === 'mismatch') {
      mismatched = true;
      log(`${ref.id}: 一致しない`);
      for (const l of outcome.lines) log(`  ${l}`);
    } else {
      unavailable = true;
      log(`${ref.id}: 確かめられなかった(${outcome.reason})`);
      if (mode !== 'check' && valid) next[ref.id] = old;
    }
  }

  const ids = new Set(references.map((r) => r.id));
  const removed = Object.keys(existing).filter((id) => !ids.has(id));
  if (mode === 'check') {
    for (const id of removed) {
      mismatched = true;
      log(`${id}: 一致しない(一覧にない文献の確認の記録がある)`);
    }
  } else {
    for (const id of removed) log(`${id}: 一覧にないので記録を消す`);
    const sorted = Object.fromEntries(
      Object.keys(next)
        .sort(compareCodePoints)
        .map((k) => [k, next[k]]),
    );
    const text =
      Object.keys(sorted).length === 0 && verifiedText === null ? null : `${JSON.stringify(sorted, null, 2)}\n`;
    if (text !== null && text !== verifiedText) await fs.writeFile(verifiedPath, text);
  }
  return mismatched ? 1 : unavailable ? 2 : 0;
}

/**
 * 1つの文献の識別子をすべて問い合わせて照合する。
 * Preconditions: ref は checkReferences を通った文献。
 * Postconditions: すべての識別子が一致すれば ok(checks は doi、isbn の順)。一致しない識別子があれば mismatch
 *   (その後の識別子は問い合わせない)。それ以外で確かめられなかった識別子があれば unavailable。
 * Failure modes: 例外は投げない。
 * Side effects: ネットワークへの問い合わせ。
 * @param {import('../core/references.js').Reference} ref
 * @param {import('./lookup.js').Http} http
 * @returns {Promise<Outcome>}
 */
export async function verifyReference(ref, http) {
  /** @type {Check[]} */
  const checks = [];
  /** @type {Array<{ identifier: string, lookup: () => Promise<import('./lookup.js').Lookup> }>} */
  const todo = [];
  if (ref.doi) {
    const doi = ref.doi;
    todo.push({ identifier: `doi:${doi}`, lookup: () => lookupDoi(doi, http) });
  }
  if (ref.isbn) {
    const isbn = ref.isbn;
    todo.push({ identifier: `isbn:${toIsbn13(isbn)}`, lookup: () => lookupIsbn(isbn, http) });
  }
  let reason = '';
  for (const { identifier, lookup } of todo) {
    const found = await lookup();
    if (found.status === 'unavailable') {
      reason = reason || `${identifier}:${found.detail}`;
      continue;
    }
    if (found.status === 'notfound')
      return { kind: 'mismatch', lines: [`${identifier}:見つからない(${found.detail})`] };
    let best = null;
    let matched = null;
    for (const rec of found.records) {
      const diffs = matchRecord(ref, rec);
      if (diffs.length === 0) {
        matched = rec;
        break;
      }
      if (best === null || diffs.length < best.diffs.length) best = { rec, diffs };
    }
    if (matched) {
      checks.push({
        identifier,
        source: found.source,
        // NDL サーチの記録に dcndl:volume があれば、そのままの文字列を残す(reference-check.md「確認の記録」)
        record: {
          type: matched.type,
          title: matched.title,
          authors: matched.authors,
          year: matched.year,
          ...(matched.volume ? { volume: matched.volume } : {}),
        },
      });
    } else if (best) {
      const lines = best.diffs.map(
        (d) => `${identifier} (${found.source}):${d.field}が一致しない。項目「${d.entry}」、記録「${d.record}」`,
      );
      return { kind: 'mismatch', lines };
    }
  }
  if (reason) return { kind: 'unavailable', reason };
  return { kind: 'ok', checks };
}

/** @param {string[]} argv @returns {{ all: boolean, check: boolean, content: string | null } | string} */
function parseArgs(argv) {
  const out = { all: false, check: false, content: /** @type {string | null} */ (null) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--check') out.check = true;
    else if (a === '--content') {
      const v = argv[++i];
      if (v === undefined) return '--content にはディレクトリを渡す';
      out.content = v;
    } else return `知らない引数 ${a}`;
  }
  if (out.all && out.check) return '--all と --check は同時に使えない';
  return out;
}

/** @param {string} file @returns {Promise<string | null>} */
async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'ENOENT') return null;
    throw e;
  }
}

/** @param {Date} d */
function formatDate(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** @param {string} a @param {string} b */
function compareCodePoints(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
