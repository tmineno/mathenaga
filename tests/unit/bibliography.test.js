// 参考文献の書誌の形(docs/spec/site.md「注と参考文献の表示」、受け入れテスト 52)。

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bibliography } from '../../src/ui/html/pages.js';

/** @param {Partial<import('../../src/core/references.js').Reference>} r */
const ref = (r) =>
  /** @type {import('../../src/core/references.js').Reference} */ ({
    id: 'x',
    type: 'book',
    authors: [],
    title: '',
    edition: null,
    publisher: null,
    journal: null,
    volume: null,
    issue: null,
    pages: null,
    year: 2000,
    isbn: null,
    doi: null,
    raw: {},
    ...r,
  });

test('52: 和書の巻は書名と一緒に『』で囲む', () => {
  const r = ref({
    authors: ['杉浦光夫'],
    title: '解析入門',
    volume: 'II',
    publisher: '東京大学出版会',
    year: 1985,
    isbn: '978-4-13-062006-2',
  });
  assert.equal(bibliography(r), '杉浦光夫、『解析入門 II』、東京大学出版会、1985。 ISBN 978-4-13-062006-2');
});

test('52: 欧文の本の巻は書名と一緒にイタリックにする', () => {
  const r = ref({
    authors: ['Donald E. Knuth'],
    title: 'The Art of Computer Programming',
    volume: '1',
    publisher: 'Addison-Wesley',
    year: 1997,
  });
  assert.match(bibliography(r), /、<i>The Art of Computer Programming 1<\/i>、Addison-Wesley、/);
});

test('52: 論文の巻は今までどおり雑誌名の後に置く', () => {
  const r = ref({
    type: 'article',
    authors: ['Yann LeCun', 'Yoshua Bengio', 'Geoffrey Hinton'],
    title: 'Deep learning',
    journal: 'Nature',
    volume: '521',
    pages: '436–444',
    year: 2015,
  });
  assert.equal(
    bibliography(r),
    'Yann LeCun、Yoshua Bengio、Geoffrey Hinton、“Deep learning”、<i>Nature</i>、521、436–444、2015。',
  );
});
