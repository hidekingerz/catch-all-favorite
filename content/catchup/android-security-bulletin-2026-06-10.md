# Android Security Bulletin キャッチアップ: 2026-06-10

> 取得日: 2026-06-10
> ソース: [Android Security Bulletins](https://source.android.com/docs/security/bulletin?hl=ja)

## 今回の注目ポイント

- 2026 年 6 月の月次速報（公開: 2026-06-01、更新: 2026-06-03）を新着として記録。
- セキュリティパッチレベルは **2026-06-01** と **2026-06-05** の 2 段階。
- 最も重大な脆弱性は **System** コンポーネントに存在し、追加の実行権限を必要とせずリモートで権限昇格（EoP）されるおそれがある（Critical）。
- Framework / System / Kernel に加え、Qualcomm・MediaTek・Unisoc・Imagination Technologies などベンダーコンポーネント、Google Play システムアップデート（MediaProvider, Documents UI）も対象。

---

## 速報一覧

### Android のセキュリティに関する公開情報 - 2026 年 6 月
- **公開日**: 2026-06-01（更新: 2026-06-03）
- **セキュリティパッチレベル**: 2026-06-01 / 2026-06-05
- **詳細**: https://source.android.com/docs/security/bulletin/2026/2026-06-01?hl=ja
- **要約**: System コンポーネントに、追加の実行権限やユーザー操作なしにリモートで権限昇格を許す可能性のある Critical な脆弱性が含まれる。対象は Framework・System・Kernel に加え、Imagination Technologies（PowerVR-GPU）・MediaTek（Modem, GenieZone, Preloader）・Unisoc（Modem）・Qualcomm（Display, クローズドソースコンポーネント）等のベンダーコンポーネント、および Google Play システムアップデート。Critical 例として CVE-2026-0043・CVE-2026-0097・CVE-2026-21352・CVE-2026-21353（System）、Qualcomm クローズドソースの CVE-2025-47392・CVE-2026-25276・CVE-2026-25277 などが挙げられている。
