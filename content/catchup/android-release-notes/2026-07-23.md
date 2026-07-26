---
title: "Android リリースノート キャッチアップ: 2026-07-23"
---

> 取得日: 2026-07-23
> ソース: [Android Release Notes](https://source.android.com/docs/whatsnew/release-notes)

## 今回の注目ポイント

前回キャッチアップ（2026-06-21）以降、リリースノート一覧の最新バージョンは引き続き **Android 17**（英語版ページ最終更新 2026-06-17 UTC）で、Android 18 等の新バージョンは未掲載。前回未記録だった Android 17 の 2 セクション **Compatibility**（互換性テスト）と **Setup**（ビルドセットアップ）が新着分。Compatibility では CTS Verifier / CTS-V の各種テスト（オーディオのマルチチャンネル入出力、ランジング精度、Telecom、USB、メディア再生、オーディオワークロード）や Camera ITS の更新、Android 17 CDD の公開が加わった。Setup では AOSP ソースツリーの読み取り専用化に伴うビルドエラーの対処が案内されている。

---

## リリースノート一覧

### Android 17 — Compatibility（互換性テスト）
- **URL**: https://source.android.com/docs/whatsnew/android-17-release#compatibility
- **要約**:
  - CTS Verifier にオーディオのマルチチャンネル入出力テストを追加。CTS-V 実行には既定ブラウザロールを付与する追加セットアップ手順が必要になった。
  - ランジング精度・Telecom テストをマルチデバイステスト化（Wi-Fi 接続テストが必須）し、USB ホスト側テストは adb over Wi-Fi を要求。メディア再生テスト・オーディオワークロードテスト等の CTS-V テストも追加。
  - オーディオテスト更新（USB-C to 3.5mm アダプタを推奨リストに追加、Pro Audio テストから HDMI 要件を削除）、Camera Image Test Suite（ITS）の更新、Android 17 版 Compatibility Definition Document（CDD）の公開を含む。

### Android 17 — Setup（ビルドセットアップ／ビルドエラーのトラブルシューティング）
- **URL**: https://source.android.com/docs/whatsnew/android-17-release#setup
- **要約**:
  - Android 17 以降、AOSP ソースツリーは読み取り専用（read-only）となる。プロダクト設定時やビルドの他工程でソースツリーを変更しようとすると、read-only ファイルシステムのエラーが発生してビルドが失敗する。
  - 解決するにはソースツリーを read-write に設定する（詳細は「Troubleshoot build errors」を参照）。
