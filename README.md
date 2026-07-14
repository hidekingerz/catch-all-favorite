# catch-all-favorite
毎週の情報のキャッチアップ情報を管理する

https://hidekingerz.github.io/catch-all-favorite/

## 開発

サイトは [Blume](https://useblume.dev/) でビルドしている。

```bash
npm ci          # 依存関係のインストール（Node.js 22.12+）
npm run dev     # 開発サーバー
npm run build   # 本番ビルド（dist/ に出力）
```

`main` への push で GitHub Actions（`.github/workflows/deploy-pages.yml`）が Blume ビルドを実行し、GitHub Pages に公開される。
