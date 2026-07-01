# Apple セキュリティリリース キャッチアップ: 2026-07-01

> 取得日: 2026-07-01
> ソース: [Apple セキュリティリリース](https://support.apple.com/ja-jp/100100)

## 今回の注目ポイント

- 2026年6月29日に iOS/iPadOS 26.5.2・macOS Tahoe 26.5.2・Safari 26.5.2 の3件が同時公開された。
- iOS/iPadOS 26.5.2 と macOS Tahoe 26.5.2 はそれぞれ 37 件、Safari 26.5.2 は 31 件の脆弱性を修正しており、いずれも WebKit 関連の修正が大半を占める（WebKit・WebKit Canvas・WebKit Storage・WebRTC・Web Extensions）。
- OS 側の更新では WebKit に加えて Kernel、IOGPUFamily、libxslt の脆弱性も修正されている。
- 取得した範囲では、実環境で悪用された（actively exploited）と明記されたゼロデイ脆弱性は確認されなかった。

---

## リリース一覧

### iOS 26.5.2およびiPadOS 26.5.2
- **公開日**: 2026-06-29
- **対象**: iPhone 11 以降、iPad Pro 12.9インチ（第3世代）以降、iPad Pro 11インチ（第1世代）以降、iPad Air（第3世代）以降 ほか
- **詳細**: https://support.apple.com/ja-jp/127594
- **要約**: 計37件の脆弱性を修正。WebKit（WebKit Canvas / WebKit Storage 含む）関連の修正が大半を占め、加えて Kernel、IOGPUFamily、libxslt、WebRTC、Web Extensions の脆弱性も修正。実環境での悪用が明記されたゼロデイは確認されなかった。

### macOS Tahoe 26.5.2
- **公開日**: 2026-06-29
- **対象**: macOS Tahoe
- **詳細**: https://support.apple.com/ja-jp/127595
- **要約**: 計37件の脆弱性を修正。iOS/iPadOS 26.5.2 と同様に WebKit 系（WebKit Canvas / WebKit Storage）の修正が中心で、Kernel、IOGPUFamily、libxslt、WebRTC、Web Extensions も対象。実環境での悪用が明記された脆弱性は確認されなかった。

### Safari 26.5.2
- **公開日**: 2026-06-29
- **対象**: macOS Sonoma、macOS Sequoia
- **詳細**: https://support.apple.com/ja-jp/127685
- **要約**: 計31件の脆弱性を修正。WebKit（WebKit Canvas / WebKit Storage）、WebRTC、Web Extensions を中心とした修正で、旧 OS（Sonoma / Sequoia）向けに Safari 単体で提供される。実環境での悪用が明記された脆弱性は確認されなかった。
