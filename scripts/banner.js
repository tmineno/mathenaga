// README の見出しのバナーを、ロゴのドットマップから作り直す(docs/spec/site.md「ロゴと favicon」)。
// 使い方: npm run banner
// logo.txt を変えたら実行して、できた SVG をコミットする。テストが、コミットした SVG と
// logo.txt から作ったものが一致することを確かめる。

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/build.js';
import { BANNERS, bannerSvg, parseBitmap, trim } from '../src/site/logo.js';

const logo = trim(parseBitmap(await fs.readFile(path.join(ROOT, 'src/site/assets/logo.txt'), 'utf8')));
for (const { file, ink } of BANNERS) {
  await fs.mkdir(path.dirname(path.join(ROOT, file)), { recursive: true });
  await fs.writeFile(path.join(ROOT, file), bannerSvg(logo, ink));
  console.log(file);
}
