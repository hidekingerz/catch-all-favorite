# MEMORY — ループの記憶（背骨）

> エージェントは毎周このファイルを読み、末尾に追記します。会話履歴ではなく**このファイルが記憶**です。
> 人間が消さない限り、run 47 でも run 1〜46 の試行を踏まえて動けます。

## Done（達成済み）

<!-- 例:
- [run 3] src/auth/login.ts のnullチェックを追加、login.test.ts 全green。commit abc1234
-->

## Open（未解決 / 次周への申し送り）

<!-- 例:
- [run 4] refreshToken の期限切れケースで test 失敗。原因仮説: タイムゾーン未考慮。次周で UTC 固定を試す。
-->

## Notes（学び / 落とし穴）

<!-- 例:
- VERIFY は `pnpm test` だけでなく `pnpm typecheck` も必要（型エラーがCIで落ちる）。
-->
