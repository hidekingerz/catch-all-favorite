---
name: firefox-catchup
description: >
  Firefox のリリース情報（product-details.mozilla.org のバージョンJSON・firefox.com のリリースノート・MDN の開発者向けリリースノート）を取得し、Firefox の新バージョン・新機能・Web 開発者向け変更点をMarkdownファイルにまとめるスキル。
  「Firefox をキャッチアップして」「Firefox の最新バージョンをまとめて」
  「Firefox のリリースノートを調べて」「Firefox の新機能・Web API 変更をキャッチアップして」
  などと言われたら必ずこのスキルを使う。Firefox、Mozilla、Firefox リリースノート、
  Firefox ESR、Gecko、MDN Firefox Releases、firefox_versions.json
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# Firefox リリースノート キャッチアップスキル

Firefox の新バージョン（安定版・ESR）を検知し、リリースノートと MDN の開発者向け情報をもとに要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 共通事項

実行環境・正確性の共通ルール・重複チェックの方針・ファイル保存/push・定期実行は [`../_shared/catchup-common.md`](../_shared/catchup-common.md) にまとめてある。**実行前に必ず読んで従うこと。** 以下はこのソース固有の事項のみ記載する。

## 最重要: バージョン検知の方法

**新バージョンの検知は必ず公式のバージョンJSONから行う:**

```
https://product-details.mozilla.org/1.0/firefox_versions.json
```

認証不要・静的JSONで、curl / WebFetch のどちらでも安定して取得できる。使うキーは以下（2026-08-25 実測で確認済み）:

- `LATEST_FIREFOX_VERSION`: 最新安定版（例: `154.0.1`）
- `FIREFOX_ESR`: 現行 ESR（例: `140.14.0esr`）
- `NEXT_RELEASE_DATE`: 次回リリース予定日（ダイジェストの参考情報として記載する）

ベータ（`LATEST_FIREFOX_DEVEL_VERSION`）・Nightly（`FIREFOX_NIGHTLY`）・DevEdition・`FIREFOX_ESR_NEXT` は**対象外**（ノイズが多いため追わない）。

各バージョンのリリース日は姉妹JSONから取得できる:

```
https://product-details.mozilla.org/1.0/firefox_history_major_releases.json      # メジャー版 (X.0)
https://product-details.mozilla.org/1.0/firefox_history_stability_releases.json  # dot release / ESR
```

## リリースノート・開発者向け情報の取得方法

**リリースノート本体**（一次情報。サーバーサイドレンダリングされており curl / WebFetch で本文が取れる）:

```
https://www.firefox.com/en-US/firefox/<バージョン>/releasenotes/
例: https://www.firefox.com/en-US/firefox/154.0.1/releasenotes/
```

- **ESR はバージョン文字列から `esr` サフィックスを外して URL を組み立てる**（`140.14.0esr` → `.../firefox/140.14.0/releasenotes/`）。`esr` を付けたままだと 404（実測）
- 旧 `www.mozilla.org/en-US/firefox/.../releasenotes/` は firefox.com へリダイレクトされる。記録するURLは `www.firefox.com` 側に統一する

**MDN の開発者向けリリースノート**（メジャーバージョンのみ存在。CSS / JS / Web API の変更が互換性情報付きでまとまっている）:

```
https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/<メジャー番号>
例: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/154
```

- **新着バージョンのメジャー番号（例: `154.0.1` → `154`）が既存ファイルにまだ記録されていない場合に参照する。** dot release から入った場合でもメジャー版の開発者向け変更を取りこぼさないため。既に同メジャーを記録済みの dot release や ESR のマイナー更新では参照しない（MDN ページはメジャーバージョン単位にしか存在しない）

**セキュリティ情報（補足）**: リリースノートに Security fixes / MFSA へのリンクがある場合はそれを転記する。無い場合（dot release など）は省略してよい。MFSA 一覧は https://www.mozilla.org/en-US/security/advisories/ 。

## 絶対に守るべきルール

共通ルール（`../_shared/catchup-common.md`）に加えて、このスキル固有のルール:

1. **バージョン検知は `firefox_versions.json` のみを使う。** リリースノート一覧ページのスクレイピングや記憶にあるバージョン番号で判断しない
2. **リリースノートURLは上記の形式で組み立て、取得に成功したものだけを記録する。** ESR は `esr` サフィックスを外す
3. **ベータ・Nightly・DevEdition は対象にしない**

## 実行手順

### 1. バージョンJSONの取得

