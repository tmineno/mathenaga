// 章の md のトークン列から、章の構造(章頭・駅・章末)を取り出して検査する。
// 規則は docs/spec/content-format.md「本文の構成」「ブロック」「数式」「式番号」「参照」。
// トークンは markdown-it が作ったものを、ただのデータとして読む(このモジュールは markdown-it に依存しない)。

import { parseAttrs, splitList } from './attrs.js';
import { DEF_PREFIX, idProblem } from './ids.js';
import { issue } from './issues.js';

const BLOCK_OPEN = 'container_mathenaga_open';
const BLOCK_CLOSE = 'container_mathenaga_close';

export const HEAD_BLOCKS = new Set(['goal', 'motivation']);
export const STATION_BLOCKS = new Set([
  'summary',
  'why',
  'definition',
  'theorem',
  'proof-sketch',
  'proof',
  'examples',
  'drop-assumption',
  'pitfall',
  'remark',
  'application',
]);
export const END_BLOCKS = new Set(['review', 'question', 'answer']);

/** ブロックごとに書ける属性。'#' は #ID。 */
const ALLOWED_ATTRS = {
  goal: ['field'],
  motivation: ['field'],
  definition: ['#', 'name', 'en', 'aliases'],
  theorem: ['#', 'name'],
  application: ['#', 'field', 'title'],
};

const FORBIDDEN_TEX = /\\(tag\*?|label|ref|eqref|notag|nonumber)(?![A-Za-z])/;

/**
 * @typedef {object} Block
 * @property {string} name
 * @property {string | null} id
 * @property {Record<string, string>} attrs
 * @property {string | null} field
 * @property {number | null} line
 * @property {number} start  開くトークンの位置
 * @property {number} end    閉じるトークンの位置
 */

/**
 * @typedef {object} Station
 * @property {string | null} id
 * @property {string} name        装飾を外した駅名
 * @property {string[]} requires
 * @property {number | null} line
 * @property {number} headingStart  heading_open の位置
 * @property {Array<{ kind: 'block', block: Block } | { kind: 'prose', start: number, end: number }>} items
 * @property {Block[]} definitions
 * @property {Block[]} theorems
 * @property {Block[]} applications
 */

/**
 * @typedef {object} ChapterModel
 * @property {string} id
 * @property {string} file
 * @property {number} number
 * @property {string} title
 * @property {string | null} subtitle
 * @property {string} lineId
 * @property {any[]} tokens
 * @property {number} lineOffset  本文の1行目のファイル内の行番号 - 1(トークンの map をファイルの行にするのに使う)
 * @property {{ goals: Block[], motivations: Block[], prose: Array<{ start: number, end: number }> }} head
 * @property {Station[]} stations
 * @property {{ reviews: Block[], questions: Array<{ question: Block, answer: Block | null }> }} end
 * @property {Array<{ token: any, id: string | null, line: number | null }>} equations
 * @property {Array<{ token: any, line: number | null, inDefinition: boolean }>} refs
 *   inDefinition は definition の本文の中の参照(文献の引用は E14 にする。content-format.md「注」)
 * @property {Array<{ token: any, line: number | null }>} notes  注(`^[…]`)。入れ子の注は含めない
 * @property {Array<{ token: any, src: string, line: number | null }>} images
 * @property {Array<{ token: any, id: string | null, images: any[], captions: any[][], line: number | null }>} figures
 *   captions は画像ごとのキャプション(タイトルを文字と行内の数式に切り分けたもの、image.meta.titleParts)
 *   図:画像だけの段落(token は paragraph_open、images はその画像のトークン)
 * @property {Array<{ token: any, line: number | null, display: boolean }>} maths
 */

/**
 * 章のトークン列を解析して検査する。
 * Preconditions: tokens は createMarkdown() の parse の結果。lineOffset は本文の1行目のファイル内の行番号 - 1。
 * Postconditions: 章の構造と、見つけたエラー・通知を返す。誤りがあっても、取り出せた分は返す。
 * Failure modes: 例外は投げない。
 * Side effects: なし。
 * @param {{ id: string, file: string, number: number, title: string, subtitle: string | null, lineId: string, tokens: any[], lineOffset: number }} input
 * @returns {{ chapter: ChapterModel, errors: import('./issues.js').Issue[], notices: import('./issues.js').Issue[] }}
 */
