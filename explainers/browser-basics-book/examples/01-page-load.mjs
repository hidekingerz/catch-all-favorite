// 1 章: ページを 1 つ開くと、ブラウザはサーバに何回問い合わせるか。
//   node examples/01-page-load.mjs          結果を表示して終わる
//   node examples/01-page-load.mjs --serve  サーバを立てたままにする（自分のブラウザで開く）
import { startServer, withBrowser, serveOnly, waitForever } from './lib.mjs';

const files = {
  '/': ['text/html; charset=utf-8', `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>はじめてのページ</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>こんにちは</h1>
  <img src="/cat.svg" alt="猫" width="80" height="80">
  <p id="message">読み込み中…</p>
  <script src="/app.js"></script>
</body>
</html>`],
  '/style.css': ['text/css', 'h1 { color: teal; }'],
  '/cat.svg': ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="orange"/></svg>'],
  '/app.js': ['text/javascript', `fetch('/api/message').then((r) => r.json()).then((d) => { document.querySelector('#message').textContent = d.text; });`],
  '/api/message': ['application/json', JSON.stringify({ text: 'サーバから届いた文章です' })],
};

const server = await startServer((req, res) => {
  const file = files[req.url];
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
  res.writeHead(200, { 'content-type': file[0] }).end(file[1]);
});

if (serveOnly) await waitForever(server.url);

const shown = await withBrowser(async (context) => {
  const page = await context.newPage();
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector('#message').textContent !== '読み込み中…');
  return page.textContent('#message');
});
await server.close();

const line = (e) => `${e.method} ${e.path.padEnd(13)} → ${e.status}  ${e.type}`;
const [html, ...rest] = server.log;
const api = rest.filter((e) => e.path.startsWith('/api/'));
const parts = rest.filter((e) => !e.path.startsWith('/api/')).sort((a, b) => a.path.localeCompare(b.path));

console.log('アドレスバーに入れた URL は 1 つ。サーバに届いたリクエストは次のとおり。');
console.log('');
console.log('最初の 1 回（HTML）');
console.log('  ' + line(html));
console.log('HTML を読んだブラウザが、追加で取りに来たもの（届く順は毎回変わる）');
for (const e of parts) console.log('  ' + line(e));
console.log('JavaScript が動いてから、さらに取りに来たもの');
for (const e of api) console.log('  ' + line(e));
console.log('');
console.log(`合計 ${server.log.length} 回`);
console.log(`画面の文章: ${shown}`);
