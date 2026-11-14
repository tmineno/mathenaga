// ビルドの入口(docs/spec/build.md)。1段目で全原稿を読んで検査し、2段目でサイト全体を書き出す。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeChapter } from './core/chapter.js';
import { buildSite } from './core/graph.js';
import { idProblem } from './core/ids.js';
import { formatIssue, issue, sortIssues } from './core/issues.js';
import { checkMaps } from './core/navigation.js';
import {
  numberApplications,
  numberCitations,
  numberEquations,
  numberFigures,
  numberNotes,
  numberStatements,
} from './core/order.js';
import { checkReferences, checkVerified } from './core/references.js';
import { resolveRefs } from './core/resolve.js';
import { checkField, checkFrontMatter, checkLines } from './core/schema.js';
import { parseChapterDir, splitFrontMatter } from './core/source.js';
import { parseYaml, readContent } from './io/content.js';
import { writeOutput } from './io/output.js';
import { createMarkdown } from './render/markdown.js';
import { renderTex } from './render/math.js';
import { generateSite } from './ui/html/pages.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_PATH = /^\/(?:[A-Za-z0-9._~-]+\/)*$/;
/** 改善案を起票するリポジトリ(docs/spec/build.md「入力」) */
const REPO_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/**
 * @typedef {object} BuildResult
 * @property {import('./core/issues.js').Issue[]} errors
 * @property {import('./core/issues.js').Issue[]} notices
 * @property {boolean} written  dist/ を書き換えたか
 */

/**
 * 1段目:全原稿を読み、章グラフを作って検査する。何も書かない。
 * Preconditions: contentDir は content/ のディレクトリ。
 * Postconditions: エラー・通知と、2段目に渡す材料(エラーがなければ)を返す。
 * Failure modes: contentDir が読めなければ例外。原稿の誤りはエラーとして返す。
 * Side effects: ファイルを読む。
 * @param {{ contentDir: string, basePath: string, repoUrl?: string }} options
 *   repoUrl は改善案を起票する GitHub のリポジトリの URL。空なら起票のアイコンを出さない。
 */
