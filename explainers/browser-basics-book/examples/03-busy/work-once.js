// 先頭で 1 回だけ譲るもの。そのあとの 1 秒は、1 つのタスクのまま。

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
  await pause();
  for (let i = 0; i < 20; i++) {
    compute(50);
  }
}