`https://product-details.mozilla.org/1.0/firefox_versions.json` を取得し、`LATEST_FIREFOX_VERSION` と `FIREFOX_ESR` を抽出する。あわせて `NEXT_RELEASE_DATE` を控えておく。

### 2. 重複チェック（新着バージョンの特定）

`content/catchup/firefox/` ディレクトリ内の既存ファイルを確認し、すでに記録済みのバージョンを把握する。

```bash
grep -h '\*\*バージョン\*\*' content/catchup/firefox/*.md 2>/dev/null
```

`LATEST_FIREFOX_VERSION` と `FIREFOX_ESR` のうち、既存ファイルに記録されていないバージョンを「新着」とする。

- 新着が1件もない場合は、ファイルを作成せず「新しいバージョンはありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、現行の安定版と ESR の2件を新着として扱う（過去バージョンには遡らない）

### 3. 各バージョンの要約作成

新着バージョンそれぞれについて:

1. リリースノート（`https://www.firefox.com/en-US/firefox/<バージョン>/releasenotes/`、ESR は `esr` を外す）を取得し、New / Fixed / Changed / Developer / Security の内容に基づいて日本語で2〜4行の要約を作成する
2. 新着バージョンの**メジャー番号が既存ファイルに未記録の場合**、MDN（`.../Firefox/Releases/<メジャー番号>`）も取得し、Web 開発者向けの変更点（CSS / JS / Web API の追加・削除・デフォルト変更）を要約に反映する
3. リリース日は `firefox_history_major_releases.json` / `firefox_history_stability_releases.json` から取得する（JSONに無い場合は「不明」とし、推測で書かない）

- 読んだ人が「自分のプロジェクト・ユーザー環境に影響があるか」を判断できるように、破壊的変更・デフォルト動作の変更・セキュリティ修正の有無を優先して書く
- dot release はバグ修正・セキュリティ修正が中心なので、要約は簡潔でよい

### 4. Markdownダイジェストの作成

新着バージョンを以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `YYYYMMDD.md`（YYYYMMDD は実行日）
**保存先**: リポジトリの `content/catchup/firefox/`

**テンプレート**:

```markdown
---
title: "Firefox リリースノート キャッチアップ: YYYY-MM-DD"
---

> 取得日: YYYY-MM-DD
> ソース: [Firefox Releases](https://www.firefox.com/en-US/firefox/releases/) / [product-details](https://product-details.mozilla.org/1.0/firefox_versions.json)
> 次回リリース予定: YYYY-MM-DD

## 今回の注目ポイント

[新着バージョンのうち特に重要な変更（破壊的変更・Web 開発者向けの主要な新機能・セキュリティ修正）を3〜5行でまとめる]

---

## バージョン一覧

### Firefox [バージョン]（安定版 / ESR）
- **バージョン**: [バージョン番号（ESR は esr サフィックス付きのまま記録する。例: 140.14.0esr）]
- **リリース日**: YYYY-MM-DD
- **リリースノート**: [firefox.com のリリースノートURL]
- **開発者向け (MDN)**: [MDN のURL（メジャー番号が今回初記録の場合のみ）]
- **要約**: [2〜4行で日本語要約。新機能・変更・セキュリティ修正など]

（新着バージョンごとに上記ブロックを繰り返す。安定版 → ESR の順に並べる）
```

`**バージョン**:` 行はステップ2の重複チェックの grep キーになるため、必ずこの形式で記録する（ESR は JSON の表記どおり `esr` サフィックス付きで記録する）。

### 5. 定期実行について

Firefox のリリースサイクルは約4週間で、間に dot release が入るため、週1回のスケジュールが適切。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| ESR のリリースノートURLに `esr` を付けて 404 | URL 組み立て時に `esr` サフィックスを外す（記録するバージョン番号は `esr` 付きのまま） |
| ベータ / Nightly まで新着に含めてしまう | 対象は `LATEST_FIREFOX_VERSION` と `FIREFOX_ESR` の2キーのみ |
| 記録済みメジャーの dot release で MDN を再取得する | MDN はメジャー番号が未記録のときだけ参照する（ページ自体もメジャー単位にしか無い） |
| リリース日を記憶や推測で書く | history JSON（major / stability）から取得。無ければ「不明」 |
| 記録URLが `www.mozilla.org` のまま | リダイレクト先の `www.firefox.com` に統一する |

共通の失敗（記憶での補完・重複・空ファイル等）は `../_shared/catchup-common.md` を参照。
