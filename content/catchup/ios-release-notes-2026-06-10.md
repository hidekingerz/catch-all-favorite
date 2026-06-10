# iOS & iPadOS リリースノート キャッチアップ: 2026-06-10

> 取得日: 2026-06-10
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 27 Beta**: シーンベースのライフサイクル必須化（未対応だと起動失敗）、`Info.plist` での Launch screen 必須化、`NSBundleResourceRequest`（On Demand Resources）の廃止と Background Assets への移行、MetricKit の新 `MetricManager` API への移行など、開発者が対応必須の破壊的変更が多数。Metal 4.1、Foundation Models、Core AI 周りの新機能・既知の問題も豊富。
- **ネットワークセキュリティの厳格化**: iOS 27 では MDM・構成プロファイル・アプリインストール等の一部システム処理で TLS 1.2 以上・ATS 準拠の暗号スイートが強制される。iOS 26 系でも既定 TLS 最小バージョンが 1.0→1.2 に変更済み。
- **StoreKit の継続強化**: 26.5 で月次12か月コミット課金プランの価格情報 API（`PricingTerms`/`billingPlanType`）、26.4 で `revocationType`/`revocationPercentage`、27 で `VerificationResult` 返却やボリューム購入対応などが追加。
- iOS 26 系は 26.6 Beta まで進行中（26.6 はステッカーの既知の問題のみ記載の小規模ベータ）。26.4 では Memory Integrity Enforcement のフル適用オプトインや RCS のエンドツーエンド暗号化ベータが登場。

---

## バージョン一覧

### iOS & iPadOS 27 Beta Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- **要約**: iOS/iPadOS 27 SDK のベータ。新機能としては Metal 4.1、Background Assets（ローカライズ済みアセットパック）、オンデバイスの新 Dictation モデル、MetricKit の Swift ファースト `MetricManager`、SwiftUI の多数の追加（`AsyncImage` キャッシュ、選択可能 `Text` のシステム選択 UI、外部ディスプレイ向け `sceneAccessory` ほか）、HealthKit/HomeKit/StoreKit の拡張など。**廃止・必須対応**: シーンベースライフサイクル未対応アプリは起動失敗、`Info.plist` への Launch screen 指定が必須、`NSBundleResourceRequest`（ODR）廃止→Background Assets、旧 MetricKit API 非推奨。既知の問題は Siri・Core AI・Foundation Models・CarPlay・UIKit など広範囲に多数。

### iOS & iPadOS 26.6 Beta Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: Xcode 26.6 にバンドルされる小規模ベータ SDK。新機能・廃止・解決済みの記載はなし。既知の問題として、ステッカーデータ破損時に新規ステッカー作成や既存ステッカー表示ができなくなり、iCloud 同期で他デバイスにも波及しうる問題（Bug ID: 163377768）が記載。

### iOS & iPadOS 26.5 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_5-release-notes
- **要約**: StoreKit に月次12か月コミット課金プラン向けの価格情報取得（`SubscriptionInfo.pricingTerms` の `PricingTerms`）、`billingPlanType` の `PurchaseOption`、`CommitmentInfo` データモデル、SwiftUI 連携の `preferredSubscriptionPricingTerms(_:)` を追加。解決済み: ASN.1 レシートの App Version が "null" になる問題、非グレゴリオ暦設定時に `Transaction.currentEntitlements` が空になる問題、`SKTestSession` の構成利用不可問題など。既知の問題: StoreKit Testing がサブスク価格変更を検知できない。

### iOS & iPadOS 26.4 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_4-release-notes
- **要約**: 新機能として Background Assets のオフライン状態確認 API、アプリが Memory Integrity Enforcement のフル保護にオプトイン可能に（従来は Soft Mode のみ）、Messages の RCS エンドツーエンド暗号化のベータテスト（本リリースでは出荷せず）、StoreKit の `revocationType`/`revocationPercentage` 追加。解決済み: Background Assets ダウンロード時のクラッシュ、外部 HFS メディアの自動マウント、UIKit の KeyboardNotification 未送出など。既知の問題: Address Sanitizer のハング（Xcode 26.4 回避）、AudioAccessoryKit/Accessory Notifications は開発者テストのみなど。

### iOS & iPadOS 26.3 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes
- **要約**: 解決済みとして StoreKit の `Product.products(for:)` がエラーを投げずに無音で失敗する問題（165186025 / FB21110809）を修正。既知の問題として、iPhone 17 系・iPhone Air・iPad Pro (M5) で iPhone Mirroring、Apple TV 4K への AirPlay ミラーリング、ワイヤレス Continuity Camera、Mac→iPad Pro (M5) の Sidecar が動作しない継続性機能の問題。新機能・廃止の記載はなし。

### iOS & iPadOS 26.2 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_2-release-notes
- **要約**: 新機能として HealthKit の高血圧通知読み取り（`HKCategoryTypeIdentifierHypertensionEvent`）、StoreKit の `AppStore.ageRatingCode`（年齢レーティングコード取得）を追加。解決済み: AirDrop の検出問題、DeclaredAgeRange API のクラッシュ（26.2 SDK での再コンパイル要）、Instruments の Allocations 計測、PermissionKit、StoreXit の win-back オファー等。既知の問題: 既定の TLS Client Hello 変更により、厳格なボット検出/既知 TLS フィンガープリント依存のサーバでログイン失敗等が起こりうる。

### iOS & iPadOS 26.1 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_1-release-notes
- **要約**: 新機能として HealthKit の血圧認可 UI 統合、NearbyInteraction の `NINearbyAccessoryConfiguration` への UWB パラメータ追加、SwiftUI の `@Animatable` マクロが iOS 13 以降で利用可能に。解決済み: AirDrop アイコン描画、Background Assets の `AssetPackManager.url(for:)` のエラー、Game Controller のタイムスタンプ、Keyboard の発音区別符号選択、ロック画面のスリープ問題、Siri (pt) など多数。既知の問題: NearbyInteraction の `NIDLTDOAConfiguration` エラー、SwiftUI の `@FocusState` × `safeAreaBar` など。

### iOS & iPadOS 26 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26-release-notes
- **要約**: iOS/iPadOS 26 の初版（Xcode 26 バンドル）。新機能に Apple Intelligence の Foundation Models フレームワーク（オンデバイス LLM）、Metal 4、Swift Charts の `Chart3D`、HealthKit の Medications/Workout API、AdAttributionKit 拡張、SwiftUI の各種改善など。**廃止・破壊的変更**: 既定の最小 TLS バージョンが 1.0→1.2（`URLSession`/Network）、CoreData の iCloud 同期 API 廃止、NetworkExtension の脆弱な暗号方式（DES/3DES/SHA1 等）非サポート、SwiftUI の `Text` の `+` 連結非推奨など。既知の問題は Foundation Models のレート制限・Maps・Photos など広範。
