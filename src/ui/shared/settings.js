// 表示の設定の選択肢と、ブラウザに保存するキー(docs/spec/site.md「表示の設定」、docs/spec/ui-contract.md)。
// ページを組む部分(head の中のスクリプト)と閲覧時のスクリプトの両方が、この定義を読む。

/** 項目ごとの選択肢。先頭が初期値 */
export const CHOICES = {
  theme: ['auto', 'light', 'dark'],
  text: ['medium', 'small', 'large'],
  width: ['standard', 'narrow', 'wide'],
  openProof: [false, true],
  openAnswer: [false, true],
  openOther: [false, true],
  popup: ['hover', 'click'],
};

/** html の data-<項目> 属性で切り替える項目(CSS と head の中のスクリプトが読む) */
export const LOOK = ['theme', 'text', 'width'];

/**
 * ブラウザに保存するキー(docs/spec/site.md「ブラウザに保存するもの」、docs/spec/ui-contract.md)。
 * Preconditions: prefix は site.yml の storage_prefix(検査済み)。
 * Postconditions: 4つのキーを返す。どれも `<prefix>-` で始まる。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} prefix
 */
export function storageKeys(prefix) {
  return {
    field: `${prefix}-field`,
    settings: `${prefix}-settings`,
    zoom: `${prefix}-map-zoom`,
    bookmarks: `${prefix}-bookmarks`,
  };
}

/**
 * ページを描く前に、保存した表示の設定のうちテーマ・文字の大きさ・本文の幅を html の属性に移す、head の中のスクリプト
 * (site.md「表示の設定」。開いたときに初期値の表示が一瞬見えないように、head の中で動かす)。
 * 選択肢にない値は無視する(初期値のまま)。設定の読み書きと残りの項目は閲覧時のスクリプトが受け持つ。
 * Preconditions: なし。
 * Postconditions: script 要素の中身にする文字列を返す。受け付ける値は、LOOK の項目の初期値以外の選択肢である。
 * Failure modes: なし。
 * Side effects: なし。
 * @param {string} prefix  ブラウザに保存するキーの接頭辞
 * @returns {string}
 */
export function lookScript(prefix) {
  const accepted = LOOK.map(
    (k) =>
      `${k}:[${CHOICES[k]
        .slice(1)
        .map((v) => `'${v}'`)
        .join(',')}]`,
  ).join(',');
  return (
    `try{var s=JSON.parse(localStorage.getItem('${storageKeys(prefix).settings}')||'null'),r=document.documentElement,o={${accepted}};` +
    "if(s&&typeof s==='object')for(var k in o)if(o[k].indexOf(s[k])>=0)r.setAttribute('data-'+k,s[k])}catch(e){}"
  );
}
