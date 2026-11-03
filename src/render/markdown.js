// markdown-it の設定と、MathEnaga の記法の規則(数式・参照・駅の見出し属性・ブロック)。
// 記法の意味は docs/spec/content-format.md。ここでは字句を切り出すだけで、検査はコアが行う。

import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import referenceRule from 'markdown-it/lib/rules_block/reference.mjs';
import imageRule from 'markdown-it/lib/rules_inline/image.mjs';

/** ブロックのトークン名。`container_<名前>_open` の形になる。 */
export const BLOCK = 'mathenaga';
export const BLOCK_OPEN = `container_${BLOCK}_open`;
export const BLOCK_CLOSE = `container_${BLOCK}_close`;

/**
 * 閲覧用の HTML に書き出すときに使う関数の組。描画の内容はページの側で決める。
 * @typedef {object} RenderEnv
 * @property {(token: any) => string} mathInline
 * @property {(token: any) => string} mathBlock
 * @property {(token: any) => string} ref
 * @property {(token: any) => string} [note]  注の印(note のトークン)を描く
 * @property {(src: string) => string} imageSrc
 * @property {(token: any) => number | undefined} [paragraphNo]  段落の番号(data-p)。番号がなければ undefined
 * @property {(token: any) => string | undefined} [sourceLines]
 *   番号を付けた段落が原稿のファイルで占める行(data-l。「12」か「12-15」)。書かないなら undefined
 * @property {(token: any) => { label: string, id: string | null, images: any[], captions: TitlePart[][] } | undefined} [figure]
 *   段落(paragraph_open)が図なら、図番号・ID・画像と、画像ごとのキャプション。図でなければ undefined
 */

/**
 * 画像のタイトルを切り分けた一片(図のキャプション、content-format.md「図」)。
 * text は文字(エスケープを解いたもの)、math_inline は行内の数式(TeX のまま)、math_error は閉じていない $ など。
 * @typedef {{ type: 'text' | 'math_inline' | 'math_error', content: string, meta?: { kind: string } }} TitlePart
 */

/** 段落の番号(data-p)を付けるトークン。別行立ての数式は env.mathBlock が付ける。 */
const NUMBERED = ['paragraph_open', 'list_item_open', 'heading_open', 'table_open', 'fence', 'code_block'];

/**
 * MathEnaga の記法を読める markdown-it を作る。
 * Preconditions: なし。
 * Postconditions: html を解釈しない(タグは文字のまま)markdown-it を返す。
 *   次のトークンが加わる:math_inline、math_block、math_error、wikiref、note、note_error、ブロックの開閉。
 *   note は注 `^[…]` で、children に注の本文を行内として解析したトークン列を持つ。
 *   2段目の見出しの末尾の {…} は取り除いて heading_open.meta.attrsSrc に入れる。
 *   タイトルのある画像は、タイトルを文字と行内の数式に切り分けて image.meta.titleParts に入れる。
 *   env.paragraphNo が番号を返すブロックには data-p 属性を付け、env.sourceLines が行を返せば data-l 属性も付ける。
 *   env.figure が図を返す段落は <figure> にし、画像を並べ、図番号とキャプションを付ける。
 * Failure modes: なし。
 * Side effects: なし。
 */