export async function analyze({ contentDir, basePath, repoUrl = '' }) {
  const errors = [];
  const notices = [];
  if (!BASE_PATH.test(basePath)) {
    errors.push(issue('E13', '-', null, `MATHENAGA_BASE_PATH「${basePath}」は / で始まり / で終わる形で書く`));
  }
  if (repoUrl !== '' && !REPO_URL.test(repoUrl)) {
    errors.push(
      issue('E13', '-', null, `MATHENAGA_REPO_URL「${repoUrl}」は https://github.com/<owner>/<repo> の形で書く`),
    );
  }
  if (errors.length > 0) return { errors, notices, ctx: null };
  const raw = await readContent(contentDir);
  const md = createMarkdown();

  let lines = [];
  const linesFile = 'lines.yml';
  if (!raw.lines) errors.push(issue('E01', linesFile, null, 'lines.yml がない'));
  else {
    const parsed = parseYaml(raw.lines.text, linesFile);
    if (parsed.error) errors.push(parsed.error);
    else {
      const r = checkLines(parsed.value, linesFile);
      errors.push(...r.errors);
      lines = r.lines;
    }
  }

  const fields = [];
  for (const f of raw.fields) {
    const parsed = parseYaml(f.text, f.file);
    if (parsed.error) {
      errors.push(parsed.error);
      continue;
    }
    const r = checkField(parsed.value, f.id, f.file);
    errors.push(...r.errors);
    if (r.field) fields.push(r.field);
  }

  // 文献の一覧と確認の記録(content-format.md「参考文献」、reference-check.md)
  /** @type {import('./core/references.js').Reference[]} */
  let references = [];
  const referencesFile = 'references.yml';
  if (raw.references) {
    const parsed = parseYaml(raw.references.text, referencesFile);
    if (parsed.error) errors.push(parsed.error);
    else {
      const r = checkReferences(parsed.value, referencesFile);
      errors.push(...r.errors);
      references = r.references;
    }
  }
  const verifiedFile = 'references.verified.json';
  /** @type {unknown} */
  let verified;
  let verifiedReadable = true;
  if (raw.verified) {
    try {
      verified = JSON.parse(raw.verified.text);
    } catch (e) {
      verifiedReadable = false;
      errors.push(
        issue(
          'E15',
          verifiedFile,
          null,
          `確認の記録が JSON として読めない(${String(/** @type {any} */ (e)?.message ?? e)})`,
        ),
      );
    }
  }
  if (verifiedReadable) errors.push(...checkVerified(verified, references, verifiedFile));

  const chapters = [];
  /** @type {Map<string, { dirPath: string, figures: string[] }>} */
  const chapterFiles = new Map();
  for (const c of raw.chapters) {
    const dir = parseChapterDir(c.dir);
    if (!dir) {
      errors.push(
        issue(
          'E03',
          `chapters/${c.dir}/`,
          null,
          `章フォルダ名「${c.dir}」は「章番号-章の ID」の形で書く(例:03-completeness-fixed-point)`,
        ),
      );
      continue;
    }
    const problem = idProblem(dir.id);
    if (problem) errors.push(issue('E03', `chapters/${c.dir}/`, null, `章の ID:${problem}`));
    if (c.text === null) {
      errors.push(issue('E01', c.file, null, '章フォルダに index.md がない'));
      continue;
    }
    const src = splitFrontMatter(c.text);
    if (src.unclosed) errors.push(issue('E01', c.file, 1, 'front matter が --- で閉じていない'));
    let fmValue;
    if (src.yaml !== null) {
      const parsed = parseYaml(src.yaml, c.file, 1);
      if (parsed.error) errors.push(parsed.error);
      fmValue = parsed.value;
    }
    const fm = checkFrontMatter(fmValue, c.file);
    errors.push(...fm.errors);
    const tokens = md.parse(src.body, {});
    const r = analyzeChapter({
      id: dir.id,
      file: c.file,
      number: dir.number,
      title: fm.title,
      subtitle: fm.subtitle,
      lineId: fm.lineId,
      tokens,
      lineOffset: src.bodyLine - 1,
    });
    errors.push(...r.errors);
    notices.push(...r.notices);
    chapters.push(r.chapter);
    chapterFiles.set(dir.id, { dirPath: c.dirPath, figures: c.figures });
  }

  const g = buildSite({ lines, fields, chapters, linesFile, references, referencesFile });
  errors.push(...g.errors);
  notices.push(...g.notices);
  const site = g.site;

  const equations = numberEquations(site.chapters, site.fieldOrder);
  const statements = numberStatements(site.chapters);
  const figures = numberFigures(site.chapters, site.fieldOrder);
  const applications = numberApplications(site.chapters, site.fieldOrder);
  const notes = numberNotes(site.chapters, site.fieldOrder);
  const citations = numberCitations(site.chapters, site.fieldOrder, site.kinds);
  const refs = resolveRefs(site, equations.byId, statements.byId, figures.byId, applications.byId, citations);
  errors.push(...refs.errors);
  const cited = new Set([...citations.values()].flatMap((m) => [...m.keys()]));
  for (const id of site.references.keys()) {
    if (!cited.has(id)) notices.push(issue('N04', referencesFile, null, `文献 ${id} はどの章からも引かれていない`));
  }

  /** @type {Map<any, string>} */
  const mathHtml = new Map();
  for (const c of site.chapters) {
    for (const m of c.maths) {
      const r = renderTex(m.token.content, m.display);
      if (r.error !== null)
        errors.push(
          issue('E10', c.file, m.line, `KaTeX が解釈できない数式「${m.token.content.slice(0, 40)}」:${r.error}`),
        );
      else mathHtml.set(m.token, r.html);
    }
    const files = chapterFiles.get(c.id);
    for (const img of c.images) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(img.src)) continue;
      const rel = path.posix.normalize(img.src);
      if (img.src.startsWith('/') || !rel.startsWith('figures/') || !files?.figures.includes(rel)) {
        errors.push(
          issue(
            'E11',
            c.file,
            img.line,
            `図「${img.src}」がない(図は章フォルダの figures/ に置き、相対パスで参照する)`,
          ),
        );
      }
    }
  }

  const maps = checkMaps(site, linesFile);
  errors.push(...maps.errors);
  notices.push(...maps.notices);

  const ctx = {
    site,
    md,
    equations,
    statements,
    figures,
    applications,
    notes,
    citations,
    resolved: refs.resolved,
    mathHtml,
    basePath,
    repoUrl,
    chapterFiles,
  };
  return { errors: sortIssues(errors), notices: sortIssues(notices), ctx: errors.length ? null : ctx };
}

/**
 * ビルドする。エラーがあれば outDir に手を付けない。
 * Preconditions: contentDir は content/、outDir は書き出し先(CLI では常にリポジトリの dist/)。
 * Postconditions: エラーがなければ outDir を消してサイト全体を書き、written を true にする。
 * Failure modes: 原稿の誤りは errors で返す。ファイルの書き込みに失敗すれば例外。
 * Side effects: outDir を消して書き直す。
 * @param {{ contentDir: string, outDir: string, basePath: string, repoUrl?: string }} options
 * @returns {Promise<BuildResult>}
 */
export async function build({ contentDir, outDir, basePath, repoUrl = '' }) {
  const { errors, notices, ctx } = await analyze({ contentDir, basePath, repoUrl });
  if (!ctx) return { errors, notices, written: false };
  const files = await generateSite(ctx);
  await writeOutput(outDir, files);
  return { errors, notices, written: true };
}

/** `npm run build` の入口。 */
export async function main() {
  const basePath = process.env.MATHENAGA_BASE_PATH || '/';
  const repoUrl = process.env.MATHENAGA_REPO_URL || '';
  const result = await build({
    contentDir: path.join(ROOT, 'content'),
    outDir: path.join(ROOT, 'dist'),
    basePath,
    repoUrl,
  });
  for (const n of result.notices) console.log(formatIssue(n));
  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(formatIssue(e));
    console.error(`ビルドを止めた:エラー ${result.errors.length}件。dist/ は変えていない`);
    process.exitCode = 1;
    return;
  }
  console.log(`dist/ に書き出した(通知 ${result.notices.length}件)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
