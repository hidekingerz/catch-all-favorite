// 各章の例が共通で使う小さな道具。
// - startServer: 手元だけで動く Web サーバを立て、届いたリクエストを記録する
// - withBrowser: 画面を出さないブラウザ（Chromium）を起動して、ページを開く
import http from 'node:http';
import { chromium } from 'playwright';

// handler(req, res) を受け取り、空いているポートでサーバを立てる。
// 返り値の log には、届いたリクエストが届いた順に入る。
export async function startServer(handler) {
  const log = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; } // ブラウザが勝手に取りに来るアイコンは数えない
    const entry = { method: req.method, path: req.url, headers: req.headers, status: null, type: null };
    log.push(entry);
    // レスポンスの状態と種類（content-type）も記録する
    const writeHead = res.writeHead.bind(res);
    res.writeHead = (status, headers = {}) => {
      entry.status = status;
      entry.type = headers['content-type'] ?? '(なし)';
      return writeHead(status, headers);
    };
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    port,
    url: `http://localhost:${port}`,
    log,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

// fn(context) を、起動したブラウザの中で実行する。終わったら必ず閉じる。
export async function withBrowser(fn, contextOptions = {}) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(contextOptions);
    return await fn(context);
  } finally {
    await browser.close();
  }
}

// --serve を付けて実行したときは、サーバを立てたまま待つ。自分のブラウザで開いて確かめられる。
export const serveOnly = process.argv.includes('--serve');
export async function waitForever(url) {
  console.log(`サーバを起動しました。ブラウザで ${url} を開いてください（止めるときは Ctrl + C）`);
  await new Promise(() => {});
}
