// 現在地バー(P-02)(docs/spec/site.md「閲覧時の機能」)。見えている駅に合わせて、バーの駅のリンクを強調する。

import { all } from './dom.js';

/**
 * 現在地バーの強調を始める。
 * Preconditions: なし。
 * Postconditions: バー(.mini)があり IntersectionObserver が使えれば、画面の中ほどにある駅のリンクに on と aria-current が付く。
 * Failure modes: バーがない、または IntersectionObserver がなければ何もしない。
 * Side effects: IntersectionObserver の登録、リンクのクラスと属性の書き換え。
 */
export function initMinibar() {
  var miniLinks = all('.mini a');
  if (miniLinks.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute('data-station');
          miniLinks.forEach(function (a) {
            var on = a.getAttribute('data-st') === id;
            a.classList.toggle('on', on);
            if (on) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    all('section.station').forEach(function (s) {
      io.observe(s);
    });
  }
}
