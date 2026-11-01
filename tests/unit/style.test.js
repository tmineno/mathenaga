// style.css のダークの値は2か所に書く(OS の設定に合わせるときと、表示の設定でダークを選んだとき)。
// 2つが食い違わないことを確かめる(docs/spec/site.md「表示の設定」)。

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';

test('style.css: OS のダークとテーマのダークの値は同じ', async () => {
  const css = await fs.readFile(new URL('../../src/site/assets/style.css', import.meta.url), 'utf8');
  const media = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{([^}]*)\}\s*\}/.exec(
    css,
  );
  const forced = /:root\[data-theme='dark'\] \{([^}]*)\}/.exec(css);
  assert.ok(media && forced, 'ダークの規則が見つからない');
  const decls = (/** @type {string} */ body) =>
    body
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean);
  assert.ok(decls(media[1]).length > 0);
  assert.deepEqual(decls(forced[1]), decls(media[1]));
});
