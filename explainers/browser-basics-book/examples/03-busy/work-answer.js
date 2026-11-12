// 演習の答え。50 ミリ秒ぶん計算するたびに、いったん手を止める。

// ms ミリ秒のあいだ、計算を続ける（重い計算の代わり）
function compute(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* 計算中 */ }
}

// いまの処理を終わりにして、続きを「次の順番」に回す
function pause() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function heavyWork() {
  for (let i = 0; i < 20; i++) {
    compute(50);
    await pause();
  }
}
