// refs:verify の受け入れテスト(docs/spec/reference-check.md「Acceptance tests」)。
// ネットワークは使わず、tests/fixtures/references/responses.json に記録した応答を返す。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../../src/core/references.js';
import { firstYear, familyFromName, normalize } from '../../src/refcheck/match.js';
import { runRefsVerify } from '../../src/refcheck/run.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const recorded = JSON.parse(
  await fs.readFile(path.join(here, '../fixtures/references/responses.json'), 'utf8'),
).responses;

const NDL_EMPTY = '<rss><channel><openSearch:totalResults>0</openSearch:totalResults></channel></rss>';
const NDL = 'https://ndlsearch.ndl.go.jp/api/opensearch?isbn=';

const LECUN = `- id: lecun-deep-learning
  type: article
  authors: [Yann LeCun, Yoshua Bengio, Geoffrey Hinton]
  title: Deep learning
  journal: Nature
  volume: "521"
  pages: 436–444
  year: 2015
  doi: 10.1038/nature14539
`;
const KREYSZIG = `- id: kreyszig-fa
  type: book
  authors: [Erwin Kreyszig]
  title: Introductory Functional Analysis with Applications
  publisher: Wiley
  year: 1978
  isbn: 978-0-471-50731-4
`;
const matsu = (year = 2018) => `- id: matsuzaka-sets
  type: book
  authors: [松坂和夫]
  title: 集合・位相入門
  edition: 新装版
  publisher: 岩波書店
  year: ${year}
  isbn: 978-4-00-029871-1
`;

/**
 * 記録した応答を返す fetch と、呼ばれた URL の一覧を作る。overrides は URL ごとに応答を差し替える。
 * @param {Record<string, { status: number, body: string } | Error>} [overrides]
 */
function fakeFetch(overrides = {}) {
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../../src/refcheck/lookup.js').FetchLike} */
  const fetch = async (url) => {
    calls.push(url);
    const r = overrides[url] ?? recorded[url];
    if (r instanceof Error) throw r;
    if (!r) throw new Error(`記録にない URL に問い合わせた: ${url}`);
    return { status: r.status, text: async () => r.body };
  };
  return { fetch, calls };
}

/**
 * 一時の content/ を作って runRefsVerify を実行する。
 * @param {string | null} yml
 * @param {string[]} argv
 * @param {{ fetch?: ReturnType<typeof fakeFetch>, verified?: string, dir?: string, timeoutMs?: number }} [opts]
 */
async function run(yml, argv = [], opts = {}) {
  const dir = opts.dir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'refcheck-')));
  if (yml !== null) await fs.writeFile(path.join(dir, 'references.yml'), yml);
  if (opts.verified !== undefined) await fs.writeFile(path.join(dir, 'references.verified.json'), opts.verified);
  const f = opts.fetch ?? fakeFetch();
  /** @type {string[]} */
  const lines = [];
  /** @type {number[]} */
  const sleeps = [];
  const code = await runRefsVerify({
    argv,
    contentDir: dir,
    fetch: f.fetch,
    sleep: async (ms) => void sleeps.push(ms),
    now: () => new Date(2026, 10, 3),
    log: (l) => lines.push(l),
    timeoutMs: opts.timeoutMs,
  });
  const vp = path.join(dir, 'references.verified.json');
  const text = await fs.readFile(vp, 'utf8').catch(() => null);
  return { code, lines, calls: f.calls, sleeps, dir, text, verified: text === null ? null : JSON.parse(text) };
}

test('1: 論文は CrossRef と一致し、記録ができる', async () => {
  const r = await run(LECUN);
  assert.equal(r.code, 0);
  const rec = r.verified['lecun-deep-learning'];
  assert.equal(rec.checks.length, 1);
  assert.equal(rec.checks[0].identifier, 'doi:10.1038/nature14539');
  assert.equal(rec.checks[0].source, 'crossref');
  assert.deepEqual(rec.checks[0].record, {
    type: 'journal-article',
    title: 'Deep learning',
    authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
    year: 2015,
  });
  assert.equal(rec.checked, '2026-11-03');
  const raw = {
    id: 'lecun-deep-learning',
    type: 'article',
    authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
    title: 'Deep learning',
    journal: 'Nature',
    volume: '521',
    pages: '436–444',
    year: 2015,
    doi: '10.1038/nature14539',
  };
  assert.equal(rec.fingerprint, fingerprint(raw));
  assert.ok(r.text?.endsWith('}\n'));
});

test('2: 存在しない DOI は「見つからない」で、記録ができない', async () => {
  const r = await run(LECUN.replace('nature14539', 'nature99999999'));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /見つからない/);
  assert.equal(r.text, null);
});

test('3: 本に書評の DOI を付けると、種類が一致しない', async () => {
  const yml = KREYSZIG.replace('isbn: 978-0-471-50731-4', 'doi: 10.1137/1021075');
  const r = await run(yml);
  assert.equal(r.code, 1);
  const out = r.lines.join('\n');
  assert.match(out, /種類が一致しない/);
  assert.match(out, /journal-article/);
  assert.equal(r.text, null);
});

