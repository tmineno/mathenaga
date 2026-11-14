// サイトごとの値(docs/adr/ADR-009-site-independent-ui.md「配信」)。ビルドが esbuild の define で ENAGA_SITE を埋め込む。

import { fill } from '../locales/index.js';
import { storageKeys } from '../shared/settings.js';

/** サイトの文言と、保存キーの接頭辞 */
export const SITE = ENAGA_SITE;

/** ブラウザに保存するキー */
export const KEYS = storageKeys(SITE.storagePrefix);

/**
 * 文言(差し込み済み)。
 * @param {string} key @param {Record<string, string | number>} [vars]
 */
export function msg(key, vars) {
  return fill(SITE.messages[key], vars);
}
