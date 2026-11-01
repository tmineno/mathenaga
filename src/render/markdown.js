// markdown-it の設定と、MathEnaga の記法の規則(数式・参照・駅の見出し属性・ブロック)。
// 記法の意味は docs/spec/content-format.md。ここでは字句を切り出すだけで、検査はコアが行う。

import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';

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
 * @property {(src: string) => string} imageSrc
 * @property {(token: any) => number | undefined} [paragraphNo]  段落の番号(data-p)。番号がなければ undefined
 */

/** 段落の番号(data-p)を付けるトークン。別行立ての数式は env.mathBlock が付ける。 */
const NUMBERED = ['paragraph_open', 'list_item_open', 'heading_open', 'table_open', 'fence', 'code_block'];

/**
 * MathEnaga の記法を読める markdown-it を作る。
 * Preconditions: なし。
 * Postconditions: html を解釈しない(タグは文字のまま)markdown-it を返す。
 *   次のトークンが加わる:math_inline、math_block、math_error、wikiref、ブロックの開閉。
 *   2段目の見出しの末尾の {…} は取り除いて heading_open.meta.attrsSrc に入れる。
 *   env.paragraphNo が番号を返すブロックには data-p 属性を付ける。
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
  md.core.ruler.after('block', 'station_heading_attrs', stationHeadingAttrs);

  md.renderer.rules.math_inline = (tokens, idx, _o, env) => env.mathInline(tokens[idx]);
  md.renderer.rules.math_block = (tokens, idx, _o, env) => env.mathBlock(tokens[idx]);
  md.renderer.rules.math_error = () => '';
  md.renderer.rules.wikiref = (tokens, idx, _o, env) => env.ref(tokens[idx]);
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src');
    if (src !== null && env.imageSrc) token.attrSet('src', env.imageSrc(src));
    return defaultImage ? defaultImage(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
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
      token.attrs = [...(saved ?? []), ['data-p', String(no)]];
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
