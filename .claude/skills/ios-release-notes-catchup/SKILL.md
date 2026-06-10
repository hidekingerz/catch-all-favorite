---
name: ios-release-notes-catchup
description: >
  iOS & iPadOS リリースノート（developer.apple.com/documentation/ios-ipados-release-notes）の最新版を取得し、iOS / iPadOS SDK の変更点・新機能・既知の問題をMarkdownファイルにまとめるスキル。
  「iOS リリースノートをキャッチアップして」「iOS / iPadOS SDK の変更点をまとめて」
  「iOS の新バージョンの release notes を調べて」「iPadOS の API 変更をキャッチアップして」
  などと言われたら必ずこのスキルを使う。iOS リリースノート、iPadOS リリースノート、
  iOS SDK、release notes、API 変更、既知の問題、ベータ SDK
  といったキーワードが含まれる場合も積極的に使う。定期スケジュールでの自動実行にも対応。
---

# iOS & iPadOS リリースノート キャッチアップスキル

iOS & iPadOS リリースノート（https://developer.apple.com/documentation/ios-ipados-release-notes）の新着バージョンを取得して、要約付きのMarkdownダイジェストとして保存する。1回の実行につき1つのダイジェストファイルを作成する。

## 実行環境

このスキルはローカルClaude Code（CLI）とデスクトップ版Claudeアプリのコードモードの両方で動作する。利用可能なツールセットが環境ごとに異なるため、Web取得は「優先するツール → フォールバック」を順に試すこと。

- **Web取得**: ブラウザツール（Chrome / Brave 等のMCPサーバ）が利用可能ならそれを最優先。利用不可な場合は `WebFetch` を使う
- **ファイル保存**: 本リポジトリでは `content/catchup/` ディレクトリ配下に保存する（デスクトップ版コードモードではワークスペースフォルダがリポジトリのルートに対応する）

## 最重要: 一覧の取得方法

**ドキュメントページ `https://developer.apple.com/documentation/ios-ipados-release-notes` を直接取得して一覧を拾ってはいけない。** このページは DocC ベースでクライアントサイド（JavaScript）レンダリングされるため、静的HTMLにはタイトルしか含まれず、リリースノート一覧を取得できない。

**一覧は必ず DocC の JSON API から取得する:**

```
https://developer.apple.com/tutorials/data/documentation/ios-ipados-release-notes.json
```

この JSON には:

- `topicSections`: メジャーバージョンごとのグループ（例: 「iOS & iPadOS 27」「iOS & iPadOS 26」…）
- `references`: 各リリースノート項目の **タイトル（`title`）** と **相対URL（`url`、例 `/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes`）**

が構造化された形で含まれている。

各リリースノートの本文も DocC JSON から取得できる。相対URLに対応する JSON は次の形:

```
https://developer.apple.com/tutorials/data/documentation/ios-ipados-release-notes/<slug>.json
例: https://developer.apple.com/tutorials/data/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes.json
```

本文は `primaryContentSections`（`kind: content`）に、概要は `abstract` に入っている。

- 推測で別のJSON URLを作らない。一覧JSONの `references` に載っている `url` をそのまま使ってJSON URLを組み立てる
- 人間向けの記事URL（記録用）は `https://developer.apple.com` + 相対URL（例 `https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes`）

## 絶対に守るべきルール

このスキルで最も重要なのは**正確性**。以下は必ず守ること:

1. **ドキュメントページのHTMLを一覧取得に使わない。** 必ず DocC JSON（`.../tutorials/data/documentation/ios-ipados-release-notes.json`）を使う
2. **取得したJSONの内容だけを使う。** 自分の記憶や推測でバージョン・要約・変更点を補完しない
3. **URLはJSONに記載のものを使う。** URLを推測しない
4. **新着バージョンを漏れなく拾う。** 既存ファイルと重複しないバージョンはすべて対象にする
5. **新着がなければファイルを作らない。** すべて既存の場合は「新しいリリースノートはありませんでした」と報告して終了する
6. **ブラウザツールで開いたタブは必ず閉じる**（ブラウザツールを利用した場合のみ）

## 実行手順

### 1. 一覧JSONの取得

