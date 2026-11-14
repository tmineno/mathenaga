// 閲覧時のスクリプト(docs/spec/site.md「閲覧時の機能」)の入口。各機能のモジュールを、決まった順に初期化する。
// 分野の切り替え(P-05)、用語ポップアップ(P-01)、現在地バー(P-02)、路線図の章の帯の強調(P-03)、
// 位置情報つきのコピー(P-08)、表示の設定(P-09)、しおり(P-10)、注と文献のポップアップ(P-11)、
// 選んだ文章からの起票と原稿の表示(P-12)。
// スクリプトが動かなくても、ページは未選択の表示のまま読める。

import { initBookmarks } from './bookmarks.js';
import { initCopy } from './copy.js';
import { reduceMotion, root } from './dom.js';
import { initField } from './field.js';
import { initIssueLinks } from './issue.js';
import { initMapCards, initMapPan } from './map.js';
import { initMinibar } from './minibar.js';
import { initPopups } from './popup.js';
import { applyLook } from './settings.js';
import { initSettingsMenu } from './settings-menu.js';

// 初期化の順は、元のスクリプトの順のまま(リスナーの登録順に効く)
applyLook();
initField();
initPopups();
initMinibar();
initIssueLinks();
initMapCards();
initMapPan();
initCopy();

// 設定のメニューの「しおりを消す」が使うので、しおりを先に作る
var bookmark = initBookmarks();
initSettingsMenu(bookmark);

if (reduceMotion) root.classList.add('reduce-motion');
