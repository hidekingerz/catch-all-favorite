---
title: "Graph Engineering（グラフエンジニアリング）調査レポート"
---

> 発行日: 2026-07-27
> テーマ: ループエンジニアリングの「次」として2026年7月中旬に突如バズった「Graph Engineering（グラフエンジニアリング）」の起源・定義・実体を一次情報で検証する。「ループ→グラフ」で何が本当に変わるのか、何がただの改名なのか。
> 出典: [@steipete の X 投稿（2026-07-18）](https://x.com/steipete/status/2078277297791189132)、[Hamel Husain の X Article](https://x.com/HamelHusain/article/2078346425621237935)、[LangChain 公式ブログ（2026-07-22）](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph) ほか

## TL;DR

- **発端は9語のジョーク**。2026-07-18、Peter Steinberger（OpenClaw 作者）が X に「Are we still talking loops or did we shift to graphs yet?（まだループの話してる？それとももうグラフに移った？）」と投稿（[原典](https://x.com/steipete/status/2078277297791189132)、48時間で260万〜290万ビュー）。数時間後に Hamel Husain が X Article「Loop Engineering Is Dead. Enter Graph Engineering」を公開し（[原典](https://x.com/HamelHusain/article/2078346425621237935)）、用語として一気に拡散した。
- **両投稿とも本来は「改名文化への皮肉」**。Louis Bouchard は「正直に言えば両ツイートともジョークだった。Steinberger は我々が概念を改名する速さを揶揄していた」と明言している（[出典](https://www.louisbouchard.ai/graph-engineering-explained/)）。prompt → context → harness → loop と続いた改名リレーの次のコマ、という自己言及ネタが「本物の新パラダイム」として独り歩きした。
- **中身の定義は概ね収束している**: 「複数の特化エージェント（＝それぞれがループを回すノード）を、エッジ（ルーティング）と共有状態で**有向グラフに配線する**実践」。つまり**ループの代替ではなく合成**。「ループは有向巡回グラフにすぎない」「グラフはループの組織図」であり、"Loop Engineering is dead" は論理的には**包含関係の取り違え**（[SmartScope の論理検証](https://smartscope.blog/en/blog/graph-engineering-loop-engineering-logic-review/)）。
- **技術としては新しくない**。LangChain は7日後に公式ブログ「[3 Years of Graph Engineering with LangGraph](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph)」で「Graph engineering isn't a new idea. It's the latest name for a well established approach」と応答。LangGraph（2024-01〜）、AutoGen GraphFlow、Google ADK、さらに10年来のワークフローエンジン（Airflow 等）が先行実装。
- **ただし便乗デマも大量発生**。「Anthropic エンジニアが Graph Engineering ワークショップ/12ページPDFを公開」「トークンコスト85%減・精度18%向上」「Stanford の310万ドル研究」等のバイラル投稿は、**一次情報が確認できないか、ナレッジグラフ（GraphRAG）の話との意図的な混同**。Turing Post が具体的に反証している（[FOD#159](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it)）。
- **実務的な結論**: 既存レポートの Fleet loop / subagent orchestration に新しい名前が付いただけ、が最も誠実な要約。乗り換え判断の基準は「**1本のループで足りなくなったか**」だけ。足りているなら、グラフはプロンプト・状態スキーマ・新しい故障モードという税金を追加するだけになる。

---

## 1. 用語の起源 — 誰がいつ言い出したか（検証済みタイムライン）

| 日時 (2026) | 出来事 | 一次情報 |
|---|---|---|
| 2025-07 | Geoffrey Huntley が Ralph（Wiggum）loop を公開。bash の while ループでエージェントを回す原型 | [ghuntley.com/ralph](https://ghuntley.com/ralph/) |
| 01-17 | Huntley「everything is a ralph loop」。**グラフへの言及はなし**（"Ralph is monolithic... one task per loop"） | [ghuntley.com/loop](https://ghuntley.com/loop/) |
| 06上旬 | 「loop engineering」という呼び名が普及（Turing Post によれば 06-07 の Addy Osmani のエッセイが契機。※Osmani 原文は本調査では未確認）。本リポジトリの [Single Agent Loop レポート](/content/research/loop/single-agent-loop)（06-17）もこの時期 | [Turing Post FOD#159](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it) |
| **07-18 00:34 UTC** | **Peter Steinberger（@steipete）**「Are we still talking loops or did we shift to graphs yet?」— 9語の投稿が260万〜290万ビュー | [x.com/steipete/status/2078277297791189132](https://x.com/steipete/status/2078277297791189132) |
| 07-18 約4時間後 | **Hamel Husain** が X Article「**Loop Engineering Is Dead. Enter Graph Engineering**」を公開。用語「graph engineering」の実質的な命名点 | [x.com/HamelHusain/article/2078346425621237935](https://x.com/HamelHusain/article/2078346425621237935)（※有料壁のため全文未確認、後述） |
| 07-19 | Santiago Valdarrama（@svpino）「Loop Engineering is dead. Long live Graph Engineering!」等、スローガンが拡散 | [x.com/svpino/status/2078516761318584774](https://x.com/svpino/status/2078516761318584774) |
| 07-19 | Carlos E. Perez（Intuition Machine）が真面目な再解釈記事「From Loop Engineering to Graph Engineering?」を公開 | [Medium](https://medium.com/intuitionmachine/from-loop-engineering-to-graph-engineering-d3ebeb08511c) |
| 07-20〜21 | 検証系記事: Turing Post [FOD#159](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it)、[SmartScope 論理検証](https://smartscope.blog/en/blog/graph-engineering-loop-engineering-logic-review/) | 同左 |
| 07-22 | **LangChain 公式**（Sydney Runkle & Harrison Chase）「[3 Years of Graph Engineering with LangGraph](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph)」で用語を"回収"。Louis Bouchard も[冷静な解説](https://www.louisbouchard.ai/graph-engineering-explained/)を公開 | 同左 |

要点が3つある。

1. **単独の考案者はいない**。Steinberger の投稿は定義ゼロの1行の問いで、方法論は何も提示していない（SmartScope が明示的に確認）。定義を最初に文章化したのは Hamel Husain の X Article で、実務的な意味での「言い出しっぺ」は Husain と言うのが最も正確。
2. **起点は皮肉だった**。Bouchard いわく「両ツイートともジョーク。Steinberger は改名の速さを揶揄していた」（[出典](https://www.louisbouchard.ai/graph-engineering-explained/)）。loop engineering が命名から**約6週間で「死亡宣告」**されたこと自体がネタの核心。
3. **にもかかわらず定着しつつある**。ジョーク発でも、LangChain・Eigent・TrueFoundry 等のベンダーが相次いで「graph engineering」を自社文脈で採用したため、用語としては生き残る公算が高い。

なお「Ralph loop の発展としてのグラフ」という物語は**二次記事側の構図**であり、Huntley 本人は（確認できた範囲で）グラフ化を主張していない。むしろ 01-17 の原典で「Ralph はモノリシック、1ループ1タスク」とループの単純さを擁護している。

---

## 2. 定義 — 収束している中身

各記事の定義はほぼ一致しており、次のように要約できる。

> **Graph engineering** = 複数の特化エージェント・決定的コード・ツール・人間チェックポイント・評価器を**ノード**とし、実行条件・依存関係・状態遷移を**エッジ**として設計し、**共有状態**をその上に流す実践。各エージェントノードの内部でどう実行するかを設計するのが loop engineering、ノード間のトポロジーを設計するのが graph engineering。

- 「Loops made agent behavior programmable. **Graphs make agent organizations programmable.**（ループはエージェントの挙動をプログラマブルにした。グラフはエージェントの組織をプログラマブルにする）」（[explainx](https://explainx.ai/blog/graph-engineering-ai-agents-multi-agent-organizations-2026)）
- 「A loop is a while-loop. **A graph is an org chart of them**... each node in your graph *is* a loop.（グラフはループの組織図。グラフの各ノードがループそのもの）」（[AI Builder Club](https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering)）
- LangChain の定義は最も工学的:「ノードが仕事をし、エッジが遷移を定義するステートマシン。グラフがワークフローと、そこを流れる状態と、ステップ間の遷移を定義する」（[LangChain blog](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph)）

### 異流: Carlos Perez の「改善サイクルのネットワーク」解釈

[Carlos E. Perez](https://medium.com/intuitionmachine/from-loop-engineering-to-graph-engineering-d3ebeb08511c) と [Eigent](https://www.eigent.ai/blog/graph-engineering-ai-agents) は、同じ語を**サイバネティクス寄り**に再解釈している: グラフとは「互いを監視し、制約し、修正し合う改善サイクルのネットワーク」。単独ループの故障モード（Goodhart の法則によるメトリクスゲーミング、ループ同士の相殺 — 「速度のループが徹底性のループを損なう」、測定の劣化）を、**カウンターメトリクス・アンカーメトリクス・凍結ノード（held-out 評価セット）・監査ループ**で相互牽制する設計論だ。Eigent の警句「**A graph without anchors is just a more elaborate echo chamber**（アンカーのないグラフは、手の込んだエコーチェンバーにすぎない）」は、この解釈の核心をよく表す。

つまり現時点で「graph engineering」は最低2つの意味で使われている:

- **(A) オーケストレーション解釈**（多数派）: エージェント群の制御フロー・トポロジー設計 ≒ LangGraph 的世界
- **(B) ガバナンス解釈**（Perez / Eigent）: 評価・監査・メトリクスのループ同士を牽制させる網の設計

さらに **(C) ナレッジグラフとの混同**（GraphRAG・知識グラフメモリの話を「graph engineering」と呼ぶバイラル投稿）が流通しているが、これは (A)(B) とは別物であり、多くが誇大・出典不明（§6）。

---

## 3. ループエンジニアリングとの対比

既存レポート（[Single Agent Loop](/content/research/loop/single-agent-loop) / [20 Loop Design Patterns](/content/research/loop/loop-design-patterns)）の枠組みに接続すると、graph engineering は前レポートで言う **Fleet loop（orchestrator + specialists + subagents）の設計部分を独立した専門領域として命名し直したもの**にあたる。

| | Loop Engineering | Graph Engineering |
|---|---|---|
| 設計対象 | 1エージェントの実行サイクル（discover → plan → execute → verify → iterate） | ノード間のトポロジー（どのノードが存在し、どの遷移を許すか） |
| 単位 | while ループ + 停止条件 | ノード（エージェント/決定的関数/ルーター/人間）+ エッジ + 共有状態 |
| 品質の要 | verifier（VERIFY ゲート）と停止条件 | ルーティングの正しさ、fan-out/fan-in、状態スキーマ、ノード間の牽制 |
| 前レポートとの対応 | Single-agent loop | Fleet loop / subagent orchestration |
| コンテキスト | 1本の長い文脈（劣化と戦う） | ノードごとに**分離されたクリーンな文脈** |
| 故障モード | ドリフト、無限ループ、slop 化 | ループ間の相殺、状態スキーマの破綻、デバッグ困難、コスト爆発 |
| 数学的関係 | **ループ ⊂ グラフ**（ループ=有向巡回グラフ / グラフの1ノード） | グラフ ⊃ 複数ループ |

「ループ→グラフ」で**本当に増える能力**は、[AI Builder Club の整理](https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering)が簡潔で、(1) **並列の特化ノードが各自クリーンな文脈を持てる**、(2) **fan-out / fan-in が第一級の操作になる**、(3) **制御フローが明示的・監査可能（図として読める）** の3点。逆に Bouchard は「何が変わったのか」を「ノードの中身がエージェントになったこと」に求める — 従来のパイプラインのステップは固定ルールに従うが、**エージェントノードはタスクを解釈するため、毎回違う選択をしうる**。だからこそ従来のワークフローエンジン以上に、検証ノード・拒否権・コスト制御をグラフに織り込む必要が出る（[出典](https://www.louisbouchard.ai/graph-engineering-explained/)）。

なお @sairahul1（過去2本のループレポートの起点となった人物）は、この騒動を「**Prompt → Context → Harness → Loop → Graph** の5層」として整理したとされる（各層がモデルから1段ずつ外側の系を設計する）。ただしこの5層投稿の原典 URL は本調査では特定できず、[AI Builder Club](https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering) 経由の**二次情報**である。

---

## 4. 実装・ツール・パターン

用語は2026年7月生まれだが、実装は数年先行している。

### フレームワーク（オーケストレーション解釈 A の実体）

| ツール | 内容 | 備考 |
|---|---|---|
| **LangGraph**（LangChain, 2024-01〜） | StateGraph: ノード・エッジ・共有状態のステートマシン。用語バズに対し「うちは3年前からやっている」と公式応答 | [3 Years of Graph Engineering](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph) |
| **Microsoft AutoGen** | GraphFlow（DiGraph）: 逐次・並列・条件分岐・ループの各フロー | [AI Builder Club の対比記事](https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering)で言及 |
| **Google ADK** | グラフワークフロー、ルーティング、A2A プロトコルでのマルチエージェント委譲 | 同上、[Turing Post](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it) も ADK 2.0 に言及 |
| **Claude Code** | サブエージェント・動的ワークフロー。前レポートの「6部品」の Subagents/Automations がノード・エッジに相当 | [Turing Post](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it)、[Bouchard](https://www.louisbouchard.ai/graph-engineering-explained/) |
| 従来のワークフローエンジン | Airflow 等の DAG エンジンは10年来この図を描いてきた | [Bouchard](https://www.louisbouchard.ai/graph-engineering-explained/) |

### パターン語彙（記事横断で頻出するもの）

- **ノード種別**: 特化エージェント / 決定的関数 / ルーター / 検証器（verifier）/ 人間チェックポイント。「予測可能なルーティングはコードが制御し、解釈・判断が要るステップだけモデルに任せる」（[Turing Post](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it)）
- **fan-out / fan-in**: 並列分岐と集約を第一級操作に
- **Org Graph / Work Graph**: 恒久的な役割を持つ長命エージェントの静的グラフと、実行時に生成・消滅するタスクノードの動的グラフの2層構造（[explainx](https://explainx.ai/blog/graph-engineering-ai-agents-multi-agent-organizations-2026)。※二次情報、独自色強め）
- **ガバナンス系（解釈 B）**: メトリクスペアリング（最適化メトリクス×カウンターメトリクス）、アンカーメトリクス（外部現実との接点）、凍結ノード（held-out 評価セット）、監査ループ、拒否権・ロールバックエッジ（[Eigent](https://www.eigent.ai/blog/graph-engineering-ai-agents)、[Perez](https://medium.com/intuitionmachine/from-loop-engineering-to-graph-engineering-d3ebeb08511c)）
- **グラフの4分類**（Turing Post による交通整理）: ①制御グラフ（LangGraph/ADK）②知識グラフ（GraphRAG）③実行トレース（可観測性）④改善グラフ（自己改善系）。バイラル投稿の多くは**①と②を混同**している

---

## 5. 既存概念との関係整理

- **LangGraph 等のグラフオーケストレーション**: graph engineering（解釈 A）は**まさにこれ**を指す。新概念ではなく既存実装への新ラベル。LangChain 自身が「A loop is just a directed, cyclic graph」「Whether you use prompting or agents or loops or graphs, those are implementation details（プロンプトかエージェントかループかグラフかは実装詳細にすぎない）」と述べ、本質は「モデルの推論を正しい場所に、正しい文脈で置くこと」で loop/harness engineering と同一だとする（[出典](https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph)）。
- **DAG ワークフロー**: 構造は同じだが、graph engineering は**巡回（ループ）を含む**点と、ノードが非決定的（エージェント）である点が differ。「構造は新しくない。ワークフローエンジンは10年この図を描いてきた」（[Bouchard](https://www.louisbouchard.ai/graph-engineering-explained/)）。
- **Subagent orchestration / Anthropic のマルチエージェント研究**: 前レポートの Fleet loop、Anthropic の orchestrator-worker 構成（マルチエージェントリサーチシステム）は graph engineering の先行実践に相当する。ただし Anthropic 自身が「graph engineering」という語を公式に使った一次情報は**確認できなかった**（§6）。
- **知識グラフ / GraphRAG**: **別物**。エージェントの記憶・検索をグラフ構造化する話であり、制御フローのグラフ設計とは対象が違う。バイラル投稿がこの2つを混ぜて「graph engineering で精度18%向上」等と主張しているのが2026年7月の混乱の主因（[Turing Post の反証](https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it)）。

---

## 6. 一次情報で確認できなかったこと（重要）

1. **Hamel Husain の X Article 全文**。命名点となった記事だが有料壁（HTTP 402）で全文を直接確認できず。「ジョーク・皮肉として書かれた」という性格付けは [Bouchard](https://www.louisbouchard.ai/graph-engineering-explained/) と [SmartScope](https://smartscope.blog/en/blog/graph-engineering-loop-engineering-logic-review/) の二次記述に依拠。
2. **「Anthropic エンジニアが Graph Engineering の2時間ワークショップ/12ページ PDF を公開」というバイラル投稿**（@0xCodez ほか）。Anthropic 公式の一次情報は見つからず。内容説明（S-P-O トリプル抽出、エンティティ解決）は明らかに**ナレッジグラフ構築の話**で、本レポートの graph engineering とは別物。真偽不明のため事実として扱わない。
3. **「トークンコスト85%減・精度18%向上」**: Turing Post が「狭い産業ダイアグラム研究を業界全体の証拠として誤用したもの」と反証。**「Stanford の310万ドル研究助成」は捏造**と複数記事が指摘。
4. **@sairahul1 の5層フレーミング（Prompt→Context→Harness→Loop→Graph）の原典 URL**。二次記事での言及のみ確認。
5. **Addy Osmani が 06-07 に loop engineering を普及させたエッセイ**。Turing Post の記述のみで原文未確認。
6. **explainx 記事の具体的数値**（「Fable 5 advisor-orchestrator で品質92%・コスト63%」「18エージェントの Council of High Intelligence」等)。出典不明の二次情報。
7. **Geoffrey Huntley 本人の「グラフ」言及**。ghuntley.com の loop 記事にグラフへの言及はなく、「Ralph loop の作者がグラフ化を提唱」という物語は確認できない。

---

## 7. 考察 — 実務での使い分け

1. **判断基準は1つ**: 「1本の閉ループ（closed loop）で足りなくなったか」。足りているなら移行は不要で、グラフ化はプロンプト数・状態スキーマ・故障モードという税金を追加するだけ。「You don't graduate from loops to graphs. You **compose** loops into graphs when — and only when — one loop stops being enough（ループからグラフへ"卒業"するのではない。1本で足りなくなったときにだけ、ループをグラフへ**合成**する）」（[AI Builder Club](https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering)）。
2. **移行のシグナル**は前レポートの語彙で言えば、(a) 1つのループに複数の関心事（速度と徹底性など）を詰めて VERIFY ゲートが太りすぎた、(b) maker ≠ checker の分離をさらに進めて checker 自体を並列化・専門化したい、(c) fan-out できる独立サブタスクが常態化した、の3つ。
3. **解釈 B（ガバナンス）は先取りする価値がある**。単独ループの Goodhart 化（メトリクスゲーミング）は本リポジトリの loop 実験でも観測しうる問題で、「アンカーメトリクス」「凍結された評価セット」は 20 パターンレポートの #19（Prompt Optimization の前提としての eval）と直結する。グラフに移行しなくても、**カウンターメトリクスを1つ足す**ことは今日からできる。
4. **用語には賞味期限がある前提で読む**。prompt(2023) → context(2025) → harness/loop(2026前半) → graph(2026-07) と、命名から死亡宣告まで6週間のサイクル。概念の中身（検証ゲート付きの反復系を、必要に応じて合成する）は一貫して変わっておらず、LangChain の「実装詳細にすぎない」が最も長持ちする視点だろう。

---

## 参考文献

**一次情報（原典）**
- Peter Steinberger (@steipete), 2026-07-18: https://x.com/steipete/status/2078277297791189132
- Hamel Husain, "Loop Engineering Is Dead. Enter Graph Engineering" (X Article), 2026-07-18: https://x.com/HamelHusain/article/2078346425621237935 （全文未確認）
- Santiago Valdarrama (@svpino), 2026-07-19: https://x.com/svpino/status/2078516761318584774
- Sydney Runkle & Harrison Chase (LangChain), "3 Years of Graph Engineering with LangGraph", 2026-07-22: https://www.langchain.com/blog/3-years-of-graph-engineering-with-langgraph
- Carlos E. Perez, "From Loop Engineering to Graph Engineering?", 2026-07-19: https://medium.com/intuitionmachine/from-loop-engineering-to-graph-engineering-d3ebeb08511c
- Geoffrey Huntley, "Ralph Wiggum as a software engineer" / "everything is a ralph loop": https://ghuntley.com/ralph/ / https://ghuntley.com/loop/

**検証・解説（二次）**
- Ksenia Se (Turing Post), "FOD#159: Is Graph Engineering Real?", 2026-07-20: https://www.turingpost.com/p/is-graph-engineering-real-why-everyone-is-talking-about-it
- Louis-François Bouchard, "Graph Engineering Explained: What Actually Changed", 2026-07-22: https://www.louisbouchard.ai/graph-engineering-explained/
- SmartScope, "What Is Graph Engineering? ... Whether the 'Obituary' Is True", 2026-07-21: https://smartscope.blog/en/blog/graph-engineering-loop-engineering-logic-review/
- AI Builder Club, "Graph Engineering vs Loop Engineering", 2026-07-20: https://www.aibuilderclub.com/blog/graph-engineering-vs-loop-engineering
- Eigent, "Graph Engineering for AI Agents", 2026-07-21: https://www.eigent.ai/blog/graph-engineering-ai-agents
- explainx, "Graph Engineering: Wire Multi-Agent Orgs After Loops", 2026-07-18: https://explainx.ai/blog/graph-engineering-ai-agents-multi-agent-organizations-2026 （独自色強め・数値は未検証）

**本リポジトリの関連レポート**
- [Single Agent Loop / Loop Engineering 調査レポート](/content/research/loop/single-agent-loop)
- [20 Loop Design Patterns 調査レポート](/content/research/loop/loop-design-patterns)
