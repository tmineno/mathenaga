// `npm run refs:verify` の入口。実際のネットワークと時計を渡して runRefsVerify を呼ぶ。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRefsVerify } from './run.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

process.exitCode = await runRefsVerify({
  argv: process.argv.slice(2),
  contentDir: path.join(ROOT, 'content'),
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  log: (line) => console.log(line),
});
