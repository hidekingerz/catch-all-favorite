# iOS & iPadOS リリースノート キャッチアップ: 2026-06-24

> 取得日: 2026-06-24
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 27 が Beta 2 に更新**: 前回（Beta 1）から内容が大幅に更新され、新機能・廃止・既知の問題が追加。新たに `FileDocument` プロトコルの非推奨化（`ReadableDocument` / `Document` への移行）が破壊的変更として追加。引き続きシーンベースライフサイクル必須化（未対応だと起動失敗）、On Demand Resources（`NSBundleResourceRequest`）廃止→Background Assets、旧 MetricKit API 非推奨が継続。
- **iOS 27 Beta 2 の新機能多数**: 高精度化する新オンデバイス Dictation モデル（Advanced Dictation Preview）、HealthKit の心拍/サイクリングパワーゾーン・閉経関連サンプル型、Core AI の Neural Engine 改善（バックグラウンドアクセス制限・大規模モデル読込改善）、PlayStation Access コントローラ対応、Background Assets のローカライズ済みアセットパックなど。
- **ネットワークセキュリティの厳格化が明文化**: 27.0 系では MDM・DDM・自動デバイス登録・構成プロファイル/アプリインストール・ソフトウェア更新の各システムプロセスで TLS 1.2 以上・ATS 準拠の暗号スイート/証明書が強制される。
- **iOS & iPadOS 26.6 も Beta 2 に更新**: 前回（Beta 1）はステッカーの既知の問題のみだったが、Beta 2 で HealthKit（血圧認可画面の不表示、時間加重平均統計の誤値）、Object Capture、StoreKit（`SKTestSessions` のテスト環境接続不良）の解決済み問題が追加。

---

## バージョン一覧

### iOS & iPadOS 27 Beta 2 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- **要約**: iOS/iPadOS 27 SDK の Beta 2（Xcode 27 バンドル）。**新機能**: 新オンデバイス Dictation モデル（Advanced Dictation Preview）、HealthKit の心拍/サイクリングパワーゾーン・閉経状態/閉経後出血のサンプル型、Core AI の Neural Engine 改善（バックグラウンドアクセス制限・1GB超モデル読込高速化・メモリ計上をアプリプロセスへ）、PlayStation Access コントローラ対応、Metal 4.1、Background Assets のローカライズ済みアセットパック、MetricKit の Swift ファースト `MetricManager`/`MetalFrameRateMetric`/`MemoryExceptionDiagnostic`、HomeKit Secure Video の on-device/Private Cloud Compute 処理など。**廃止・必須対応**: シーンベースライフサイクル未対応アプリは起動失敗、On Demand Resources（`NSBundleResourceRequest`）廃止→Background Assets、旧 MetricKit API（`MXMetricManager` 等）非推奨、`FileDocument` プロトコル非推奨（`ReadableDocument`/`Document` へ）、`calendar.deleteEvents` → `calendar.deleteEvent` リネーム、AirPort Utility の新規ダウンロード終了。**ネットワークセキュリティ**: 27.0 系の MDM/DDM/構成プロファイル/アプリインストール/ソフトウェア更新等で TLS 1.2 以上・ATS 準拠を強制。既知の問題は AirPlay・Siri・Core AI・Foundation Models・CarPlay・UIKit・SwiftUI など広範に多数。

### iOS & iPadOS 26.6 Beta 2 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: Xcode 26.6 にバンドルされるベータ SDK の Beta 2。**解決済み**: HealthKit の血圧（`HKQuantityTypeIdentifierBloodPressureDiastolic`/`Systolic`）認可画面が表示されない問題、サンプルが時間的に重複する際に離散量タイプ（安静時心拍数など）の時間加重平均統計が異常に高い値を返す問題、Object Capture のキャプチャ/再構築失敗、StoreKit の `SKTestSessions` が Simulator でテスト環境に正しく接続できずテストアクションが失敗する問題。**既知の問題**: ステッカーデータ破損時に新規ステッカー作成や既存ステッカー表示ができなくなり、iCloud 同期で他デバイスにも波及しうる問題（163377768）。新機能・廃止の記載はなし。
