// 画面の部品の取り決め(docs/spec/ui-contract.md)の受け入れテスト 1・2・4・5。3 は tests/browser/site.test.js。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../../src/build.js';
import { CHOICES, LOOK, lookScript, storageKeys } from '../../src/ui/shared/settings.js';
import { listFiles, readDist, referenceBuild } from '../helpers/fixture.js';

const SPEC = path.join(ROOT, 'docs/spec/ui-contract.md');
const CLIENT = path.join(ROOT, 'src/ui/client');
const THEME = path.join(ROOT, 'src/ui/theme');

/** セレクタらしい文字列から、クラス名(.x)・id(#x)・data- 属性名を集める @param {string} s @param {Set<string>} out */
function namesIn(s, out) {
  for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(`.${m[1]}`);
  for (const m of s.matchAll(/#([A-Za-z_][\w-]*)/g)) out.add(`#${m[1]}`);
  for (const m of s.matchAll(/\b(data-[a-z-]*[a-z])/g)) out.add(m[1]);
}

/**
 * 取り決めの表を読む。各行の「名前」の列の名前と、「書く」の列の文字を返す。
 * 名前の列の `<…>` は差し込む値なので、そこで名前を切る(`#_note-<注番号>-text` は `#_note-`)。
 * 状態のクラスのような、ドットのない英小文字の名前はクラス名として扱う。
 * @returns {Promise<Array<{ names: Set<string>, writer: string }>>}
 */
async function specRows() {
  const text = await fs.readFile(SPEC, 'utf8');
  const rows = [];
  let nameCol = -1;
  let writerCol = -1;
  let header = true;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      header = true;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (header) {
      nameCol = cells.indexOf('名前');
      writerCol = cells.indexOf('書く');
      header = false;
      continue;
    }
    if (/^-+$/.test(cells[0]) || nameCol < 0) continue;
    const names = new Set();
    for (const m of (cells[nameCol] ?? '').matchAll(/`([^`]+)`/g)) {
      const t = m[1];
      if (['width', 'height', 'viewBox', 'hidden', 'id'].includes(t) || t.startsWith('aria-') || t.includes('.json'))
        continue;
      if (/^[a-z][\w-]*$/.test(t) && !t.startsWith('data-')) names.add(`.${t}`);
      else if (t.startsWith('#') && t.includes('<')) {
        if (t.indexOf('<') > 1) names.add(t.slice(0, t.indexOf('<')));
      } else namesIn(t.replace(/<[^>]*>/g, ' '), names);
    }
    rows.push({ names, writer: writerCol >= 0 ? (cells[writerCol] ?? '') : '' });
  }
  return rows;
}

/**
 * client のソースが読み書きする名前。セレクタや属性名を受け取る呼び出しと、className・id への代入の、最初の文字列リテラルから集める。
 * @returns {Promise<Set<string>>}
 */
async function clientNames() {
  const used = new Set();
  const lit = `'([^'\\n]*)'`;
  const patterns = [
    new RegExp(`(?:querySelectorAll|querySelector|closest|matches|all)\\(\\s*${lit}`, 'g'),
    new RegExp(`getElementById\\(\\s*${lit}`, 'g'),
    new RegExp(`(?:get|set|remove|has|toggle)Attribute\\(\\s*${lit}`, 'g'),
    new RegExp(`classList\\.(?:add|remove|toggle|contains)\\(\\s*${lit}`, 'g'),
    new RegExp(`className\\s*=\\s*${lit}`, 'g'),
    new RegExp(`\\.id\\s*=\\s*${lit}`, 'g'),
    new RegExp(`POP_TRIGGERS\\s*=\\s*${lit}`, 'g'),
  ];
  for (const f of (await fs.readdir(CLIENT)).filter((x) => x.endsWith('.js'))) {
    const src = await fs.readFile(path.join(CLIENT, f), 'utf8');
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        let s = m[1];
        if (/classList|className/.test(m[0]))
          s = s
            .split(/\s+/)
            .map((c) => `.${c}`)
            .join(' ');
        if (/getElementById|\.id\s*=/.test(m[0])) s = `#${s}`;
        if (/Attribute\(/.test(m[0]) && !s.startsWith('data-')) continue;
        namesIn(s, used);
      }
    }
  }
  return used;
}

