---
title: "iOS & iPadOS リリースノート キャッチアップ: 2026-07-21"
---

> 取得日: 2026-07-21
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

- **iOS & iPadOS 26.6 が RC（Release Candidate）に到達**。前回キャッチアップ（Beta 5, 2026-07-13）で「既知の問題（新規）」だった **Messages の HDR スクリーンショットが乱れる問題（180859837）が解決済みに移動**。既知の問題は掲載なしとなり、正式版が近い。
- **iOS & iPadOS 27 が Beta 4 に進行し、初めて詳細な変更点が確認できた**（前回まで Beta 3 で詳細未取得）。App Intents・HealthKit・StoreKit・SwiftUI などで多数の新 API と非推奨化が入っている。
- **SwiftUI のドキュメント API が刷新**。`FileDocument`／`ReferenceFileDocument` が非推奨となり、非同期読み書き・進捗報告に対応した `ReadableDocument`／`WritableDocument`／`Document` プロトコルへ移行が推奨。`fileExporter` の複数エクスポート対応や `@State` 実装の刷新（再評価を避ける・iOS 17 までバックデプロイ）も。
- **Network Security の厳格化（27.0〜）**: MDM・DDM・自動デバイス登録・構成プロファイル／アプリインストール・ソフトウェア更新に関わる一部システムプロセスが TLS 1.2 以上と ATS 準拠の暗号スイート／証明書を必須化。サーバが満たさないと接続失敗の可能性。
- **StoreKit のボリューム購入・Bundle/Suite サブスク対応が拡張**。Offer code 引き換えが `VerificationResult` を返す、`Transaction.OwnershipType.assigned` 等の追加、Bundle/Suite を表す新 `Product.ProductType` API など。
- **HealthKit に更年期関連の新サンプルタイプ追加**（`HKCategoryTypeIdentifierMenopausalState`／`BleedingAfterMenopause`）、心拍・サイクリングパワーのゾーン対応、履歴アクセス範囲（限定／全履歴）を選べる新しい許可フロー。

---

## バージョン一覧

### iOS & iPadOS 26.6 RC Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_6-release-notes
- **要約**: 26.6 の RC（Release Candidate）。記載は **解決済みの問題（Resolved Issues）** のみで、**既知の問題は掲載なし**。前回 Beta 5 で既知の問題だった Messages の HDR スクリーンショット破損（180859837）が解決済みに移動した点が差分。
  - **HealthKit**: 血圧（`HKQuantityTypeIdentifierBloodPressureDiastolic`/`Systolic`）要求時に認可画面が表示されない問題（177652061）、サンプルが時間的に重複する際に離散量タイプ（安静時心拍数など）の時間加重平均統計が異常に高い値を返す問題（178157672）を修正。
  - **Messages**: HDR スクリーンショットを Messages で送信すると表示が乱れる問題（180859837）を修正。
  - **Object Capture**: キャプチャ／再構築が失敗しうる問題（175324303）を修正。
  - **Stickers**: ステッカーデータ破損時に新規作成・既存表示ができず、iCloud 同期で他デバイスにも波及しうる問題（163377768）を修正。
  - **StoreKit**: Simulator 使用時に `SKTestSessions` がテスト環境へ正しく接続できずテストアクションが失敗する問題（174738526／FB22500243）を修正。

