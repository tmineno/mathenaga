// dist/ への書き出し。

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {string | Uint8Array | { copyFrom: string }} OutputFile
 */

/**
 * 出力先を消してから、すべてのファイルを書く。
 * Preconditions: outDir はリポジトリや content/ を含まないディレクトリ。files のキーは / 区切りの相対パス。
 * Postconditions: outDir に files だけがある状態になる。
 * Failure modes: outDir がファイルシステムの根か、cwd の祖先なら例外(消しすぎを防ぐ)。書き込みの失敗は例外。
 * Side effects: outDir を消して書き直す。
 * @param {string} outDir
 * @param {Map<string, OutputFile>} files
 */
export async function writeOutput(outDir, files) {
  const target = path.resolve(outDir);
  const cwd = path.resolve(process.cwd());
  if (target === path.parse(target).root || cwd === target || cwd.startsWith(target + path.sep)) {
    throw new Error(`output directory ${target} is not a place that may be deleted`);
  }
  await fs.rm(target, { recursive: true, force: true });
  const keys = [...files.keys()].sort();
  for (const key of keys) {
    if (key.split('/').includes('..') || path.isAbsolute(key)) throw new Error(`invalid output path ${key}`);
    const dest = path.join(target, ...key.split('/'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const file = /** @type {OutputFile} */ (files.get(key));
    if (typeof file === 'object' && file !== null && 'copyFrom' in file) await fs.copyFile(file.copyFrom, dest);
    else await fs.writeFile(dest, /** @type {string | Uint8Array} */ (file));
  }
}
