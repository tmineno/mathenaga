// 改善案の起票(P-07)(docs/spec/site.md「改善案の起票」)。ページの欄にオリジンを足して、完全な URL にする。

import { all } from './dom.js';

/**
 * 起票リンク(a.issue[data-page])のページの欄に、オリジンを足す。
 * Preconditions: なし。
 * Postconditions: 各リンクの href の page 欄が、オリジン付きの URL になる。
 * Failure modes: URL が扱えない環境では、そのリンクはパスのまま(例外は出さない)。
 * Side effects: リンクの href を書き換える。
 */
export function initIssueLinks() {
  all('a.issue[data-page]').forEach(function (a) {
    try {
      var url = new URL(a.href);
      url.searchParams.set('page', window.location.origin + a.getAttribute('data-page'));
      a.href = url.toString().replace(/\+/g, '%20');
    } catch {
      // URL が扱えない環境では、パスのまま
    }
  });
}
