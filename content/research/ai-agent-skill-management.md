---
title: "AIエージェント向けスキル管理ツール 技術調査レポート — APM vs skills CLI"
---

> 発行日: 2026-07-15
> テーマ: AIエージェント向けスキル（SKILL.md）をチームで配布・バージョン管理するためのパッケージマネージャーの現状調査。Microsoft「APM (Agent Package Manager)」と Vercel Labs「skills (npx skills)」を中心に、機能対比・運用モデルの違い・選定観点を整理

## TL;DR

- **「package.json のようにスキルの配布元とバージョンを管理ファイルでリポジトリ管理し、メンバーが install で再現する」というワークフローは既に実現されている**。最も忠実に実装しているのは Microsoft の **APM**（`apm.yml` + `apm.lock.yaml` + `apm install`）。
- **APM は「npm 型」、skills は「ベンダリング型」**。APM はマニフェスト+ロックファイルで宣言的に管理し複数エージェントへコンパイル展開する。skills はスキルファイル実体をプロジェクトにコピーして Git にコミットする。
- APM はスキルだけでなく **instructions / prompts / agents / hooks / MCP サーバーまで単一の `apm.yml` で管理**できる。skills はスキル（SKILL.md）専用。
- エコシステムの広さでは skills が先行: **対応エージェント 73+**（APM は 8）、公開カタログ **skills.sh** が存在し、Supabase など公式導入手順に `npx skills add` を採用するベンダーも出てきている。
- **再現性・ガバナンス重視のチーム開発なら APM、手軽さと流通の広さなら skills**。SKILL.md 形式自体は両者共通のため、スキル資産は可搬でツール乗り換えコストは低い。

---

## 1. 背景: エージェントスキル管理の課題

Claude Code / Codex / Cursor 等のコーディングエージェントでは、再利用可能な指示パッケージ「スキル」（YAML フロントマター付き Markdown = `SKILL.md`）が事実上の標準形式になりつつある。一方で、チーム運用には次の課題があった。

- スキルの**配布元とバージョンをコードとして管理**できない（各自が手動コピー）
- メンバー間・エージェント間で**同じスキルセットを再現**する仕組みがない
- Claude Code / Codex 等、**エージェントごとに配置ディレクトリが異なる**

npm における `package.json` + `package-lock.json` + `npm install` に相当するワークフローが求められており、2025〜2026 年にかけて複数のツールが登場した。

## 2. 主要ツールの概観

| ツール | 開発元 | モデル | 特徴 |
| --- | --- | --- | --- |
| **APM (Agent Package Manager)** | Microsoft | マニフェスト+ロック（npm 型） | `apm.yml` で全プリミティブを宣言、`apm install` で再現 |
| **skills (npx skills)** | Vercel Labs | ファイルコピー+Git コミット（ベンダリング型） | skills.sh カタログ、73+ エージェント対応 |
| paks | stakpak | パッケージマネージャー型 | AgentSkills 標準（SKILL.md）向け、semver 対応 |
| Claude Code プラグイン機構 | Anthropic | ネイティブ機能 | `.claude/settings.json` でマーケットプレイス+プラグインを宣言（Claude Code 専用） |

以下、本命の 2 つ（APM / skills）を詳細に比較する。

## 3. 機能対比

| 機能 | APM | skills CLI |
| --- | --- | --- |
| マニフェスト | ✅ `apm.yml` に依存を宣言 | ❌ なし（インストール結果のファイル自体をコミット） |
| ロックファイル | ✅ `apm.lock.yaml`（整合性ハッシュ付き） | ❌ なし |
| バージョン固定 | ✅ `#タグ` / `ref:`（タグ・ブランチ・SHA） | ❌ 明示機能なし（コミットされたファイルが事実上のスナップショット） |
| 推移的依存解決 | ✅ npm / pip と同様 | ❌ なし |
| 管理対象 | skills / instructions / prompts / agents / hooks / commands / MCP サーバー | skills（SKILL.md）のみ |
| 対応エージェント | 8（Copilot / Claude / Cursor / Codex / Gemini / Windsurf / Kiro / OpenCode） | 73+（Claude Code / Codex / Cursor / Cline / Copilot ほか） |
| 配布元 | 任意の Git ホスト（GitHub / GitLab / Bitbucket / Azure DevOps / Gitea 等） | GitHub リポジトリ中心 |
| 発見手段 | Git リポジトリ直接参照（中央レジストリなし） | **skills.sh**（公開カタログ+インストール数ランキング） |
| 更新 | `apm install` で lock に従い再現、ref 更新で明示的アップグレード | `npx skills update` で最新版に一括更新 |
| セキュリティ機構 | `apm audit` + インストール時スキャン | 人気度テレメトリのみ（CI では自動無効化） |
| 一時利用 | ❌ | ✅ `npx skills use`（インストールせず利用） |
| スキル作成支援 | `apm pack`（バンドル化） | `npx skills init`（SKILL.md テンプレート生成） |
| スコープ | プロジェクト単位（`apm_modules/` + 各エージェントディレクトリへ展開） | プロジェクト（既定）/ グローバル（`-g`、`~/<agent>/skills/`） |