export function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.use(container, BLOCK, { validate: (/** @type {string} */ params) => params.trim() !== '' });
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
  md.inline.ruler.before('link', 'wikiref', wikiRefRule);
  md.inline.ruler.before('link', 'note', noteRule);
  keepImageTitleParts(md);
  md.core.ruler.after('block', 'station_heading_attrs', stationHeadingAttrs);

  md.renderer.rules.math_inline = (tokens, idx, _o, env) => env.mathInline(tokens[idx]);
  md.renderer.rules.math_block = (tokens, idx, _o, env) => env.mathBlock(tokens[idx]);
  md.renderer.rules.math_error = () => '';
  md.renderer.rules.wikiref = (tokens, idx, _o, env) => env.ref(tokens[idx]);
  md.renderer.rules.note = (tokens, idx, _o, env) => (env.note ? env.note(tokens[idx]) : '');
  md.renderer.rules.note_error = () => '';
  const defaultImage = md.renderer.rules.image;
  const esc = md.utils.escapeHtml;
  /** 並べた画像の札:(a)、(b)、… @param {number} i */
  const sub = (i) => `(${String.fromCharCode(97 + i)})`;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    // 描画の間だけ属性を変える(トークンは共有なので、ほかの描画に残さない)
    const token = tokens[idx];
    const saved = token.attrs;
    const fig = env?.figureNow;
    try {
      const src = token.attrGet('src');
      token.attrs = (saved ?? []).filter(([k]) => !(fig && k === 'title'));
      if (src !== null && env.imageSrc) token.attrSet('src', env.imageSrc(src));
      const img = defaultImage ? defaultImage(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      if (!fig) return img;
      const label = fig.images.length > 1 ? `<span class="fig-sub">${sub(fig.images.indexOf(token))}</span>` : '';
      return `<span class="fig-item">${img}${label}</span>`;
    } finally {
      token.attrs = saved;
    }
  };
  // 図(画像だけの段落、content-format.md「図」):<figure> にし、画像の行の下に図番号とキャプションを付ける
  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const fig = tokens[idx].hidden ? undefined : env?.figure?.(tokens[idx]);
    if (!fig) return self.renderToken(tokens, idx, options);
    env.figureNow = fig;
    return `<figure class="fig"${fig.id ? ` id="${esc(fig.id)}"` : ''}${self.renderAttrs(tokens[idx])}><span class="fig-row">`;
  };
  md.renderer.rules.paragraph_close = (tokens, idx, options, env, self) => {
    const fig = env?.figureNow;
    if (!fig) return self.renderToken(tokens, idx, options);
    env.figureNow = null;
    const many = fig.images.length > 1;
    /** @param {TitlePart} p */
    const part = (p) => (p.type === 'math_inline' ? env.mathInline(p) : p.type === 'text' ? esc(p.content) : '');
    const caption = fig.images
      .map((_im, i) => ({ parts: fig.captions[i] ?? [], mark: many ? `${sub(i)} ` : '' }))
      .filter((c) => c.parts.length > 0)
      .map((c) => `${c.mark}${c.parts.map(part).join('')}`)
      .join(' ');
    return `</span><figcaption><span class="fig-no">図 ${esc(fig.label)}</span>${caption ? ` ${caption}` : ''}</figcaption></figure>\n`;
  };
  for (const type of NUMBERED) {
    const base = md.renderer.rules[type];
    md.renderer.rules[type] = (tokens, idx, options, env, self) => {
      const render = () => (base ? base(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options));
      const no = env?.paragraphNo?.(tokens[idx]);
      if (no === undefined) return render();
      // 描画の間だけ属性を足す(トークンは共有なので、ほかの描画に残さない)
      const token = tokens[idx];
      const saved = token.attrs;
      const lines = env.sourceLines?.(token);
      token.attrs = [...(saved ?? []), ['data-p', String(no)], ...(lines ? [['data-l', lines]] : [])];
      try {
        return render();
      } finally {
        token.attrs = saved;
      }
    };
  }
  return md;
}

/** `$$` の位置を探す。`\$` は飛ばす。見つからなければ -1。 @param {string} text @param {number} from */
function findDisplayClose(text, from) {
  for (let i = from; i < text.length - 1; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '$' && text[i + 1] === '$') return i;
  }
  return -1;
}

/** 別行立ての数式 `$$…$$`(行頭から。閉じる `$$` の後ろに `{#ID}` を書ける)。 */
function mathBlockRule(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.slice(start, start + 2) !== '$$') return false;
  if (silent) return true;

  const first = state.src.slice(start + 2, max);
  let content;
  let after = '';
  let last = startLine;
  let closed = false;
  const inline = findDisplayClose(first, 0);
  if (inline >= 0) {
    content = first.slice(0, inline);
    after = first.slice(inline + 2);
    closed = true;
  } else {
    const parts = [first];
    for (let line = startLine + 1; line < endLine; line++) {
      const s = state.bMarks[line] + state.tShift[line];
      const text = state.src.slice(s, state.eMarks[line]);
      const close = findDisplayClose(text, 0);
      if (close >= 0) {
        parts.push(text.slice(0, close));
        after = text.slice(close + 2);
        last = line;
        closed = true;
        break;
      }
      parts.push(text);
    }
    content = parts.join('\n');
  }
  if (!closed) {
    const token = state.push('math_error', '', 0);
    token.map = [startLine, startLine + 1];
    token.meta = { kind: 'unclosed-display' };
    token.content = first;
    state.line = startLine + 1;
    return true;
  }
  const token = state.push('math_block', 'div', 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, last + 1];
  token.meta = { after: after.trim() };
  state.line = last + 1;
  return true;
}

/** 行内の数式 `$…$`。`\$` は数式にしない(escape の規則が処理する)。 */
function mathInlineRule(state, silent) {
  const src = state.src;
  const pos = state.pos;
  if (src[pos] !== '$') return false;
  if (src[pos + 1] === '$') {
    if (!silent) {
      const token = state.push('math_error', '', 0);
      token.meta = { kind: 'inline-display' };
      token.content = '$$';
    }
    state.pos += 2;
    return true;
  }
  let end = pos + 1;
  while (end < state.posMax) {
    if (src[end] === '\\') {
      end += 2;
      continue;
    }
    if (src[end] === '$') break;
    end++;
  }
  if (end >= state.posMax) {
    if (!silent) {
      const token = state.push('math_error', '', 0);
      token.meta = { kind: 'unclosed-inline' };
      token.content = src.slice(pos, Math.min(state.posMax, pos + 20));
    }
    state.pos += 1;
    return true;
  }
  if (!silent) {
    const token = state.push('math_inline', '', 0);
    token.content = src.slice(pos + 1, end);
  }
  state.pos = end + 1;
  return true;
}

