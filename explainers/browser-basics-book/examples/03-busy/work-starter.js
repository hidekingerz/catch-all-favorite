// 演習の出発点。合計 1 秒かかる計算を、休まずに続ける。

// ms ミリ秒のあいだ、計算を続ける（重い計算の代わり）
function compute(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* 計算中 */ }
}

// 演習で使う道具。await pause(); と書くと、いまの処理を終わりにして、続きを「次の順番」に回す
function pause() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function heavyWork() {
  for (let i = 0; i < 20; i++) {
    compute(50);
  }
}
