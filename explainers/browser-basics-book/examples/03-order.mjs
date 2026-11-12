// 3 章: 書いた順に動くとは限らない。
//   node examples/03-order.mjs
console.log('1. 最初の行');

setTimeout(() => console.log('4. setTimeout(0) に渡した処理'), 0);

Promise.resolve().then(() => console.log('3. Promise の then に渡した処理'));

console.log('2. 最後の行');