/**
 * 画像の規則を包み、タイトルを文字と行内の数式に切り分けて image.meta.titleParts に入れる。
 * markdown-it はタイトルのエスケープを解いてしまう(`\{` が `{` になる)ので、解く前のタイトルを
 * parseLinkTitle から受け取って切り分ける。参照形式の画像(`![alt][ref]`)は、参照の定義
 * (`[ref]: src "タイトル"`)を読むときに解く前のタイトルを覚えておき、それを使う。
 * @param {MarkdownIt} md
 */
function keepImageTitleParts(md) {
  /** 読んでいるタイトルの、解く前の文字の範囲 @type {{ raw: string | null, start?: number } | null} */
  let slot = null;
  const parseLinkTitle = md.helpers.parseLinkTitle;
  md.helpers.parseLinkTitle = (str, start, max, prev) => {
    const res = parseLinkTitle(str, start, max, prev);
    if (slot && slot.raw === null) {
      // 参照の定義のタイトルは複数行にわたることがあり、行ごとに呼ばれる(2回目からは prev がある)
      if (!prev) slot.start = start;
      if (res.ok && slot.start !== undefined) slot.raw = str.slice(slot.start + 1, res.pos - 1);
    }
    return res;
  };
  md.block.ruler.at('reference', (state, startLine, endLine, silent) => {
    const outer = slot;
    const mine = { raw: /** @type {string | null} */ (null) };
    slot = mine;
    const before = new Set(Object.keys(state.env.references ?? {}));
    let ok;
    try {
      ok = referenceRule(state, startLine, endLine, silent);
    } finally {
      slot = outer;
    }
    if (!ok || silent || mine.raw === null) return ok;
    for (const [label, ref] of Object.entries(state.env.references ?? {})) {
      // 同じ名前の2つ目からの定義は使われないので、新しく加わった定義にだけ付ける
      if (!before.has(label) && md.utils.unescapeAll(mine.raw) === ref.title) ref.rawTitle = mine.raw;
    }
    return ok;
  });
  md.inline.ruler.at('image', (state, silent) => {
    const outer = slot;
    const mine = { raw: /** @type {string | null} */ (null) };
    slot = mine;
    const count = state.tokens.length;
    let ok;
    try {
      ok = imageRule(state, silent);
    } finally {
      slot = outer;
    }
    const token = state.tokens[state.tokens.length - 1];
    if (!ok || silent || state.tokens.length === count || token.type !== 'image') return ok;
    const title = token.attrGet('title');
    if (title === null) return ok;
    // 中の alt を読むときに別のタイトルを拾っていないか、解いた形で照らし合わせる
    let raw = mine.raw !== null && md.utils.unescapeAll(mine.raw) === title ? mine.raw : null;
    if (mine.raw === null) raw = referenceRawTitle(state.env.references, token.attrGet('src'), title);
    token.meta = {
      ...token.meta,
      titleParts: raw === null ? lexTitle(title, (s) => s) : lexTitle(raw, md.utils.unescapeAll),
    };
    return ok;
  });
}

/**
 * 参照形式の画像が使った参照の定義の、解く前のタイトル。画像のトークンには参照の名前が残らないので、
 * 行き先とタイトルが同じ定義を探す。解く前の書き方が1つに決まらなければ null(解いた後のタイトルを使う)。
 * @param {Record<string, { href: string, title: string, rawTitle?: string }> | undefined} refs
 * @param {string | null} src
 * @param {string} title  解いた後のタイトル
 * @returns {string | null}
 */
function referenceRawTitle(refs, src, title) {
  const raws = new Set(
    Object.values(refs ?? {})
      .filter((r) => r.href === src && r.title === title)
      .map((r) => r.rawTitle ?? title),
  );
  return raws.size === 1 ? [...raws][0] : null;
}

/**
 * タイトルを、文字と行内の数式 `$…$` に切り分ける。本文の行内の数式と同じく、`\$` は $ そのもの。
 * @param {string} raw  エスケープを解く前のタイトル
 * @param {(s: string) => string} unescape  文字の部分のエスケープを解く関数
 * @returns {TitlePart[]}
 */
