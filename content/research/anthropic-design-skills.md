---
title: "Anthropic のデザイン系スキル 技術調査レポート — frontend-design の中身と変遷、design プラグイン、Claude Design との関係"
---

> 発行日: 2026-11-10
> テーマ: Anthropic が公開しているデザイン系の Agent Skills を整理する。中心は Claude Code の公式プラグインとして配られている `frontend-design` スキルで、どこで配られているか、SKILL.md に何が書かれているか、2025-11 の初版から 2026-09 の改訂までに何が変わったか、どう呼び出し、どう調整するかを一次情報で追う。あわせて anthropics/skills のほかのデザイン系スキル、Cowork 向けの `design` プラグイン、2026-04 に出た製品 Claude Design との関係、限界と使い方を整理する。frontend-design を中心にするのは、Anthropic がデザインの品質を上げる目的で発表記事を出し、版を重ねて改訂しているスキルがこれだけだからである。スキル配布ツールの比較は [AIエージェント向けスキル管理ツール レポート](/content/research/ai-agent-skill-management) を参照
> 一次情報: [Claude Blog: Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)（2025-11-12）、[anthropics/skills: skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)、[anthropics/claude-plugins-official: plugins/frontend-design](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design)、[anthropics/skills PR #98](https://github.com/anthropics/skills/pull/98)・[#1293](https://github.com/anthropics/skills/pull/1293)・[#1713](https://github.com/anthropics/skills/pull/1713)、[Claude Cookbooks: Prompting for frontend aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)、[anthropics/knowledge-work-plugins: design](https://github.com/anthropics/knowledge-work-plugins/tree/main/design)、[Claude Docs: Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)、[Claude Code Docs: Skills](https://code.claude.com/docs/en/skills)、[Anthropic: Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)（2026-04-17）

## TL;DR

- Anthropic が公開しているデザイン関連のスキルは 3 系統に分けられる。**(1) コードで UI を作るときの美的判断を導く `frontend-design`**、**(2) anthropics/skills にあるそのほかのサンプルスキル**（画像・アート・テーマ・アーティファクト構築）、**(3) デザイナの業務（デザインレビュー、デザインシステム、ハンドオフ、アクセシビリティ、UX コピー、ユーザリサーチ）を支援する Cowork 向けの `design` プラグイン**。製品の Claude Design はスキルではなく別の製品で、一次情報の範囲では両者を結びつける記述は見つからなかった。
- `frontend-design` の狙いは「分布の収束」への対処。指示がないとモデルは学習データの中心にある無難な選択（Inter、白地に紫のグラデーション、控えめなアニメーション）に寄る。この対処のための指示をシステムプロンプトに常駐させず、**フロントエンドの作業のときだけ読み込まれるスキル**にしたのが設計の要点。
- SKILL.md には 3 つの版がある。2025-11 の初版（約 560 語）は「大胆に、Inter や紫のグラデーションを避けよ」という禁止リスト型だった。2026-06（約 1,340 語）と 2026-09（約 1,520 語、現行）の全面改稿で、**「題材に根ざす → 計画 → 照合（ありきたりになっていないか見直す） → 実装 → 自己批評」という手順型**に変わった。
- 現行版は AI 生成デザインに今よく出る特徴を 5 つ具体的に挙げる。クリーム地に高コントラストのセリフ体とテラコッタのアクセント、ほぼ黒の地に酸性グリーン 1 色、ブロードシート風、同じ角丸カードを並べる SaaS 風、全大文字のアイブロウ（見出しの上の小さなラベル）や `→` 付きリンクといった定型の装飾、の 5 つ。1 つ目のアクセント色 `#D97757` は Anthropic 自身の Claude 用アクセント色なので、ユーザの案件に出ると AI 製の印になる、と SKILL.md に書かれている。
- 避ける見た目は第 2 版の 3 種から第 3 版で 5 種に増えた。避けた先で別の定番に収束する問題（発表記事自身が Space Grotesk の例で認めている）は、改訂後も続いていると読める。効果を数値で示した公式の評価は見つからなかった（記事の before / after もスクリーンショットだけ）。
- 導入は Claude Code なら `/plugin install frontend-design@claude-plugins-official`。claude.ai の有料プランでは、サンプルスキルとして最初から使える。

---

## 1. 対象の整理: 3 系統と 1 製品

| 系統 | 中身 | 配布元 | 主な利用先 |
| --- | --- | --- | --- |
| **frontend-design** | コードで UI を作るときの美的判断（書体、配色、レイアウト、モーション、コピー） | anthropics/skills、anthropics/claude-plugins-official | Claude Code、claude.ai、API |
| **anthropics/skills のそのほかのサンプルスキル** | canvas-design、algorithmic-art、brand-guidelines、theme-factory（画像・アート・テーマ）と web-artifacts-builder（アーティファクト構築） | anthropics/skills | claude.ai、Claude Code |
| **design プラグイン** | デザインレビュー、デザインシステム、ハンドオフ仕様、アクセシビリティ監査、UX コピー、ユーザリサーチ、リサーチの統合（7 スキル + MCP コネクタ） | anthropics/knowledge-work-plugins | Cowork（Claude Code でも動く） |
| （参考）**Claude Design** | デザイン・プロトタイプ・スライドを作る製品。スキルではない | Anthropic Labs | claude.ai の会話、Claude Code |

Agent Skills は 2025-10-16 に発表された仕組みで、`SKILL.md`（YAML フロントマター付き Markdown）と付属ファイルをフォルダにまとめたもの。2025-12-18 に [agentskills.io](https://agentskills.io) でオープン標準として公開され、2026-10-22 には Linux Foundation 傘下の Agentic AI Foundation への寄贈が発表された（[Anthropic News](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation)）。以下で扱うスキルはどれもこの形式で、ほかのエージェントにも持ち運べる。

## 2. 背景: なぜスキルにしたのか

### 2.1 分布の収束（distributional convergence）

`frontend-design` の発表記事 [Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)（2025-11-12、Applied AI チームの Prithvi Rajasekaran、Justin Wei、Alexander Bricken ほか）は、問題を次のように説明している。

- 何も指示しないとフロントエンドは「ほぼ必ず Inter フォント、白地に紫のグラデーション、最小限のアニメーション」になる。
- 理由はサンプリングの性質にある。誰にも嫌われない無難なデザインが Web の学習データの大半を占めるので、指示がなければモデルは「確率の高い中心」から選ぶ。
- 一方でモデルは誘導に素直に従う。「Inter と Roboto を避けて」「単色ではなく雰囲気のある背景を」と言うだけで結果はすぐに良くなる。

### 2.2 システムプロンプトではなくスキルにする理由

記事はデザインの指示をシステムプロンプトに常駐させると、Python のデバッグやメール作成など無関係な依頼にもデザインの文脈が乗ることを問題にしている。スキルなら、普段は名前と説明文（約 100 トークン）だけがコンテキストに載り、フロントエンドの作業と判断されたときに SKILL.md の本文が読み込まれる。これは Agent Skills の段階的な開示（progressive disclosure）の設計そのもの。

| 段階 | 読み込まれるもの | タイミング | 目安の量（公式ドキュメント） |
| --- | --- | --- | --- |
| 1 | フロントマターの `name` と `description` | 常に | 1 スキルあたり約 100 トークン |
| 2 | SKILL.md の本文 | スキルが発動したとき | 5,000 トークン未満 |
| 3 | 付属ファイル・スクリプト | 必要になったとき | 読むまで 0（スクリプトは出力だけが入る） |

出典: [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)。

記事の時点のプロンプト（`<frontend_aesthetics>`）は約 400 トークンで、「コンテキストを膨らませずに読み込める小ささ」を意図していた。現行の SKILL.md は英語で約 1,520 語あり、語数から推定すると約 2,000 トークンになる。記事が意図した小ささからは離れたが、段階 2 の目安（5,000 トークン未満）には収まる。

### 2.3 指示の抽象度（altitude）

記事のもう 1 つの主張は指示を**適切な高さ**（altitude）で書くこと。正確な 16 進カラーコードを書き込むような低すぎる指示と、共有された前提に頼る曖昧な高すぎる指示の両極を避ける。その中間として、フロントエンドエンジニアが考える軸、つまり書体、配色とテーマ、モーション、背景ごとに、避けるべき既定値と代わりの方向を示す。書体の指示例（`<use_interesting_fonts>`）では、Inter、Roboto、Open Sans、Lato、システムフォントを禁止し、ウェイトは 400 対 600 ではなく 100/200 対 800/900、サイズの差は 1.5 倍ではなく 3 倍以上という極端な対比を勧めている。

記事は自分で限界にも触れている。避ける対象を明示しても、モデルは次の定番（たとえば Space Grotesk）に収束しうる。ただし同じ記事の `<use_interesting_fonts>` はコード風の書体の候補として Space Grotesk を勧めている。この「新しい局所解」の問題は後の改訂でも中心の課題になる（5.2 節、10 章）。

前身として、2025-10-21 に Claude Cookbooks へ [prompting_for_frontend_aesthetics.ipynb](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb) が追加されている。プラグインの README は詳しい解説としてこのノートブックを案内している。

## 3. frontend-design の配布場所と導入

### 3.1 配布場所

2026-11-10 時点の状態。

| 場所 | 状態 |
| --- | --- |
| [anthropics/skills `skills/frontend-design/`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | 2025-11-12 に PR #98 で追加、2025-12-01 に `skills/` 配下へ移動。`example-skills` プラグイン（マーケットプレイス名 `anthropic-agent-skills`）に含まれる |
| [anthropics/claude-plugins-official `plugins/frontend-design/`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) | Claude Code の公式マーケットプレイス。プラグインのバージョンは 1.1.1。SKILL.md は anthropics/skills の版と同じ内容 |
| anthropics/claude-code `plugins/frontend-design/` | 2025-11-12 に追加され、2026-10-26 のコミット 10a5141 で削除。プラグイン ID `frontend-design@claude-plugins-official` はそのまま使える |

anthropics/claude-code 側のファイルは削除されたので、古い記事のリンクは切れていることが多い。今は claude-plugins-official を参照する。

ライセンスは Apache License 2.0（anthropics/skills では `LICENSE.txt`、claude-plugins-official では `LICENSE`）。`plugin.json` の author は「Anthropic」で、プラグインの README は作者として Prithvi Rajasekaran と Alexander Bricken を挙げている。この README は更新されておらず、「大胆な美的選択」「インパクトのあるアニメーション」という初版の頃の説明のままで、現行の SKILL.md とは方向が合っていない。

### 3.2 導入方法

Claude Code では、公式マーケットプレイス `claude-plugins-official` は対話セッションの初回起動時に自動で追加される（[Discover plugins](https://code.claude.com/docs/en/discover-plugins)）。以下の `/plugin` はセッションの中で打つコマンドで、シェルからは `claude plugin install …` の形でも同じことができる。

```bash
# 公式マーケットプレイスから（推奨）
/plugin install frontend-design@claude-plugins-official

# anthropics/skills のサンプル集ごと入れる場合
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

claude.ai では、サンプルスキルは有料プランで最初から使える（[anthropics/skills README](https://github.com/anthropics/skills)）。API では、コード実行ツールと組み合わせて `container` の `skills` に指定する。Skills API はベータを終えており、以前のベータヘッダ `anthropic-beta: skills-2025-10-02` は無くても動く（付ければ旧形式の応答になる）（[Skills guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)）。自作スキルは利用面（claude.ai、Claude Code、API）の間で同期されない点に注意する。

### 3.3 発動・呼び出し・調整（Claude Code）

出典は [Claude Code Docs: Skills](https://code.claude.com/docs/en/skills)。

- **自動の発動**: Claude は `description` を見て、関係のある作業でスキルを読み込む。現行の `description` は「新しい UI を作るとき、または既存の UI を作り直すとき」なので、小さな修正では読み込まれないことがある。
- **明示的な呼び出し**: プラグインのスキルは `/プラグイン名:スキル名` で呼べる。frontend-design なら `/frontend-design:frontend-design` をメッセージの先頭に書く。文の途中に名前を書いただけでは直接は実行されない。
- **コンテキストに残る量**: 読み込まれた SKILL.md の本文は 1 つのメッセージとして会話に入り、以後のターンにも残る。説明文はスキルを使わないターンでも毎回コンテキストに載る。
- **複製して調整する**: Apache-2.0 なので、SKILL.md をプロジェクトの `.claude/skills/<名前>/` に複製して書き換えられる。プラグインのスキルは `プラグイン名:` の名前空間が付くので、同じ名前の自作スキルを置いても上書きにはならず、両方が読み込まれる。複製を使うなら、プラグインを無効にするか、名前を変えて使い分ける。版を固定したいときも、この複製をリポジトリで管理するのが確実。

## 4. 現行の SKILL.md（2026-09 版）の中身

フロントマターの `description` は「新しい UI を作るとき、または既存の UI を作り直すときに、意図のある独自のビジュアルデザインを導く。美的な方向付け、タイポグラフィ、テンプレートの既定値に見えない選択を助ける」という趣旨。SKILL.md の本文は冒頭の役割設定と 5 つの節でできている。以下の見出しの括弧内は SKILL.md の節名。

### 4.1 役割の設定（冒頭）

「どのクライアントにも他と取り違えられない独自のビジュアルアイデンティティを与えることで知られるデザインスタジオのデザインリード」として振る舞わせる。このクライアントはありきたりな提案を既に断っている、という設定まで付け、配色・書体・レイアウトについて案件固有の判断をさせる。

### 4.2 題材に根ざす（Ground your designs in the subject matter）

依頼文に題材が書かれていなければ、具体的な題材、想定読者、ページの主な役割を自分で仮に決め、ユーザ（設定上のクライアント）に確認する。確認の答えを待ってから進むのか、仮の案で進めるのかは SKILL.md には書かれていない。独自の選択の源は題材の業界、素材、言葉づかいにある。8〜11 歳の女の子向けの玩具と金融アナリスト向けのダッシュボードでは、見た目がまったく違うはず、という例が添えられている。

### 4.3 デザイン原則（Design principles）

- **ヒーロー**: 題材の世界で最も特徴的なものを、最も合う形式（見出し、画像、アニメーション、ライブデモなど）で冒頭に置く。「大きな数字と小さなラベル、補足の統計、グラデーションのアクセント」は既定値なので、本当に最善なときだけ使う。
- **タイポグラフィ**: ページの個性を担う。書体は 1〜2 ファミリーにとどめ、2 つ使うならはっきり違うものにする。『The Elements of Typographic Style』に沿った文字サイズの段階を作る。行長は 80 文字未満を既定にし、セリフ体の本文は少し行間を広げる。
- **AI 製の印**として次を避ける: 見出しの 1 語だけを斜体・太字・別の色にする、ラベルを全大文字にする、内容の上に不要なラベルを置く。
- **構造は情報**: 枠線、番号、アイブロウ、区切り線は内容の構造を表すために使い、飾りには使わない。`01 / 02 / 03` の番号は、内容が本当に順序を持つとき（手順やタイムライン）だけ使う。
- **モーション**: ユーザが操作していないのに動くものは控えめにする。ページ読み込み時の演出か、表示時の演出を 1 か所に絞るほうが効く。各セクションのフェードとスライドアップ、全カードのホバー演出は AI 製に見える既定値。開く・展開する・確定するなど、操作への応答として変化を示す動きは歓迎する。

### 4.4 計画 → 照合 → 実装 → 自己批評（Process: plan, review against the brief, build, critique）

まず「AI 生成デザインが今集まりがちな特徴」を 5 つ挙げて基準にする。

1. 温かいクリーム色の背景（`#F4F1EA` 付近）、高コントラストのセリフ体の見出し、テラコッタや土色のアクセント（`#D97757` 付近が多い）。この色は Anthropic 自身の Claude 用アクセント色なので、ユーザの案件に出ると AI 製の印になる、と明記している。
2. ほぼ黒の背景に、明るい酸性グリーンかバーミリオンのアクセント 1 色。
3. 細い罫線、角丸なし、新聞のように詰まった段組みのブロードシート風。
4. SaaS のカード一式。内容を同じ角丸カードに刻み、階層に関係なく同じ角丸半径、同じ薄い灰色の影（`rgba(0,0,0,.1)`）、装飾としてのグラデーション。
5. 題材に関係なく現れる定型の装飾。見出しごとの字間を広げた全大文字アイブロウ、中黒でつないだメタ情報（`A · B · C`）、`WORD — fragment` 形式のラベル、黒の代わりの色付きのほぼ黒（`#0B0B0B`、`#111`）、小さなデータラベルの等幅フォント、リンクやボタンの末尾の `→`。

どれも案件によっては正当な選択だが、題材に関係なく現れる**既定値であって選択ではない**、という位置づけ。依頼文が見た目を指定しているときは、これらの見た目であっても依頼文の言葉を常に優先する。自由に決めてよい軸だけ、これらの既定値に使わない。

そのうえで、実装の前に計画と照合の 2 段階を踏む（実装後の自己批評は 4.5）。

1. **計画**: 小さなトークン体系を作る。配色は名前付きの 16 進値 4〜6 個、書体はその役割、レイアウトは 1 文の説明と ASCII のワイヤーフレームで複数案を比べる（左揃え・中央揃え・両端揃えの方針も含める）、原則はこのページを独自にする方針。
2. **照合**: 実装前に計画を依頼文と照らす。似た依頼でも同じ案に行き着く部分、つまりありきたりな既定値に見える部分は直し、何をなぜ変えたかを書く。そのあとで実装に入る。

実装上の注意として、`.section` のような型ベースのセレクタと `.cta` のような要素ベースのセレクタの詳細度がぶつかり、セクション間の余白が打ち消し合う問題を挙げている。

### 4.5 抑制と自己批評（Restraint and self-critique）

- 大胆さは 1 か所に使う。記憶に残る要素を 1 つにし、周りは静かに保ち、依頼に役立たない装飾は削る。
- 品質の下限を、わざわざ言わずに満たす。モバイルまでのレスポンシブ、キーボードフォーカスの可視化、`prefers-reduced-motion` の尊重、視覚的なアクセシビリティ、調和した配色。
- 環境が許せばスクリーンショットを撮って自己批評する。「出かける前に鏡を見て、アクセサリーを 1 つ外す」というシャネルの助言を引いている。
- 人間の制作者は記憶を持ち、毎回新しいことを試す。試したことをメモできる場所があれば、次の作業に役立つ。

### 4.6 デザインの中のコピー（More on writing in design）

コピーもデザインの一部として扱う。

- エンドユーザの視点で、システムの作りではなく利用者が分かる言葉で名付ける（「webhook 設定」ではなく「通知の管理」）。
- 能動態を既定にし、CTA は押すと何が起きるかを書く（「Submit」ではなく「Save changes」）。操作の名前はフローを通して揃える（「Publish」ボタンの結果のトーストは「Published」）。
- エラーは謝らず、何が起きたかと直し方を具体的に書く。空の画面は行動への誘いとして扱う。

## 5. 版の変遷

| 日付 | 版 | 語数 | 主な変更 | 出典 |
| --- | --- | --- | --- | --- |
| 2025-10-21 | 前身 | — | Cookbook のノートブック | claude-cookbooks |
| 2025-11-12 | 初版 | 約 560 | 公開 | anthropics/skills PR #98 |
| 2025-12-04 | 初版の修正 | 約 580 | `description` に用途（アーティファクト、ポスター、ランディングページ、ダッシュボード、React コンポーネントなど）を追記 | anthropics/skills PR #134 |
| 2026-06-09 | 第 2 版 | 約 1,340 | 全面改稿。手順型に転換し、避ける見た目 3 種と Signature 項目を導入 | anthropics/skills PR #1293。claude-plugins-official は 06-15（PR #2540）、claude-code は 06-18（PR #69226、プラグイン 1.1.0） |
| 2026-09-01〜03 | 第 3 版（現行） | 約 1,520 | 役割をデザインリードに設定。避ける見た目を 3 種から 5 種に増やし `#D97757` を明記。題材の確認手順と、行長・書体数・ラベルの規則を追加。Signature 項目を削除 | claude-plugins-official コミット 44490cc（09-01）、anthropics/skills PR #1713（09-03） |

語数は各コミット時点の SKILL.md を `wc -w` で数えた値。

### 5.1 初版: 禁止リストと「大胆さ」

初版の構成は「Design Thinking」と「Frontend Aesthetics Guidelines」の 2 節だった。

- 目的、トーン、制約、差別化を先に考える。トーンは「極端なものを選べ」として、徹底したミニマル、マキシマリスト、レトロフューチャー、ブルータリストなどを例示する。
- 書体（Arial や Inter を避け、個性的な見出し用書体と洗練された本文用書体を組む）、配色（CSS 変数、支配的な色と鋭いアクセント）、モーション（CSS で、React なら Motion ライブラリで、読み込み時の演出は段階的に）、空間構成（非対称、重なり、斜めの流れ）、背景（グラデーションメッシュ、ノイズ、グレイン）の 5 項目。
- 「Inter、Roboto、Arial、システムフォント、特に白地に紫のグラデーション、予測できるレイアウトを決して使うな」「Space Grotesk のような定番に世代をまたいで収束するな」と禁止を並べる。
- 最後に「Claude は並外れた創作ができる。出し惜しみするな」と励ます。

### 5.2 初版と現行版の比較

2026 年の 2 回の改稿で、方向がはっきり変わった。

| 観点 | 初版（2025-11） | 現行（2026-09） |
| --- | --- | --- |
| 基本姿勢 | 極端なトーンを選べ、出し惜しみするな | 題材に根ざし、大胆さは 1 か所に |
| 避ける対象 | 特定の書体名と配色（Inter、Roboto、紫のグラデーション） | AI 生成デザインに今よく出る見た目 5 種と装飾の型 |
| 進め方 | 方向を決めて実装 | 計画 → 照合 → 実装 → 自己批評 |
| モーション | 読み込み時の段階的な演出、スクロールとホバーで驚かせる | 自動の動きは控えめに、操作への応答を優先 |
| 依頼文との関係 | 記述なし | 依頼文の指定が常に優先 |
| アクセシビリティ | 制約の 1 つとして言及 | 品質の下限として明記 |
| コピー | 記述なし | 独立した節 |

初版が勧めていた演出のうち、全体へのホバー演出は現行版で避ける側に入っている（4.3 のモーション）。初版が背景に勧めていたグラデーションも、現行版では SaaS 風の特徴の 1 つ「装飾としてのグラデーション」として挙がっている（4.4 の 4 番目）。

第 2 版（2026-06）は現行版への途中の形にあたる。避ける見た目はクリーム地とテラコッタ、ほぼ黒と酸性グリーン、ブロードシート風の 3 種で、クリーム地の項目にはまだ `#D97757` の記述がなかった。トークンには「Signature（このページが記憶される唯一の要素）」の項目があり、「計画と反復はなるべく思考の中で行い、喜ばれる確信が高まってから見せる」という指示もあった。第 3 版でこの 2 つは消え、代わりに題材をクライアントに確認する手順と、行長・書体数・ラベルの扱いなどの具体的な規則が入った。

PR #1713 の説明は「各依頼に独自のビジュアルアイデンティティを与えるデザインリードとして作業を捉える。依頼がない限り避けるべきよくある既定の見た目を挙げる。配色・書体・レイアウトで意図的な選択を求める」。第 2 版の PR #1293 の説明は「frontend-design スキルのいくつかの改善」だけで、どちらの PR にも改稿の根拠となる評価は見つからなかった。

## 6. anthropics/skills のほかのデザイン系スキル

いずれも Apache-2.0。canvas-design、algorithmic-art、brand-guidelines、theme-factory は 2025-10-16 の公開時から含まれている。web-artifacts-builder は当初 `artifacts-builder` という名前で、2025-11-17 に改名された。

| スキル | 内容 | 付属ファイル |
| --- | --- | --- |
| **canvas-design** | 「デザイン哲学」を言語化してから、ポスターやアート作品などの静的な作品を `.png` / `.pdf` で作る | `canvas-fonts/` |
| **algorithmic-art** | p5.js で、シード付きの乱数と対話的なパラメータ調整を使ったジェネラティブアート（フローフィールド、パーティクルなど）を作る | `templates/` |
| **brand-guidelines** | Anthropic の公式ブランドの色と書体を成果物に適用する | — |
| **theme-factory** | 10 種のプリセットテーマ（色と書体）か、その場で作ったテーマをスライドや文書などに適用する | `themes/`、`theme-showcase.pdf` |
| **web-artifacts-builder** | React、Tailwind CSS、shadcn/ui で複数コンポーネントの claude.ai アーティファクトを作り、Parcel で 1 つの HTML にまとめる。単一ファイルの簡単なものは対象外 | `scripts/` |

web-artifacts-builder は frontend-design の発表記事でも紹介されている。見た目の判断（frontend-design）と、複雑なアーティファクトを組み立てる道具（web-artifacts-builder）を組み合わせる想定になっている。brand-guidelines は Anthropic のブランド専用で、主アクセントのオレンジとして `#d97757` を挙げている。自社ブランドに使うなら、これを雛形に同じ形のスキルを自作する。

## 7. design プラグイン（knowledge-work-plugins）

[anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) は職種別のプラグイン集で、`design/` は 2026-02-24 に追加された。同じ日のブログ [Cowork and plugins for teams across the enterprise](https://claude.com/blog/cowork-plugins-across-enterprise) は、新しいプラグインの 1 つとして Design を紹介している。README は「主に Cowork（Anthropic のエージェント型デスクトップアプリ）向けだが、Claude Code でも動く」と書いている。プラグインのバージョンは 1.2.0。

`frontend-design` が作る側の美的判断を扱うのに対し、design プラグインはデザイナの周辺業務を扱う。

| スキル | 内容 |
| --- | --- |
| design-critique | ユーザビリティ、視覚的な階層、一貫性の観点で構造化したデザインレビュー |
| design-system | デザインシステムの監査（命名の揺れ、ハードコードされた値）、文書化、拡張 |
| design-handoff | 開発者向けハンドオフ仕様（レイアウト、デザイントークン、状態、ブレークポイント、エッジケース、アニメーション） |
| accessibility-review | WCAG 2.1 AA の監査（コントラスト、キーボード操作、タッチターゲット、スクリーンリーダ） |
| ux-copy | マイクロコピー、エラーメッセージ、空の状態、CTA の作成とレビュー |
| user-research | インタビューガイド、ユーザビリティテスト、調査設計 |
| research-synthesis | インタビュー記録やアンケートを、テーマ・インサイト・優先順位付きの提案にまとめる |

例として design-critique の SKILL.md は、Figma の URL があれば MCP でデザインを取り込み、なければスクリーンショットか説明を求める。そのうえで「第一印象（2 秒）」「ユーザビリティ」「視覚的な階層」「一貫性」「アクセシビリティ」の 5 観点で評価し、指摘を重大度つきの表で返す。指摘は具体的に書き、理由を原則やユーザのニーズに結びつけ、代案を出し、良い点も挙げる、という書き方の指示もある。frontend-design の自己批評が自分の作ったものを直すためのものなのに対し、design-critique は人が作ったデザインを評価する形式になっている。

- `.mcp.json` に Figma（`https://mcp.figma.com/mcp`）、Slack、Linear、Asana、Atlassian、Notion、Intercom の MCP サーバが登録されている（ほかに URL が空の Google Calendar と Gmail の項目がある）。README の言い方では、単体でも動き、Figma などをつなぐと「強化」される。
- 2026-03-13 にスラッシュコマンドがスキルへ移行した。README はまだ `/critique`・`/handoff` などの旧コマンド名や `ux-writing` などの旧スキル名を載せているので、実際の名前は `skills/` 配下を見て確かめる。

```bash
claude plugin marketplace add anthropics/knowledge-work-plugins
claude plugin install design@knowledge-work-plugins
```

## 8. Claude Design との関係

[Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) は 2026-04-17 に Anthropic Labs のリサーチプレビューとして発表された製品。デザイン、プロトタイプ、スライド、1 枚資料を作り、コードベースやデザインファイルからデザインシステムを組み立て、Claude Code へのハンドオフや Canva・PDF・PPTX・HTML への書き出しができる。2026-09-16 からは通常の会話や Claude Code の中でも使えるようになった（[リリースノート](https://support.claude.com/en/articles/12138966-release-notes)）。単独サイト claude.ai/design は 2026-12-14 に閉じる予定（[移行ガイド](https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-claude)）。Claude Code からは `/design-sync` でデザインシステムを取り込める（[Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)）。

一次情報の範囲では、Claude Design と frontend-design スキルの関係を示す記述は見つからなかった。名前は似ているが別物として扱う。

## 9. 使い方の指針

| 場面 | 向いているもの |
| --- | --- |
| 新しいランディングページや試作を、コードで見栄えよく作りたい | frontend-design |
| 既存のデザインシステムがある製品の画面を作る | frontend-design を使うなら依頼文で規定を明示する。規定どおりかの監査は design プラグインの design-system で行う |
| 人が作ったデザインをレビューしたい、ハンドオフ仕様を作りたい | design プラグイン（design-critique、design-handoff）+ Figma MCP |
| 画面のアクセシビリティを点検したい | design プラグインの accessibility-review |
| ポスターや画像、ジェネラティブアート | canvas-design、algorithmic-art |
| スライドや文書の配色・書体を揃えたい | theme-factory（自社ブランドなら brand-guidelines を雛形に自作） |
| デザインツール上で試作し、コードへ渡したい | Claude Design（スキルではなく製品） |

frontend-design を使うときは、次の点を押さえると効果が出やすい。

- **題材・読者・ページの役割を依頼文に書く**。書いていないと、スキルは自分で仮に決めて確認を求めるので、最初から渡すほうが早い。
- **固定したい軸は依頼文で指定する**。ブランドカラーや書体は、スキルの「避ける既定値」より依頼文が優先されると SKILL.md に書かれている。プロジェクトの CLAUDE.md に書いた規定が同じ扱いになるかは、SKILL.md には書かれていない。確実にしたいなら依頼文に書く。
- **スクリーンショットを撮れる環境で使う**。現行版は自己批評にスクリーンショットを使う前提で書かれている。Claude Code ならブラウザ操作の MCP（Playwright など）を併用する。
- **試したデザインを記録しておく**。SKILL.md は、試したことのメモが次の作業に役立つと書いている。同じプロジェクトで何度も作るなら、採った配色や書体をメモのファイルに残しておくと、同じ案の繰り返しを避けやすい。
- **出力は版の変更で変わりうる**。SKILL.md は初版から約 10 か月で 2 回全面的に書き直されている。結果を安定させたいなら、3.3 の方法で複製してリポジトリで管理する。

## 10. 限界と批判

- **避けた先でまた収束する**: 初版の時点で記事が Space Grotesk の例を挙げており、避ける見た目は第 2 版の 3 種から第 3 版で 5 種に増えた。現行版は「AI 生成デザインが今（right now）集まりがちな特徴」と時点を限って書いている。リストは使う時点のモデルに対する観察で、モデルが変われば古くなりうる（推測）。
- **効果の定量評価が見つからない**: 発表記事の before / after（SaaS のランディングページ、ブログ、管理画面）はスクリーンショットとキャプションだけで、点数や評価の手順は示されていない。改稿の PR にも評価結果は付いていなかった。
- **既存のデザインシステムとの衝突**: スキルは独自の見た目を強く求める。既存のデザインシステムやブランド規定がある製品の画面に適用すると、規定から外れた提案が出うる。現行版は「依頼文の指定が常に優先」と明記しているので、規定は依頼文に書いて渡す。
- **第三者の評価（二次情報）**: このスキルを出発点にした第三者のスキル [Impeccable](https://github.com/pbakaus/impeccable) は、README で同じモデル・同じ依頼（14 室の家族向けゲストハウス）の比較を示している。Impeccable なしでは「クリーム色のページ、細いセリフ体、斜体のアクセント、ピル型ボタン」という無難な既定値になる、という例で、62 個の決定的な規則による検出器を足している。これは 1 つの依頼での比較で、一般的な評価ではない。

## 参考文献

- [Claude Blog: Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)（2025-11-12）
- [Claude Cookbooks: prompting_for_frontend_aesthetics.ipynb](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- [anthropics/skills: skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)（[PR #98](https://github.com/anthropics/skills/pull/98)、[PR #134](https://github.com/anthropics/skills/pull/134)、[PR #1293](https://github.com/anthropics/skills/pull/1293)、[PR #1713](https://github.com/anthropics/skills/pull/1713)）
- [anthropics/claude-plugins-official: plugins/frontend-design](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design)
- [anthropics/claude-code コミット 10a5141](https://github.com/anthropics/claude-code/commit/10a5141d2d12b5a089a5fbb5f24af3fd345a34d2)（2026-10-26）
- [anthropics/knowledge-work-plugins: design](https://github.com/anthropics/knowledge-work-plugins/tree/main/design)
- [Claude Blog: Cowork and plugins for teams across the enterprise](https://claude.com/blog/cowork-plugins-across-enterprise)（2026-02-24）
- [Anthropic Engineering: Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)（2025-10-16）
- [Claude Docs: Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Claude Docs: Skills guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
- [Claude Code Docs: Skills](https://code.claude.com/docs/en/skills)、[Discover plugins](https://code.claude.com/docs/en/discover-plugins)
- [Anthropic News: Donating Agent Skills to the Agentic AI Foundation](https://www.anthropic.com/news/donating-agent-skills-to-the-agentic-ai-foundation)（2026-10-22）
- [Anthropic News: Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)（2026-04-17）
- [Claude Help Center: Release notes](https://support.claude.com/en/articles/12138966-release-notes)、[Move from standalone Claude Design to Claude](https://support.claude.com/en/articles/17440474-move-from-standalone-claude-design-to-claude)、[Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)
- （二次情報）[pbakaus/impeccable](https://github.com/pbakaus/impeccable)
