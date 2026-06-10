# Android リリースノート キャッチアップ: 2026-06-10

> 取得日: 2026-06-10
> ソース: [Android Release Notes](https://source.android.com/docs/whatsnew/release-notes?hl=ja)

## 今回の注目ポイント

初回キャッチアップのため、リリースノート一覧の最新版である **Android 16**（Android 16 / QPR1 / QPR2 を含む）を対象とする。2026 年からは AOSP が trunk stable バージョンモデルへ移行し、ソースコードのリリースは Q2 と Q4 に行われる。プラットフォーム面では Generic Bootloader (GBL) の導入、16KB ページサイズ最適化、KeyMint 4.0 によるアテステーション強化、Android Virtualization Framework (AVF) の拡充など、ブート・メモリ・セキュリティ・仮想化に関わる基盤的な変更が多い。

---

## リリースノート一覧

### Android 16（Android 16 / QPR1 / QPR2）
- **日付**: 2026-03-13（ページ最終更新）
- **関連リンク**: [Android 16 release notes](https://source.android.com/docs/whatsnew/android-16-release?hl=ja)
- **要約**:
  - **開発モデル**: 2026 年から AOSP は trunk stable バージョンモデルに移行し、ソースコードのリリースは Q2 と Q4 に実施される。
  - **アーキテクチャ**: Generic Bootloader (GBL) という標準化・更新可能なブートローダを導入し、Android のブートプロセスを簡素化。16KB ページサイズ環境では Thread Local Storage のメモリ改善により初期スレッドメモリを約 8KB 削減。
  - **接続性**: Bluetooth デバイスが Android API レベルを読み取れる GATT サービス「Android Identification Service (AIS)」、複数の距離測定技術を統合する Ranging モジュール、IMS 向けの緊急コールバックモードリスナー System API、Wi-Fi Soft AP の切断クライアント追跡の強化。
  - **表示・操作**: デスクトップウィンドウでのウィンドウ重ね配置サポート、デバイス固有のキャリブレーションを削減する正規化 PWLE ハプティクス API、デバイス状態に基づく自動回転のリファクタリング。
  - **メディア**: HDR のフォールバック機能とスクリーンショット対応、Android TV 向け画質・音質調整を標準化する Media Quality Framework、Advanced Professional Video (APV) コーデックのプラットフォームサポート。
  - **オーディオ**: AIDL HAL 向けに Configurable audio policy (CAP) サポートを復活（Android 14〜15 の実装上の制約を解消）。
  - **パフォーマンス・セキュリティ**: 初期化後のシステム健全性評価を行う Trade-in mode、モジュールハッシュ検証を伴う KeyMint 4.0 アテステーション、SELinux マクロによる GPU syscall フィルタリング強化。
  - **仮想化**: AVF の LL-NDK サポート、early-boot VM、Microdroid 更新、Ferrochrome による Linux ターミナルサポート、Trusty OS 統合を含む Protected VM の改善。
