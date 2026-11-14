// 日本語の、言語ごとの処理(docs/adr/ADR-009-site-independent-ui.md「言語ごとの処理」)。
// 文言の辞書、書誌の形、路線図の折り返しの規則と文字幅の見積もり。

import { escapeHtml as h } from '../../core/text.js';

/**
 * 文字の種類(折り返しの規則で、種類の変わり目を見るため)。
 * @param {string} ch
 */
function script(ch) {
  const cp = /** @type {number} */ (ch.codePointAt(0));
  if (cp >= 0x30a0 && cp <= 0x30ff) return 'kata';
  if (cp >= 0x3040 && cp <= 0x309f) return 'hira';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'kanji';
  return 'other';
}

/**
 * 路線図の文字の扱い(docs/spec/route-map.md「配置」6)。core/map.js が使う。
 * - charWidth:1文字のおおよその幅(em)。全角(U+2E80 以上)は 1em、それ以外は 0.58em とみなす。
 * - breakTiers:折り返す位置の選び方。i は折り返した後の行の先頭の位置で、chars[i - 1] がその前の文字。
 *   前のものほど優先する。「の」「・」の後ろ、「と」「や」と空白の後ろ、文字の種類の変わり目の順。
 * @type {import('./index.js').TextRules}
 */
export const text = {
  charWidth: (ch) => (/** @type {number} */ (ch.codePointAt(0)) >= 0x2e80 ? 1 : 0.58),
  breakTiers: [
    (chars, i) => 'の・'.includes(chars[i - 1]),
    (chars, i) => 'とや'.includes(chars[i - 1]) || chars[i - 1] === ' ',
    (chars, i) => script(chars[i - 1]) !== script(chars[i]),
  ],
};

/**
 * 参考文献の項目の書誌(site.md「注と参考文献の表示」)。要素を「、」で区切って「。」で終え、
 * その後に ISBN と DOI のリンクを空白で区切って置く。書名・題名に仮名か漢字があれば和文として扱う。
 * Preconditions: r は検査を通った文献の項目。
 * Postconditions: 書誌の HTML を返す。文字はエスケープ済み。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {import('../../core/references.js').Reference} r
 * @returns {string}
 */
export function bibliography(r) {
  const ja = /[぀-ヿ㐀-鿿]/.test(r.title);
  const authors = r.authors.length >= 4 ? `${h(r.authors[0])}ほか` : r.authors.map(h).join('、');
  /** @type {string[]} */
  const parts = [authors];
  if (r.type === 'book') {
    // 多巻本の巻は、書名の後に空白を挟んで書名と一緒に囲む(『解析入門 II』)
    const title = r.volume ? `${h(r.title)} ${h(r.volume)}` : h(r.title);
    parts.push(ja ? `『${title}』` : `<i>${title}</i>`);
    if (r.edition) parts.push(h(r.edition));
    if (r.publisher) parts.push(h(r.publisher));
  } else {
    parts.push(ja ? `「${h(r.title)}」` : `“${h(r.title)}”`);
    if (r.journal) parts.push(ja ? h(r.journal) : `<i>${h(r.journal)}</i>`);
    if (r.volume) parts.push(`${h(r.volume)}${r.issue ? `(${h(r.issue)})` : ''}`);
    if (r.pages) parts.push(h(r.pages));
  }
  parts.push(String(r.year));
  let out = `${parts.join('、')}。`;
  if (r.isbn) out += ` ISBN ${h(r.isbn)}`;
  if (r.doi) {
    const url = `https://doi.org/${r.doi}`;
    out += ` <a href="${h(url)}">${h(url)}</a>`;
  }
  return out;
}

/**
 * 文言の辞書。値は文字列で、{n} のような差し込みを含めてよい(content-format.md「サイトの設定」の messages)。
 * @type {Record<string, string>}
 */