### iOS & iPadOS 27 Beta 4 Release Notes
- **URL**: https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- **概要**: iOS & iPadOS 27 beta 4 向け SDK（Xcode 27 にバンドル）。主な**新機能**と**非推奨（Deprecations）**は以下（フレームワーク別）。
- **主な新機能**:
  - **App Intents**: `notes.createNote`／`notes.updateNote` スキーマに `AttributedString` 型の name パラメータを渡せるように（173431080）。
  - **AudioAccessoryKit**: サードパーティ製オーディオアクセサリが固定空間オーディオ向けにヘッドフォン情報をシステムへ提供可能に（現状は開発者テスト用。将来の 27 リリースで EU の利用者向けに提供予定）（178275661）。
  - **Background Assets**: ローカライズ済みアセットパックでアプリのストレージ使用量を削減（ユーザーの優先言語に応じて配信）（163944365）。
  - **Core AI**: Apple Intelligence 対応デバイス向けの Neural Engine 改善。バックグラウンドからの Neural Engine アクセスを制限、1GB 超の大規模モデル読み込み性能を改善、メモリ使用がアプリプロセスに帰属（Allocations に表示）（174796039）。バックグラウンドでの Neural Engine 利用に新エンタイトルメント `com.apple.developer.background-tasks.continued-processing.inference` が必要（179282606）。
  - **Dictation**: オンデバイスの新モデルで精度向上（設定 > キーボード > 音声入力で「Advanced Dictation Preview」をオン）（178444388）。
  - **Game Controller**: PlayStation® Access™ コントローラを macOS/iPadOS/iOS でサポート。カスタム入力プロファイルを作成・保存可能（168071382）。
  - **HealthKit**: 心拍・サイクリングパワーのゾーン対応（135746152）、限定履歴／全履歴を選べる新しい許可フロー（172310874）、更年期状態（`HKCategoryTypeIdentifierMenopausalState`）と閉経後出血（`HKCategoryTypeIdentifierBleedingAfterMenopause`）の2つの新サンプルタイプ（読み書き可・Reproductive Health 分類）（178532053）。
  - **HomeKit**: Home アプリで Apple Intelligence 有効時、HomeKit Secure Video 録画をオンデバイス＋Private Cloud Compute で処理し映像説明・検索を提供（178858470）。Home の Apple Intelligence には 2TB 以上の iCloud+ が必要（181282161）。
  - **Media Sharing Extensions**: システムレベルでメディア共有プロトコルを拡張として追加できる新フレームワーク（168722808）。
  - **MetricKit**: `CrashDiagnostic` に `terminationCategory` 追加、`StateReporting` 状態コンテキストでのメトリクス／診断、`MemoryExceptionDiagnostic`、`MetalFrameRateMetric`、`AsyncStream` で `MetricReport`／`DiagnosticReport` を受け取る Swift ファーストの新 `MetricManager` API（164439529 ほか）。
  - **Network Security**: 27.0 以降、MDM/DDM/自動デバイス登録/構成プロファイル・アプリインストール/ソフトウェア更新に関わる一部システムプロセスが TLS 1.2 以上・ATS 準拠を必須化。
  - **RealityKit**: Gaussian Splat Component API が今後のリリースで提供予定（178061856）。
  - **StoreKit**: Offer code 引き換え完了時に `VerificationResult` を返す（141012819）、ボリューム購入向け `Transaction.OwnershipType.assigned`／`RevocationType.assignmentRevoked`（156749517）、Bundle/Suite サブスクを表す新 `Product.ProductType` と関連 API（160501742）、Advanced Commerce の `partnerName`／`partnerId`（167808780）。
  - **SwiftUI（抜粋）**: `.toolbarColorScheme(_:for: .statusBar)`／`.toolbarVisibility(_:for: .statusBar)` でステータスバー制御、`AsyncImage` が HTTP キャッシュ対応・`URLSession` カスタマイズ可、選択可能 `Text` がシステムテキスト選択 UI・`TextRenderer` 対応、`@State` の再評価を避ける新実装（iOS 17 までバックデプロイ）、非同期読み書き対応の `ReadableDocument`／`WritableDocument`／`Document` プロトコルと新 `DocumentGroup`／`fileExporter(...documents:...)`、`TabsPickerStyle`、`TextInputBorderShape`／`.bordered` テキストフィールドスタイル、`concentricCornerRadii`、メニュー項目シンボル画像の既定非表示化 など多数。
  - **System**: C の `stat`/`lstat`/`fstat`/`fstatat` に対応する Swift API（`Stat` 型、`FilePath.stat()`／`FileDescriptor.stat()` 等。SYS-0006 参照）（160612181）。
- **主な非推奨（Deprecations）**:
  - **AirPort Utility**: App Store から新規ダウンロード不可に。iOS 27 以降では機能保証なし（158364073）。
  - **App Intents**: `calendar.deleteEvents` スキーマを `calendar.deleteEvent` に改名（176751155）。
  - **MetricKit**: 旧 API（`MXMetricManager`／`MXMetricManagerSubscriber`／`MXMetricPayload`／`MXDiagnosticPayload`）は新規採用非推奨。`MetricManager` を使う（174892111）。
  - **On Demand Resources**: On Demand Resources と `NSBundleResourceRequest` API が非推奨。Background Assets を使う（170066290）。
  - **PencilKit**: `__PKStrokeRenderState` を `PKStrokeRenderStateReference` に改名（176410709）。
  - **SwiftUI**: `FileDocument` プロトコルが非推奨（読み取り専用は `ReadableDocument`、読み書きは `Document` を使う）（178776840）。`.squareBorder`／`.roundedBorder` テキストフィールドスタイルはソフト非推奨（`.bordered` へ）。