### 3.1 APM の依存指定形式

```yaml
# apm.yml
name: your-project
version: 1.0.0
dependencies:
  apm:
    - anthropics/skills/skills/frontend-design          # GitHub 短縮形（owner/repo/パス）
    - microsoft/apm-sample-package#v1.0.0               # #タグでバージョン固定
    - gitlab.com/acme/repo#v2.0                          # GitHub 以外は FQDN を明示
    - git: https://code.acme.com/platform/standards.git  # セルフホストはオブジェクト形式
      type: gitlab
      path: skills/example
      ref: v1.0.0
  mcp:
    - name: io.github.github/github-mcp-server
      transport: http
```

ホスト判定は「**短縮形（owner/repo）は GitHub 既定、それ以外は URL に書かれたホストをそのまま使う**」の 2 段構え。中央レジストリは存在せず、識別子自体に配布元情報が埋め込まれる Go modules に近い設計。

CLI からの追加は次の 1 コマンドで、`apm.yml` に自動追記される。

```bash
apm install anthropics/skills/skills/frontend-design
```

### 3.2 APM のマルチエージェント展開（コンパイル）

`apm install` はターゲットエージェントごとにファイルを変換・配置する。Codex を含む主要エージェントに **1 つの `apm.yml` から同時展開**できる。

| ターゲット | 配置先 | 対応プリミティブ |
| --- | --- | --- |
| claude | `.claude/` | instructions, agents, skills, commands, hooks, mcp |
| codex | `.codex/` + `.agents/` | agents, skills, hooks, mcp（instructions は `AGENTS.md` にコンパイル。prompts / commands 非対応） |
| copilot | `.github/` | instructions, prompts, agents, skills, hooks, mcp |
| cursor | `.cursor/` | instructions, agents, skills, commands, hooks, mcp |

スキルは `.agents/skills/<name>/SKILL.md` という「ハーネス中立」ディレクトリにも配置される。

### 3.3 skills CLI の使い方

```bash
npx skills add vercel-labs/agent-skills --skill frontend-design  # 特定スキルを追加
npx skills add owner/repo --all                                   # リポジトリの全スキル
npx skills find <keyword>                                         # skills.sh から検索
npx skills update                                                  # 一括更新
```

スキル実体が `./.claude/skills/` 等（エージェントごと）にコピーされ、**それを Git にコミットして共有する**のが想定ワークフロー。clone すれば追加セットアップなしで即使える。

## 4. 運用モデルの違い

### 4.1 ワークフロー比較

**APM（npm 型）**

1. リード役が `apm.yml` に依存を宣言し、manifest + lock をコミット
2. メンバーは clone 後に `apm install` を実行
3. lock に従い全員のローカルに同一ツリーを再現
4. 更新は ref の変更 → lock 差分が PR レビューに現れる

**skills（ベンダリング型）**

1. 誰かが `npx skills add owner/repo` を実行
2. SKILL.md 群がプロジェクト内に実体コピーされる
3. それを Git にコミットして共有 — clone すれば即使える
4. 更新は `npx skills update` → ファイル差分をコミット

### 4.2 運用上の含意

- **clone 後のセットアップ**: skills は不要（ファイルが既にある）。APM は `apm install` が必要で、CI やオンボーディング手順に 1 ステップ増える。
- **出所の追跡（プロベナンス）**: APM はマニフェストに「どこから・どのバージョンか」が常に残る。skills はコピーされた時点で出所情報が薄れ、ローカル改変と上流の区別がつきにくい。
- **リポジトリの見た目**: skills はエージェントごとにスキル実体が複製されるため、複数エージェント併用時は同内容のファイルが並ぶ。APM は成果物を生成するので `.gitignore` 運用も選べる。
- **スキル以外の資産**: MCP サーバー設定・エージェント定義・hooks まで一元管理したいなら APM 一択。

