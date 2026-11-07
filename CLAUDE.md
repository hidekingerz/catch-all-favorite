# catch-all-favorite

## 調査レポート（content/research）を書くとき

- 用語の表記は既存レポートと揃える。表記の正本は `.textlint/` の辞書。
  - `.textlint/prh-common.yml`: content/research 全体（長音: ユーザ・サーバ・ヘッダ・パーサ など）
  - `.textlint/prh-email.yml`: content/research/email だけ（エンベロープ、エンベロープFrom、アラインメント など）
- PR を作る前に `npm run lint:text` を通す。自動で直せるものは `npm run lint:text:fix` で直る。
  CI（Content PR automation の content-guard）でも同じチェックが走り、落ちると auto-merge が止まる。
- 書いている途中で、同じ概念に複数の表記（カタカナ・漢語・英語、長音の有無など）を使っていないか確かめる。
  辞書に無い用語で表記を決めたら、辞書に `expected` / `pattern` を追記する（同じ PR でよい）。
  意味が違う語（例: 「整合性」= consistency と「アラインメント」= alignment）は揺れとして扱わず、
  必要なら正規表現と `specs` で除外する。