export function analyzeChapter(input) {
  const { file, tokens, lineOffset } = input;
  /** @type {import('./issues.js').Issue[]} */
  const errors = [];
  /** @type {import('./issues.js').Issue[]} */
  const notices = [];
  /** @param {any} tok */
  const lineOf = (tok) => (tok && tok.map ? tok.map[0] + lineOffset + 1 : null);
  /** @param {string} code @param {any} tok @param {string} msg */
  const fail = (code, tok, msg) => errors.push(issue(code, file, lineOf(tok), msg));

  /** @type {ChapterModel} */
  const chapter = {
    ...input,
    head: { goals: [], motivations: [], prose: [] },
    stations: [],
    end: { reviews: [], questions: [] },
    equations: [],
    refs: [],
    notes: [],
    images: [],
    figures: [],
    maths: [],
  };

  let phase = 'head';
  /** @type {Station | null} */
  let current = null;
  /** @type {{ question: Block, answer: Block | null } | null} */
  let pending = null;
  const closePending = () => {
    if (pending) {
      fail('E08', tokens[pending.question.start], 'question の直後に answer がない');
      pending = null;
    }
  };

  for (const node of topLevelNodes(tokens)) {
    const tok = tokens[node.start];
    if (tok.type === 'heading_open' && (tok.tag === 'h1' || tok.tag === 'h2')) {
      closePending();
      if (tok.tag === 'h1') {
        fail('E09', tok, '1段目の見出し(#)は書けない。章のタイトルは front matter に書く');
        continue;
      }
      if (phase === 'end') fail('E09', tok, '章末(review・question)の後に駅の見出しがある');
      current = makeStation(tokens, node.start, fail, lineOf);
      chapter.stations.push(current);
      phase = 'station';
      continue;
    }
    if (tok.type === BLOCK_OPEN) {
      const block = makeBlock(tokens, node, fail, lineOf);
      if (!block) continue;
      const name = block.name;
      if (END_BLOCKS.has(name)) {
        if (name !== 'answer') closePending();
        phase = 'end';
        if (name === 'review') chapter.end.reviews.push(block);
        else if (name === 'question') {
          pending = { question: block, answer: null };
          chapter.end.questions.push(pending);
        } else if (!pending) fail('E09', tok, 'question のない answer がある');
        else {
          pending.answer = block;
          pending = null;
        }
        continue;
      }
      closePending();
      if (HEAD_BLOCKS.has(name)) {
        if (phase !== 'head') fail('E09', tok, `${name} は章頭(最初の駅の見出しより前)にだけ書ける`);
        else (name === 'goal' ? chapter.head.goals : chapter.head.motivations).push(block);
        continue;
      }
      // 駅のブロック
      if (phase === 'head') fail('E09', tok, `${name} は駅の中にだけ書ける(駅の外にある)`);
      else if (phase === 'end') fail('E09', tok, `章末(review・question)の後に ${name} がある`);
      else if (current) current.items.push({ kind: 'block', block });
      continue;
    }
    closePending();
    if (isStrayClose(tokens, node)) {
      fail('E09', tok, '開いていないブロックの ::: がある');
      continue;
    }
    if (phase === 'head') chapter.head.prose.push({ start: node.start, end: node.end });
    else if (phase === 'end') fail('E09', tok, '章末には review・question・answer のブロックだけを書ける');
    else if (current) current.items.push({ kind: 'prose', start: node.start, end: node.end });
  }
  closePending();

  checkHead(chapter, fail);
  for (const st of chapter.stations) checkStation(st, tokens, fail);
  checkEnd(chapter, tokens, fail, notices, file);
  if (chapter.stations.length === 0) errors.push(issue('E08', file, null, '駅が1つもない'));
  collectInline(chapter, lineOf, fail);
  return { chapter, errors, notices };
}

/**
 * トップレベルの要素ごとに、トークンの範囲 [start, end] を返す。
 * @param {any[]} tokens
 */
