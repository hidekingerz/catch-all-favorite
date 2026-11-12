// 5 章: ブラウザに置いたデータは、誰から見えて、どこへ送られるか。
//   node examples/05-storage.mjs
// 同じ内容のサーバを 2 つ立てる（A と B。違うのはポート番号だけ）。
import { startServer, withBrowser } from './lib.mjs';

const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>保存の実験</title></head><body><h1>保存の実験</h1></body></html>';
const handler = (req, res) => {
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  // /login に来たときだけ、サーバが Cookie を渡す
  if (req.url === '/login') headers['set-cookie'] = 'session=abc123; Path=/';
  res.writeHead(200, headers).end(html);
};
const a = await startServer(handler);
const b = await startServer(handler);

const seen = await withBrowser(async (context) => {
  const page = await context.newPage();

  await page.goto(`${a.url}/login`);                                        // A で Cookie を受け取り
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));         // A のページで localStorage に書く
  await page.goto(`${a.url}/next`);                                         // A の別のページへ
  const themeOnA = await page.evaluate(() => localStorage.getItem('theme'));

  await page.goto(`${b.url}/next`);                                         // B のページへ
  const themeOnB = await page.evaluate(() => localStorage.getItem('theme'));
  return { themeOnA, themeOnB };
});
await a.close();
await b.close();

const sent = (server) => {
  const req = server.log.find((e) => e.path === '/next');
  const cookie = req.headers.cookie ?? '(なし)';
  const hasTheme = JSON.stringify(req.headers).includes('dark');
  return { cookie, hasTheme };
};

console.log('サーバ A のページで、2 つのデータを置いた');
console.log('  Cookie        session=abc123（サーバ A が Set-Cookie ヘッダで渡した）');
console.log('  localStorage  theme=dark（ページの JavaScript が書いた）');
console.log('');
console.log('サーバ A の別のページを開いたとき');
console.log(`  リクエストに付いた Cookie ヘッダ: ${sent(a).cookie}`);
console.log(`  リクエストに localStorage の値は: ${sent(a).hasTheme ? '含まれる' : '含まれない'}`);
console.log(`  ページから読んだ localStorage の theme: ${seen.themeOnA}`);
console.log('');
console.log('サーバ B（ポート番号だけが違う）のページを開いたとき');
console.log(`  リクエストに付いた Cookie ヘッダ: ${sent(b).cookie}`);
console.log(`  ページから読んだ localStorage の theme: ${seen.themeOnB}`);
