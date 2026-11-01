// ページの組み立て(docs/spec/site.md)と、定義索引 defs.json(docs/spec/build.md)。

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutMap, renderMapSvg } from '../core/map.js';
import {
  chapterInField,
  chapterStations,
  nextChapter,
  prerequisiteChapters,
  transferGuide,
} from '../core/navigation.js';
import { byFieldOrder, stationItems } from '../core/order.js';
import { escapeHtml as h } from '../core/text.js';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
const KATEX_DIR = path.dirname(createRequire(import.meta.url).resolve('katex'));
const SITE_NAME = 'MathEnaga';
const OUT_OF_SCOPE = 'この分野の目標には不要(読み飛ばし可)';
const ISSUE_TIP = 'この駅についてGitHub Issueに起票する';
/** 吹き出しのアイコン */
const ISSUE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9.5h8M8 12.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const BLOCK_LABELS = {
  summary: '一言でいうと',
  why: 'なぜ必要か',
  'proof-sketch': '証明の骨格',
  examples: '例と反例',
  'drop-assumption': '仮定を外すと',
  pitfall: '落とし穴',
};
const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Zen+Kaku+Gothic+New:wght@500;700&family=Barlow+Semi+Condensed:wght@600&display=swap">';

/**
 * サイト全体のファイルを作る。
 * Preconditions: ctx は analyze() がエラーなしで返した材料。
 * Postconditions: 出力の相対パス → 内容(文字列、またはコピー元)を返す。
 * Failure modes: KaTeX や assets のファイルが読めなければ例外。
 * Side effects: assets と KaTeX のファイルを読む。
 * @param {any} ctx
 * @returns {Promise<Map<string, import('../io/output.js').OutputFile>>}
 */
export async function generateSite(ctx) {
  const r = new Renderer(ctx);
  /** @type {Map<string, import('../io/output.js').OutputFile>} */
  const files = new Map();
  files.set('index.html', r.topPage());
  for (const f of ctx.site.fields) files.set(`fields/${f.id}/index.html`, r.fieldPage(f));
  for (const c of ctx.site.chapters) {
    files.set(`chapters/${c.id}/index.html`, r.chapterPage(c));
    const src = ctx.chapterFiles.get(c.id);
    for (const fig of src?.figures ?? []) {
      files.set(`chapters/${c.id}/${fig}`, { copyFrom: path.join(src.dirPath, ...fig.split('/')) });
    }
  }
  files.set('defs.json', r.definitionIndex());
  files.set('assets/style.css', await fs.readFile(path.join(ASSETS, 'style.css'), 'utf8'));
  files.set('assets/app.js', await fs.readFile(path.join(ASSETS, 'app.js'), 'utf8'));
  files.set('assets/lines.css', lineCss(ctx.site.lines));
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
  return files;
}

/**
 * 路線の色を CSS の変数にする。ダークテーマでは color_dark を使う。
 * @param {import('../core/schema.js').Line[]} lines
 */