export function topLevelNodes(tokens) {
  const nodes = [];
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    if (tokens[i].nesting === 1) {
      let depth = 0;
      for (; i < tokens.length; i++) {
        depth += tokens[i].nesting;
        if (depth === 0) break;
      }
    }
    nodes.push({ start, end: Math.min(i, tokens.length - 1) });
    i++;
  }
  return nodes;
}

/** @param {any[]} tokens @param {{ start: number, end: number }} node */
function isStrayClose(tokens, node) {
  const t = tokens[node.start];
  return t.type === 'paragraph_open' && tokens[node.start + 1]?.content?.trim() === ':::';
}

/**
 * @param {any[]} tokens
 * @param {number} start
 * @param {(code: string, tok: any, msg: string) => void} fail
 * @param {(tok: any) => number | null} lineOf
 * @returns {Station}
 */
function makeStation(tokens, start, fail, lineOf) {
  const open = tokens[start];
  const inline = tokens[start + 1];
  /** @type {Station} */
  const st = {
    id: null,
    name: plainText(inline),
    requires: [],
    line: lineOf(open),
    headingStart: start,
    items: [],
    definitions: [],
    theorems: [],
    applications: [],
  };
  const src = open.meta?.attrsSrc ?? null;
  if (src === null) {
    fail('E09', open, `駅の見出し「${st.name}」に {#ID} がない`);
    return st;
  }
  const parsed = parseAttrs(src);
  for (const p of parsed.problems) fail('E02', open, p);
  if (parsed.id === null) fail('E09', open, `駅の見出し「${st.name}」に #ID がない`);
  else {
    const problem = idProblem(parsed.id);
    if (problem) fail('E03', open, problem);
    st.id = parsed.id;
  }
  for (const key of Object.keys(parsed.values)) {
    if (key !== 'requires') fail('E02', open, `駅の見出しに属性 ${key} は書けない`);
  }
  if (parsed.values.requires !== undefined) {
    for (const r of splitList(parsed.values.requires)) {
      if (r === '') fail('E03', open, 'requires に空の ID がある');
      else st.requires.push(r);
    }
  }
  if (st.name === '') fail('E08', open, '駅名がない');
  for (const c of inline.children || []) {
    if (['math_inline', 'math_error', 'wikiref', 'note', 'note_error'].includes(c.type)) {
      fail('E09', open, `駅の見出し「${st.name}」に数式・参照・注は書けない`);
      break;
    }
  }
  return st;
}

/**
 * @param {any[]} tokens
 * @param {{ start: number, end: number }} node
 * @param {(code: string, tok: any, msg: string) => void} fail
 * @param {(tok: any) => number | null} lineOf
 * @returns {Block | null}
 */
function makeBlock(tokens, node, fail, lineOf) {
  const open = tokens[node.start];
  const info = open.info.trim();
  const m = /^([a-z][a-z-]*)\s*(.*)$/.exec(info);
  if (!m) {
    fail('E02', open, `ブロック「${info}」を解釈できない`);
    return null;
  }
  const name = m[1];
  if (!HEAD_BLOCKS.has(name) && !STATION_BLOCKS.has(name) && !END_BLOCKS.has(name)) {
    fail('E02', open, `知らないブロック ${name}`);
    return null;
  }
  const rest = m[2].trim();
  let parsed = { id: null, values: {}, problems: [] };
  if (rest !== '') {
    const braces = /^\{(.*)\}$/.exec(rest);
    if (!braces) fail('E02', open, `ブロック ${name} の属性は {…} で書く`);
    else parsed = parseAttrs(braces[1]);
  }
  for (const p of parsed.problems) fail('E02', open, p);
  const allowed = ALLOWED_ATTRS[name] || [];
  if (parsed.id !== null && !allowed.includes('#')) fail('E02', open, `ブロック ${name} に #ID は書けない`);
  for (const key of Object.keys(parsed.values)) {
    if (!allowed.includes(key)) fail('E02', open, `ブロック ${name} に属性 ${key} は書けない`);
  }
  for (let i = node.start + 1; i < node.end; i++) {
    const t = tokens[i];
    if (t.type === BLOCK_OPEN) {
      fail('E09', t, 'ブロックの中に別のブロックは書けない(::: の閉じ忘れかもしれない)');
      break;
    }
    if (t.type === 'heading_open' && (t.tag === 'h1' || t.tag === 'h2')) {
      fail('E09', t, 'ブロックの中に駅の見出しがある(::: の閉じ忘れかもしれない)');
      break;
    }
  }
  if (tokens[node.end]?.type !== BLOCK_CLOSE) fail('E09', open, `ブロック ${name} が閉じていない`);
  if (parsed.id !== null) {
    const problem = idProblem(parsed.id, name === 'definition');
    if (problem) fail('E03', open, problem);
  }
  return {
    name,
    id: parsed.id,
    attrs: parsed.values,
    field: parsed.values.field ?? null,
    line: lineOf(open),
    start: node.start,
    end: node.end,
  };
}

