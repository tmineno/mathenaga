// 原稿の文字列の下ごしらえ:改行の統一、front matter の切り出し、章フォルダ名の解析。

/**
 * 改行を LF にそろえる。
 * @param {string} text
 */
export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * @typedef {object} SplitSource
 * @property {string | null} yaml  front matter の YAML(なければ null)
 * @property {string} body         本文
 * @property {number} bodyLine     本文の1行目が、ファイルの何行目か(1 から数える)
 * @property {boolean} unclosed    front matter が閉じていない
 */

/**
 * 章の md を front matter と本文に分ける。
 * Preconditions: text の改行は LF。
 * Postconditions: 先頭が `---` の行なら次の `---` の行までを yaml に入れる。
 * Failure modes: 閉じる `---` がなければ unclosed を true にし、全体を本文として返す。
 * Side effects: なし。
 * @param {string} text
 * @returns {SplitSource}
 */
export function splitFrontMatter(text) {
  if (!text.startsWith('---\n')) return { yaml: null, body: text, bodyLine: 1, unclosed: false };
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return {
        yaml: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        bodyLine: i + 2,
        unclosed: false,
      };
    }
  }
  return { yaml: null, body: text, bodyLine: 1, unclosed: true };
}

const CHAPTER_DIR = /^(\d+)-(.+)$/;

/**
 * 章フォルダ名を章番号と章の ID に分ける(docs/spec/content-format.md「ファイル配置」)。
 * Preconditions: なし。
 * Postconditions: 「数字-残り」の形なら番号(整数)と ID(残り)を返す。
 * Failure modes: 形が違えば null を返す。ID の形式はここでは確かめない。
 * Side effects: なし。
 * @param {string} dirName
 * @returns {{ number: number, id: string } | null}
 */
export function parseChapterDir(dirName) {
  const m = CHAPTER_DIR.exec(dirName);
  if (!m) return null;
  return { number: Number.parseInt(m[1], 10), id: m[2] };
}