export function lineCss(lines) {
  const light = lines.map((l) => `.l-${l.id}{--lc:${l.color}}`).join('\n');
  const dark = lines.map((l) => `.l-${l.id}{--lc:${l.colorDark}}`).join('\n');
  return `${light}\n@media (prefers-color-scheme: dark){\n${dark}\n}\n`;
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
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    /** @type {import('../core/graph.js').Site} */
    this.site = ctx.site;
    this.base = ctx.basePath;
    /** @type {string} */
    this.repoUrl = ctx.repoUrl ?? '';
    this.md = ctx.md;
    /** @type {Map<any, string>} */
    this.eqIds = new Map();
    for (const c of this.site.chapters) for (const e of c.equations) if (e.id) this.eqIds.set(e.token, e.id);
    /** @type {Map<any, Map<any, number>>} 章 → (トークン → 段落の番号) */
    this.paragraphs = new Map();
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
        return `<div class="eq"${id ? ` id="${h(id)}"` : ''}${no === undefined ? '' : ` data-p="${no}"`}><div class="eq-body">${this.ctx.mathHtml.get(t) ?? ''}</div><span class="eq-num">(${label})</span></div>\n`;
      },
      paragraphNo: paragraphs ? (/** @type {any} */ t) => paragraphs.get(t) : undefined,
      ref: (/** @type {any} */ t) => this.refHtml(t, chapter, plain),
      imageSrc: (/** @type {string} */ src) =>
        /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : `${this.base}chapters/${chapter.id}/${path.posix.normalize(src)}`,
    };
  }

  /** @param {any} t @param {any} chapter @param {boolean} plain */
  refHtml(t, chapter, plain) {
    /** @type {import('../core/resolve.js').Resolution | undefined} */
    const r = this.ctx.resolved.get(t);
    if (!r) return h(t.content);
    const text = h(r.text);
    if (plain) return text;
    if (t.meta.at) {
      if (r.kind === 'chapter') return `<a class="num" href="${this.chapterUrl(r.id)}">${text}</a>`;
      const cls = r.kind === 'equation' ? 'eqref' : 'num';
      return `<a class="${cls}" href="${this.anchorUrl(r.chapterId, r.id, chapter)}">${text}</a>`;
    }
    if (r.kind === 'definition') {
      return `<button type="button" class="term" data-def="${h(r.id)}" aria-haspopup="dialog" aria-expanded="false">${text}</button>`;
    }
    return `<a class="st-ref" href="${this.anchorUrl(r.chapterId, r.id, chapter)}">${text}</a>`;
  }

  /** トークンの範囲 [start, end] を描画する。 @param {any} chapter @param {number} start @param {number} end @param {boolean} [plain] */
  range(chapter, start, end, plain = false) {
    if (end < start) return '';
    return this.md.renderer.render(chapter.tokens.slice(start, end + 1), this.md.options, this.env(chapter, plain));
  }

  /** ブロックの中身。 @param {any} chapter @param {import('../core/chapter.js').Block} b @param {boolean} [plain] */
  inner(chapter, b, plain = false) {
    return this.range(chapter, b.start + 1, b.end - 1, plain);
  }

  /** @param {any} chapter @param {import('../core/chapter.js').Block} b */
  blockHtml(chapter, b) {
    const body = this.inner(chapter, b);
    if (b.name === 'definition') {
      return `<div class="box def" id="def-${h(b.id)}"><p class="tag">定義 · ${h(b.attrs.name)}<span class="tag-en">${h(b.attrs.en)}</span></p><div class="flow">${body}</div></div>`;
    }
    if (b.name === 'theorem') {
      return `<div class="box thm" id="${h(b.id)}"><p class="tag">定理 · ${h(b.attrs.name)}</p><div class="flow">${body}</div></div>`;
    }
    if (b.name === 'proof') {
      return `<details class="fold"><summary>証明の詳細</summary><div class="fold-body flow">${body}</div></details>`;
    }
    return `<div class="box ${b.name}"><p class="tag">${BLOCK_LABELS[b.name]}</p><div class="flow">${body}</div></div>`;
  }

  /** @param {string} fieldId */
  fieldTitle(fieldId) {
    return this.site.fieldById.get(fieldId)?.title ?? fieldId;
  }

  /**
   * 共通版と分野版の組。共通版は開いたまま、分野版は折りたたむ(初期状態は未選択)。
   * 出発点は節の見出し「出発点」の下に置くので、共通版に札を付けず、分野版の札を「〈分野名〉では」にする(site.md)。
   * @param {any} chapter @param {import('../core/chapter.js').Block[]} blocks @param {string} kind @param {string} label
   * @param {string} [loc] 位置情報つきのコピーで使う区画の名前(data-loc)。区画でなければ空
   */
  versionGroup(chapter, blocks, kind, label, loc = '') {
    const out = [`<div class="vgroup" data-kind="${kind}"${loc ? ` data-loc="${h(loc)}"` : ''}>`];
    for (const b of byFieldOrder(blocks, this.site.fieldOrder)) {
      if (!b.field) {
        const tag = kind === 'motivation' ? '' : `<p class="tag tag-${kind}">${label}</p>`;
        out.push(`<div class="v common">${tag}<div class="flow">${this.inner(chapter, b)}</div></div>`);
      } else {
        const field = h(this.fieldTitle(b.field));
        const title =
          kind === 'application'
            ? `${label}(${field}) · ${h(b.attrs.title ?? '')}`
            : kind === 'motivation'
              ? `${field}では`
              : `${label}(${field})`;
        out.push(
          `<details class="v" data-field="${h(b.field)}"><summary>${title}</summary><div class="v-body flow">${this.inner(chapter, b)}</div></details>`,
        );
      }
    }
    out.push('</div>');
    return out.join('');
  }

  /** @param {import('../core/graph.js').StationInfo} st */
  badge(st) {
    return `<span class="badge l-${st.lineId}">${h(st.code)}</span>`;
  }

  /** 駅の表示番号の範囲。1駅なら1つだけ。 @param {import('../core/graph.js').StationInfo[]} list @param {string} sep */
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
    if (layout.stations.some((s) => s.final)) legend.push('<li><span class="mk final"></span>終着駅</li>');
    if (layout.stations.some((s) => s.transfer)) legend.push('<li><span class="mk transfer"></span>乗換駅</li>');
    if (layout.stations.some((s) => s.partial)) legend.push('<li><span class="mk pill"></span>途中下車OK</li>');
    if (layout.bands.some((b) => b.planned)) legend.push('<li><span class="mk planned"></span>未執筆</li>');
    return { html: `<ul class="legend">${legend.join('')}</ul><div class="map-scroll">${svg}</div>`, layout };
  }

  // ---------- 共通の枠 ----------

  /** @param {{ title: string, bodyClass: string, bar: string, main: string }} p */
  page(p) {
    const fields = JSON.stringify(this.site.fields.map((f) => ({ id: f.id, title: f.title }))).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="ja" data-base="${h(this.base)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(p.title)}</title>
${FONTS}
<link rel="stylesheet" href="${this.base}assets/katex/katex.min.css">
<link rel="stylesheet" href="${this.base}assets/style.css">
<link rel="stylesheet" href="${this.base}assets/lines.css">
<script type="application/json" id="_fields">${fields}</script>
<script src="${this.base}assets/app.js" defer></script>
</head>
<body class="${p.bodyClass}">
<header class="bar"><div class="bar-in">${p.bar}</div></header>
<main class="wrap" id="_main">
${p.main}
</main>
<div id="_pop" class="pop" role="dialog" aria-label="用語の定義" tabindex="-1" hidden></div>
</body>
</html>
`;
  }

  /** @param {string} crumb */
  barStart(crumb) {
    return `<a class="mark" href="${this.base}">${SITE_NAME}</a><span class="crumb">${h(crumb)}</span>`;
  }

  // ---------- トップページ ----------

  topPage() {
    const all = new Set(this.site.stations.map((s) => s.id));
    const map = this.mapBlock(all, {
      title: '全体の路線図',
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
    const main = `<section class="intro"><h1>${SITE_NAME}</h1></section>
<section class="sec"><h2 class="sec-h">路線図</h2><div class="map-v">${map.html}</div></section>
<section class="sec"><h2 class="sec-h">分野</h2><ul class="field-list">${fields}</ul></section>`;
    return this.page({ title: SITE_NAME, bodyClass: 'page-top', bar: this.barStart(''), main });
  }

  // ---------- 分野の入口ページ ----------

  /** @param {import('../core/schema.js').Field} f */
  fieldPage(f) {
    const scope = this.site.scope.get(f.id) ?? new Set();
    const goals = f.goals
      .map((g) => {
        const st = this.site.stationById.get(g.station);
        if (!st) return '';
        const kind =
          g.kind === 'final' ? '<span class="gk final">終着駅</span>' : '<span class="gk partial">途中下車OK</span>';
        return `<li>${kind}${this.badge(st)}<span>${h(st.name)}</span><span class="note">${h(g.label)}</span></li>`;
      })
      .join('');
    const map = this.mapBlock(scope, {
      goals: f.goals,
      title: `${f.title}の路線図`,
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
        const codes = contiguous ? this.codeRange(inScope) : inScope.map((s) => this.badge(s)).join('、');
        return `<tr><td><a href="${this.chapterUrl(c.id, f.id)}">第${c.number}章 ${h(c.title)}</a></td><td>${codes}</td></tr>`;
      })
      .join('');
    const main = `<section class="intro"><p class="eyebrow">分野の入口</p><h1>${h(f.title)}</h1><p class="lede">${h(f.description)}</p></section>
<section class="sec"><h2 class="sec-h">この分野の目標</h2><ul class="goal-list">${goals}</ul></section>
<section class="sec"><h2 class="sec-h">路線図</h2><div class="map-v">${map.html}</div></section>
<section class="sec"><h2 class="sec-h">通る章</h2><div class="tbl-scroll"><table class="chap"><thead><tr><th>章</th><th>この分野で通る駅</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    return this.page({
      title: `${f.title} | ${SITE_NAME}`,
      bodyClass: 'page-field',
      bar: this.barStart('分野の入口'),
      main,
    });
  }

  // ---------- 章ページ ----------

  /** @param {import('../core/chapter.js').ChapterModel} c */
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
      `<button type="button" data-set-field="" aria-pressed="true">指定なし</button>`,
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
    const bar = `${this.barStart(`第${c.number}章 ${c.title}`)}<div class="switch" role="group" aria-label="分野">${switchButtons}</div><nav class="mini" aria-label="この章の駅">${mini}</nav>`;

    // 見出しと現在地
    const range = this.codeRange(stations);
    const here =
      stations.length === 1
        ? `${lineName} ${range}`
        : `${lineName} ${this.badge(stations[0])} から ${this.badge(stations[stations.length - 1])} まで`;
    const prereq = prerequisiteChapters(site, c);
    const prereqHtml = prereq.length
      ? prereq.map((p) => `<a href="${this.chapterUrl(p.id)}">第${p.number}章 ${h(p.title)}</a>`).join('、')
      : 'なし';
    const fieldRow = [
      ...fields.map(
        (f) =>
          `<span data-for="${h(f.id)}" hidden>${h(f.title)}(<a href="${this.base}fields/${f.id}/">入口へ</a>)</span>`,
      ),
      '<span data-for="">指定なし</span>',
    ].join('');
    const nextRow = [
      ...fields.map((f) => `<span data-for="${h(f.id)}" hidden>${this.nextText(c, f)}</span>`),
      `<span data-for="">${this.nextText(c, null)}</span>`,
    ].join('');
    const head = `<header class="ch-head">
<p class="eyebrow">第${c.number}章 · ${lineName} ${range}</p>
<h1 class="ch-title">${h(c.title)}</h1>
${c.subtitle ? `<p class="ch-sub">${h(c.subtitle)}</p>` : ''}
<dl class="here">
<div><dt>現在地</dt><dd class="here-where">${here}</dd></div>
<div><dt>前提</dt><dd class="here-prereq">${prereqHtml}</dd></div>
<div><dt>分野</dt><dd class="here-field">${fieldRow}</dd></div>
<div><dt>次の章</dt><dd class="here-next">${nextRow}</dd></div>
</dl>
</header>`;

    const chooser = `<div class="chooser" data-for="">
<p class="chooser-t">分野を選ぶと、ゴール・路線図・次の章・分野での応用がその分野向けになります。</p>
<div class="chooser-b">${fields.map((f) => `<button type="button" class="pick" data-set-field="${h(f.id)}">${h(f.title)}</button>`).join('')}</div>
<p class="note">分野の入口:${fields.map((f) => `<a href="${this.base}fields/${f.id}/">${h(f.title)}</a>`).join(' · ')}</p>
</div>`;

    // 路線図
    const maps = fields.map((f) => {
      const m = this.mapBlock(site.scope.get(f.id) ?? new Set(), {
        goals: f.goals,
        highlight: c.id,
        title: `${f.title}の路線図`,
        idPrefix: `_map-${f.id}`,
        hrefFor: (s) => (s.chapter === c ? `#${s.id}` : `${this.chapterUrl(s.chapter.id, f.id)}#${s.id}`),
        chapterHref: (id) => (id === c.id ? '#' : this.chapterUrl(id, f.id)),
      });
      const note = m.layout.bands.some((b) => b.current)
        ? ''
        : `<p class="note">この章は${h(f.title)}の路線図に載っていません。</p>`;
      return `<div class="map-v" data-for="${h(f.id)}" hidden>${m.html}${note}</div>`;
    });
    const all = this.mapBlock(new Set(site.stations.map((s) => s.id)), {
      highlight: c.id,
      title: '全体の路線図',
      idPrefix: '_map-all',
      planned: true,
      hrefFor: (s) => (s.chapter === c ? `#${s.id}` : `${this.chapterUrl(s.chapter.id)}#${s.id}`),
      chapterHref: (id) => (id === c.id ? '#' : this.chapterUrl(id)),
    });
    maps.push(`<div class="map-v" data-for="">${all.html}</div>`);
    const mapSec = `<section class="mapsec" aria-labelledby="_map-h"><h2 id="_map-h" class="sec-h">路線図</h2>${maps.join('')}</section>`;

    // 出発点
    const prose = c.head.prose.map((r) => this.range(c, r.start, r.end)).join('');
    const motivation = `<section class="start flow" id="_start" data-loc="出発点"><h2 class="sec-h" data-p="0">出発点</h2>${this.versionGroup(c, c.head.motivations, 'motivation', '出発点')}${prose}</section>`;

    // 駅
    const stationHtml = stations.map((st) => this.stationSection(c, st)).join('\n');

    // 章末
    const review = c.end.reviews[0]
      ? `<section class="review" id="_review" data-loc="ふりかえり"><h2 class="sec-h" data-p="0">ふりかえり</h2><div class="box review"><div class="flow">${this.inner(c, c.end.reviews[0])}</div></div></section>`
      : '';
    const questions = c.end.questions.length
      ? `<section class="quiz" id="_quiz" data-loc="確認問題"><h2 class="sec-h" data-p="0">確認問題</h2><ol class="qs">${c.end.questions
          .map(
            (q) =>
              `<li><div class="q flow">${this.inner(c, q.question)}</div>${
                q.answer
                  ? `<details class="fold"><summary>答え</summary><div class="fold-body flow">${this.inner(c, q.answer)}</div></details>`
                  : ''
              }</li>`,
          )
          .join('')}</ol></section>`
      : '';
    const ahead = [
      ...fields.map((f) => `<ul class="next" data-for="${h(f.id)}" hidden>${this.aheadItems(c, f)}</ul>`),
      `<ul class="next" data-for="">${this.aheadItems(c, null)}</ul>`,
    ].join('');
    const aheadSec = `<section class="ahead" id="_ahead"><h2 class="sec-h">この先</h2>${ahead}</section>`;

    const main = `<article class="chapter" data-chapter="${c.number}">
${head}
${chooser}
${this.versionGroup(c, c.head.goals, 'goal', 'この章のゴール', 'この章のゴール')}
${mapSec}
${motivation}
${stationHtml}
${review}
${questions}
${aheadSec}
</article>`;
    return this.page({ title: `第${c.number}章 ${c.title} | ${SITE_NAME}`, bodyClass: 'page-chapter', bar, main });
  }

  /** @param {any} c @param {import('../core/graph.js').StationInfo} st */
  stationSection(c, st) {
    const site = this.site;
    const out = site.fields.filter((f) => !site.scope.get(f.id)?.has(st.id)).map((f) => f.id);
    const shared = site.definitions.get(st.id);
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
              `<p class="goal-note" data-goal-for="${h(f.id)}"><span class="gk ${g.kind}">${g.kind === 'final' ? '終着駅' : '途中下車OK'}</span>${h(f.title)}:${h(g.label)}</p>`,
          ),
      )
      .join('');
    const items = [];
    const apps = [];
    for (const item of /** @type {any[]} */ (stationItems(st.model, site.fieldOrder))) {
      if (item.kind === 'prose') items.push(this.range(c, item.start, item.end));
      else if (item.block.name === 'application') apps.push(item.block);
      else items.push(this.blockHtml(c, item.block));
    }
    const appHtml = apps.length ? this.versionGroup(c, apps, 'application', '分野での応用') : '';
    return `<section class="station flow" id="${h(st.id)}" data-station="${h(st.id)}" data-loc="${h(st.code)}" data-out="${out.join(' ')}">
<h2 data-p="0">${this.badge(st)}<span class="st-name">${heading}</span>${shared ? `<span class="en">${h(shared.en)}</span>` : ''}<span class="out-label" hidden>${OUT_OF_SCOPE}</span></h2>
${notes}${items.join('')}${appHtml}${this.issueLink(c, st)}
</section>`;
  }

  /**
   * 駅の改善案を起票するリンク(site.md「改善案の起票」)。リポジトリの URL がなければ空。
   * ページの欄は、スクリプトがオリジンを足して完全な URL にする(app.js)。
   * @param {any} c @param {import('../core/graph.js').StationInfo} st
   */
  issueLink(c, st) {
    if (!this.repoUrl) return '';
    const page = `${this.chapterUrl(c.id)}#${st.id}`;
    const params = [
      ['template', 'station.yml'],
      ['title', `[改善案] 第${c.number}章 ${st.code} ${st.name}`],
      ['station', `第${c.number}章 ${c.title} / ${st.code} ${st.name}(${st.id})`],
      ['page', page],
    ]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const href = `${this.repoUrl}/issues/new?${params}`;
    return `<div class="issue-rail"><a class="issue" href="${h(href)}" target="_blank" rel="noopener" aria-label="${ISSUE_TIP}" data-tip="${ISSUE_TIP}" data-page="${h(page)}">${ISSUE_ICON}</a></div>`;
  }

  /** 現在地の「次の章」。 @param {any} c @param {import('../core/schema.js').Field | null} f */
  nextText(c, f) {
    const next = nextChapter(this.site, c, f ? f.id : null);
    let text;
    if (next) text = `<a href="${this.chapterUrl(next.id, f ? f.id : null)}">第${next.number}章 ${h(next.title)}</a>`;
    else {
      const finals = f
        ? chapterStations(this.site, c).filter((s) => f.goals.some((g) => g.kind === 'final' && g.station === s.id))
        : [];
      text = finals.length ? `なし(この章の ${finals.map((s) => this.badge(s)).join('、')} が終着駅)` : 'なし';
    }
    if (f && !chapterInField(this.site, c, f.id)) text += ` <span class="note">この章は${h(f.title)}の範囲外</span>`;
    return text;
  }

  /** 「この先」の項目。 @param {any} c @param {import('../core/schema.js').Field | null} f */
  aheadItems(c, f) {
    const site = this.site;
    if (!f) {
      const next = nextChapter(site, c, null);
      const text = next ? `<a href="${this.chapterUrl(next.id)}">第${next.number}章 ${h(next.title)}</a>` : 'なし';
      return `<li><b>次の章</b>${text}</li><li>分野を選ぶと、その分野の目標までの道順が表示されます。</li>`;
    }
    const items = [];
    for (const st of chapterStations(site, c)) {
      for (const g of f.goals.filter((x) => x.station === st.id)) {
        items.push(
          g.kind === 'final'
            ? `<li><b>終着駅</b>${h(f.title)}の目標「${h(g.label)}」には、この章の ${this.badge(st)} で到着します。</li>`
            : `<li><b>途中下車</b>${h(g.label)}。この章の ${this.badge(st)} で降りて構いません。</li>`,
        );
      }
    }
    const next = nextChapter(site, c, f.id);
    if (next) {
      items.push(
        `<li><b>${h(site.lineById.get(next.lineId)?.name ?? '')}を進む</b><a href="${this.chapterUrl(next.id, f.id)}">第${next.number}章 ${h(next.title)}</a></li>`,
      );
    } else {
      const further = nextChapter(site, c, null);
      if (further) {
        items.push(
          `<li><b>さらに進む場合</b><a href="${this.chapterUrl(further.id, f.id)}">第${further.number}章 ${h(further.title)}</a>(${h(f.title)}の範囲外)</li>`,
        );
      }
    }
    for (const t of transferGuide(site, c, f.id)) {
      const first = `<a href="${this.chapterUrl(t.first.chapter.id, f.id)}">第${t.first.chapter.number}章 ${h(t.first.chapter.title)}</a>`;
      const from = t.here
        ? `この章の ${this.badge(t.branch)} ${h(t.branch.name)} から`
        : `${this.badge(t.branch)} ${h(t.branch.name)}(<a href="${this.chapterUrl(t.branch.chapter.id, f.id)}#${h(t.branch.id)}">第${t.branch.chapter.number}章</a>)から`;
      items.push(`<li><b>${h(t.line.name)}に乗り換える</b>${from}、${first}へ</li>`);
    }
    return items.join('');
  }

  // ---------- 定義索引 ----------

  definitionIndex() {
    /** @type {Record<string, any>} */
    const out = {};
    for (const id of [...this.site.definitions.keys()].sort()) {
      const d = /** @type {import('../core/graph.js').DefinitionInfo} */ (this.site.definitions.get(id));
      const c = d.station.chapter;
      out[id] = {
        name: d.name,
        en: d.en,
        aliases: d.aliases,
        station: d.station.id,
        code: d.station.code,
        stationName: d.station.name,
        chapter: c.number,
        chapterTitle: c.title,
        url: `${this.base}chapters/${c.id}/#def-${id}`,
        html: this.inner(c, d.block, true),
      };
    }
    return `${JSON.stringify(out)}\n`;
  }
}