/** @param {ChapterModel} chapter @param {(code: string, tok: any, msg: string) => void} fail */
function checkHead(chapter, fail) {
  const tokens = chapter.tokens;
  for (const [name, list] of [
    ['goal', chapter.head.goals],
    ['motivation', chapter.head.motivations],
  ]) {
    const blocks = /** @type {Block[]} */ (list);
    const common = blocks.filter((b) => !b.field);
    if (common.length === 0) fail('E08', null, `共通版の ${name}(field のないもの)がない`);
    if (common.length > 1) fail('E09', tokens[common[1].start], `共通版の ${name} が2つ以上ある`);
    const seen = new Set();
    for (const b of blocks.filter((x) => x.field)) {
      if (seen.has(b.field)) fail('E09', tokens[b.start], `${name} の分野版(${b.field})が2つ以上ある`);
      seen.add(b.field);
    }
  }
}

/**
 * @param {Station} st
 * @param {any[]} tokens
 * @param {(code: string, tok: any, msg: string) => void} fail
 */
function checkStation(st, tokens, fail) {
  const heading = tokens[st.headingStart];
  const blocks = st.items.filter((i) => i.kind === 'block').map((i) => /** @type {any} */ (i).block);
  const summaries = blocks.filter((b) => b.name === 'summary');
  if (summaries.length === 0) fail('E08', heading, `駅「${st.name}」に summary がない`);
  if (summaries.length > 1) fail('E09', tokens[summaries[1].start], `駅「${st.name}」に summary が2つ以上ある`);
  st.definitions = blocks.filter((b) => b.name === 'definition');
  st.theorems = blocks.filter((b) => b.name === 'theorem');
  st.applications = blocks.filter((b) => b.name === 'application');
  if (st.theorems.length > 0 && !blocks.some((b) => b.name === 'proof-sketch')) {
    fail('E08', heading, `駅「${st.name}」には定理があるのに proof-sketch がない`);
  }
  for (const d of st.definitions) {
    const open = tokens[d.start];
    if (!d.attrs.name) fail('E08', open, 'definition に name がない');
    if (!d.attrs.en) fail('E08', open, 'definition に en がない');
    // ID を省略した定義は def-<駅ID>。2つ目は名前空間の重複(E04)になる(ADR-008)
    if (d.id === null && st.id !== null) d.id = `${DEF_PREFIX}${st.id}`;
  }
  for (const t of st.theorems) {
    const open = tokens[t.start];
    if (t.id === null) fail('E08', open, 'theorem に #ID がない(定理の ID は省略できない)');
    if (!t.attrs.name) fail('E08', open, 'theorem に name がない');
  }
  // 同じ分野の application は何個でも書ける(content-format.md「ブロック」)
  for (const a of st.applications) {
    const open = tokens[a.start];
    if (!a.field) fail('E08', open, 'application に field がない');
    if (!a.attrs.title) fail('E08', open, 'application に title がない');
  }
}

/**
 * @param {ChapterModel} chapter
 * @param {any[]} tokens
 * @param {(code: string, tok: any, msg: string) => void} fail
 * @param {import('./issues.js').Issue[]} notices
 * @param {string} file
 */
function checkEnd(chapter, tokens, fail, notices, file) {
  const reviews = chapter.end.reviews;
  if (reviews.length === 0) fail('E08', null, 'review がない');
  if (reviews.length > 1) fail('E09', tokens[reviews[1].start], 'review が2つ以上ある');
  if (chapter.end.questions.length === 0) notices.push(issue('N02', file, null, '確認問題(question)がない'));
}

