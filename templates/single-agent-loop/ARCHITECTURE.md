# ARCHITECTURE — 技術スタックとフォルダ構成

> 対象リポジトリ向けに書き換えてください。エージェントが DISCOVER を高速化するための
> プロジェクト知識です（毎周ゼロから推測させないため）。

## スタック

- 言語 / ランタイム: {{例: TypeScript / Node.js 20}}
- フレームワーク: {{例: なし / React / Jekyll など}}
- テスト: {{例: Vitest}}
- Lint / Format: {{例: ESLint, Prettier}}
- パッケージマネージャ: {{例: pnpm}}

## 主要ディレクトリ

```
{{例:
src/          アプリ本体
  auth/       認証ドメイン
test/         テスト
scripts/      補助スクリプト
}}
```

## 重要な慣習

- {{例: 公開APIは src/index.ts から export する}}
- {{例: テストは対象ファイルと同階層に *.test.ts で置く}}
- {{例: 副作用のある処理は src/io 以下に隔離する}}

## ビルド / 実行コマンド

- インストール: `{{例: pnpm install}}`
- テスト: `{{例: pnpm test}}`
- Lint: `{{例: pnpm lint}}`
- 型チェック: `{{例: pnpm typecheck}}`
