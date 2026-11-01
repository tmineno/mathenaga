// dist/ をベースパスの下に配信する、小さな静的ファイルの配信(プレビューとテストで使う)。

import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
};

/**
 * HTTP の要求を処理する関数を作る。
 * Preconditions: distDir は出力先、basePath は / で始まり / で終わる。
 * Postconditions: basePath の下のパスを distDir のファイルに対応させる。ディレクトリなら index.html を返す。
 * Failure modes: ファイルがなければ 404。distDir の外を指すパスは 404。
 * Side effects: ファイルを読む。
 * @param {string} distDir
 * @param {string} basePath
 * @param {{ transformHtml?: (html: string) => string }} [opts]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createStaticHandler(distDir, basePath, opts = {}) {
  const root = path.resolve(distDir);
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === basePath.slice(0, -1)) {
      res.writeHead(301, { Location: basePath });
      res.end();
      return;
    }
    if (!pathname.startsWith(basePath)) return notFound(res);
    pathname = pathname.slice(basePath.length);
    let file = path.resolve(root, ...pathname.split('/').filter(Boolean));
    if (file !== root && !file.startsWith(root + path.sep)) return notFound(res);
    try {
      const st = await fs.stat(file);
      if (st.isDirectory()) {
        if (!url.pathname.endsWith('/')) {
          res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
          res.end();
          return;
        }
        file = path.join(file, 'index.html');
      }
      let body = await fs.readFile(file);
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
      if (type.startsWith('text/html') && opts.transformHtml)
        body = Buffer.from(opts.transformHtml(body.toString('utf8')));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      notFound(res);
    }
  };
}

/** @param {import('node:http').ServerResponse} res */
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
}