/**
 * 数式・参照・注・図をすべて集め、数式と注の形を検査する。
 * @param {ChapterModel} chapter
 * @param {(tok: any) => number | null} lineOf
 * @param {(code: string, tok: any, msg: string) => void} fail
 */
function collectInline(chapter, lineOf, fail) {
  /** definition の本文のトークンの位置 */
  const inDefinition = new Set();
  for (const st of chapter.stations) {
    for (const d of st.definitions) for (let i = d.start; i <= d.end; i++) inDefinition.add(i);
  }
  for (let i = 0; i < chapter.tokens.length; i++) {
    const tok = chapter.tokens[i];
    const open = chapter.tokens[i - 1];
    if (tok.type === 'inline' && tok.children && open?.type === 'paragraph_open' && !open.hidden) {
      const fig = figureOf(tok.children, (code, msg) => fail(code, tok, msg));
      if (fig) {
        const line = lineOf(tok);
        const captions = fig.images.map((im) => captionOf(im, chapter, line, (code, msg) => fail(code, tok, msg)));
        chapter.figures.push({ token: open, id: fig.id, images: fig.images, captions, line });
        for (const parts of captions) for (const p of parts) if (p.type === 'math_inline') checkTex(p, fail, tok);
      }
    }
    if (tok.type === 'math_block') {
      const line = lineOf(tok);
      let id = null;
      const after = tok.meta?.after ?? '';
      if (after !== '') {
        const braces = /^\{(.*)\}$/.exec(after);
        if (!braces) fail('E10', tok, `閉じる $$ の後ろに属性以外の文字「${after}」がある`);
        else {
          const parsed = parseAttrs(braces[1]);
          for (const p of parsed.problems) fail('E02', tok, p);
          for (const key of Object.keys(parsed.values))
            fail('E02', tok, `式に属性 ${key} は書けない(書けるのは #ID だけ)`);
          if (parsed.id !== null) {
            const problem = idProblem(parsed.id);
            if (problem) fail('E03', tok, problem);
            id = parsed.id;
          }
        }
      }
      chapter.equations.push({ token: tok, id, line });
      chapter.maths.push({ token: tok, line, display: true });
      checkTex(tok, fail);
    } else if (tok.type === 'math_error') {
      fail('E10', tok, '閉じていない $$ がある');
    }
    if (tok.type !== 'inline' || !tok.children) continue;
    collectChildren(chapter, tok, tok.children, inDefinition.has(i), false, lineOf, fail);
  }
}

/**
 * 行内のトークンの子を集める。注の中身も、注の位置で同じように集める。
 * @param {ChapterModel} chapter
 * @param {any} tok  子を持つ inline のトークン(行番号に使う)
 * @param {any[]} children
 * @param {boolean} inDefinition  definition の本文の中か
 * @param {boolean} inNote  注の本文の中か
 * @param {(tok: any) => number | null} lineOf
 * @param {(code: string, tok: any, msg: string) => void} fail
 */
function collectChildren(chapter, tok, children, inDefinition, inNote, lineOf, fail) {
  for (const c of children) {
    if (c.type === 'math_inline') {
      chapter.maths.push({ token: c, line: lineOf(tok), display: false });
      checkTex(c, fail, tok);
    } else if (c.type === 'math_error') {
      if (inNote && c.meta.kind === 'inline-display') continue; // 注の側で E14 にする
      fail(
        'E10',
        tok,
        c.meta.kind === 'inline-display'
          ? '別行立ての $$ は行頭から書く(文中に $$ がある)'
          : `閉じていない $ がある(「${c.content}」)。$ そのものは \\$ と書く`,
      );
    } else if (c.type === 'wikiref') {
      chapter.refs.push({ token: c, line: lineOf(tok), inDefinition });
    } else if (c.type === 'image') {
      chapter.images.push({ token: c, src: c.attrGet('src') ?? '', line: lineOf(tok) });
    } else if (c.type === 'note_error') {
      fail(
        'E14',
        tok,
        c.meta.kind === 'empty'
          ? '空の注(^[])がある'
          : `閉じていない注がある(「${c.content}」)。^[ そのものは \\^[ と書く`,
      );
    } else if (c.type === 'note') {
      if (inNote) fail('E14', tok, '注の中に注は書けない');
      else if (inDefinition)
        fail('E14', tok, 'definition の本文には注を書けない(定義はほかの章のポップアップにも出る)');
      else chapter.notes.push({ token: c, line: lineOf(tok) });
      if (c.meta?.display) fail('E14', tok, '注の中に別行立ての数式($$)は書けない');
      collectChildren(chapter, tok, c.children ?? [], inDefinition, true, lineOf, fail);
    }
  }
}

