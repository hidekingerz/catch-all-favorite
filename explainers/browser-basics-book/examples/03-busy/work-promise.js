// 答えの pause から setTimeout を外し、Promise だけにしたもの。順番を譲ったことにならない。

// ms ミリ秒のあいだ、計算を続ける（重い計算の代わり）
function compute(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* 計算中 */ }
}

// Promise の続きは、次のタスクに移る前に実行される
function pause() {
  return Promise.resolve();
}

export async function heavyWork() {
  for (let i = 0; i < 20; i++) {
    compute(50);
    await pause();
  }
}
