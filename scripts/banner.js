// README の見出しのバナーを、ロゴのドットマップから作り直す(docs/spec/site.md「ロゴと favicon」)。
// 使い方: npm run banner
// logo.txt を変えたら実行して、できた SVG をコミットする。テストが、コミットした SVG と
// logo.txt から作ったものが一致することを確かめる。

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/build.js';
import { BANNER_FILE, bannerSvg, parseBitmap, trim } from '../src/site/logo.js';

const logo = trim(parseBitmap(await fs.readFile(path.join(ROOT, 'src/site/assets/logo.txt'), 'utf8')));
const file = path.join(ROOT, BANNER_FILE);
await fs.mkdir(path.dirname(file), { recursive: true });
await fs.writeFile(file, bannerSvg(logo));
console.log(BANNER_FILE);