/**
 * 段落が図(画像だけの段落)なら、その画像と ID を返す(content-format.md「図」)。
 * 最後の画像の後ろの {#ID} は図の ID として読み取り、描画しないように中身を空にする。
 * 画像の前後にほかの文字がある段落は図ではない(文の中の画像)。
 * @param {any[]} children  段落の inline トークンの子
 * @param {(code: string, msg: string) => void} fail
 * @returns {{ images: any[], id: string | null } | null}
 */
function figureOf(children, fail) {
  const blank = (/** @type {any} */ c) => c.type === 'softbreak' || (c.type === 'text' && c.content.trim() === '');
  const last = children.map((c) => c.type).lastIndexOf('image');
  if (last < 0) return null;
  if (!children.slice(0, last + 1).every((c) => c.type === 'image' || blank(c))) return null;
  const tail = children.slice(last + 1);
  if (!tail.every((c) => c.type === 'text' || c.type === 'softbreak')) return null;
  const images = children.filter((c) => c.type === 'image');
  const after = tail
    .map((c) => (c.type === 'text' ? c.content : ''))
    .join('')
    .trim();
  if (after === '') return { images, id: null };
  const braces = /^\{(.*)\}$/.exec(after);
  if (!braces) return null;
  let id = null;
  const parsed = parseAttrs(braces[1]);
  for (const p of parsed.problems) fail('E02', p);
  for (const key of Object.keys(parsed.values)) fail('E02', `図に属性 ${key} は書けない(書けるのは #ID だけ)`);
  if (parsed.id !== null) {
    const problem = idProblem(parsed.id);
    if (problem) fail('E03', problem);
    id = parsed.id;
  }
  for (const c of tail) if (c.type === 'text') c.content = '';
  return { images, id };
}

/**
 * 図の画像のタイトルから、キャプションの一片を取り出す。行内の数式は本文の数式と同じく描画して検査する。
 * @param {any} image
 * @param {ChapterModel} chapter
 * @param {number | null} line
 * @param {(code: string, msg: string) => void} fail
 * @returns {any[]}
 */
function captionOf(image, chapter, line, fail) {
  const parts = image.meta?.titleParts ?? [];
  for (const p of parts) {
    if (p.type === 'math_inline') chapter.maths.push({ token: p, line, display: false });
    else if (p.type === 'math_error')
      fail(
        'E10',
        p.meta?.kind === 'inline-display'
          ? '図のタイトルに $$ は書けない(行内の数式は $…$ で書く)'
          : `図のタイトルに閉じていない $ がある(「${p.content}」)。$ そのものは \\$ と書く`,
      );
  }
  return parts;
}

/**
 * @param {any} tok
 * @param {(code: string, tok: any, msg: string) => void} fail
 * @param {any} [lineTok]
 */
function checkTex(tok, fail, lineTok) {
  const m = FORBIDDEN_TEX.exec(tok.content);
  if (m) fail('E10', lineTok ?? tok, `数式に \\${m[1]} は使えない。番号はツールが振り、参照は [[@ID]] で書く`);
}

/**
 * インラインのトークンから、装飾を外した文字列を作る。
 * @param {any} inline
 */
export function plainText(inline) {
  if (!inline) return '';
  if (!inline.children) return (inline.content || '').trim();
  let s = '';
  for (const c of inline.children) {
    if (c.type === 'text' || c.type === 'code_inline' || c.type === 'text_special') s += c.content;
    else if (c.type === 'softbreak' || c.type === 'hardbreak') s += ' ';
    else if (c.type === 'math_inline') s += c.content;
  }
  return s.trim();
}
