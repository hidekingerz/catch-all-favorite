// 3 章: 重い処理の途中でボタンを押すと、反応はどれだけ遅れるか。
//   node examples/03-busy.mjs starter   演習の出発点（work-starter.js）
//   node examples/03-busy.mjs answer    演習の答え（work-answer.js）
//   node examples/03-busy.mjs promise   譲り方を Promise だけにしたもの（work-promise.js）
//   node examples/03-busy.mjs once      先頭で 1 回だけ譲るもの（work-once.js）
//   node examples/03-busy.mjs --serve   サーバを立てたままにする（自分のブラウザで開く）
import { readFileSync } from 'node:fs';
import { startServer, withBrowser, serveOnly, waitForever } from './lib.mjs';

const which = process.argv.slice(2).find((a) => /^[a-z]+$/.test(a)) ?? 'starter';
const dir = new URL('./03-busy/', import.meta.url);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript' };

const server = await startServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const name = path === '/' ? 'page.html' : path.slice(1);
  if (!/^[\w-]+\.(html|js)$/.test(name)) { res.writeHead(404).end(); return; }
  let body;
  try {
    body = readFileSync(new URL(name, dir));
  } catch {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[name.split('.').pop()], 'cache-control': 'no-store' }).end(body);
});

if (serveOnly) await waitForever(`${server.url}/?work=${which}`);

// 1 回ぶんの測定。重い処理を始め、0.2 秒後に「押してみる」を押す。
async function measure(context) {
  const page = await context.newPage();
  await page.goto(`${server.url}/?work=${which}`);
  await page.waitForSelector('body[data-ready]');
  // 2 つのボタンの位置を先に調べておく（重い処理の間は、ページに問い合わせても返事が来ないため）
  const center = async (selector) => {
    const box = await page.locator(selector).boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const start = await center('#start');
  const ping = await center('#ping');
  await page.mouse.click(...start);                        // 「重い処理を始める」を押す
  await page.waitForTimeout(200);                          // 重い処理が始まって 0.2 秒たったところで
  const clickedAt = Date.now();
  await page.mouse.click(...ping);                         // 「押してみる」を押す
  await page.waitForSelector('body[data-done]');
  await page.waitForSelector('body[data-handled-at]');
  const startedAt = Number(await page.getAttribute('body', 'data-started-at'));
  const handledAt = Number(await page.getAttribute('body', 'data-handled-at'));
  const doneAt = Number(await page.getAttribute('body', 'data-done-at'));
  const frames = Number(await page.textContent('#frames'));
  await page.close();
  // クリックしたのが重い処理の途中でなければ、測定になっていない
  return { valid: startedAt <= clickedAt && clickedAt < doneAt, delay: handledAt - clickedAt, frames };
}

const result = await withBrowser(async (context) => {
  for (let i = 0; i < 5; i++) {
    const r = await measure(context);
    if (r.valid) return r;
  }
  throw new Error('重い処理の途中でクリックできなかった。もう一度実行してください');
});
await server.close();

if (process.env.DEBUG) console.log(result);
const fast = result.delay < 100;
const smooth = result.frames >= 10;
console.log(`読み込んだファイル: work-${which}.js（合計 1 秒の重い処理）`);
console.log(`クリックから反応まで: ${fast ? '100 ミリ秒未満' : `約 ${(result.delay / 1000).toFixed(1)} 秒`}`);
console.log(`重い処理の間に画面を更新できた回数: ${result.frames === 0 ? '0 回' : smooth ? '10 回以上' : '1〜9 回'}`);
console.log(fast && smooth ? '判定: ✓ 重い処理の途中でも、ボタンが反応する' : '判定: ✗ 重い処理が終わるまで、ボタンが反応しない');