export const messages = {
  'chapter.number': '第{n}章',
  'statement.definition': '定義 {number}',
  'statement.theorem': '定理 {number}',
  'application.number': '応用 {number}',
  'figure.number': '図 {number}',
  'block.why': 'なぜ必要か',
  'block.proof-sketch': '証明の骨格',
  'block.examples': '例と反例',
  'block.drop-assumption': '仮定を外すと',
  'block.pitfall': '落とし穴',
  'block.remark': '補足',
  'block.proof': '証明の詳細',
  'version.application': '分野での応用',
  'version.motivation': '{field}では',
  'version.field': '{label}({field})',
  'application.title': '応用 {number}({field}) · {title}',
  'note.ref': '注{n}',
  'note.title': '注',
  'note.back': '本文へ戻る',
  'section.references': '参考文献',
  'section.start': '出発点',
  'section.review': 'ふりかえり',
  'section.quiz': '確認問題',
  'section.goal': 'この章のゴール',
  'section.ahead': 'この先',
  'section.map': '路線図',
  'section.fields': '分野',
  'quiz.answer': '答え',
  'goal.final': '最終目標',
  'goal.partial': '途中の目標',
  'list.separator': '、',
  'list.join': '・',
  'map.legend.arrow': '前提の矢印',
  'map.legend.planned': '未執筆',
  'map.title.all': '全体の路線図',
  'map.title.field': '{field}の路線図',
  'map.card.planned': '{chapter} 未執筆',
  'map.card.current': '{chapter} このページ',
  'map.from': '{name}から',
  'map.goal.title': '{kind}:{label}',
  'map.desc.planned': '(未執筆)',
  'map.desc.station': '{code} {name}{marks}',
  'map.desc.mark': '({mark})',
  'map.desc.chapter': '{chapter} {title}{planned}:{items}。',
  'map.desc.line': '{line}。{chapters}',
  'map.desc.arrow': '{to}は、{from}の {stations}を前提にする。',
  'map.zoomin': '拡大',
  'map.zoomout': '縮小',
  'map.fit': '全体',
  'map.fit.label': '全体を表示',
  'field.eyebrow': '分野の入口',
  'field.goals': 'この分野の目標',
  'field.chapters': '通る章',
  'field.chapters.chapter': '章',
  'field.chapters.stations': 'この分野で通る駅',
  'field.none': '指定なし',
  'field.label': '分野',
  'chapter.stations': 'この章の駅',
  'chapter.notinmap': 'この章は{field}の路線図に載っていません。',
  'here.where': '現在地',
  'here.prereq': '前提',
  'here.next': '次の章',
  'here.none': 'なし',
  'here.range': '{line} {from} から {to} まで',
  'here.fieldentry': '{field}({link})',
  'here.enter': '入口へ',
  'chooser.text': '分野を選ぶと、ゴール・路線図・次の章・分野での応用がその分野向けになります。',
  'chooser.entries': '分野の入口:{links}',
  'next.final': 'なし(この章の {stations} が最終目標)',
  'next.outofscope': 'この章は{field}の範囲外',
  'ahead.choose': '分野を選ぶと、その分野の目標までの道順が表示されます。',
  'ahead.final': '{field}の目標「{label}」には、この章の {station} で到達します。',
  'ahead.partial': '{label}。この章の {station} で読み終えて構いません。',
  'ahead.line': '{line}を進む',
  'ahead.further': 'さらに進む場合',
  'ahead.furtherout': '({field}の範囲外)',
  'ahead.branch.line': '{line}へ進む',
  'ahead.branch.here': 'この章の {station} {name}',
  'ahead.branch.there': '{station} {name}({link})',
  'ahead.branch.from': '{stations}から',
  'ahead.branch.fromhere': '{stations} から',
  'ahead.branch.to': '{from}、{first}へ',
  'station.outofscope': 'この分野の目標には不要(読み飛ばし可)',
  'station.issue': 'この駅についてGitHub Issueに起票する',
  'issue.title': '[改善案] {title}',
  'bookmark.title': 'しおり',
  'bookmark.add': 'この駅をしおりに入れる',
  'bookmark.remove': 'しおりから外す',
  'bookmark.remove.station': 'しおりから外す:{station}',
  'bookmark.empty': 'しおりはまだありません。駅のしおりのアイコンを押すと、ここに加わります。',
  'popup.loading': '読み込み中…',
  'popup.definition.title': '用語の定義',
  'popup.definition.place': '定義の場所:{chapter} {title} · {code} {station} ',
  'popup.definition.here': 'この定義へ移動',
  'popup.definition.chapter': '定義の章へ',
  'popup.definition.missing': '定義が索引にありません',
  'popup.definition.failed': '定義を読み込めませんでした',
  'popup.reference.title': '文献',
  'popup.reference.go': '参考文献へ移動',
  'copy.menu': '選んだ文章の操作',
  'copy.plain': 'コピー',
  'copy.plain.tip': 'そのままコピー',
  'copy.loc': '位置つき',
  'copy.loc.tip': '位置つきでコピー(1行目に位置情報を付ける)',
  'copy.issue': '起票',
  'copy.issue.tip': 'この記述についてGitHub Issueに起票する',
  'copy.source': '編集',
  'copy.source.tip': 'この段落の原稿をGitHubで開いて編集する',
  'copy.done': 'コピーしました',
  'copy.failed': 'コピーできませんでした',
  'settings.title': '表示の設定',
  'settings.theme': 'テーマ',
  'settings.theme.light': 'ライト',
  'settings.theme.dark': 'ダーク',
  'settings.theme.auto': 'OS に合わせる',
  'settings.text': '文字の大きさ',
  'settings.text.small': '小',
  'settings.text.medium': '中',
  'settings.text.large': '大',
  'settings.width': '本文の幅',
  'settings.width.narrow': '狭い',
  'settings.width.standard': '標準',
  'settings.width.wide': '広い',
  'settings.open': '最初から開く',
  'settings.open.proof': '証明の詳細',
  'settings.open.answer': '確認問題の答え',
  'settings.open.other': 'ほかの分野の版',
  'settings.popup': '用語ポップアップ',
  'settings.popup.hover': '重ねたら出す',
  'settings.popup.click': '押したときだけ出す',
  'settings.reset': '元に戻す',
  'settings.reset.done': '元に戻しました',
  'settings.clearmarks': 'しおりを消す',
  'settings.clearmarks.done': 'しおりを消しました',
};

/** @type {import('./index.js').Locale} */
export const ja = { id: 'ja', messages, text, bibliography };
