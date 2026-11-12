// 2 章: 同じページを HTTP/1.1 と HTTP/2 で開き、サーバが同時にいくつ処理していたかを比べる。
//   node examples/02-http-versions.mjs       画像 12 枚
//   node examples/02-http-versions.mjs 18    画像の枚数を変える
// サーバは、画像を 1 枚返すのに 300 ミリ秒かける。
import http from 'node:http';
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withBrowser } from './lib.mjs';

const IMAGES = Number(process.argv[2] ?? 12);
const DELAY = 300;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="teal"/></svg>';
const html = `<!doctype html><meta charset="utf-8"><title>画像 ${IMAGES} 枚</title>` +
  Array.from({ length: IMAGES }, (_, i) => `<img src="/img/${i}.svg" width="20" height="20" alt="">`).join('');

// HTTP/1.1 でも HTTP/2 でも同じ処理をする。処理中のリクエストの数を数える。
function makeHandler(stats) {
  return (req, res) => {
    stats.connections.add(req.stream?.session ?? req.socket);   // どの通り道（コネクション）で届いたか
    if (!req.url.startsWith('/img/')) {
      res.writeHead(req.url === '/' ? 200 : 204, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/' ? html : '');
      return;
    }
    stats.now++;
    stats.max = Math.max(stats.max, stats.now);
    setTimeout(() => {
      stats.now--;
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }).end(svg);
    }, DELAY);
  };
}

async function measure(label, server, url, contextOptions) {
  const stats = { now: 0, max: 0, connections: new Set() };
  server.on('request', makeHandler(stats));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const elapsed = await withBrowser(async (context) => {
    const page = await context.newPage();
    const start = Date.now();
    await page.goto(url(server.address().port), { waitUntil: 'load' });
    return Date.now() - start;
  }, contextOptions);
  await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
  console.log(`${label}`);
  console.log(`  ブラウザが使ったコネクションの数: ${stats.connections.size}`);
  console.log(`  サーバが同時に処理していた画像の最大数: ${stats.max}`);
  console.log(`  全部そろうまでの時間: 1 枚ぶんの待ち時間（${DELAY} ミリ秒）の約 ${Math.round(elapsed / DELAY)} 倍`);
}

// HTTP/2 はブラウザでは暗号化（HTTPS）が必須なので、この場かぎりの証明書を作る。
const dir = mkdtempSync(join(tmpdir(), 'h2-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
const tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
rmSync(dir, { recursive: true });

console.log(`画像 ${IMAGES} 枚のページを開く。サーバは 1 枚返すのに ${DELAY} ミリ秒かける。`);
console.log('');
await measure('HTTP/1.1', http.createServer(), (port) => `http://localhost:${port}/`);
await measure('HTTP/2', http2.createSecureServer(tls), (port) => `https://localhost:${port}/`, { ignoreHTTPSErrors: true });
