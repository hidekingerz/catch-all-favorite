---
title: "Apple セキュリティリリース キャッチアップ: 2026-06-10"
---

> 取得日: 2026-06-10
> ソース: [Apple セキュリティリリース](https://support.apple.com/ja-jp/100100)

## 今回の注目ポイント

- 2026年5月11日に iOS/iPadOS 26.5、macOS Tahoe 26.5、tvOS/watchOS/visionOS 26.5 など主要 OS のセキュリティアップデートが一斉に公開された。macOS Tahoe 26.5 は約98件、iOS/iPadOS 26.5 は約90件の脆弱性を修正している。
- レガシー端末向けにも iOS/iPadOS 18.7.9・17.7.11・16.7.16・15.8.8 が同日提供され、古い iPhone/iPad もカバーされている。
- 5月13日には WebKit を中心に22件を修正した Safari 26.5（macOS Sonoma/Sequoia 向け）が公開。
- 6月1日に iOS 26.5.1 / macOS Tahoe 26.5.1 が公開されたが、いずれも公開時点で CVE の公開エントリはない。
- 取得した範囲では、実環境で悪用された（actively exploited）と明記されたゼロデイ脆弱性は確認されなかった。

---

## リリース一覧

### iOS 26.5.1
- **公開日**: 2026-06-01
- **対象**: iPhone 17（全モデル）および iPhone Air
- **詳細**: 一覧ページに詳細ページへのリンクなし（https://support.apple.com/ja-jp/100100 参照）
- **要約**: iPhone 17 系および iPhone Air 向けのアップデート。一覧ページ上では「このアップデートには CVE の公開エントリがありません」と記載されており、公開時点でセキュリティ修正の CVE 情報は掲載されていない。

### macOS Tahoe 26.5.1
- **公開日**: 2026-06-01
- **対象**: macOS Tahoe
- **詳細**: 一覧ページに詳細ページへのリンクなし（https://support.apple.com/ja-jp/100100 参照）
- **要約**: macOS Tahoe 向けのアップデート。一覧ページ上では CVE の公開エントリがないと記載されており、公開時点でセキュリティ修正の CVE 情報は掲載されていない。

### Safari 26.5
- **公開日**: 2026-05-13
- **対象**: macOS Sonoma および macOS Sequoia
- **詳細**: https://support.apple.com/ja-jp/127121
- **要約**: 計22件の脆弱性を修正。大半（約20件）が WebKit に関するもので、メモリ破損やコンテンツセキュリティポリシーのバイパス、悪意あるWebコンテンツによるプロセスクラッシュやユーザーデータ露出などに対処。WebRTC 関連の修正も含まれる。実環境での悪用は明記されていない。

### iOS 26.5 and iPadOS 26.5
- **公開日**: 2026-05-11
- **対象**: iPhone 11 以降、iPad Pro 12.9インチ（第3世代以降）、iPad Pro 11インチ（第1世代以降）、iPad Air（第3世代以降）、iPad（第8世代以降）、iPad mini（第5世代以降）
- **詳細**: https://support.apple.com/ja-jp/127110
- **要約**: 約90件の脆弱性を修正する大規模アップデート。WebKit（20件超）を中心に、Kernel、mDNSResponder、ImageIO/AppleJPEG などのメモリ安全性・アクセス制御・入力検証の問題に対処。実環境での悪用は明記されていない。

### iOS 18.7.9 and iPadOS 18.7.9
- **公開日**: 2026-05-11
- **対象**: iPhone XS / XS Max / XR、iPad（第7世代）
- **詳細**: https://support.apple.com/ja-jp/127111
- **要約**: 旧世代デバイス向けのセキュリティアップデート。最新 OS と同日に公開され、対象端末のセキュリティ修正を提供する。詳細は詳細ページの CVE 一覧を参照。

### iPadOS 17.7.11
- **公開日**: 2026-05-11
- **対象**: iPad Pro 12.9インチ（第2世代）、iPad Pro 10.5インチ、iPad（第6世代）
- **詳細**: https://support.apple.com/ja-jp/127112
- **要約**: iPadOS 17 系のレガシー iPad 向けセキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### iOS 16.7.16 and iPadOS 16.7.16
- **公開日**: 2026-05-11
- **対象**: iPhone 8 / 8 Plus / X、iPad（第5世代）、iPad Pro 9.7インチ、iPad Pro 12.9インチ（第1世代）
- **詳細**: https://support.apple.com/ja-jp/127113
- **要約**: iOS/iPadOS 16 系の旧世代デバイス向けセキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### iOS 15.8.8 and iPadOS 15.8.8
- **公開日**: 2026-05-11
- **対象**: iPhone 6s（全モデル）、iPhone 7（全モデル）、iPhone SE（第1世代）、iPad Air 2、iPad mini（第4世代）、iPod touch（第7世代）
- **詳細**: https://support.apple.com/ja-jp/127114
- **要約**: iOS/iPadOS 15 系の最も古い対応デバイス向けセキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### macOS Tahoe 26.5
- **公開日**: 2026-05-11
- **対象**: macOS Tahoe
- **詳細**: https://support.apple.com/ja-jp/127115
- **要約**: 計98件の脆弱性を修正する大規模アップデート。WebKit（20件超）、Kernel（10件超）、mDNSResponder、ImageIO/Model I/O、Sandbox/Storage などにわたるメモリ破損・バッファオーバーフロー・アクセス制御の問題に対処。実環境での悪用は明記されていない。

### macOS Sequoia 15.7.7
- **公開日**: 2026-05-11
- **対象**: macOS Sequoia
- **詳細**: https://support.apple.com/ja-jp/127116
- **要約**: macOS Sequoia 向けのセキュリティアップデート。最新 macOS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### macOS Sonoma 14.8.7
- **公開日**: 2026-05-11
- **対象**: macOS Sonoma
- **詳細**: https://support.apple.com/ja-jp/127117
- **要約**: macOS Sonoma 向けのセキュリティアップデート。最新 macOS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### tvOS 26.5
- **公開日**: 2026-05-11
- **対象**: Apple TV HD および Apple TV 4K（全モデル）
- **詳細**: https://support.apple.com/ja-jp/127118
- **要約**: Apple TV 向けの tvOS セキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### watchOS 26.5
- **公開日**: 2026-05-11
- **対象**: Apple Watch Series 6 以降
- **詳細**: https://support.apple.com/ja-jp/127119
- **要約**: Apple Watch 向けの watchOS セキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。

### visionOS 26.5
- **公開日**: 2026-05-11
- **対象**: Apple Vision Pro（全モデル）
- **詳細**: https://support.apple.com/ja-jp/127120
- **要約**: Apple Vision Pro 向けの visionOS セキュリティアップデート。最新 OS と同日に公開。詳細は詳細ページの CVE 一覧を参照。
