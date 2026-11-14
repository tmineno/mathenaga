// ページの組み立て(docs/spec/site.md)と、定義索引 defs.json(docs/spec/build.md)。

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { build as esbuild } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEF_PREFIX } from '../../core/ids.js';
import { layoutMap, renderMapSvg } from '../../core/map.js';
import {
  chapterInField,
  chapterStations,
  nextChapter,
  prerequisiteChapters,
  otherLineGuide,
} from '../../core/navigation.js';
import { byFieldOrder, stationItems, walkInline } from '../../core/order.js';
import { escapeHtml as h, fill } from '../../core/text.js';
import { lookScript } from '../shared/settings.js';
import { birdSvg, blocks, FAVICON_SIZE, faviconPng, faviconSvg, logoSvg, parseBitmap, trim } from './logo.js';

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KATEX_DIR = path.dirname(createRequire(import.meta.url).resolve('katex'));
/** 吹き出しのアイコン */
const ISSUE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
/** しおりのアイコン(site.md「しおり」)。入れた駅では CSS で塗りつぶす */
const BOOKMARK_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
/**
 * 書体の読み込み(site.md「Performance / Safety」の書体)。site.yml の fonts がなければ何も読み込まない。
 * @param {string} url  Google Fonts の CSS の URL(検査済み)
 */
function fontLinks(url) {
  if (!url) return '';
  return (
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    `<link rel="stylesheet" href="${h(url)}">`
  );
}

/**
 * サイト全体のファイルを作る。
 * Preconditions: ctx は analyze() がエラーなしで返した材料。
 * Postconditions: 出力の相対パス → 内容(文字列、またはコピー元)を返す。
 * Failure modes: KaTeX や assets のファイルが読めなければ例外。ロゴのドットマップの形式が違えば例外。
 * Side effects: assets と KaTeX のファイルを読む。
 * @param {any} ctx
 * @returns {Promise<Map<string, import('../../io/output.js').OutputFile>>}
 */
export async function generateSite(ctx) {
  const logo = trim(parseBitmap(ctx.logo.text, ctx.logo.file));
  const bird = blocks(logo)[0];
  const r = new Renderer(ctx, { logo, bird });
  /** @type {Map<string, import('../../io/output.js').OutputFile>} */
  const files = new Map();
  // ページが読むファイルは、URL に中身の版の印を付けるので、ページより先に作る(build.md「出力」)
  for (const c of ctx.site.chapters) {
    const src = ctx.chapterFiles.get(c.id);
    for (const fig of src?.figures ?? []) {
      const from = path.join(src.dirPath, ...fig.split('/'));
      files.set(`chapters/${c.id}/${fig}`, { copyFrom: from });
      r.versions.set(`chapters/${c.id}/${fig}`, versionOf(await fs.readFile(from)));
    }
  }
  files.set('defs.json', r.definitionIndex());
  files.set('assets/style.css', [await themeCss(), ...(ctx.theme ? [ctx.theme] : [])].join('\n'));
  files.set(
    'assets/app.js',
    await clientScript({ storagePrefix: ctx.siteConfig.storagePrefix, messages: ctx.messages }),
  );
  files.set('assets/lines.css', lineCss(ctx.site.lines));
  files.set('assets/favicon.svg', faviconSvg(bird));
  files.set('assets/favicon.png', faviconPng(bird));
  const katexCss = await fs.readFile(path.join(KATEX_DIR, 'katex.min.css'), 'utf8');
  files.set(
    'assets/katex/katex.min.css',
    katexCss.replace(
      /src:url\((fonts\/[^)]+?\.woff2)\) format\("woff2"\)(?:,url\([^)]+\) format\("[^"]+"\))*/g,
      'src:url($1) format("woff2")',
    ),
  );
  for (const font of (await fs.readdir(path.join(KATEX_DIR, 'fonts'))).filter((f) => f.endsWith('.woff2')).sort()) {
    files.set(`assets/katex/fonts/${font}`, { copyFrom: path.join(KATEX_DIR, 'fonts', font) });
  }
  for (const [p, content] of files)
    if (typeof content === 'string' || content instanceof Uint8Array) r.versions.set(p, versionOf(content));

  files.set('index.html', r.topPage());
  for (const f of ctx.site.fields) files.set(`fields/${f.id}/index.html`, r.fieldPage(f));
  for (const c of ctx.site.chapters) files.set(`chapters/${c.id}/index.html`, r.chapterPage(c));
  return files;
}

/**
 * CSS(docs/spec/build.md「出力」)。src/ui/theme/ の .css を、ファイル名の順に空行1つをはさんでつなぐ。
 * Preconditions: なし。
 * Postconditions: つないだ CSS を返す。
 * Failure modes: ファイルが読めなければ例外。
 * Side effects: src/ui/theme/ を読む。
 */
export async function themeCss() {
  const dir = path.join(UI, 'theme');
  const names = (await fs.readdir(dir)).filter((f) => f.endsWith('.css')).sort();
  const parts = await Promise.all(names.map((f) => fs.readFile(path.join(dir, f), 'utf8')));
  return parts.join('\n');
}

/**
 * 閲覧時のスクリプト(docs/spec/build.md「出力」)。src/ui/client/index.js から読むモジュールを、esbuild で1つの即時関数にまとめる。
 * Preconditions: esbuild がインストール済み。
 * サイトの文言と保存キーの接頭辞は、ENAGA_SITE として埋め込む(src/ui/client/site.js)。
 * Postconditions: まとめたスクリプトを返す。同じソースと同じ site からは同じ文字列になる。
 * Failure modes: モジュールが解決できない・構文の誤りがあれば例外。
 * Side effects: src/ui/client/ と src/ui/shared/ を読む。
 * @param {{ storagePrefix: string, messages: Record<string, string> }} site
 */
export async function clientScript(site) {
  const out = await esbuild({
    entryPoints: [path.join(UI, 'client', 'index.js')],
    bundle: true,
    write: false,
    format: 'iife',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'silent',
    define: { ENAGA_SITE: JSON.stringify(site) },
  });
  return out.outputFiles[0].text;
}

/**
 * ファイルの版の印。中身の SHA-256 の16進の先頭 10 文字(build.md「出力」)。
 * @param {string | Uint8Array} content
 */
export function versionOf(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 10);
}

/**
 * 路線の色を CSS の変数にする。ダークテーマでは color_dark を使う。
 * ダークは、OS の設定に合わせるとき(テーマをライトに固定していない)と、表示の設定でダークを選んだときの2つ
 * (site.md「表示の設定」)。
 * @param {import('../../core/schema.js').Line[]} lines
 */
