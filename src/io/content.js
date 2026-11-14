// content/ の読み込みと YAML の解釈。

import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { issue } from '../core/issues.js';
import { normalizeNewlines } from '../core/source.js';

/**
 * @typedef {object} RawContent
 * @property {{ file: string, text: string } | null} lines
 * @property {Array<{ id: string, file: string, text: string }>} fields
 * @property {Array<{ dir: string, file: string, dirPath: string, text: string | null, figures: string[] }>} chapters
 * @property {{ file: string, text: string } | null} references  文献の一覧(なければ null)
 * @property {{ file: string, text: string } | null} verified    文献の確認の記録(なければ null)
 * @property {{ file: string, text: string } | null} site        サイトの設定 site.yml(なければ null)
 * @property {{ file: string, text: string } | null} logo        ロゴのドットマップ assets/logo.txt(なければ null)
 * @property {{ file: string, text: string } | null} theme       テーマの上書き assets/theme.css(なければ null)
 */

/**
 * content/ の下のファイルを読む。並びはいつも名前の順にする。
 * Preconditions: contentDir は読めるディレクトリ。
 * Postconditions: 路線ファイル・分野ファイル・章フォルダ・文献の一覧・確認の記録・サイトの設定・ロゴ・テーマの中身を返す。改行は LF にそろえる。
 * Failure modes: contentDir がなければ例外。個々のファイルがないときは null や空の配列にする。
 * Side effects: ファイルを読む。
 * @param {string} contentDir
 * @returns {Promise<RawContent>}
 */
export async function readContent(contentDir) {
  const linesPath = path.join(contentDir, 'lines.yml');
  const lines = (await exists(linesPath))
    ? { file: 'lines.yml', text: normalizeNewlines(await fs.readFile(linesPath, 'utf8')) }
    : null;

  const fieldsDir = path.join(contentDir, 'fields');
  const fields = [];
  for (const name of (await listDir(fieldsDir)).sort()) {
    if (!name.endsWith('.yml')) continue;
    const full = path.join(fieldsDir, name);
    if (!(await fs.stat(full)).isFile()) continue;
    fields.push({
      id: name.slice(0, -'.yml'.length),
      file: `fields/${name}`,
      text: normalizeNewlines(await fs.readFile(full, 'utf8')),
    });
  }

  const chaptersDir = path.join(contentDir, 'chapters');
  const chapters = [];
  for (const dir of (await listDir(chaptersDir)).sort()) {
    const dirPath = path.join(chaptersDir, dir);
    if (!(await fs.stat(dirPath)).isDirectory()) continue;
    const indexPath = path.join(dirPath, 'index.md');
    const text = (await exists(indexPath)) ? normalizeNewlines(await fs.readFile(indexPath, 'utf8')) : null;
    const figures = (await listFiles(path.join(dirPath, 'figures'))).map((f) => `figures/${f}`).sort();
    chapters.push({ dir, file: `chapters/${dir}/index.md`, dirPath, text, figures });
  }
  const references = await readOptional(contentDir, 'references.yml');
  const verified = await readOptional(contentDir, 'references.verified.json');
  const site = await readOptional(contentDir, 'site.yml');
  const logo = await readOptional(contentDir, 'assets/logo.txt');
  const theme = await readOptional(contentDir, 'assets/theme.css');
  return { lines, fields, chapters, references, verified, site, logo, theme };
}

/** @param {string} contentDir @param {string} name */
async function readOptional(contentDir, name) {
  const full = path.join(contentDir, name);
  return (await exists(full)) ? { file: name, text: normalizeNewlines(await fs.readFile(full, 'utf8')) } : null;
}

/**
 * YAML を解釈する。
 * Preconditions: なし。
 * Postconditions: 値か、E01 のエラーを返す。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {string} text
 * @param {string} file
 * @param {number} [lineOffset] ファイルの中で YAML が始まる行 - 1
 * @returns {{ value: unknown, error: import('../core/issues.js').Issue | null }}
 */
export function parseYaml(text, file, lineOffset = 0) {
  try {
    return { value: yaml.load(text), error: null };
  } catch (e) {
    const err = /** @type {any} */ (e);
    const line = err?.mark?.line !== undefined ? err.mark.line + 1 + lineOffset : null;
    const reason = err?.reason ?? String(err?.message ?? err).split('\n')[0];
    return { value: undefined, error: issue('E01', file, line, `cannot parse YAML (${reason})`) };
  }
}

/** @param {string} p */
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} dir */
async function listDir(dir) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** ディレクトリの下のファイルを、相対パス(/ 区切り)で列挙する。 @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
  const out = [];
  for (const name of await listDir(dir)) {
    const full = path.join(dir, name);
    const st = await fs.stat(full);
    if (st.isDirectory()) for (const f of await listFiles(full)) out.push(`${name}/${f}`);
    else if (st.isFile()) out.push(name);
  }
  return out;
}
