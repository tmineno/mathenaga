// プレビュー用サーバー(docs/spec/build.md の `npm run dev`)。
// content/ と src/ を監視し、変更のたびに別プロセスで全体を作り直し、成功したらブラウザを再読み込みする。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticHandler } from './static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = '127.0.0.1';
const EVENTS = '/__mathenaga/events';

/**
 * プレビューを始める。
 * Preconditions: 依存をインストール済み。
 * Postconditions: 127.0.0.1 の PORT(既定 8000)で dist/ をベースパスの下に配信し続ける。
 * Failure modes: ビルドのエラーは端末に出し、ブラウザは前回の出力のまま。ポートが使えなければ終了する。
 * Side effects: dist/ を書き換える。子プロセスを起動する。
 */
export function main() {
  const basePath = process.env.MATHENAGA_BASE_PATH || '/';
  const port = Number(process.env.PORT || 8000);
  /** @type {Set<import('node:http').ServerResponse>} */
  const clients = new Set();
  const reloadScript = `<script>new EventSource(${JSON.stringify(EVENTS)}).onmessage=function(){location.reload()}</script>`;
  const handler = createStaticHandler(path.join(ROOT, 'dist'), basePath, {
    transformHtml: (html) => html.replace('</body>', `${reloadScript}</body>`),
  });
  const server = http.createServer((req, res) => {
    if (req.url === EVENTS) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    handler(req, res);
  });

  let running = false;
  let again = false;
  const rebuild = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'build.js')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      running = false;
      if (code === 0) for (const c of clients) c.write('data: reload\n\n');
      else console.error('ビルドに失敗した。原稿を直して保存し直すと、もう一度作り直す。');
      if (again) {
        again = false;
        rebuild();
      }
    });
  };

  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  for (const dir of ['content', 'src']) {
    fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 150);
    });
  }
  server.listen(port, HOST, () => {
    console.log(`プレビュー:http://${HOST}:${port}${basePath}`);
    rebuild();
  });
}

main();