`https://developer.apple.com/tutorials/data/documentation/ios-ipados-release-notes.json` を取得し、`references` から各リリースノートの **タイトル・相対URL** を抽出する。`topicSections` の並び（先頭が最新メジャーバージョン）を参考に、新しいバージョン順に整理する。

- 直近のもの（最新メジャーバージョンとその直下のマイナー／ベータ）を中心に対象にすれば十分。古いバージョン（iOS 12〜18 など）まで遡る必要はない

### 2. 重複チェック（新着バージョンの特定）

`content/catchup/` ディレクトリ内の既存の `ios-release-notes-*.md` ファイルを確認し、すでに記録済みのバージョン（リリースノートの相対URL／slug）を把握する。

```bash
ls content/catchup/ios-release-notes-*.md 2>/dev/null
```

一覧JSONのバージョンのうち、既存ファイルにまだ含まれていないもの（slug が未掲載のもの）を「新着」とする。

- 新着が1件もない場合は、ファイルを作成せず「新しいリリースノートはありませんでした」と報告して終了する
- 既存ファイルが1つもない場合（初回）は、最新メジャーバージョン系列（例: iOS 27 系・26 系）の各リリースノートを新着として扱う（古いバージョンは無理に含めない）

### 3. 各リリースノートの要約作成

新着バージョンそれぞれについて、対応する本文JSON（`.../ios-ipados-release-notes/<slug>.json`）を取得し、`abstract` と `primaryContentSections` の内容に基づいて日本語で2〜4行の要約を作成する。

- 「新機能（New Features）」「廃止・変更（Deprecations / API changes）」「解決された問題（Resolved Issues）」「既知の問題（Known Issues）」など、開発者が対応判断できる観点を簡潔にまとめる
- 本文が取得できなかった場合は `abstract` をもとに要約する（推測で内容を作らない）

### 4. Markdownダイジェストの作成

新着バージョンを以下のフォーマットで **1つのファイル** にまとめる。

**ファイル名**: `ios-release-notes-YYYY-MM-DD.md`（YYYY-MM-DD は実行日）
**保存先**: リポジトリの `content/catchup/` ディレクトリ

**テンプレート**:

```markdown
# iOS & iPadOS リリースノート キャッチアップ: YYYY-MM-DD

> 取得日: YYYY-MM-DD
> ソース: [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)

## 今回の注目ポイント

[新着バージョンのうち特に重要な変更（破壊的変更・廃止API・主要な新機能・重大な既知の問題）を3〜5行でまとめる]

---

## バージョン一覧

### [リリースノートのタイトル]
- **URL**: [リリースノートの記事URL]
- **要約**: [2〜4行で日本語要約。新機能・変更・既知の問題など]

（新着バージョンごとに上記ブロックを繰り返す。新しいバージョン順に並べる）
```

新着バージョンをすべて漏れなく含める。タイトルは JSON の `title` をそのまま使う（英語のままでよい）。

このスキル単体ではpushを行わない。push まで自動化したい場合は `frontend-catchup-and-push` スキルを使う（他のソースと合わせて1回でcommit & pushされる）。

### 5. 定期実行について

このスキルは `frontend-catchup-and-push` スキルのステップに組み込まれており、`schedule` スキルによる定期キャッチアップの一部として自動実行される。iOS/iPadOS リリースノート単独で定期実行したい場合は `schedule` スキルで週次タスクとして登録できる。

リリースノートはベータ期間中は頻繁に、正式版は不定期に更新されるため、週1回のスケジュールが適切。

## よくある失敗と対処

| 失敗 | 対処 |
|------|------|
| ドキュメントHTMLを取得して一覧が取れない | DocC はJSレンダリング。`.../tutorials/data/documentation/ios-ipados-release-notes.json` を使う |
| JSON URLを推測して404 | 一覧JSONの `references[].url` をそのまま使ってJSON URLを組み立てる。推測しない |
| 古いバージョンまで全部ダイジェストに入れる | 最新メジャー系列に絞る。重複チェックで既存slugを除外 |
| 記憶で変更点を補完してしまう | 取得したJSONの内容のみ使う。取得失敗時は abstract のみで要約 |
| 新着ゼロなのに空ファイルを作る | ファイルを作らず「新しいリリースノートはありませんでした」と報告 |
