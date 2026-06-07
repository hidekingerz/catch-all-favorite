# Chrome for Developers キャッチアップ: 2026-06-07

> 取得日: 2026-06-07
> ソース: [Chrome for Developers Blog](https://developer.chrome.com/blog?hl=ja)

## 今回の注目ポイント

- Chrome 150ベータが公開。CSS `text-fit`、アニメーション可能な`zoom`、`polygon()`角丸め、IndexedDBのSQLiteバックエンド移行など多数の新機能
- Chrome 149ではCSSギャップ装飾、bfcacheでのWebSocket対応が正式リリース
- DevTools 149でAIアシスタンスが大幅強化、エージェント向けMCPサーバーが安定版化
- Google I/O 2026でWebMCP、HTML-in-Canvas、宣言型部分更新などの新APIが発表
- PWAのオリジン移行機能がChrome 150で導入、ドメイン変更時のユーザー移行がシームレスに

---

## 記事一覧

### Seamless PWA origin migration: Change domains without losing users
- **URL**: https://developer.chrome.com/blog/seamless-pwa-origin-migration?hl=ja
- **公開日**: 2026-06-03
- **要約**: Chrome 150でPWAのドメイン移行を支援する機能が導入。マニフェストに`migrate_from`フィールドを追加し、旧オリジンの`.well-known`ファイルで`allow_migration`を有効化することで、ユーザーへの通知とともに旧アプリの自動アンインストールと新アプリのインストールがシームレスに行われる

### Chrome 150 beta
- **URL**: https://developer.chrome.com/blog/chrome-150-beta?hl=ja
- **公開日**: 2026-06-03
- **要約**: CSS関連では`AccentColor`/`AccentColorText`システムカラー、アニメーション可能な`zoom`、`polygon()`角丸め、`text-fit`による動的テキスト調整、`background-clip: border-area`が追加。Web API側ではIndexedDBがSQLiteバックエンドに移行し信頼性とパフォーマンスが向上、PWAオリジン移行機能、プログラムによるスクロール操作のPromise通知にも対応

### What's new in DevTools (Chrome 149)
- **URL**: https://developer.chrome.com/blog/new-in-devtools-149?hl=ja
- **公開日**: 2026-06-02
- **要約**: Gemini 3ベースのAIアシスタンスUIが大幅刷新され、会話機能やコーディングエージェントへの出力コピー機能が追加。エージェント向けDevTools MCPサーバーが安定版化し、試験運用版のWebMCPデバッグツールが導入。コントラスト計算でAPCA（高度な知覚コントラストアルゴリズム）が標準機能に昇格

### New in Chrome 149
- **URL**: https://developer.chrome.com/blog/new-in-chrome-149?hl=ja
- **公開日**: 2026-06-02
- **要約**: CSSギャップ装飾でグリッドやflexboxのギャップをスタイル設定可能に。アクティブなWebSocket接続があるページがbfcacheに保存されるようになりページの高速復元が可能に。`Intl.Locale.prototype.variants`でロケールバリアントを取得するAPIが追加

### Build new features using built-in AI in Chrome
- **URL**: https://developer.chrome.com/blog/build-new-features-using-built-in-ai-in-chrome-io2026?hl=ja
- **公開日**: 2026-05-26
- **要約**: Google I/O 2026の講演の書き起こし。Chromeに組み込まれたAI機能により、Summarizer API・Prompt API・Writer APIなどを使ってデバイス上でモデルを実行可能。クラウド費用不要でプライバシーを保護しつつオフラインでも動作する

### What's new in web extensions: I/O 2026 recap
- **URL**: https://developer.chrome.com/blog/extensions-io-2026?hl=ja
- **公開日**: 2026-05-22
- **要約**: AI技術により拡張機能開発が身近になり、開発者の月間登録数が2倍以上に増加。開発者登録対象国を120ヶ国以上に拡大予定。ダッシュボードでのロール管理、企業向け限定公開オプション、`browser`グローバル名前空間によるクロスブラウザ対応強化など

### New in Chrome at Google I/O 2026
- **URL**: https://developer.chrome.com/blog/new-in-chrome-io26?hl=ja
- **公開日**: 2026-05-21
- **要約**: Google I/O 2026で発表されたChrome関連の講演が全てオンデマンド視聴可能に。WebMCP、Modern Web Guidance、エージェント向けChrome DevTools、HTML-in-Canvas、Prompt APIなど多数の新機能が紹介

### Modernize authentication with passkeys, digital credentials, and more
- **URL**: https://developer.chrome.com/blog/io26-web-identity?hl=ja
- **公開日**: 2026-05-21
- **要約**: パスキーによるフィッシング耐性の高いログイン体験の実現方法を解説。条件付き作成によるパスキーの自動アップグレード、ID連携やメール確認プロトコル（EVP）の活用、デバイスバインドセッション認証情報（DBSC）による包括的なセキュリティ対策

### 15 updates from Google I/O 2026: Powering the agentic web with new capabilities, tools, and features in Chrome
- **URL**: https://developer.chrome.com/blog/chrome-at-io26?hl=ja
- **公開日**: 2026-05-19
- **要約**: 「エージェントウェブの時代」に対応する15のアップデートを発表。WebMCPなどのAIエージェント向け機能、HTML-in-CanvasやDeclarative Partial UpdatesなどUI/パフォーマンス新API、Gemini in Chromeによるプロアクティブなアシスタント機能が含まれる

### Declarative partial updates
- **URL**: https://developer.chrome.com/blog/declarative-partial-updates?hl=ja
- **公開日**: 2026-05-19
- **要約**: `<template>`要素と処理命令プレースホルダを用いた順不同ストリーミングAPIと、`setHTML`・`streamHTML`などの動的HTML挿入メソッドが導入。コンテンツの準備ができた時点でストリーミング配信でき、ページ全体の準備を待たずにレンダリングが可能に