test('4: 無関係な記録に当たる ISBN は書名が一致しない(NDL サーチの記録)', async () => {
  const yml = KREYSZIG.replace('978-0-471-50731-4', '978-0-00-000000-2');
  const r = await run(yml);
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /書名が一致しない.*Radikalisasi Pancasila/);
  assert.deepEqual(r.calls, [`${NDL}9780000000002`]);
});

test('4: NDL サーチに記録がなければ OpenLibrary の無関係な記録を使い、書名が一致しない', async () => {
  const yml = KREYSZIG.replace('978-0-471-50731-4', '978-0-00-000000-2');
  const f = fakeFetch({ [`${NDL}9780000000002`]: { status: 200, body: NDL_EMPTY } });
  const r = await run(yml, [], { fetch: f });
  assert.equal(r.code, 1);
  const out = r.lines.join('\n');
  assert.match(out, /openlibrary/);
  assert.match(out, /書名が一致しない.*Kitab Jurumiyyah/);
  assert.equal(r.text, null);
});

test('5: dcndl:ErrorISBN の一致だけなら NDL サーチの記録を使わない', async () => {
  const yml = KREYSZIG.replace('978-0-471-50731-4', '978-4-00-000000-0');
  const r = await run(yml);
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /見つからない/);
  // NDL サーチの記録(誤記として登録された ISBN の本)は照合に使わず、OpenLibrary に回る
  assert.deepEqual(r.calls, [`${NDL}9784000000000`, 'https://openlibrary.org/isbn/9784000000000.json']);
  assert.equal(r.text, null);
});

test('6: 和書は NDL サーチの記録と一致し、source が ndl になる', async () => {
  const r = await run(matsu());
  assert.equal(r.code, 0);
  const c = r.verified['matsuzaka-sets'].checks[0];
  assert.equal(c.identifier, 'isbn:9784000298711');
  assert.equal(c.source, 'ndl');
  assert.deepEqual(c.record, { type: 'book', title: '集合・位相入門', authors: ['松坂, 和夫'], year: 2018 });
});

test('7: 年を1つ変えると、年が一致しない', async () => {
  const r = await run(matsu(2019));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /年が一致しない.*2019.*2018/);
  assert.equal(r.text, null);
});

test('Kreyszig は実物の ISBN で NDL サーチの記録と一致する(ビルドの凍結原稿が使う)', async () => {
  const r = await run(KREYSZIG);
  assert.equal(r.code, 0);
  const c = r.verified['kreyszig-fa'].checks[0];
  assert.equal(c.identifier, 'isbn:9780471507314');
  assert.equal(c.source, 'ndl');
  assert.equal(c.record.year, 1978);
});

test('NDL サーチに記録がなければ OpenLibrary(著者の記録をたどる)の記録で一致する', async () => {
  const f = fakeFetch({ [`${NDL}9780471507314`]: { status: 200, body: NDL_EMPTY } });
  const r = await run(KREYSZIG, [], { fetch: f });
  assert.equal(r.code, 0);
  const c = r.verified['kreyszig-fa'].checks[0];
  assert.equal(c.source, 'openlibrary');
  assert.deepEqual(c.record.authors, ['Erwin Kreyszig']);
  assert.equal(f.calls.at(-1), 'https://openlibrary.org/authors/OL144195A.json');
});

test('doi と isbn の両方を書いた項目は、両方が一致したときだけ確かめたものになる', async () => {
  const both = `${KREYSZIG}  doi: 10.1137/1021075\n`;
  const r = await run(both);
  assert.equal(r.code, 1);
  assert.equal(r.text, null);
  assert.match(r.lines.join('\n'), /種類が一致しない/);
});

test('8: 記録を手で書き換えて --check すると、今の記録と合わず、ファイルは変わらない', async () => {
  const first = await run(LECUN);
  const tampered = JSON.parse(/** @type {string} */ (first.text));
  tampered['lecun-deep-learning'].checks[0].record.title = 'Deep Learning!';
  const edited = `${JSON.stringify(tampered, null, 2)}\n`;
  const r = await run(LECUN, ['--check'], { dir: first.dir, verified: edited });
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /今の記録と合わない/);
  assert.equal(r.text, edited);
});

test('--check は、記録が正しければ 0 で、ファイルを書かない', async () => {
  const first = await run(LECUN + matsu());
  const r = await run(LECUN + matsu(), ['--check'], { dir: first.dir });
  assert.equal(r.code, 0);
  assert.equal(r.text, first.text);
  assert.equal(r.calls.length, 2);
});

test('--check は、記録がない文献と、一覧にない文献の記録を一致しないとする', async () => {
  const first = await run(LECUN);
  const r = await run(matsu(), ['--check'], { dir: first.dir });
  assert.equal(r.code, 1);
  const out = r.lines.join('\n');
  assert.match(out, /matsuzaka-sets: 一致しない.*記録がない/);
  assert.match(out, /lecun-deep-learning: 一致しない.*一覧にない/);
});

