---
title: "iOS & iPadOS リリースノート キャッチアップ: 2026-06-29"
---

> 取得日: 2026-06-29
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 26.6 が Beta 3 に更新**: 前回（Beta 2, 2026-06-24）から進み、Beta 2 では「既知の問題」として残っていたステッカーデータ破損の問題（163377768）が Beta 3 で解決済み（Fixed）になった。今回のリリースノートは解決済みの問題のみで、新機能・廃止・既知の問題の記載はなし。
- **解決済みの問題は HealthKit / Object Capture / Stickers / StoreKit の4分野**: 血圧サンプルの認可画面が表示されない問題、離散量タイプの時間加重平均統計が異常に高い値を返す問題、Object Capture のキャプチャ/再構築失敗、ステッカーデータ破損、Simulator での `SKTestSessions` のテスト環境接続不良がすべて修正された。
- **iOS & iPadOS 27 は引き続き Beta 2**: メジャー系列の 27 はタイトル・slug ともに前回（2026-06-24）の Beta 2 のままで新規更新なし。今回の新着は 26.6 Beta 3 のみ。

---

## バージョン一覧

### iOS & iPadOS 26.6 Beta 3 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: Xcode 26.6 にバンドルされるベータ SDK の Beta 3。記載は **解決済みの問題（Resolved Issues）** のみ。**HealthKit**: 血圧（`HKQuantityTypeIdentifierBloodPressureDiastolic`/`Systolic`）要求時に認可画面が表示されない問題（177652061）、サンプルが時間的に重複する際に離散量タイプ（安静時心拍数など）の時間加重平均統計が異常に高い値を返す問題（178157672）を修正。**Object Capture**: キャプチャ/再構築が失敗しうる問題（175324303）を修正。**Stickers**: ステッカーデータ破損時に新規ステッカー作成や既存ステッカー表示ができなくなり、iCloud 同期で他デバイスにも波及しうる問題（163377768）を修正（Beta 2 では既知の問題として残っていたもの）。**StoreKit**: Simulator 使用時に `SKTestSessions` がテスト環境に正しく接続できずテストアクションが失敗する問題（174738526／FB22500243）を修正。新機能・廃止・既知の問題の記載はなし。
