// 3 章: 03-order.mjs と同じ 4 行を、ブラウザの中で動かす。
//   node examples/03-order-browser.mjs
import { withBrowser } from './lib.mjs';

const lines = await withBrowser(async (context) => {
  const page = await context.newPage();
  return page.evaluate(() => new Promise((done) => {
    const out = [];
    out.push('1. 最初の行');
    setTimeout(() => { out.push('4. setTimeout(0) に渡した処理'); done(out); }, 0);
    Promise.resolve().then(() => out.push('3. Promise の then に渡した処理'));
    out.push('2. 最後の行');
  }));
});
console.log('ブラウザ（Chromium）の中で動かした結果');
for (const line of lines) console.log(line);
