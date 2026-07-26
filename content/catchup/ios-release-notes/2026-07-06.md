---
title: "iOS & iPadOS リリースノート キャッチアップ: 2026-07-06"
---

> 取得日: 2026-07-06
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 27 が Beta 3 に更新**: 前回（Beta 2, 2026-06-24）から進み、記載項目が大幅に拡充。破壊的変更は引き続き健在で、**シーンベースライフサイクル未対応アプリは起動失敗**、**27.0 SDK ビルドでは Launch screen（`UILaunchScreen` 等）必須**、On Demand Resources（`NSBundleResourceRequest`）廃止→Background Assets、旧 MetricKit（`MXMetricManager` 等）非推奨、`FileDocument` プロトコル非推奨→`ReadableDocument`/`Document`、`calendar.deleteEvents`→`calendar.deleteEvent` リネーム、AirPort Utility の新規ダウンロード終了。
- **Beta 3 の新機能が拡大**: SwiftUI にドキュメント系新API（`ReadableDocument`/`WritableDocument`/`Document`、複数書き出し対応 `fileExporter`）、`AsyncImage` の HTTP キャッシュ、`@State` のマクロ実装（iOS 17 系までバックデプロイ）、`TabsPickerStyle`、`TextInputBorderShape` などが追加。StoreKit はオファーコード redemption の `VerificationResult` 返却・ボリューム購入・サブスクリプション Bundle/Suite に対応。TrustInsights フレームワーク、Media Sharing Extensions、AudioAccessoryKit、System の `stat` 系 Swift API、TextKit の `NSTextTable`（UIKit 対応）も新登場。
- **Beta 3 で多数の問題が解決**: Foundation Models（`@Generable` enum の警告、`onPrompt` 周りの不具合）、StoreKit Testing（サブスク各種挙動）、SwiftUI（`containerRelativeFrame` の safe-area 計算、選択可能 Text の TextRenderer）、Core Bluetooth/Nearby Interaction の Channel Sounding、Metal のサンプラ clamp 問題などが Fixed。
- **iOS & iPadOS 26.6 は Beta 4 に更新**: 前回（Beta 3, 2026-06-29）から番号のみ進行し、解決済みの問題（HealthKit / Object Capture / Stickers / StoreKit）の内容は Beta 3 と同一。新機能・廃止・新規の既知の問題の追加はなし。

---

## バージョン一覧

### iOS & iPadOS 27 Beta 3 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- **要約**: iOS/iPadOS 27 SDK の Beta 3（Xcode 27 バンドル）。**破壊的変更・必須対応**: シーンベースライフサイクル未対応アプリは起動失敗（`Transitioning to the UIKit scene-based life cycle` 参照）、27.0 SDK ビルドは `Info.plist` に Launch screen キー（`UILaunchStoryboardName`/`UILaunchStoryboards`/`UILaunchScreen`/`UILaunchScreens`）必須（未対応は App Store で拒否）、On Demand Resources（`NSBundleResourceRequest`）廃止→Background Assets、旧 MetricKit API 非推奨→`MetricManager`、`FileDocument` 非推奨→`ReadableDocument`/`Document`、`calendar.deleteEvents`→`calendar.deleteEvent` リネーム、AirPort Utility 新規ダウンロード終了。**ネットワークセキュリティ**: 27.0 OS では MDM/DDM/自動デバイス登録/構成プロファイル/アプリインストール/ソフトウェア更新に関わるシステムプロセスが TLS 1.2 以上・ATS 準拠を強制。**主な新機能**: 新オンデバイス Dictation モデル（Advanced Dictation Preview）、Core AI の Neural Engine 改善（バックグラウンドアクセス制限・新エンタイトルメント `com.apple.developer.background-tasks.continued-processing.inference`・1GB超モデル読込高速化・メモリ計上をアプリへ）、HealthKit の心拍/サイクリングパワーゾーン・履歴アクセス粒度選択・閉経状態/閉経後出血のサンプル型、PlayStation Access コントローラ対応、Background Assets のローカライズ済みアセットパック、HomeKit Secure Video の on-device/Private Cloud Compute 処理、MetricKit の Swift ファースト `MetricManager`/`MetalFrameRateMetric`/`MemoryExceptionDiagnostic`、SwiftUI の `ReadableDocument`/`WritableDocument`/`Document`・`AsyncImage` HTTP キャッシュ・`@State` マクロ実装・`TabsPickerStyle`・`TextInputBorderShape`・複数書き出し `fileExporter`・メニュー画像の既定非表示、UIKit の Launch screen 必須化・`preferredImageVisibility`・`navigationBarMinimization`・状態復元拡張、StoreKit のオファーコード `VerificationResult`・ボリューム購入（`assigned`/`assignmentRevoked`）・サブスク Bundle/Suite、TrustInsights フレームワーク、Media Sharing Extensions、AudioAccessoryKit（固定空間オーディオ）、System の `stat`/`lstat`/`fstat` 系 Swift API（SYS-0006）、TextKit の `NSTextTable`（UIKit 対応）、VideoToolbox の超解像 1.5x/フレーム補間 1080p 対応。**主な解決済み**: Foundation Models（`@Generable` enum 警告・`onPrompt` 不具合・`model(_:)` コンパイルエラー）、StoreKit Testing（サブスク期限切れ/アップグレード/価格の各種不整合）、SwiftUI（`containerRelativeFrame` の safe-area 計算・選択可能 Text の `TextRenderer`・`fileExporter`+`fileMover` 併用・スクロール位置バインディング）、Core Bluetooth/Nearby Interaction の Channel Sounding、Metal のサンプラ clamp、RealityKit の `OpacityComponent`、NetworkExtension の CarPlay 除外、Watch Connectivity の WidgetKit コンプリケーション転送。**既知の問題**: AirPlay・CarPlay・Siri・Core AI・Foundation Models・Camera・Photos・Safari・UIKit・SwiftUI・Image Playground など広範に多数残存。

### iOS & iPadOS 26.6 Beta 4 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: Xcode 26.6 にバンドルされるベータ SDK の Beta 4。記載は **解決済みの問題（Resolved Issues）** のみで、内容は Beta 3 と同一（新規追加なし）。**HealthKit**: 血圧（`HKQuantityTypeIdentifierBloodPressureDiastolic`/`Systolic`）要求時に認可画面が表示されない問題（177652061）、サンプルが時間的に重複する際に離散量タイプ（安静時心拍数など）の時間加重平均統計が異常に高い値を返す問題（178157672）を修正。**Object Capture**: キャプチャ/再構築が失敗しうる問題（175324303）を修正。**Stickers**: ステッカーデータ破損時に新規作成や既存表示ができず iCloud 同期で他デバイスにも波及しうる問題（163377768）を修正。**StoreKit**: Simulator 使用時に `SKTestSessions` がテスト環境に正しく接続できずテストアクションが失敗する問題（174738526／FB22500243）を修正。新機能・廃止・既知の問題の記載はなし。