export function lexTitle(raw, unescape) {
  /** @type {TitlePart[]} */
  const parts = [];
  let text = '';
  const flush = () => {
    if (text !== '') parts.push({ type: 'text', content: unescape(text) });
    text = '';
  };
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      text += raw.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch !== '$') {
      text += ch;
      i++;
      continue;
    }
    flush();
    if (raw[i + 1] === '$') {
      parts.push({ type: 'math_error', content: '$$', meta: { kind: 'inline-display' } });
      i += 2;
      continue;
    }
    let end = i + 1;
    while (end < raw.length && raw[end] !== '$') end += raw[end] === '\\' ? 2 : 1;
    if (end >= raw.length) {
      parts.push({ type: 'math_error', content: raw.slice(i, i + 20), meta: { kind: 'unclosed-inline' } });
      i++;
      continue;
    }
    parts.push({ type: 'math_inline', content: raw.slice(i + 1, end) });
    i = end + 1;
  }
  flush();
  return parts;
}

/** 参照 `[[キー]]`、`[[キー|文字]]`、`[[@ID]]`。表の中では `\|` も区切りとして読む。 */
function wikiRefRule(state, silent) {
  const src = state.src;
  const pos = state.pos;
  if (src[pos] !== '[' || src[pos + 1] !== '[') return false;
  const close = src.indexOf(']]', pos + 2);
  if (close < 0 || close + 2 > state.posMax) return false;
  const inner = src.slice(pos + 2, close);
  if (inner.includes('\n') || inner.includes('[')) return false;
  if (!silent) {
    const token = state.push('wikiref', '', 0);
    const at = inner.startsWith('@');
    const body = at ? inner.slice(1) : inner;
    const bar = body.search(/\\?\|/);
    const key = (bar < 0 ? body : body.slice(0, bar)).trim();
    const label = bar < 0 ? null : body.slice(bar).replace(/^\\?\|/, '');
    token.content = inner;
    token.meta = { at, key, label };
  }
  state.pos = close + 2;
  return true;
}

/**
 * 注 `^[注の本文]`(content-format.md「注」)。本文は、`[` と `]` の入れ子を数えて、最初の対応する `]` で閉じる。
 * 行内の数式・コード・`[[…]]` の中の括弧と、`\]` は数えない。本文は行内として解析し、children に入れる。
 * 閉じていない注と空の注は note_error にする(検査はコアが行う)。`\^[` は escape の規則が文字にする。
 */
function noteRule(state, silent) {
  const src = state.src;
  const pos = state.pos;
  if (src[pos] !== '^' || src[pos + 1] !== '[') return false;
  const max = state.posMax;
  let depth = 1;
  let display = false;
  let i = pos + 2;
  let close = -1;
  while (i < max) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '$') {
      if (src[i + 1] === '$') {
        display = true;
        i += 2;
        continue;
      }
      const end = closingDollar(src, i + 1, max);
      i = end < 0 ? i + 1 : end + 1;
      continue;
    }
    if (ch === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const end = src.indexOf(fence, i + n);
      i = end < 0 || end >= max ? i + n : end + n;
      continue;
    }
    if (ch === '[' && src[i + 1] === '[') {
      const end = src.indexOf(']]', i + 2);
      if (end >= 0 && end + 2 <= max) {
        i = end + 2;
        continue;
      }
    }
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) {
      close = i;
      break;
    }
    i++;
  }
  if (close < 0) {
    if (!silent) {
      const token = state.push('note_error', '', 0);
      token.meta = { kind: 'unclosed' };
      token.content = src.slice(pos, Math.min(max, pos + 20));
    }
    state.pos = pos + 2;
    return true;
  }
  const content = src.slice(pos + 2, close);
  if (!silent) {
    if (content.trim() === '') {
      const token = state.push('note_error', '', 0);
      token.meta = { kind: 'empty' };
      token.content = '';
    } else {
      const token = state.push('note', '', 0);
      token.content = content;
      token.meta = { display };
      /** @type {any[]} */
      const children = [];
      state.md.inline.parse(content, state.md, state.env, children);
      token.children = children;
    }
  }
  state.pos = close + 1;
  return true;
}

/** `from` から、行内の数式を閉じる `$` を探す。`\$` は飛ばす。見つからなければ -1。 @param {string} src @param {number} from @param {number} max */
function closingDollar(src, from, max) {
  for (let i = from; i < max; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '$') return i;
  }
  return -1;
}

/** 2段目の見出しの末尾の {…} を、インラインの解析の前に取り除く。 */
function stationHeadingAttrs(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open' || t.tag !== 'h2') continue;
    const inline = tokens[i + 1];
    const m = /\s*\{([^{}]*)\}\s*$/.exec(inline.content);
    t.meta = { ...(t.meta || {}), attrsSrc: m ? m[1] : null };
    if (m) inline.content = inline.content.slice(0, m.index);
  }
}