test('9: 500 は「確かめられなかった」で、終了コード 2、記録は書かない', async () => {
  const f = fakeFetch({
    'https://api.crossref.org/works/10.1038/nature14539': { status: 500, body: 'oops' },
  });
  const r = await run(LECUN, [], { fetch: f });
  assert.equal(r.code, 2);
  assert.match(r.lines.join('\n'), /確かめられなかった/);
  assert.equal(r.text, null);
});

test('9: 時間内に応答がなければ「確かめられなかった」で、終了コード 2', async () => {
  /** @type {import('../../src/refcheck/lookup.js').FetchLike} */
  const hang = (_url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const r = await run(LECUN, [], { fetch: { fetch: hang, calls: [] }, timeoutMs: 20 });
  assert.equal(r.code, 2);
  assert.match(r.lines.join('\n'), /確かめられなかった.*秒以内に応答がない/);
  assert.equal(r.text, null);
});

test('一致しない文献と確かめられなかった文献があれば 1 を返し、一致した文献の記録は書く', async () => {
  const f = fakeFetch({ [`${NDL}9784000298711`]: { status: 503, body: '' } });
  const r = await run(
    LECUN + matsu() + KREYSZIG.replace('978-0-471-50731-4', '978-0-00-000000-2').replace('kreyszig-fa', 'bad'),
    [],
    {
      fetch: f,
    },
  );
  assert.equal(r.code, 1);
  assert.deepEqual(Object.keys(r.verified), ['lecun-deep-learning']);
});

test('10: 一致した後に続けて実行すると問い合わせず 0、一覧から消すと記録が消える', async () => {
  const first = await run(LECUN + matsu());
  assert.equal(first.code, 0);
  assert.deepEqual(Object.keys(first.verified), ['lecun-deep-learning', 'matsuzaka-sets']);
  const again = await run(LECUN + matsu(), [], { dir: first.dir });
  assert.equal(again.code, 0);
  assert.equal(again.calls.length, 0);
  assert.equal(again.text, first.text);
  const dropped = await run(LECUN, [], { dir: first.dir });
  assert.equal(dropped.code, 0);
  assert.equal(dropped.calls.length, 0);
  assert.deepEqual(Object.keys(dropped.verified), ['lecun-deep-learning']);
});

test('--all は記録があっても問い合わせ直す。項目を書き換えた文献は問い合わせ直す', async () => {
  const first = await run(LECUN);
  const all = await run(LECUN, ['--all'], { dir: first.dir });
  assert.equal(all.calls.length, 1);
  assert.equal(all.text, first.text);
  const edited = await run(LECUN.replace('pages: 436–444', 'pages: 436-444'), [], { dir: first.dir });
  assert.equal(edited.calls.length, 1);
  assert.notEqual(
    edited.verified['lecun-deep-learning'].fingerprint,
    first.verified['lecun-deep-learning'].fingerprint,
  );
});

test('問い合わせは1件ずつ順に行い、あいだに1秒あける', async () => {
  const r = await run(LECUN + matsu());
  assert.equal(r.calls.length, 2);
  assert.deepEqual(r.sleeps, [1000]);
});

test('一覧の形式が違えば、ビルドと同じエラーを出して問い合わせない', async () => {
  const r = await run(`- id: x\n  type: book\n  authors: [A]\n  title: T\n  year: 2000\n`);
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /^E08 references\.yml /);
  assert.equal(r.calls.length, 0);
  assert.equal(r.text, null);
});

test('一覧がなければ、記録を消して 0', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'refcheck-'));
  const r = await run(null, [], { dir, verified: '{"gone":{"fingerprint":"x"}}' });
  assert.equal(r.code, 0);
  assert.equal(r.text, '{}\n');
});

test('引数の誤りは 64', async () => {
  assert.equal((await run(LECUN, ['--all', '--check'])).code, 64);
  assert.equal((await run(LECUN, ['--nope'])).code, 64);
});

test('正規化・年・姓の取り出し', () => {
  assert.equal(normalize('集合・位相入門'), '集合位相入門');
  assert.equal(normalize('Ｄｅｅｐ Learning: A-B'), 'deeplearningab');
  assert.equal(firstYear('c1978'), 1978);
  assert.equal(firstYear('1980.3'), 1980);
  assert.equal(firstYear('１９７３'), 1973);
  assert.equal(firstYear('n.d.'), null);
  assert.equal(familyFromName('松坂, 和夫, 1927-2012'), '松坂');
  assert.equal(familyFromName('Kreyszig, Erwin'), 'Kreyszig');
  // 区切りのない欧文の名前は最後の語を姓とする(最初の語を取ると、名の一致で通ってしまう)
  assert.equal(familyFromName('Erwin Kreyszig'), 'Kreyszig');
  assert.equal(familyFromName('杉浦光夫'), '杉浦光夫');
});