## 5. 考察

### 5.1 「ロックファイルがない」は skills の弱点とは言い切れない

ベンダリング型では**コミットされたファイル自体がロックファイルの役割**を果たすため、再現性がないわけではない。本当の差は**更新時の体験**に出る。APM は lock の差分で「何がどのバージョンからどこへ上がったか」が構造的に見えるのに対し、skills はプロンプト本文の生 diff を読むことになる。ただしスキルは実行コードではなく指示文なので、**生 diff レビューのほうがむしろ監査しやすい**という見方も成り立つ。

### 5.2 セキュリティ面の非対称

スキルはエージェントに読み込ませる指示文であり、**プロンプトインジェクションの持ち込み口**になり得る。APM が `apm audit` とインストール時スキャンを備えるのは企業利用を見据えた設計。一方 skills.sh のランキングはインストール数テレメトリ由来で、**人気度は安全性を担保しない**。どちらを使うにせよ「サードパーティスキルは中身を読んでから入れる」運用ルールが必要。実体ファイルが必ずリポジトリに入る skills のほうが「読まざるを得ない」分だけ健全になりやすい、という逆説もある。

### 5.3 エコシステムの重心は skills 側にある

対応エージェント数（73+ vs 8）と skills.sh というカタログの存在で、**発見と配布のネットワーク効果は skills が先行**している。Supabase など、公式ドキュメントで `npx skills add` をインストール手段として案内するベンダーも登場した。APM は「管理の厳密さ」、skills は「流通の広さ」で勝負しており、直接の競合というよりレイヤーが半分ずれている。APM は GitHub 上の任意のスキルリポジトリを依存として取り込めるため、**「skills.sh で発見して APM で管理する」併用**は現実的な選択肢。

### 5.4 標準化はまだ途上、ただし乗り換えコストは低い

SKILL.md（YAML フロントマター + Markdown）という形式自体は両者で共通しており、事実上の標準になりつつある。配置先はエージェントごとにバラバラで、APM の `.agents/skills/`（ハーネス中立ディレクトリ）のような統一置き場が業界標準になるかは流動的。**どちらを選んでもスキル資産自体は可搬**なので、ツール選定をやり直すコストは低い。

## 6. 選定ガイド

| 状況 | 推奨 | 理由 |
| --- | --- | --- |
| チームでバージョンを厳密に統制したい | APM | manifest + lock + ref 固定。lock 差分が PR レビューに乗る |
| MCP・hooks・エージェント定義まで一元管理したい | APM | skills CLI はスキル専用 |
| 社内 GitLab / セルフホスト Git から配布したい | APM | 任意 Git ホスト対応（`type: gitlab` 等） |
| とにかく手軽に始めたい・個人利用 | skills | `npx` だけで完結、clone 後のセットアップ不要 |
| マイナーなエージェントも併用している | skills | 対応 73+ エージェントで圧倒的に広い |
| コミュニティのスキルを探したい | skills | skills.sh カタログ + `find` コマンド |

> **注**: 両ツールとも 2025〜2026 年に登場した若いツールで、仕様変更の頻度が高い段階にある。本レポートは 2026-07-15 時点の公式ドキュメント・README に基づく。

---

## 参考リンク

- [microsoft/apm — GitHub](https://github.com/microsoft/apm)
- [APM 公式ドキュメント](https://microsoft.github.io/apm/)
- [APM Targets matrix（対応エージェントと配置先）](https://microsoft.github.io/apm/reference/targets-matrix/)
- [APM Manage dependencies（依存指定形式）](https://microsoft.github.io/apm/consumer/manage-dependencies/)
- [APM Quickstart](https://microsoft.github.io/apm/quickstart/)
- [vercel-labs/skills — GitHub](https://github.com/vercel-labs/skills)
- [Introducing skills, the open agent skills ecosystem — Vercel changelog](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)
- [Agent skills explained: An FAQ — Vercel blog](https://vercel.com/blog/agent-skills-explained-an-faq)
- [skills.sh — スキルカタログ](https://www.skills.sh/)
- [stakpak/paks — GitHub](https://github.com/stakpak/paks)
- [Agent Package Manager (APM): A DevOps Guide to Reproducible AI Agents — DEV Community](https://dev.to/pwd9000/agent-package-manager-apm-a-devops-guide-to-reproducible-ai-agents-4c25)
