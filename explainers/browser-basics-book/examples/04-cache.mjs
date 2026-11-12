// 4 章: 同じファイルを 2 回使うとき、ブラウザはサーバにもう一度問い合わせるか。
//   node examples/04-cache.mjs
// 1 ページ目と 2 ページ目は、同じ 3 つの CSS ファイルを使う。違うのは、サーバが付ける Cache-Control ヘッダだけ。
import { startServer, withBrowser } from './lib.mjs';

const css = {
  '/long.css': { control: 'max-age=3600', body: 'h1 { color: teal; }' },
  '/check.css': { control: 'no-cache', body: 'p { color: gray; }' },
  '/never.css': { control: 'no-store', body: 'a { color: navy; }' },
};
const page = (title) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>` +
  Object.keys(css).map((p) => `<link rel="stylesheet" href="${p}">`).join('') +
  `</head><body><h1>${title}</h1></body></html>`;

const server = await startServer((req, res) => {
  if (req.url === '/first' || req.url === '/second') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page(req.url.slice(1)));
    return;
  }
  const file = css[req.url];
  if (!file) { res.writeHead(404).end(); return; }
  const etag = `"${req.url.slice(1)}-v1"`;   // ファイルの中身に付けた名札。中身が変わったら変える
  const headers = { 'content-type': 'text/css', 'cache-control': file.control, etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();        // 「手元のものと同じ」とだけ答える。本体は送らない
    return;
  }
  res.writeHead(200, headers).end(file.body);
});

const marks = await withBrowser(async (context) => {
  const tab = await context.newPage();
  await tab.goto(`${server.url}/first`);
  const first = server.log.length;
  await tab.goto(`${server.url}/second`);
  return first;
});
await server.close();

const answer = (visit, path) => {
  const e = visit.find((x) => x.path === path);
  if (!e) return 'サーバに届いていない（手元のコピーを使った）';
  if (e.status === 304) return '届いた → 304（変わっていない、と答えただけ。本体は送っていない）';
  return `届いた → ${e.status}（本体を送った）`;
};
const visits = { '1 ページ目': server.log.slice(0, marks), '2 ページ目': server.log.slice(marks) };
for (const [label, visit] of Object.entries(visits)) {
  console.log(`${label}を開いたとき`);
  for (const [path, file] of Object.entries(css)) {
    console.log(`  ${path.padEnd(11)} Cache-Control: ${file.control.padEnd(13)} ${answer(visit, path)}`);
  }
}