/** 文字列をつないで組み立てる名前(ui-contract.md 受け入れテスト 1):名前 → client のソースにあるべき部分 */
const CONSTRUCTED = new Map([
  ['#_note-', "'#_note-'"],
  ['.note-body', "'-text .note-body'"],
  ['.ref-body', "' .ref-body'"],
  ...LOOK.map((k) => /** @type {[string, string]} */ ([`data-${k}`, "'data-' + k"])),
]);

test('ui-contract 1. client のソースの名前と、取り決めの表の名前の列が一致する', async () => {
  const listed = new Set((await specRows()).flatMap((r) => [...r.names]));
  const used = await clientNames();
  const sources = (
    await Promise.all(
      (await fs.readdir(CLIENT)).filter((x) => x.endsWith('.js')).map((f) => fs.readFile(path.join(CLIENT, f), 'utf8')),
    )
  ).join('\n');
  for (const [name, part] of CONSTRUCTED) {
    assert.ok(sources.includes(part), `組み立てる名前 ${name} の部分 ${part} が client にない`);
    used.add(name);
  }
  assert.deepEqual([...used].filter((n) => !listed.has(n)).sort(), [], 'client にあって表にない名前');
  assert.deepEqual([...listed].filter((n) => !used.has(n)).sort(), [], '表にあって client にない名前');
});

test('ui-contract 1. 表から1行消すと、食い違いが見つかる(対照)', async () => {
  const rows = await specRows();
  const target = rows.find((r) => r.names.has('data-goal-for'));
  assert.ok(target, 'data-goal-for の行がない');
  const listed = new Set(rows.filter((r) => r !== target).flatMap((r) => [...r.names]));
  const used = await clientNames();
  assert.ok(used.has('data-goal-for') && !listed.has('data-goal-for'));
});

test('ui-contract 2. 書く側が html か core の名前は、テスト用原稿のページにすべて出てくる', async () => {
  const { dist } = await referenceBuild();
  const html = (
    await Promise.all((await listFiles(dist)).filter((f) => f.endsWith('.html')).map((f) => readDist(dist, f)))
  ).join('\n');
  const missing = [];
  for (const { names, writer } of await specRows()) {
    if (!/\b(html|core)\b/.test(writer)) continue;
    for (const n of names) {
      const bare = n.slice(n.startsWith('data-') ? 0 : 1);
      const re = n.startsWith('.')
        ? new RegExp(`class="([^"]*\\s)?${bare}(\\s[^"]*)?"`)
        : n.startsWith('#')
          ? new RegExp(`id="${bare}`)
          : new RegExp(`\\s${bare}(=|[\\s>])`);
      if (!re.test(html)) missing.push(n);
    }
  }
  assert.deepEqual(missing, []);
});

test('ui-contract 4. 表示の設定の初期値以外の値ごとに、theme に規則があり、head のスクリプトが受け付ける', async () => {
  const css = (
    await Promise.all((await fs.readdir(THEME)).sort().map((f) => fs.readFile(path.join(THEME, f), 'utf8')))
  ).join('\n');
  const script = lookScript('mathenaga');
  for (const k of LOOK) {
    for (const v of CHOICES[k].slice(1)) {
      assert.ok(css.includes(`[data-${k}='${v}']`), `theme に [data-${k}='${v}'] がない`);
      assert.ok(script.includes(`'${v}'`), `head のスクリプトが ${k}=${v} を受け付けない`);
    }
  }
});

test('ui-contract 5. ブラウザに保存するキーは4つで、MathEnaga では今と同じ名前になる', () => {
  assert.deepEqual(Object.values(storageKeys('mathenaga')).sort(), [
    'mathenaga-bookmarks',
    'mathenaga-field',
    'mathenaga-map-zoom',
    'mathenaga-settings',
  ]);
});
