---
title: "iOS & iPadOS リリースノート キャッチアップ: 2026-07-13"
---

> 取得日: 2026-07-13
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 26.6 が Beta 5 に更新**: 前回キャッチアップ（Beta 4, 2026-07-06）から番号が進行。**解決済みの問題（Resolved Issues）の内容は Beta 4 と同一**（HealthKit / Object Capture / Stickers / StoreKit）で新規追加はなし。
- **Beta 5 で新規の「既知の問題」が追加**: Messages で **HDR スクリーンショットを送信すると表示が乱れる可能性がある**（180859837）。Beta 4 には既知の問題の記載がなかったため、この Messages の項目が今回の新着。
- **iOS & iPadOS 27 は引き続き Beta 3**: メジャー系列の 27 はタイトル・slug ともに前回（Beta 3, 2026-07-06）のままで新規更新なし。今回の新着は 26.6 Beta 5 のみ。

---

## バージョン一覧

### iOS & iPadOS 26.6 Beta 5 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: Xcode 26.6 にバンドルされるベータ SDK の Beta 5。記載は **解決済みの問題（Resolved Issues）** と **既知の問題（Known Issues）** のみ（新機能・廃止の記載はなし）。**解決済みの問題**は Beta 4 と同一 —— **HealthKit**: 血圧（`HKQuantityTypeIdentifierBloodPressureDiastolic`/`Systolic`）要求時に認可画面が表示されない問題（177652061）、サンプルが時間的に重複する際に離散量タイプ（安静時心拍数など）の時間加重平均統計が異常に高い値を返す問題（178157672）を修正。**Object Capture**: キャプチャ/再構築が失敗しうる問題（175324303）を修正。**Stickers**: ステッカーデータ破損時に新規ステッカー作成や既存ステッカー表示ができなくなり、iCloud 同期で他デバイスにも波及しうる問題（163377768）を修正。**StoreKit**: Simulator 使用時に `SKTestSessions` がテスト環境に正しく接続できずテストアクションが失敗する問題（174738526／FB22500243）を修正。**既知の問題（新規）** —— **Messages**: HDR スクリーンショットを Messages で送信すると表示が乱れる（garbled）可能性がある（180859837）。
