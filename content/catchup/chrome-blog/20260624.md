---
title: "Chrome for Developers キャッチアップ: 2026-06-24"
---

> 取得日: 2026-06-24
> ソース: [Chrome for Developers Blog](https://developer.chrome.com/blog?hl=ja)

## 今回の注目ポイント

今回は「AIエージェント対応のWeb開発」がメインテーマ。サイトをエージェントが操作しやすくするための Lighthouse 新カテゴリ「Agentic Browsing」と DevTools のエージェント向け機能、さらにフレームワークがランタイム情報をAIに共有できるサードパーティツール連携（Discovery API）が登場した。加えて WebGPU (Chrome 149-150) では immediates の追加と transient attachments の検証強化があった。

---

## 記事一覧

### A developer toolkit to make your website agent-ready
- **URL**: https://developer.chrome.com/blog/agent-ready-toolkit?hl=ja
- **公開日**: 2026-06-22
- **要約**: AIエージェントがWebサイトを正しく操作できるようにするための開発者向けツールキットを紹介。Chrome M150以降で使える Lighthouse の新カテゴリ「Agentic Browsing」で決定論的な監査を行え、DevTools のエージェント向け機能と組み合わせて検証できる。アクセシビリティツリー、視覚的安定性、WebMCP 統合の3点が鍵になる。

### Unlock runtime insights: Introducing third-party developer tools for Chrome DevTools for agents
- **URL**: https://developer.chrome.com/blog/devtools-for-agents-3p-tools?hl=ja
- **公開日**: 2026-06-18
- **要約**: Chrome DevTools for agents にサードパーティ開発者ツール連携が追加された。新しい Discovery API により、フレームワークやライブラリが内部のランタイム状態をAIエージェントに公開でき、静的なコード解析を超えたデバッグが可能になる。Angular の Signal Graph や DI ツールが先行実装として紹介されており、他フレームワークの参加も募っている。

### What's New in WebGPU (Chrome 149-150)
- **URL**: https://developer.chrome.com/blog/new-in-webgpu-149-150?hl=ja
- **公開日**: 2026-06-17
- **要約**: Chrome 149-150 の WebGPU 更新。小さく頻繁に変化するデータをGPUバッファのオーバーヘッドなしにシェーダーへ直接渡せる「immediates」が追加された。また、メモリ効率の良い transient attachments の誤用を防ぐための検証ルールが強化された。