export function lineCss(lines) {
  const light = lines.map((l) => `.l-${l.id}{--lc:${l.color}}`).join('\n');
  /** @param {string} scope */
  const dark = (scope) => lines.map((l) => `${scope} .l-${l.id}{--lc:${l.colorDark}}`).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark(":root:not([data-theme='light'])")}\n}\n${dark(":root[data-theme='dark']")}\n`;
}

/**
 * トークン i が段落として数えるもの(site.md「位置情報つきのコピー」)なら、data-p を付けるトークンを返す。
 * 項目の詰まった箇条書きでは段落の <p> を書き出さないので、その項目(list_item_open)に付ける。
 * @param {any[]} tokens @param {number} i
 */
function numberedToken(tokens, i) {
  const t = tokens[i];
  if (t.type === 'paragraph_open') {
    if (!t.hidden) return t;
    for (let j = i - 1; j >= 0; j--) {
      if (tokens[j].type === 'list_item_open' && tokens[j].level === t.level - 1) return tokens[j];
    }
    return null;
  }
  return ['heading_open', 'table_open', 'math_block', 'fence', 'code_block'].includes(t.type) ? t : null;
}

class Renderer {
  /**
   * @param {any} ctx
   * @param {{ logo: import('./logo.js').Bitmap, bird: import('./logo.js').Bitmap }} art
   *   logo はロゴ全体、bird はその最初の塊(鳥)
   */
  constructor(ctx, art) {
    this.ctx = ctx;
    /** トップページの見出しのロゴ */
    /** サイト名(site.yml の name) */
    this.siteName = ctx.siteConfig.name;
    this.logoSvg = logoSvg(art.logo, { className: 'logo', label: this.siteName });
    /** 上端のバーのしおりのボタン。スクリプトが動くときだけ見せる(app.js) */
    this.bookmarkOpen = `<button type="button" class="bm-open" aria-expanded="false" aria-controls="_bookmarks" hidden>${BOOKMARK_ICON}<span>${h(this.m('bookmark.title'))}</span></button>`;
    /** head の中で表示の設定を html の属性に移すスクリプト(src/ui/shared/settings.js) */
    this.lookScript = lookScript(ctx.siteConfig.storagePrefix);
    /** 上端のバーのアイコン */
    this.birdSvg = birdSvg(art.bird, 'mark-icon');
    /** @type {import('../../core/graph.js').Site} */
    this.site = ctx.site;
    this.base = ctx.basePath;
    /** @type {string} */
    this.repoUrl = ctx.repoUrl ?? '';
    this.md = ctx.md;
    /** @type {Map<any, string>} */
    this.eqIds = new Map();
    for (const c of this.site.chapters) for (const e of c.equations) if (e.id) this.eqIds.set(e.token, e.id);
    /** 図の段落のトークン → 図(content-format.md「図」) */
    this.figs = new Map();
    for (const c of this.site.chapters) for (const f of c.figures) this.figs.set(f.token, f);
    /** @type {Map<any, Map<any, number>>} 章 → (トークン → 段落の番号) */
    this.paragraphs = new Map();
    /** @type {Map<any, number>} 注のトークン → 注の一覧の項目の段落の番号 */
    this.noteParagraphs = new Map();
    /** @type {Map<any, any>} 注のトークン → 注を書いた行内のトークン(注の一覧の項目の行に使う) */
    this.noteHosts = new Map();
    /** @type {Map<string, string>} 出力の相対パス → 版の印(generateSite が入れる) */
    this.versions = new Map();
  }

  /**
   * 文言(差し込み済み、エスケープ前)。
   * @param {string} key @param {Record<string, string | number>} [vars]
   */
  m(key, vars) {
    return fill(this.ctx.messages[key], vars);
  }

  /**
   * HTML に入れる文言。文言の文字はエスケープし、vars は HTML として差し込む(呼び出し側でエスケープしておく)。
   * @param {string} key @param {Record<string, string | number>} [vars]
   */
  mh(key, vars) {
    return fill(h(this.ctx.messages[key]), vars);
  }

  /** 章番号の文言(「第3章」)。 @param {number} n */
  chapterNo(n) {
    return this.m('chapter.number', { n });
  }

  /**
   * ページが読むファイルの URL。版の印があれば ?v= に付ける(build.md「出力」)。
   * @param {string} rel  出力の相対パス
   */
  asset(rel) {
    const v = this.versions.get(rel);
    return `${this.base}${rel}${v ? `?v=${v}` : ''}`;
  }

  /**
   * 区画(駅と、ゴール・出発点・ふりかえり・確認問題の節)ごとに、段落の番号を原稿の順に 1 から振る
   * (site.md「位置情報つきのコピー」)。折りたたむ中身とほかの分野の版も数える。
   * @param {any} c
   * @returns {Map<any, number>} 番号を付けるトークン → 番号
   */
  paragraphMap(c) {
    const cached = this.paragraphs.get(c);
    if (cached) return cached;
    const tokens = c.tokens;
    /** @type {Map<any, number>} */
    const map = new Map();
    /** @param {Array<{ start: number, end: number }>} ranges */
    const number = (ranges) => {
      const idx = new Set();
      for (const r of ranges) for (let i = r.start; i <= r.end; i++) idx.add(i);
      let n = 0;
      for (const i of [...idx].sort((a, b) => a - b)) {
        const target = numberedToken(tokens, i);
        if (target && !map.has(target)) map.set(target, ++n);
      }
      // 注の一覧の項目は、区画のほかのすべての段落の後に、注番号の順に数える(site.md「位置情報つきのコピー」)
      for (const t of this.notesIn(c, ranges)) this.noteParagraphs.set(t, ++n);
    };
    number(c.head.goals);
    number([...c.head.motivations, ...c.head.prose]);
    for (const st of c.stations) number(st.items.map((/** @type {any} */ it) => (it.kind === 'block' ? it.block : it)));
    number(c.end.reviews);
    number(c.end.questions.flatMap((/** @type {any} */ q) => (q.answer ? [q.question, q.answer] : [q.question])));
    this.paragraphs.set(c, map);
    return map;
  }

  // ---------- URL ----------

  /** @param {string} id @param {string | null} [field] */
  chapterUrl(id, field = null) {
    return `${this.base}chapters/${id}/${field ? `?field=${field}` : ''}`;
  }

  /** ページ内なら #ID、ほかの章なら章ページの #ID。 @param {string} chapterId @param {string} anchor @param {any} current @param {string | null} [field] */
  anchorUrl(chapterId, anchor, current, field = null) {
    if (current && current.id === chapterId) return `#${anchor}`;
    return `${this.chapterUrl(chapterId, field)}#${anchor}`;
  }

  // ---------- 本文の描画 ----------

  /** @param {any} chapter @param {boolean} plain */
  env(chapter, plain) {
    const paragraphs = plain ? null : this.paragraphMap(chapter);
    return {
      mathInline: (/** @type {any} */ t) => this.ctx.mathHtml.get(t) ?? '',
      mathBlock: (/** @type {any} */ t) => {
        const id = this.eqIds.get(t);
        const label = this.ctx.equations.labels.get(t);
        const no = paragraphs?.get(t);
        return `<div class="eq"${id ? ` id="${h(id)}"` : ''}${no === undefined ? '' : ` data-p="${no}"${this.linesAttr(chapter, t)}`}><div class="eq-body">${this.ctx.mathHtml.get(t) ?? ''}</div><span class="eq-num">(${label})</span></div>\n`;
      },
      paragraphNo: paragraphs ? (/** @type {any} */ t) => paragraphs.get(t) : undefined,
      sourceLines: paragraphs ? (/** @type {any} */ t) => this.sourceLines(chapter, t) : undefined,
      figure: (/** @type {any} */ t) => {
        const f = this.figs.get(t);
        return f
          ? {
              label: this.ctx.figures.labels.get(t),
              no: this.m('figure.number', { number: this.ctx.figures.labels.get(t) }),
              id: f.id,
              images: f.images,
              captions: f.captions,
            }
          : undefined;
      },
      ref: (/** @type {any} */ t) => this.refHtml(t, chapter, plain),
      note: (/** @type {any} */ t) => (plain ? '' : this.noteMarker(t)),
      imageSrc: (/** @type {string} */ src) =>
        /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : this.asset(`chapters/${chapter.id}/${path.posix.normalize(src)}`),
    };
  }

  /** @param {any} t @param {any} chapter @param {boolean} plain */
  refHtml(t, chapter, plain) {
    /** @type {import('../../core/resolve.js').Resolution | undefined} */
    const r = this.ctx.resolved.get(t);
    if (!r) return h(t.content);
    const text = h(r.text);
    if (plain) return text;
    if (t.meta.at) {
      if (r.kind === 'chapter') return `<a class="num" href="${this.chapterUrl(r.id)}">${text}</a>`;
      if (r.kind === 'reference') {
        return `<a class="cite" href="#${h(r.id)}" data-cite="${h(r.id)}" aria-haspopup="dialog" aria-expanded="false">${text}</a>`;
      }
      const cls = r.kind === 'equation' ? 'eqref' : 'num';
      return `<a class="${cls}" href="${this.anchorUrl(r.chapterId, r.id, chapter)}">${text}</a>`;
    }
    if (r.kind === 'definition') {
      return `<button type="button" class="term" data-def="${h(r.id)}" aria-haspopup="dialog" aria-expanded="false">${text}</button>`;
    }
    return `<a class="st-ref" href="${this.anchorUrl(r.chapterId, r.id, chapter)}">${text}</a>`;
  }

  /**
   * 注の印(site.md「注と参考文献の表示」)。注の一覧の項目へのリンクで、スクリプトが動くときはポップアップを出す。
   * @param {any} t  note のトークン
   */
  noteMarker(t) {
    const n = this.ctx.notes.labels.get(t);
    if (n === undefined) return '';
    return `<sup class="note-ref" id="_note-${n}"><a href="#_note-${n}-text" data-note="${n}" aria-haspopup="dialog" aria-expanded="false">${this.mh('note.ref', { n })}</a></sup>`;
  }

  /**
   * 範囲の中の注を、注番号の順に返す。
   * @param {any} c @param {Array<{ start: number, end: number }>} ranges
   * @returns {any[]}
   */
  notesIn(c, ranges) {
    const labels = this.ctx.notes.labels;
    /** @type {any[]} */
    const found = [];
    walkInline(c, ranges, (t, inline) => {
      if (t.type !== 'note' || !labels.has(t)) return;
      found.push(t);
      this.noteHosts.set(t, inline);
    });
    return found.sort((a, b) => labels.get(a) - labels.get(b));
  }

  /**
   * 駅か節の最後に置く注の一覧。注がなければ空。
   * @param {any} c @param {Array<{ start: number, end: number }>} ranges  その駅か節のトークンの範囲
   */
  notesList(c, ranges) {
    this.paragraphMap(c);
    const notes = this.notesIn(c, ranges);
    if (notes.length === 0) return '';
    const env = this.env(c, false);
    const items = notes.map((t) => {
      const n = this.ctx.notes.labels.get(t);
      const p = this.noteParagraphs.get(t);
      const body = this.md.renderer.renderInline(t.children ?? [], this.md.options, env);
      return `<li id="_note-${n}-text" class="note-item"${p === undefined ? '' : ` data-p="${p}"${this.linesAttr(c, this.noteHosts.get(t))}`}><span class="note-no">${this.mh('note.ref', { n })}</span> <span class="note-body">${body}</span><a class="note-back" href="#_note-${n}" aria-label="${h(this.m('note.back'))}">↩</a></li>`;
    });
    return `<aside class="notes" aria-label="${h(this.m('note.title'))}"><p class="notes-h">${h(this.m('note.title'))}</p><ol class="note-list">${items.join('')}</ol></aside>`;
  }

  /**
   * 章末の参考文献の節(site.md「注と参考文献の表示」)。文献を引いていない章では空。
   * @param {any} c
   */
  referencesSection(c) {
    /** @type {Map<string, number>} */
    const numbers = this.ctx.citations.get(c.id) ?? new Map();
    if (numbers.size === 0) return '';
    const items = [...numbers].map(([id, n]) => {
      const r = this.site.references.get(id);
      return `<li id="${h(id)}" class="ref-item" data-p="${n}"><span class="ref-no">[${n}]</span> <span class="ref-body">${r ? this.ctx.locale.bibliography(r) : h(id)}</span></li>`;
    });
    const title = this.m('section.references');
    return `<section class="refs-sec" id="_references" data-loc="${h(title)}"${this.sectionIssue(c, title, '_references')}><h2 class="sec-h" data-p="0">${h(title)}</h2><ol class="refs">${items.join('')}</ol></section>`;
  }

  /** トークンの範囲 [start, end] を描画する。 @param {any} chapter @param {number} start @param {number} end @param {boolean} [plain] */
  range(chapter, start, end, plain = false) {
    if (end < start) return '';
    return this.md.renderer.render(chapter.tokens.slice(start, end + 1), this.md.options, this.env(chapter, plain));
  }

  /** ブロックの中身。 @param {any} chapter @param {import('../../core/chapter.js').Block} b @param {boolean} [plain] */
  inner(chapter, b, plain = false) {
    return this.range(chapter, b.start + 1, b.end - 1, plain);
  }

  /**
   * @param {any} chapter @param {import('../../core/chapter.js').Block} b
   * @param {import('../../core/chapter.js').Block[]} [proofs]  theorem の枠に入れる、直後の proof-sketch と proof
   */
  blockHtml(chapter, b, proofs = []) {
    const body = this.inner(chapter, b);
    if (b.name === 'definition') {
      return `<div class="box def" id="${h(b.id)}"><p class="tag">${h(this.m('statement.definition', { number: this.ctx.statements.labels.get(b) }))} · ${h(b.attrs.name)}<span class="tag-en">${h(b.attrs.en)}</span></p><div class="flow">${body}</div></div>`;
    }
    if (b.name === 'theorem') {
      // 証明の骨格と証明の詳細は、定理の枠の中に入れる(site.md「駅の表示」)
      const inside = proofs
        .map((p) =>
          p.name === 'proof'
            ? this.blockHtml(chapter, p)
            : `<div class="thm-part proof-sketch"><p class="tag">${h(this.m('block.proof-sketch'))}</p><div class="flow">${this.inner(chapter, p)}</div></div>`,
        )
        .join('');
      return `<div class="box thm" id="${h(b.id)}"><p class="tag">${h(this.m('statement.theorem', { number: this.ctx.statements.labels.get(b) }))} · ${h(b.attrs.name)}</p><div class="flow">${body}</div>${inside}</div>`;
    }
    if (b.name === 'summary') {
      // 一言でいうと:札も枠もなく、駅の最初の地の文として出す(site.md「駅の表示」)
      return `<div class="summary flow">${body}</div>`;
    }
    if (b.name === 'proof') {
      // 見出しは、定理の札と同じ大きさの札にする(site.md「駅の表示」)
      return `<details class="fold proof"><summary><span class="tag">${h(this.m('block.proof'))}</span></summary><div class="fold-body flow">${body}</div></details>`;
    }
    return `<div class="box ${b.name}"><p class="tag">${h(this.m(`block.${b.name}`))}</p><div class="flow">${body}</div></div>`;
  }

  /** @param {string} fieldId */
  fieldTitle(fieldId) {
    return this.site.fieldById.get(fieldId)?.title ?? fieldId;
  }

  /**
   * 共通版と分野版の組。共通版は開いたまま、分野版は折りたたむ(初期状態は未選択)。
   * 出発点は節の見出し「出発点」の下に置くので、共通版に札を付けず、分野版の札を「〈分野名〉では」にする(site.md)。
   * @param {any} chapter @param {import('../../core/chapter.js').Block[]} blocks @param {string} kind @param {string} label
   * @param {string} [loc] 位置情報つきのコピーで使う区画の名前(data-loc)。区画でなければ空
   * @param {string} [tail] 組の最後に足す HTML(注の一覧など)
   */
  versionGroup(chapter, blocks, kind, label, loc = '', tail = '') {
    const out = [
      `<div class="vgroup" data-kind="${kind}"${loc ? ` data-loc="${h(loc)}"${this.sectionIssue(chapter, loc, '')}` : ''}>`,
    ];
    for (const b of byFieldOrder(blocks, this.site.fieldOrder)) {
      if (!b.field) {
        const tag = kind === 'motivation' ? '' : `<p class="tag tag-${kind}">${h(label)}</p>`;
        out.push(`<div class="v common">${tag}<div class="flow">${this.inner(chapter, b)}</div></div>`);
      } else {
        const field = h(this.fieldTitle(b.field));
        const title =
          kind === 'application'
            ? this.mh('application.title', {
                number: h(this.ctx.applications.labels.get(b) ?? ''),
                field,
                title: h(b.attrs.title ?? ''),
              })
            : kind === 'motivation'
              ? this.mh('version.motivation', { field })
              : this.mh('version.field', { label: h(label), field });
        out.push(
          `<details class="v"${b.id ? ` id="${h(b.id)}"` : ''} data-field="${h(b.field)}"><summary>${title}</summary><div class="v-body flow">${this.inner(chapter, b)}</div></details>`,
        );
      }
    }
    out.push(`${tail}</div>`);
    return out.join('');
  }

  /** @param {import('../../core/graph.js').StationInfo} st */
  badge(st) {
    return `<span class="badge l-${st.lineId}">${h(st.code)}</span>`;
  }

  /** 駅の表示番号の範囲。1駅なら1つだけ。 @param {import('../../core/graph.js').StationInfo[]} list @param {string} sep */
  codeRange(list, sep = '–') {
    if (list.length === 0) return '';
    if (list.length === 1) return this.badge(list[0]);
    return `${this.badge(list[0])}${sep}${this.badge(list[list.length - 1])}`;
  }

  // ---------- 路線図 ----------

  /**
   * @param {Set<string>} drawn
   * @param {{ goals?: any[], highlight?: string | null, planned?: boolean, title: string, idPrefix: string, hrefFor: (s: any) => string, chapterHref: (chapterId: string) => string | null }} opts
   */
  mapBlock(drawn, opts) {
    const layout = layoutMap(this.site, drawn, {
      goals: opts.goals,
      highlight: opts.highlight ?? null,
      planned: opts.planned ?? false,
    });
    const svg = renderMapSvg(layout, {
      title: opts.title,
      idPrefix: opts.idPrefix,
      hrefFor: opts.hrefFor,
      chapterHref: opts.chapterHref,
    });
    const legend = layout.linesShown.map(
      (l) => `<li><span class="sw l-${l.id}${l.style === 'dotted' ? ' dotted' : ''}"></span>${h(l.name)}</li>`,
    );
    if (layout.stations.some((s) => s.final))
      legend.push(`<li><span class="mk final"></span>${h(this.m('goal.final'))}</li>`);
    if (layout.stations.some((s) => s.partial))
      legend.push(`<li><span class="mk pill"></span>${h(this.m('goal.partial'))}</li>`);
    if (layout.arrows.length > 0)
      legend.push(`<li><span class="mk arrow"></span>${h(this.m('map.legend.arrow'))}</li>`);
    if (layout.cards.some((c) => c.planned))
      legend.push(`<li><span class="mk planned"></span>${h(this.m('map.legend.planned'))}</li>`);
    return { html: `<ul class="legend">${legend.join('')}</ul><div class="map-scroll">${svg}</div>`, layout };
  }

  // ---------- 共通の枠 ----------

  /** @param {{ title: string, bodyClass: string, bar: string, main: string }} p */
  page(p) {
    const fields = JSON.stringify(this.site.fields.map((f) => ({ id: f.id, title: f.title }))).replace(/</g, '\\u003c');
    // しおりの一覧で、駅の ID から表示番号・駅名・章を引くための索引(読む順。site.md「しおり」)
    const stations = JSON.stringify(
      this.site.stations
        .filter((st) => !st.planned)
        .map((st) => ({ id: st.id, code: st.code, name: st.name, ch: st.chapter.number, chapter: st.chapter.id })),
    ).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="${h(this.ctx.siteConfig.lang)}" data-base="${h(this.base)}" data-defs="${h(this.asset('defs.json'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${this.lookScript}</script>
<title>${h(p.title)}</title>
<link rel="icon" href="${this.asset('assets/favicon.png')}" type="image/png" sizes="${FAVICON_SIZE}x${FAVICON_SIZE}">
<link rel="icon" href="${this.asset('assets/favicon.svg')}" type="image/svg+xml">
${fontLinks(this.ctx.siteConfig.fonts)}
<link rel="stylesheet" href="${this.asset('assets/katex/katex.min.css')}">
<link rel="stylesheet" href="${this.asset('assets/style.css')}">
<link rel="stylesheet" href="${this.asset('assets/lines.css')}">
<script type="application/json" id="_fields">${fields}</script>
<script type="application/json" id="_stations">${stations}</script>
<script src="${this.asset('assets/app.js')}" defer></script>
</head>
<body class="${p.bodyClass}">
<header class="bar"><div class="bar-in">${p.bar}</div></header>
<main class="wrap" id="_main">
${p.main}
</main>
<div id="_pop" class="pop" role="dialog" aria-label="${h(this.m('popup.definition.title'))}" tabindex="-1" hidden></div>
</body>
</html>
`;
  }

  /** @param {string} crumb */
  barStart(crumb) {
    return `<a class="mark" href="${this.base}">${this.birdSvg}${h(this.siteName)}</a><span class="crumb">${h(crumb)}</span>`;
  }

  // ---------- トップページ ----------

  topPage() {
    const all = new Set(this.site.stations.map((s) => s.id));
    const map = this.mapBlock(all, {
      title: this.m('map.title.all'),
      idPrefix: '_map-all',
      planned: true,
      hrefFor: (s) => `${this.chapterUrl(s.chapter.id)}#${s.id}`,
      chapterHref: (id) => this.chapterUrl(id),
    });
    const fields = this.site.fields
      .map(
        (f) =>
          `<li><a class="field-name" href="${this.base}fields/${f.id}/">${h(f.title)}</a><p>${h(f.description)}</p></li>`,
      )
      .join('');
    const main = `<section class="intro"><h1 class="logo-h">${this.logoSvg}</h1></section>
<section class="sec"><h2 class="sec-h">${h(this.m('section.map'))}</h2><div class="map-v">${map.html}</div></section>
<section class="sec"><h2 class="sec-h">${h(this.m('section.fields'))}</h2><ul class="field-list">${fields}</ul></section>`;
    return this.page({
      title: this.siteName,
      bodyClass: 'page-top',
      bar: `${this.barStart('')}${this.bookmarkOpen}`,
      main,
    });
  }

  // ---------- 分野の入口ページ ----------

  /** @param {import('../../core/schema.js').Field} f */
  fieldPage(f) {
    const scope = this.site.scope.get(f.id) ?? new Set();
    const goals = f.goals
      .map((g) => {
        const st = this.site.stationById.get(g.station);
        if (!st) return '';
        const kind =
          g.kind === 'final'
            ? `<span class="gk final">${h(this.m('goal.final'))}</span>`
            : `<span class="gk partial">${h(this.m('goal.partial'))}</span>`;
        return `<li>${kind}${this.badge(st)}<span>${h(st.name)}</span><span class="note">${h(g.label)}</span></li>`;
      })
      .join('');
    const map = this.mapBlock(scope, {
      goals: f.goals,
      title: this.m('map.title.field', { field: f.title }),
      idPrefix: `_map-${f.id}`,
      hrefFor: (s) => `${this.chapterUrl(s.chapter.id, f.id)}#${s.id}`,
      chapterHref: (id) => this.chapterUrl(id, f.id),
    });
    const rows = (this.site.fieldChapters.get(f.id) ?? [])
      .map((c) => {
        const list = chapterStations(this.site, c);
        const inScope = list.filter((s) => scope.has(s.id));
        const contiguous =
          inScope.length > 1 &&
          list.indexOf(inScope[inScope.length - 1]) - list.indexOf(inScope[0]) === inScope.length - 1;
        const codes = contiguous
          ? this.codeRange(inScope)
          : inScope.map((s) => this.badge(s)).join(h(this.m('list.separator')));
        return `<tr><td><a href="${this.chapterUrl(c.id, f.id)}">${h(this.chapterNo(c.number))} ${h(c.title)}</a></td><td>${codes}</td></tr>`;
      })
      .join('');
    const main = `<section class="intro"><p class="eyebrow">${h(this.m('field.eyebrow'))}</p><h1>${h(f.title)}</h1><p class="lede">${h(f.description)}</p></section>
<section class="sec"><h2 class="sec-h">${h(this.m('field.goals'))}</h2><ul class="goal-list">${goals}</ul></section>
<section class="sec"><h2 class="sec-h">${h(this.m('section.map'))}</h2><div class="map-v">${map.html}</div></section>
<section class="sec"><h2 class="sec-h">${h(this.m('field.chapters'))}</h2><div class="tbl-scroll"><table class="chap"><thead><tr><th>${h(this.m('field.chapters.chapter'))}</th><th>${h(this.m('field.chapters.stations'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    return this.page({
      title: `${f.title} | ${this.siteName}`,
      bodyClass: 'page-field',
      bar: `${this.barStart(this.m('field.eyebrow'))}${this.bookmarkOpen}`,
      main,
    });
  }

  // ---------- 章ページ ----------

  /** @param {import('../../core/chapter.js').ChapterModel} c */
  chapterPage(c) {
    const site = this.site;
    const stations = chapterStations(site, c);
    const line = site.lineById.get(c.lineId);
    const lineName = h(line?.name ?? c.lineId);
    const fields = site.fields;
    const outFields = (/** @type {string} */ id) =>
      fields.filter((f) => !site.scope.get(f.id)?.has(id)).map((f) => f.id);

    // 上端のバー
    const switchButtons = [
      `<button type="button" data-set-field="" aria-pressed="true">${h(this.m('field.none'))}</button>`,
      ...fields.map(
        (f) => `<button type="button" data-set-field="${h(f.id)}" aria-pressed="false">${h(f.title)}</button>`,
      ),
    ].join('');
    const mini = stations
      .map(
        (s) =>
          `<a href="#${h(s.id)}" class="l-${s.lineId}" data-st="${h(s.id)}" data-out="${outFields(s.id).join(' ')}">${h(s.code)}</a>`,
      )
      .join('');
    const bar = `${this.barStart(`${this.chapterNo(c.number)} ${c.title}`)}<div class="switch" role="group" aria-label="${h(this.m('field.label'))}">${switchButtons}</div>${this.bookmarkOpen}<nav class="mini" aria-label="${h(this.m('chapter.stations'))}">${mini}</nav>`;

    // 見出しと現在地
    const range = this.codeRange(stations);
    const here =
      stations.length === 1
        ? `${lineName} ${range}`
        : this.mh('here.range', {
            line: lineName,
            from: this.badge(stations[0]),
            to: this.badge(stations[stations.length - 1]),
          });
    const prereq = prerequisiteChapters(site, c);
    const prereqHtml = prereq.length
      ? prereq
          .map((p) => `<a href="${this.chapterUrl(p.id)}">${h(this.chapterNo(p.number))} ${h(p.title)}</a>`)
          .join(h(this.m('list.separator')))
      : h(this.m('here.none'));
    const fieldRow = [
      ...fields.map(
        (f) =>
          `<span data-for="${h(f.id)}" hidden>${this.mh('here.fieldentry', { field: h(f.title), link: `<a href="${this.base}fields/${f.id}/">${h(this.m('here.enter'))}</a>` })}</span>`,
      ),
      `<span data-for="">${h(this.m('field.none'))}</span>`,
    ].join('');
    const nextRow = [
      ...fields.map((f) => `<span data-for="${h(f.id)}" hidden>${this.nextText(c, f)}</span>`),
      `<span data-for="">${this.nextText(c, null)}</span>`,
    ].join('');
    const head = `<header class="ch-head">
<p class="eyebrow">${h(this.chapterNo(c.number))} · ${lineName} ${range}</p>
<h1 class="ch-title">${h(c.title)}</h1>
${c.subtitle ? `<p class="ch-sub">${h(c.subtitle)}</p>` : ''}
<dl class="here">
<div><dt>${h(this.m('here.where'))}</dt><dd class="here-where">${here}</dd></div>
<div><dt>${h(this.m('here.prereq'))}</dt><dd class="here-prereq">${prereqHtml}</dd></div>
<div><dt>${h(this.m('field.label'))}</dt><dd class="here-field">${fieldRow}</dd></div>
<div><dt>${h(this.m('here.next'))}</dt><dd class="here-next">${nextRow}</dd></div>
</dl>
</header>`;

    const chooser = `<div class="chooser" data-for="">
<p class="chooser-t">${h(this.m('chooser.text'))}</p>
<div class="chooser-b">${fields.map((f) => `<button type="button" class="pick" data-set-field="${h(f.id)}">${h(f.title)}</button>`).join('')}</div>
<p class="note">${this.mh('chooser.entries', { links: fields.map((f) => `<a href="${this.base}fields/${f.id}/">${h(f.title)}</a>`).join(' · ') })}</p>
</div>`;

    // 路線図
    const maps = fields.map((f) => {
      const m = this.mapBlock(site.scope.get(f.id) ?? new Set(), {
        goals: f.goals,
        highlight: c.id,
        title: this.m('map.title.field', { field: f.title }),
        idPrefix: `_map-${f.id}`,
        hrefFor: (s) => (s.chapter === c ? `#${s.id}` : `${this.chapterUrl(s.chapter.id, f.id)}#${s.id}`),
        chapterHref: (id) => (id === c.id ? '#' : this.chapterUrl(id, f.id)),
      });
      const note = m.layout.cards.some((c) => c.current)
        ? ''
        : `<p class="note">${this.mh('chapter.notinmap', { field: h(f.title) })}</p>`;
      return `<div class="map-v" data-for="${h(f.id)}" hidden>${m.html}${note}</div>`;
    });
    const all = this.mapBlock(new Set(site.stations.map((s) => s.id)), {
      highlight: c.id,
      title: this.m('map.title.all'),
      idPrefix: '_map-all',
      planned: true,
      hrefFor: (s) => (s.chapter === c ? `#${s.id}` : `${this.chapterUrl(s.chapter.id)}#${s.id}`),
      chapterHref: (id) => (id === c.id ? '#' : this.chapterUrl(id)),
    });
    maps.push(`<div class="map-v" data-for="">${all.html}</div>`);
    const mapSec = `<section class="mapsec" aria-labelledby="_map-h"><h2 id="_map-h" class="sec-h">${h(this.m('section.map'))}</h2>${maps.join('')}</section>`;

    // 出発点
    const prose = c.head.prose.map((r) => this.range(c, r.start, r.end)).join('');
    const startNotes = this.notesList(c, [...c.head.motivations, ...c.head.prose]);
    const startName = this.m('section.start');
    const motivation = `<section class="start flow" id="_start" data-loc="${h(startName)}"${this.sectionIssue(c, startName, '_start')}><h2 class="sec-h" data-p="0">${h(startName)}</h2>${this.versionGroup(c, c.head.motivations, 'motivation', startName)}${prose}${startNotes}</section>`;

    // 駅
    const stationHtml = stations.map((st) => this.stationSection(c, st)).join('\n');

    // 章末
    const reviewName = this.m('section.review');
    const quizName = this.m('section.quiz');
    const review = c.end.reviews[0]
      ? `<section class="review" id="_review" data-loc="${h(reviewName)}"${this.sectionIssue(c, reviewName, '_review')}><h2 class="sec-h" data-p="0">${h(reviewName)}</h2><div class="box review"><div class="flow">${this.inner(c, c.end.reviews[0])}</div></div>${this.notesList(c, c.end.reviews)}</section>`
      : '';
    const questions = c.end.questions.length
      ? `<section class="quiz" id="_quiz" data-loc="${h(quizName)}"${this.sectionIssue(c, quizName, '_quiz')}><h2 class="sec-h" data-p="0">${h(quizName)}</h2><ol class="qs">${c.end.questions
          .map(
            (q) =>
              `<li><div class="q flow">${this.inner(c, q.question)}</div>${
                q.answer
                  ? `<details class="fold answer"><summary>${h(this.m('quiz.answer'))}</summary><div class="fold-body flow">${this.inner(c, q.answer)}</div></details>`
                  : ''
              }</li>`,
          )
          .join('')}</ol>${this.notesList(
          c,
          c.end.questions.flatMap((/** @type {any} */ q) => (q.answer ? [q.question, q.answer] : [q.question])),
        )}</section>`
      : '';
    const ahead = [
      ...fields.map((f) => `<ul class="next" data-for="${h(f.id)}" hidden>${this.aheadItems(c, f)}</ul>`),
      `<ul class="next" data-for="">${this.aheadItems(c, null)}</ul>`,
    ].join('');
    const aheadSec = `<section class="ahead" id="_ahead"><h2 class="sec-h">${h(this.m('section.ahead'))}</h2>${ahead}</section>`;

    const source = this.repoUrl
      ? ` data-source="${h(`${this.repoUrl}/blob/${this.ctx.siteConfig.repoBranch}/content/${c.file}`)}"`
      : '';
    const main = `<article class="chapter" data-chapter="${c.number}" data-id="${h(c.id)}"${source}>
${head}
${chooser}
${this.versionGroup(c, c.head.goals, 'goal', this.m('section.goal'), this.m('section.goal'), this.notesList(c, c.head.goals))}
${mapSec}
${motivation}
${stationHtml}
${review}
${questions}
${this.referencesSection(c)}
${aheadSec}
</article>`;
    return this.page({
      title: `${this.chapterNo(c.number)} ${c.title} | ${this.siteName}`,
      bodyClass: 'page-chapter',
      bar,
      main,
    });
  }

  /** @param {any} c @param {import('../../core/graph.js').StationInfo} st */
  stationSection(c, st) {
    const site = this.site;
    const out = site.fields.filter((f) => !site.scope.get(f.id)?.has(st.id)).map((f) => f.id);
    const own = site.definitions.get(`${DEF_PREFIX}${st.id}`);
    const shared = own?.station.id === st.id ? own : undefined;
    const heading = this.md.renderer.renderInline(
      c.tokens[st.model.headingStart + 1].children ?? [],
      this.md.options,
      this.env(c, false),
    );
    const notes = site.fields
      .flatMap((f) =>
        f.goals
          .filter((g) => g.station === st.id)
          .map(
            (g) =>
              `<p class="goal-note" data-goal-for="${h(f.id)}"><span class="gk ${g.kind}">${h(this.m(g.kind === 'final' ? 'goal.final' : 'goal.partial'))}</span>${h(f.title)}:${h(g.label)}</p>`,
          ),
      )
      .join('');
    const items = [];
    const apps = [];
    /** 定理と、その直後に続く proof-sketch・proof(定理の枠に入れる) */
    let thm = null;
    const flush = () => {
      if (thm) items.push(this.blockHtml(c, thm.block, thm.proofs));
      thm = null;
    };
    for (const item of /** @type {any[]} */ (stationItems(st.model, site.fieldOrder))) {
      if (thm && item.kind === 'block' && (item.block.name === 'proof-sketch' || item.block.name === 'proof')) {
        thm.proofs.push(item.block);
        continue;
      }
      flush();
      if (item.kind === 'prose') items.push(this.range(c, item.start, item.end));
      else if (item.block.name === 'application') apps.push(item.block);
      else if (item.block.name === 'theorem') thm = { block: item.block, proofs: [] };
      else items.push(this.blockHtml(c, item.block));
    }
    flush();
    const appHtml = apps.length ? this.versionGroup(c, apps, 'application', this.m('version.application')) : '';
    return `<section class="station flow" id="${h(st.id)}" data-station="${h(st.id)}" data-loc="${h(st.code)}"${this.repoUrl ? ` data-issue="${h(this.stationIssueHref(c, st))}"` : ''} data-out="${out.join(' ')}">
<h2 data-p="0"${this.linesAttr(c, c.tokens[st.model.headingStart])}>${this.badge(st)}<span class="st-name">${heading}</span>${shared ? `<span class="en">${h(shared.en)}</span>` : ''}<span class="out-label" hidden>${h(this.m('station.outofscope'))}</span></h2>
${notes}${items.join('')}${appHtml}${this.notesList(
      c,
      st.model.items.map((/** @type {any} */ it) => (it.kind === 'block' ? it.block : it)),
    )}${this.stationTools(c, st)}
</section>`;
  }

  /**
   * 駅のしおりのボタン(site.md「しおり」)と起票のリンクを横に並べた置き場。駅の最後の子に置く。
   * しおりのボタンはスクリプトが動くときだけ見せる(app.js)。
   * @param {any} c @param {import('../../core/graph.js').StationInfo} st
   */
  stationTools(c, st) {
    const tip = h(this.m('bookmark.add'));
    const bookmark = `<button type="button" class="bm" data-bm="${h(st.id)}" aria-pressed="false" aria-label="${tip}" data-tip="${tip}" hidden>${BOOKMARK_ICON}</button>`;
    return `<div class="st-tools">${bookmark}${this.issueLink(c, st)}</div>`;
  }

  /**
   * 駅の改善案を起票するリンク(site.md「改善案の起票」)。リポジトリの URL がなければ空。
   * ページの欄は、スクリプトがオリジンを足して完全な URL にする(app.js)。
   * @param {any} c @param {import('../../core/graph.js').StationInfo} st
   */
  issueLink(c, st) {
    if (!this.repoUrl) return '';
    const page = `${this.chapterUrl(c.id)}#${st.id}`;
    return `<a class="issue" href="${h(this.stationIssueHref(c, st))}" target="_blank" rel="noopener" aria-label="${h(this.m('station.issue'))}" data-tip="${h(this.m('station.issue'))}" data-page="${h(page)}">${ISSUE_ICON}</a>`;
  }

  /**
   * Issue フォームの作成画面の URL(site.md「改善案の起票」)。ページの欄はパスのままで、オリジンはスクリプトが足す。
   * @param {string} title  「[改善案] 」の後に続くタイトル @param {string} station @param {string} page
   */
  issueHref(title, station, page) {
    const params = [
      ['template', 'station.yml'],
      ['title', this.m('issue.title', { title })],
      ['station', station],
      ['page', page],
    ]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    return `${this.repoUrl}/issues/new?${params}`;
  }

  /** 駅の起票の URL。 @param {any} c @param {import('../../core/graph.js').StationInfo} st */
  stationIssueHref(c, st) {
    return this.issueHref(
      `${this.chapterNo(c.number)} ${st.code} ${st.name}`,
      `${this.chapterNo(c.number)} ${c.title} / ${st.code} ${st.name}(${st.id})`,
      `${this.chapterUrl(c.id)}#${st.id}`,
    );
  }

  /**
   * 駅の外の節(区画)の起票の URL を data-issue 属性にする(site.md「選んだ文章からの起票と原稿の表示」)。
   * 選択メニューの「起票」が、選んだ文を足して使う。リポジトリの URL がなければ空。
   * @param {any} c @param {string} name  節の名前 @param {string} anchor  節の ID。章ページの先頭なら空
   */
  sectionIssue(c, name, anchor) {
    if (!this.repoUrl) return '';
    const page = `${this.chapterUrl(c.id)}${anchor ? `#${anchor}` : ''}`;
    return ` data-issue="${h(this.issueHref(`${this.chapterNo(c.number)} ${name}`, `${this.chapterNo(c.number)} ${c.title} / ${name}`, page))}"`;
  }

  /**
   * 段落が原稿のファイルで占める行(site.md「選んだ文章からの起票と原稿の表示」)。「12」か「12-15」。
   * 1 から数え、front matter の行も数える。リポジトリの URL がない(「編集」を出さない)か、行が分からなければ undefined。
   * @param {any} c @param {any} token  map(本文の中の [始めの行, 終わりの次の行]、0 から)を持つトークン
   */
  sourceLines(c, token) {
    if (!this.repoUrl || !token || !token.map) return undefined;
    let end = token.map[1];
    if (token.type === 'list_item_open') {
      // 箇条書きの最後の項目の map は、後ろの空行まで含む。項目の中身(行内・コード・別行立ての数式)の行で終わりを決める
      const tokens = c.tokens;
      end = token.map[0] + 1;
      for (let j = tokens.indexOf(token) + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === 'list_item_close' && t.level === token.level) break;
        if (t.map && ['inline', 'fence', 'code_block', 'math_block'].includes(t.type)) end = Math.max(end, t.map[1]);
      }
    }
    const first = token.map[0] + c.lineOffset + 1;
    const last = Math.max(first, end + c.lineOffset);
    return first === last ? `${first}` : `${first}-${last}`;
  }

  /** sourceLines を data-l 属性にする。行がなければ空。 @param {any} c @param {any} token */
  linesAttr(c, token) {
    const lines = this.sourceLines(c, token);
    return lines ? ` data-l="${lines}"` : '';
  }

  /** 現在地の「次の章」。 @param {any} c @param {import('../../core/schema.js').Field | null} f */
  nextText(c, f) {
    const next = nextChapter(this.site, c, f ? f.id : null);
    let text;
    if (next)
      text = `<a href="${this.chapterUrl(next.id, f ? f.id : null)}">${h(this.chapterNo(next.number))} ${h(next.title)}</a>`;
    else {
      const finals = f
        ? chapterStations(this.site, c).filter((s) => f.goals.some((g) => g.kind === 'final' && g.station === s.id))
        : [];
      text = finals.length
        ? this.mh('next.final', { stations: finals.map((s) => this.badge(s)).join(h(this.m('list.separator'))) })
        : h(this.m('here.none'));
    }
    if (f && !chapterInField(this.site, c, f.id))
      text += ` <span class="note">${this.mh('next.outofscope', { field: h(f.title) })}</span>`;
    return text;
  }

  /** 「この先」の項目。 @param {any} c @param {import('../../core/schema.js').Field | null} f */
  aheadItems(c, f) {
    const site = this.site;
    if (!f) {
      const next = nextChapter(site, c, null);
      const text = next
        ? `<a href="${this.chapterUrl(next.id)}">${h(this.chapterNo(next.number))} ${h(next.title)}</a>`
        : h(this.m('here.none'));
      return `<li><b>${h(this.m('here.next'))}</b>${text}</li><li>${h(this.m('ahead.choose'))}</li>`;
    }
    const items = [];
    for (const st of chapterStations(site, c)) {
      for (const g of f.goals.filter((x) => x.station === st.id)) {
        items.push(
          g.kind === 'final'
            ? `<li><b>${h(this.m('goal.final'))}</b>${this.mh('ahead.final', { field: h(f.title), label: h(g.label), station: this.badge(st) })}</li>`
            : `<li><b>${h(this.m('goal.partial'))}</b>${this.mh('ahead.partial', { label: h(g.label), station: this.badge(st) })}</li>`,
        );
      }
    }
    const next = nextChapter(site, c, f.id);
    if (next) {
      items.push(
        `<li><b>${this.mh('ahead.line', { line: h(site.lineById.get(next.lineId)?.name ?? '') })}</b><a href="${this.chapterUrl(next.id, f.id)}">${h(this.chapterNo(next.number))} ${h(next.title)}</a></li>`,
      );
    } else {
      const further = nextChapter(site, c, null);
      if (further) {
        items.push(
          `<li><b>${h(this.m('ahead.further'))}</b><a href="${this.chapterUrl(further.id, f.id)}">${h(this.chapterNo(further.number))} ${h(further.title)}</a>${this.mh('ahead.furtherout', { field: h(f.title) })}</li>`,
        );
      }
    }
    for (const t of otherLineGuide(site, c, f.id)) {
      const first = `<a href="${this.chapterUrl(t.first.chapter.id, f.id)}">${h(this.chapterNo(t.first.chapter.number))} ${h(t.first.chapter.title)}</a>`;
      // 分岐駅が2つ以上あれば(合流する支線)、読む順に「・」でつなぐ(site.md「この先」)
      const stations = t.branches.map(({ station: b, here }) =>
        here
          ? this.mh('ahead.branch.here', { station: this.badge(b), name: h(b.name) })
          : this.mh('ahead.branch.there', {
              station: this.badge(b),
              name: h(b.name),
              link: `<a href="${this.chapterUrl(b.chapter.id, f.id)}#${h(b.id)}">${h(this.chapterNo(b.chapter.number))}</a>`,
            }),
      );
      const from = this.mh(t.branches[t.branches.length - 1].here ? 'ahead.branch.fromhere' : 'ahead.branch.from', {
        stations: stations.join(h(this.m('list.join'))),
      });
      items.push(
        `<li><b>${this.mh('ahead.branch.line', { line: h(t.line.name) })}</b>${this.mh('ahead.branch.to', { from, first })}</li>`,
      );
    }
    return items.join('');
  }

  // ---------- 定義索引 ----------

  definitionIndex() {
    /** @type {Record<string, any>} */
    const out = {};
    for (const id of [...this.site.definitions.keys()].sort()) {
      const d = /** @type {import('../../core/graph.js').DefinitionInfo} */ (this.site.definitions.get(id));
      const c = d.station.chapter;
      out[id] = {
        name: d.name,
        en: d.en,
        number: this.ctx.statements.labels.get(d.block),
        aliases: d.aliases,
        station: d.station.id,
        code: d.station.code,
        stationName: d.station.name,
        chapter: c.number,
        chapterTitle: c.title,
        url: `${this.base}chapters/${c.id}/#${id}`,
        html: this.inner(c, d.block, true),
      };
    }
    return `${JSON.stringify(out)}\n`;
  }
}
