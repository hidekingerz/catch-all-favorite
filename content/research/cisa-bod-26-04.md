---
title: "CISA BOD 26-04 調査レポート — Prioritizing Security Updates Based on Risk（リスクに基づくセキュリティ更新の優先度付け）"
---

> 発行日: 2026-07-29
> テーマ: 米国 CISA が 2026-06-10 に発令した Binding Operational Directive (BOD) 26-04 の内容整理。特に BOD 19-02 / 22-01 など過去の指令との違い（何が転換点か）を軸に、一次情報（cisa.gov 原文）から要求事項・期限を転記して分析する
> 出典: [BOD 26-04 原文](https://www.cisa.gov/news-events/directives/bod-26-04-prioritizing-security-updates-based-risk)、[Implementation Guidance](https://www.cisa.gov/news-events/directives/bod-26-04-implementation-guidance-prioritizing-security-updates-based-risk)、[CISA プレスリリース](https://www.cisa.gov/news-events/news/cisa-issues-new-directive-improving-how-federal-agencies-prioritize-mitigation-cyber-vulnerabilities) ほか（本文中に個別に明記）

## TL;DR

- **BOD 26-04「Prioritizing Security Updates Based on Risk」は 2026-06-10 発令**。連邦民間行政機関（FCEB）の脆弱性修正ルールを、CVSS 深刻度ベースから**「公開露出 × KEV 掲載 × 攻撃自動化可能性 × 技術的影響」の 4 変数リスクマトリクス**へ全面転換した（[原文](https://www.cisa.gov/news-events/directives/bod-26-04-prioritizing-security-updates-based-risk)）。
- **BOD 19-02（CVSS Critical 15日/High 30日）と BOD 22-01（KEV 2週間/6ヶ月）を明示的に廃止（supersedes and hereby revokes）**し、1 本に統合。位置づけは「新領域」ではなく**置き換え + 拡張**。FAQ には「BOD 19-02 の廃止により、FCEB は脆弱性優先度付けに CVSS を使う義務がなくなった」と明記（[Implementation Guidance](https://www.cisa.gov/news-events/directives/bod-26-04-implementation-guidance-prioritizing-security-updates-based-risk)）。
- 最高リスク帯（公開露出 + KEV 掲載 + 自動化可能 or 全権掌握）は**3 暦日以内の修正 + フォレンジックトリアージ（侵害有無の確認）を義務化**。一方、最低リスク帯は「**Fix on system upgrade**（次回システム更改時で可）」と、初めて「低リスクの後回し」を公式に容認した。
- 転換点は 4 つ: (1) CVSS 廃止 → SSVC ベースのリスク判断、(2) 一律期限 → 16 区分の傾斜期限（3日〜次回更改時）、(3) パッチ適用だけでなく**侵害確認（forensic triage）を要求**（「パッチ適用は一般に脅威アクターを追い出さない」）、(4) **AI による悪用の高速化**を明示的な根拠に採用。
- 民間への強制力はないが、CISA 長官代行は「**すべてのパートナーに同様のアクションの採用を強く推奨する**」と表明（[プレスリリース](https://www.cisa.gov/news-events/news/cisa-issues-new-directive-improving-how-federal-agencies-prioritize-mitigation-cyber-vulnerabilities)）。日本の組織にとっても「CVSS 単独での優先度付けから、悪用実績（KEV）+ 露出 + 自動化可能性による優先度付けへ」という設計指針として参照価値が高い。

---

## BOD とは（前提知識・ED との違い）

Binding Operational Directive（拘束的運用指令）は、連邦情報・情報システム保護を目的とした**連邦行政機関への強制的な指示**（44 U.S.C. § 3552(b)(1)）。DHS 長官が発出権限を持ち（44 U.S.C. § 3553(b)(2)）、連邦機関は 44 U.S.C. § 3554(a)(1)(B)(ii) により遵守義務を負う。国家安全保障システム、Department of War（旧国防総省）や情報コミュニティの一部システムには適用されない（[BOD 26-04 原文の冒頭定型文](https://www.cisa.gov/news-events/directives/bod-26-04-prioritizing-security-updates-based-risk)より転記）。

- **BOD**: 中長期の戦略的・恒常的な運用要求（例: 脆弱性管理、資産可視化、クラウド設定基準）。Implementation Guidance の FAQ でも「BODs are meant to be long-term, strategic initiatives（BOD は長期戦略的な取り組みであることを意図している）」と明言。
- **ED（Emergency Directive）**: 特定の重大脅威・特定製品の脆弱性（例: [ED 26-03: Cisco SD-WAN](https://www.cisa.gov/news-events/directives)）に対する緊急対応指令。数日単位の期限で単発的に発出される。
- なお BOD 26-04 の FAQ には「**CISA はサイバー指令の要求アクションに対する waiver（適用除外）や例外を発行しない**」と明記されており、免除規定はない。

## BOD 26-04 の概要

| 項目 | 内容（原文から転記） |
|---|---|
| 正式名称 | Binding Operational Directive 26-04: Prioritizing Security Updates Based on Risk |
| 発令日 | 2026 年 6 月 10 日 |
| 対象 | FCEB（Federal Civilian Executive Branch）機関の「federal information system」上の資産（OMB Circular A-130 の定義による。機関に代わり第三者が運用するシステムを含む） |
| 契約業者 | 調達契約で指示されない限り直接は適用されないが、**機関は本指令遵守に必要な契約変更の要否を全契約についてレビューする義務**を負う |
| クラウド | FedRAMP 認定サービスは FedRAMP PMO 経由で、非認定クラウドは CSP と直接、遵守を確保する |
| 廃止する指令 | BOD 19-02（2019-04-29）および BOD 22-01（2021-11-03）を「supersedes and hereby revokes」 |
| 根拠・背景 | FISMA 2014 / OMB Circular A-130、EO「Promoting Advanced Artificial Intelligence Innovation and Security」、Cyber Strategy for America。「脅威アクターの AI 利用が、パッチ公開から悪用までに防御側が反応できる時間をさらに狭めうる」 |

### リスク判定の 4 変数（原文 Background 節より）

1. **Asset Exposure**: 脆弱な資産は公開露出（publicly exposed）しているか。「認証されていない・信頼されていない主体がインターネット等の公衆網経由でアクセス可能な、機関所有・管理の IT リソース（物理的・論理的配置を問わない）」
2. **KEV Status**: その CVE ID は CISA の [Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)（悪用実績カタログ）に掲載されているか
3. **Exploit Automation（Automatable）**: 攻撃者は悪用に必要な全ステップを自動化できるか
4. **Technical Impact**: 悪用後に攻撃者が得るのは **Partial control**（限定的制御。DoS を含む）か **Total control**（ソフトウェアの完全制御。ログイン資格情報の確実な露出を含む）か

KEV Status / Automatable / Technical Impact は CISA が **Vulnrichment Program** を通じて全 CVE ID について公表し、Asset Exposure は機関側が CDM・Cyber Hygiene 等で判定する。SSVC（Stakeholder-Specific Vulnerability Categorization）の方法論に基づく。

### Table 1: Remediation Timelines（修正期限。原文の表を全 16 行転記）

| # | 公開露出 | KEV 掲載 | 自動化可能 | 技術的影響 | 修正期限（暦日） |
|---|---|---|---|---|---|
| 1 | Yes | Yes | Yes | Total control | **3 日 + forensic triage** |
| 2 | Yes | Yes | Yes | Partial control | 3 日 |
| 3 | Yes | Yes | No | Total control | **3 日 + forensic triage** |
| 4 | Yes | Yes | No | Partial control | 14 日 |
| 5 | Yes | No | Yes | Total control | 3 日 |
| 6 | Yes | No | Yes | Partial control | 14 日 |
| 7 | Yes | No | No | Total control | 14 日 |
| 8 | Yes | No | No | Partial control | 60 日 |
| 9 | No | Yes | Yes | Total control | **3 日 + forensic triage** |
| 10 | No | Yes | Yes | Partial control | 14 日 |
| 11 | No | Yes | No | Total control | 14 日 |
| 12 | No | Yes | No | Partial control | 14 日 |
| 13 | No | No | Yes | Total control | 60 日 |
| 14 | No | No | Yes | Partial control | 60 日 |
| 15 | No | No | No | Total control | Fix on system upgrade |
| 16 | No | No | No | Partial control | Fix on system upgrade |

補足ルール（原文 Appendix A より）:

- 期限の起算点は「(1) CISA が KEV カタログに追加した時点」または「(2) BOD 23-01 に基づき機関が資産上でその脆弱性を検出し CDM ダッシュボードを更新した時点」の**早い方**。
- 期限は状況変化で動的に変わる（例: システムをインターネットから外せば「公開露出=Yes→No」となり期限が後ろ倒しになる。逆に KEV 追加で短縮される）。
- 「remediated」= パッチ適用・システム廃止・その他の措置により脆弱性を除去すること。
- CVE メタデータが未提供かつ KEV 非掲載の場合、CISA は期限を 60 日として扱う。「公開露出」情報が CDM で得られない資産は**予防的に公開露出扱い**となる（FAQ）。
- ブルートフォース型 DoS（リソース枯渇攻撃）は CVE 採番ルール上 CVE が付かないため本 BOD の対象外（FAQ）。

### 要求アクション（フェーズと期限）

| フェーズ | 期限 | 要求内容（要旨） |
|---|---|---|
| Phase I | 即時（発令と同時） | 脆弱性管理ポリシーの見直し・更新(役割定義、KEV 継続修正プロセス、検証・追跡体制)。KEV カタログ更新の監視と期限内の積極的修正。**CDM ダッシュボード経由の自動報告**（未自動化の機関は**隔週で手動報告**）。Cyber Hygiene スキャンの継続、スキャン元 IP のブロックリスト除外、**四半期ごと**の公開 IP・ドメインの棚卸し/アテステーション |
| Phase II | 発令から 60 日以内（〜2026-08-09 ※換算） | CVE データベース（または同等データを提供するサービス）+ KEV カタログに基づく継続的修正ができるよう、脆弱性管理プロセス・手順を更新 |
| Phase III | 発令から 180 日以内（〜2026-12-07 ※換算） | Table 1 の期限に従った修正の実施。外部から到達可能・ルーティング可能 IP を持つ全資産の継続的な特定とタグ付け（組織/サブ組織、prod/dev、public/internal、資産種別）。CDM 未自動化の機関は **7 日ごと**に機械可読形式で CISA へ報告。CDM 連邦ダッシュボードに報告する全資産に RFC 1918/RFC 4193 のプライベート IP を含む全 IP を含める |

CISA 側のアクション: KEV カタログの即時更新・Vulnrichment によるメタデータ提供、60 日以内の資産タグ付けデータスキーマ公表、**会計年度ごとの期限の再評価**、DHS 長官・OMB 長官・国家サイバー長官への年次報告など。

### Forensic triage（侵害確認トリアージ）

「3 日 + forensic triage」該当時、機関は期限内の修正に加えて**資産が既に侵害されていないかの評価**を行う義務がある。[Implementation Guidance](https://www.cisa.gov/news-events/directives/bod-26-04-implementation-guidance-prioritizing-security-updates-based-risk) は 6 ステップ（推奨タイムライン付き。タイムライン自体は義務ではなく「adequate な triage の実施」が義務）を定義:

1. **Scoping**（KEV 追加から 2 時間以内目標）— 対応チーム起動、範囲特定、帯域外通信路の確立
2. **Preserve and Collect Evidence**（2〜24 時間）— 揮発性データ優先の証拠保全
3. **Critical Patching and Stabilization**（2〜24 時間）— 証拠収集後にパッチ適用
4. **Contain and Control**（6〜24 時間）— 攻撃者に検知を悟らせない封じ込め
5. **Triage Analysis**（24〜48 時間）— 不正アクセス・横展開・持続化・持ち出しの有無分析
6. **Escalation Decision**（48〜72 時間）— トリアージ報告書作成。侵害確認時は CISA Incident Reporting System へ報告しフル IR へ移行

## これまでの方針との違い

### 系譜: 置き換えか、拡張か、新領域か

**結論: BOD 26-04 は「置き換え（BOD 19-02 + BOD 22-01 の統合的廃止）+ 拡張（SSVC マトリクス・forensic triage の新設）」**であり、新領域の指令ではない。脆弱性修正 BOD の系譜は BOD 15-01 → 19-02 → 22-01 → 26-04 と一本化された。資産可視化（23-01）、管理インターフェース（23-02）、VDP（20-01）、クラウド設定（25-01）、EOS 機器（26-02）は**存続し、26-04 と併走・連携**する。

### 過去 BOD との対比表

| | [BOD 15-01](https://www.cisa.gov/news-events/directives/bod-19-02-vulnerability-remediation-requirements-internet-accessible-systems)（2015, 19-02 が廃止） | [BOD 19-02](https://www.cisa.gov/news-events/directives/bod-19-02-vulnerability-remediation-requirements-internet-accessible-systems)（2019-04-29, **26-04 が廃止**） | [BOD 22-01](https://www.cisa.gov/news-events/directives/bod-22-01-reducing-significant-risk-known-exploited-vulnerabilities)（2021-11-03, **26-04 が廃止**） | **BOD 26-04**（2026-06-10） |
|---|---|---|---|---|
| 優先度の基準 | CVSS Critical | CVSS（Critical/High） | 悪用実績（KEV 掲載） | 4 変数リスク（露出 × KEV × 自動化 × 影響）= SSVC ベース |
| 対象システム | インターネット接続システム | インターネット接続システム（Cyber Hygiene スキャンで検出） | 全連邦情報システム | 全連邦情報システム（露出有無は変数として扱う） |
| 期限 | Critical 30 日 | Critical 15 暦日 / High 30 暦日 | 2021 年以降の CVE: 2 週間 / 2021 年より前の CVE: 6 ヶ月 | **3 日〜60 日の 16 区分 + 「次回システム更改時」** |
| 侵害確認 | なし | なし | なし | **最高リスク帯で forensic triage を義務化** |
| 低リスクの扱い | 対象外（暗黙） | 対象外（暗黙） | KEV 非掲載は対象外（暗黙） | **「Fix on system upgrade」として明示的に後回しを容認** |
| データ基盤 | Cyber Hygiene 週次レポート | Cyber Hygiene スキャン | KEV カタログ | KEV + **Vulnrichment（CVE ごとの SSVC メタデータ）** + CDM + Cyber Hygiene |

（各期限数値は各指令の cisa.gov 原文ページから転記。BOD 22-01 原文: 「remediate within 6 months for vulnerabilities with a CVE ID assigned prior to 2021 and within two weeks for all other vulnerabilities」、BOD 19-02 原文: 「Critical vulnerabilities must be remediated within 15 calendar days... High vulnerabilities must be remediated within 30 calendar days of initial detection」）

### 存続する関連 BOD との関係（原文 FAQ・各原文より）

| 指令 | 内容と 26-04 との関係 |
|---|---|
| [BOD 23-01](https://www.cisa.gov/news-events/directives/bod-23-01-improving-asset-visibility-and-vulnerability-detection-federal-networks)（2022, 資産可視化） | 7 日ごとの自動資産発見・14 日ごとの脆弱性列挙・72 時間以内の CDM 取り込みを要求。**26-04 の期限起算点の一方は「23-01 に基づく検出 + CDM 更新」**であり、26-04 の実効性は 23-01 のデータ基盤に依存する（FAQ: 「BOD 23-01 との連携で、機関は 7 日以内に報告できる公開露出資産リストを持っているはず」） |
| [BOD 23-02](https://www.cisa.gov/news-events/directives/binding-operational-directive-23-02)（2023, インターネット露出管理インターフェース） | 検出から 14 日以内にインターフェースを外部から除去するか Zero Trust の政策執行点で保護。26-04 の「公開露出」変数を減らす方向で補完 |
| [BOD 20-01](https://www.cisa.gov/news-events/directives)（2020, VDP） | 脆弱性開示ポリシー。FAQ で「20-01 は各機関に報告された個別脆弱性、26-04 の KEV は複数機関に存在しうる脆弱性を扱う」と整理 |
| [BOD 25-01](https://www.cisa.gov/news-events/directives/bod-25-01-implementing-secure-practices-cloud-services)（2024, SCuBA クラウド設定基準） | 設定ベースライン（M365 の mandatory policies 等）。26-04 は「CVE ID の付く製品脆弱性」を扱い、**CVE の付かない設定不備は 26-04 の範囲外**（FAQ が明言）で 25-01 等が引き続きカバー |
| [BOD 26-02](https://www.cisa.gov/news-events/directives/bod-26-02-mitigating-risk-end-support-edge-devices)（2026-02-05, EOS エッジ機器） | サポート終了エッジ機器の棚卸し（3 ヶ月以内）〜継続的発見プロセス確立（24 ヶ月以内）。26-04 FAQ が「レガシー製品の KEV 対応は 26-02 を参照」と相互参照 |

### 何が転換点か

1. **CVSS 深刻度からの公式決別**。Implementation Guidance FAQ: 「Note: By revoking BOD 19-02, the FCEB no longer requires CVSS use for vulnerability prioritization.（BOD 19-02 の廃止により、FCEB は脆弱性優先度付けへの CVSS 使用を要求されなくなった）」。「Critical/High というラベルは具体的アクションを規定しない。曖昧さを排除するため、CISA はこれらのラベルを、定義された条件下での明示的な修正期限に置き換える」とも述べ、FIRST の CVSS 利用ガイダンス（CVSS-B スコアは深刻度であってリスク評価に単独で使うべきでない）に整合すると位置づけた。
2. **「全部塗る」から「濃淡をつける」へ**。KEV 最短期限は 2 週間（22-01）から **3 日**へ大幅短縮される一方、最低リスク帯は「次回システム更改時」まで正式に繰り延べ可能に。CISA ブログ [Patch Smarter, Not Harder](https://www.cisa.gov/news-events/news/patch-smarter-not-harder) は、ある大規模民間機関の初期分析で「**3 日カテゴリに該当したのは脆弱性インスタンスの 1% のみ、60% 超は次回更改時まで繰り延べ**」だったと紹介している。
3. **パッチ適用 ≠ 侵害解消、の制度化**。プレスリリース: 「Applying a patch generally does not evict a threat actor.（パッチ適用は一般に脅威アクターを追い出さない）」。最高リスク帯では修正と同時に forensic triage（侵害有無確認）が義務となり、脆弱性管理とインシデント対応が初めて 1 本の BOD で接続された。
4. **AI 脅威を明示的な根拠に**。原文 Background: 「脅威アクターの AI 利用は、パッチ公開から悪用可能になるまでに防御側が反応できる時間をさらに狭めうる」。ブログは Verizon 2026 DBIR を引き、「2025 年に KEV 掲載脆弱性を完全修正できた組織は 26% のみ（前年 38% から低下）、完全解消までの中央値は 43 日に上昇」という防御側の逼迫を挙げる。
5. **機械可読データ駆動の運用**。Vulnrichment Program が全 CVE に SSVC 判定（Automatable / Technical Impact 等）を ADP として供給し、CDM ダッシュボード・資産タグ付けスキーマ（60 日以内に公表）で自動報告する前提の設計。22-01 時点には存在しなかったインフラを前提にしている（FAQ: 「3〜6 年前には利用できなかったツールと実践を活用する」）。
6. **エッジ偏重の明確な理由付け**。ブログは「このフレームワークは主にネットワークエッジの脆弱性を優先するが、CISA の観測上、コアネットワークの侵害は製品脆弱性よりも設定不備と正規資格情報（living off the land）によることが多く、それは設定堅牢化・セグメンテーション・フィッシング耐性 MFA など別の手段で対処すべき」と説明。

## 実務影響

### FCEB（連邦民間機関）

- **即時**: ポリシー改定、KEV 監視、CDM 自動報告（未自動化なら隔週手動報告）、Cyber Hygiene スキャン受け入れ・四半期ごとの公開資産アテステーション。
- **60 日以内（〜2026-08-09 ※発令日からの換算）**: CVE データベース + KEV に基づく修正プロセスへの更新。
- **180 日以内（〜2026-12-07 ※換算）**: Table 1 期限での修正運用の開始、外部到達可能資産の継続的タグ付け（未自動化なら 7 日ごと報告）。
- waiver（適用除外）は発行されない。期限を守れない特殊ケースは CyberDirectives@cisa.dhs.gov へ相談し緩和策を協議する運用。
- 高可用性システムでも期限は同じで、変更管理・COOP 側を期限に合わせて整備することが求められる（FAQ）。
- サードパーティ / クラウド: FedRAMP 認定 CSP は FedRAMP PMO 経由で調整（[FedRAMP も対応方針を公表](https://www.fedramp.gov/notices/0014/)。二次的一次情報）。SaaS/PaaS/IaaS の責任分界は共有責任モデル（OMB M-24-15）に従い、CISA は**修正期限を SLA・契約に組み込むことを強く推奨**。

### 民間企業・非連邦組織

- 法的拘束力は FCEB のみ。ただしプレスリリースで CISA 長官代行 Nick Andersen は「**本指令は連邦機関への義務だが、CISA はすべてのパートナーが脆弱性管理ポリシーで同様のアクションを採用することを強く推奨する**」と明言。
- 連邦契約業者は直接の適用対象外だが、各機関が契約見直しを義務づけられているため、**政府調達に関わるベンダーには契約経由で 3 日 /14 日級の修正 SLA が波及する**可能性が高い。
- Vulnrichment の SSVC メタデータ（KEV / Automatable / Technical Impact）は CVE レコードの ADP コンテナとして誰でも取得可能であり、民間もそのまま同じ判定表を運用に流用できる。

### 日本の組織への示唆

- **CVSS 基礎値のみでのパッチ優先度付けは、米連邦標準としては公式に終了した**。日本でも「CVSS 9.8 だから即対応」ではなく、(1) 外部露出しているか、(2) 悪用実績（KEV）があるか、(3) 悪用が自動化可能か、(4) 完全掌握に至るか、の 4 問で棚卸しする方式は、限られた運用リソースの配分方法としてそのまま輸入可能。
- 「パッチ前に侵害されていた可能性」を確認する forensic triage の 6 ステップ（証拠保全 → パッチ → 封じ込め → 分析 → エスカレーション判断）は、KEV 掲載脆弱性が自組織の露出資産に見つかった際の対応手順書のテンプレートとして有用。
- 前提として資産インベントリと外部露出の把握（BOD 23-01/23-02 相当）がなければこのモデルは回らない。攻撃面管理（ASM）と脆弱性管理の統合が先行投資になる。
- 米政府調達・FedRAMP 環境にサービスを提供する日本企業は、顧客機関経由で本指令の期限・報告要求が契約条件化される可能性に留意。

## 一次情報で確認できなかったこと

- **BOD 26-01 / BOD 26-03 の存在**: cisa.gov の Binding Operational Directives 一覧（2026-07-29 時点で取得）には FY26 の BOD として 26-02 と 26-04 のみが掲載されており、26-01 / 26-03 という番号の公開 BOD は確認できなかった（欠番の理由も一次情報で確認できず。なお ED には 26-03: Cisco SD-WAN が存在するが、ED と BOD は別番号体系）。
- 根拠として言及される Executive Order「Promoting Advanced Artificial Intelligence Innovation and Security」および「Cyber Strategy for America」の原文内容（BOD 原文の脚注リンクは whitehouse.gov のトップレベルページで、個別文書は本調査では未確認）。
- Table 1 は原文ページ上で画像（PNG）として提供されており、本レポートの表はその画像から転記した。PDF 版原本との照合は行っていない。
- ブログが引用する Verizon 2026 Data Breach Investigations Report の数値（KEV 完全修正率 26%、中央値 43 日）は、CISA ブログ経由の孤立した引用であり DBIR 原本では未確認。
- 「3 日」等の期限が営業日でなく**暦日**であることは原文（"Days are calendar days."）で確認済みだが、期限超過時の具体的な強制措置・罰則は本指令原文には記載がなく、確認できなかった。

## 参考文献一覧

### 一次情報（CISA / 米政府）

- [BOD 26-04: Prioritizing Security Updates Based on Risk（指令原文）](https://www.cisa.gov/news-events/directives/bod-26-04-prioritizing-security-updates-based-risk) — 2026-06-10
- [BOD 26-04: Implementation Guidance for Prioritizing Security Updates Based on Risk](https://www.cisa.gov/news-events/directives/bod-26-04-implementation-guidance-prioritizing-security-updates-based-risk) — forensic triage 手順・FAQ・用語集
- [プレスリリース: CISA Issues New Directive Improving How Federal Agencies Prioritize the Mitigation of Cyber Vulnerabilities](https://www.cisa.gov/news-events/news/cisa-issues-new-directive-improving-how-federal-agencies-prioritize-mitigation-cyber-vulnerabilities) — 2026-06-10
- [ブログ: Patch Smarter, Not Harder](https://www.cisa.gov/news-events/news/patch-smarter-not-harder) — 2026-06-10、Chris Butera / Dr. Jonathan Spring
- [BOD 22-01: Reducing the Significant Risk of Known Exploited Vulnerabilities（Revoked）](https://www.cisa.gov/news-events/directives/bod-22-01-reducing-significant-risk-known-exploited-vulnerabilities)
- [BOD 19-02: Vulnerability Remediation Requirements for Internet-Accessible Systems（Revoked）](https://www.cisa.gov/news-events/directives/bod-19-02-vulnerability-remediation-requirements-internet-accessible-systems)
- [BOD 23-01: Improving Asset Visibility and Vulnerability Detection on Federal Networks](https://www.cisa.gov/news-events/directives/bod-23-01-improving-asset-visibility-and-vulnerability-detection-federal-networks)
- [BOD 23-02: Mitigating the Risk from Internet-Exposed Management Interfaces](https://www.cisa.gov/news-events/directives/binding-operational-directive-23-02)
- [BOD 25-01: Implementing Secure Practices for Cloud Services](https://www.cisa.gov/news-events/directives/bod-25-01-implementing-secure-practices-cloud-services)
- [BOD 26-02: Mitigating Risk From End-of-Support Edge Devices](https://www.cisa.gov/news-events/directives/bod-26-02-mitigating-risk-end-support-edge-devices)
- [Cybersecurity Directives（指令一覧）](https://www.cisa.gov/news-events/directives)
- [Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [FedRAMP Response to CISA BOD 26-04](https://www.fedramp.gov/notices/0014/)

### 二次情報（文脈補強のみに使用）

- [Nucleus Security: What is CISA BOD 26-04?](https://nucleussec.com/resources/knowledge-center/what-is-cisa-bod-26-04/)
- [Covington (Inside Government Contracts): CISA Releases Binding Operational Directive on Prioritizing Security Updates Based on Risk](https://www.insidegovernmentcontracts.com/2026/06/cisa-releases-binding-operational-directive-on-prioritizing-security-updates-based-on-risk/)
