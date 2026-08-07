---
title: "WebMCP 調査レポート — ブラウザページを MCP ツール化する提案と Cloudflare の developer preview"
---

> 発行日: 2026-08-07
> テーマ: WebMCP — Web ページがブラウザ内の AI エージェントへツールを公開する新ブラウザ標準の提案と、Cloudflare が発表した「WebMCP on Cloudflare」developer preview の内容整理
> 出典: [Cloudflare Blog: WebMCP on Cloudflare](https://blog.cloudflare.com/webmcp/)（2026-08-06、Will Rowe）、[webmachinelearning/webmcp（W3C Web Machine Learning CG）](https://github.com/webmachinelearning/webmcp) ほか（本文中に個別に明記）

## TL;DR

- **WebMCP は「Web ページ自身が AI エージェント向けツールを公開する」ブラウザ標準の提案**。W3C の Web Machine Learning Community Group で Google・Microsoft のエンジニアがインキュベーション中で、ページ内の JavaScript API（`document.modelContext` / 当初は `navigator.modelContext`）で `registerTool()` を呼ぶと、エージェントが DOM を推測操作する代わりに型付きツールを直接呼べる。
- **Cloudflare は 2026-08-06、「WebMCP on Cloudflare」の developer preview を発表**。ダッシュボードのトグル 1 つで、HTMLRewriter がエッジで全 HTML レスポンスに bridge script（`/.webmcp/bridge.js`）を 1 行注入し、**オリジン側のコード変更・再デプロイなし**でサイトを WebMCP 対応にする。
- 初期提供は 2 つのツールパック: **Content Credentials pack**（画像の C2PA 来歴メタデータを読む `scan_images_c2pa` / `inspect_image_c2pa`）と **Site MCP Server pack**（既存のリモート MCP サーバーのツールをページ内ツールとして再公開）。いずれも**完全にブラウザ内で実行**され、Cloudflare のサーバーへのラウンドトリップはない。
- 従来のリモート MCP サーバー方式との最大の違いは**認証**。Site MCP Server pack はページから同一オリジン（`credentials: "same-origin"`）で MCP エンドポイントを呼ぶため、**訪問者のログイン済みセッションをそのまま使え、OAuth や API キーの別建て配布が不要**になる。
- 背景思想は「エージェントがコンテンツをサーバー側へコピーして持ち去る（クローラー型）のではなく、**人間のブラウザの中で動くことで、人間が制御を保ち、クリエイターがトラフィックを失わない**」というもの。Cloudflare のリモートブラウザ **BrowserRun** は既に WebMCP 対応済み。
- サポート状況はまだ実験段階。Cloudflare 記事によれば Chrome 146 で experimental に出荷。二次情報では Chrome 149〜156 で origin trial 実施中、API は `navigator.modelContext` から `document.modelContext` へ移行、Edge はフラグ付き対応と報じられている。prompt injection やタブ間のツール連鎖などセキュリティ課題は「認識されているが未解決」の段階と見られる。

---

## WebMCP とは — 提案の出所と MCP との関係

WebMCP（Web Model Context Protocol）は、**Web ページが自分の機能を「ツール」として宣言し、ブラウザ内で動く AI エージェントに呼ばせるための Web 標準提案**である。仕様のインキュベーションは W3C の [Web Machine Learning Community Group](https://webmachinelearning.github.io/charter/) で行われており、リポジトリは [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp)。二次情報（[InfoQ](https://www.infoq.com/news/2026/06/webmcp-web-agent-standard-chrome/) 等）によれば、Google と Microsoft のエンジニアが共同で提案し、2026 年 2 月に最初に公表されたと見られる。

MCP（Model Context Protocol）本体との関係は「別プロトコル」ではなく**「MCP の語彙（tools / schemas / parameters）を Web プラットフォームに合わせて移植したもの」**である。[提案文書](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md)は、Web API を MCP のプリミティブに密接に揃えることで「WebMCP で宣言されたエージェント機能は、最小限の変換層でどの MCP 互換エージェントからも利用できる」ことを設計目標に掲げている。乱暴に言えば **「ページがその場で MCP サーバーになる」** 仕組みであり、Cloudflare の記事も WebMCP を "a new browser standard" と紹介している。

解決したい課題は明確で、Cloudflare 記事の言葉を借りると:

> A site can choose to expose a set of tools for agents running in the browser, meaning agents no longer have to guess their way through a page built for humans. This enables agents to have a different browsing experience from the user and use tokens on tasks, not navigation.

つまり、人間向け UI をスクリーンショットや DOM スナップショットから推測してクリックする現行のブラウザエージェント方式は遅く・壊れやすく・トークンを浪費する。WebMCP はサイト側が型付きの関数を差し出すことでこれを置き換える。ただし「the site has to implement it（サイト側が実装しなければならない）」——ここが Cloudflare の発表の出発点になる。

## 仕組み: ページがツールを公開する JavaScript API

ページは `modelContext` オブジェクトの `registerTool()` に、MCP のツール定義とほぼ同形のオブジェクトを渡す。Cloudflare 記事に載っている形は次の通り（bridge 内部でパックのツールを登録するコード）:

```javascript
document.modelContext.registerTool({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  execute: async (args) => { ... }
})
```

- `name` / `description` / `inputSchema`（JSON Schema）は MCP のツール定義と同じ語彙。
- `execute` はページ内 JavaScript としてブラウザで実行される。つまりツールの実体は**ページのオリジン・セッション・Cookie の文脈で動く同一オリジンのコード**である。
- API の生えている場所について、当初の提案・origin trial では `navigator.modelContext` だったが、その後 `document.modelContext` へ移行した（Chrome 150 で `navigator.modelContext` が deprecated になったと報じられている。[DEV Community](https://dev.to/thousand_miles_ai/webmcp-in-chrome-149-web-pages-get-a-tool-api-for-ai-agents-bfi) 等の二次情報）。Cloudflare 記事は一貫して `document.modelContext` と表記している。

ブラウザ（またはブラウザに接続したエージェント）は、ページが登録したツール一覧を MCP のツールリストとして発見し、通常の MCP tool call と同じ形で呼び出す。エージェント側から見れば「そのタブが MCP サーバー」に見える、というのが本質である。

## Cloudflare の発表内容: WebMCP on Cloudflare（developer preview）

Cloudflare は Agents Week の一環として 2026-08-06 に developer preview を発表した。要点は **「サイト側の実装が必要」という WebMCP の弱点を、エッジでの自動注入で肩代わりする**ことにある。

### エッジでの bridge script 注入

ダッシュボードの **Agent Readiness > Labs** でトグルを有効化すると、Cloudflare は **HTMLRewriter** を使って各 HTML レスポンスに 1 行を追加する:

```html
<script type="module"
        src="/.webmcp/bridge.js"
        data-packs="c2pa,mcp-server-client"
        data-mcp-url="/mcp"></script>
```

- bridge script 自体も Cloudflare が同一オリジンパス（`/.webmcp/bridge.js`）で配信するため、**外部オリジンのスクリプト注入にはならない**（"same origin, and your HTML is otherwise untouched"）。
- bridge は `data-packs` に列挙されたパックを合成して 1 つのツールリストにまとめ、それぞれを `registerTool` で登録する。
- ブラウザが WebMCP 非対応なら bridge は「何もせず return する」ため、通常の閲覧には影響しない。
- 有効化の確認は `curl -s https://your-site.example | grep webmcp` で注入を確かめるだけ。記事は "nothing to deploy and nothing to change at your origin"（デプロイ不要・オリジン変更不要）を繰り返し強調している。
- この preview では**全ツールが訪問者のブラウザ内で完結**する: "In this preview, every tool runs entirely in the visitor's browser. There is no round trip to a server of ours."

### Content Credentials pack（C2PA）

画像の来歴（provenance）メタデータ C2PA を読む静的パック。2 つのツールを公開する:

- **`scan_images_c2pa`**: ページ内の全画像を走査し、C2PA クレデンシャルの有無・claim generator（例: "Adobe Firefly"）・タイトル・署名主体の短い要約を返す。
- **`inspect_image_c2pa`**: 1 枚の画像のフルマニフェスト（編集履歴・作者・署名証明書）をデコードする。

実装は「画像本体ではなく先頭数 KB のメタデータだけに触れる plain TypeScript のリーダー」で、現段階では**署名の暗号学的検証はせず、デコードした主張の報告に留まる**。結果には明示的に `signatureVerified: false` が付き、「エージェントがデコード済みクレームを検証済みと誤認しない」よう設計されている。

### Site MCP Server pack

既にリモート MCP サーバーを持つサイト向けの動的パック。bridge が起動時（boot）に `data-mcp-url` で指定された MCP エンドポイント（例: `/mcp`）からツール一覧をディスカバリし、それぞれをページ内ツールとして `registerTool` する。ツール呼び出しはページから **訪問者のオリジン上で、訪問者の既存セッションを使って**（`credentials: "same-origin"`）MCP エンドポイントへ直接届く。

> The Site MCP Server pack talks straight to your MCP server endpoint from the page, on the visitor's origin and with their existing session.

### BrowserRun 統合とテスト方法

Cloudflare のリモートブラウザ **BrowserRun** は既に WebMCP 対応済みで、URL を与えると「訪問者のエージェントとまったく同じように」パックが登録したツールをディスカバリして呼び出せる。ツールの挙動は「ブラウザが誰かのラップトップ上でもクラウドの headless でも同一」とされ、開発者のエンドツーエンドテスト手段として位置付けられている。また、既に MCP サーバーと話せるエージェントであれば「特別な追加なし」で動くとしている。

## 従来のリモート MCP サーバー方式との違い・利点

| 観点 | リモート MCP サーバー | WebMCP（+ Cloudflare bridge） |
|---|---|---|
| 実装・運用 | サーバーを別途構築・公開・運用 | ページ内 JS のみ。Cloudflare 経由ならトグルだけ（コード変更・再デプロイ不要） |
| 認証 | OAuth フローや API キーを別建てで設計・配布 | **訪問者のログイン済みブラウザセッションをそのまま利用**（same-origin、Cookie ベース） |
| 実行場所 | サイト外のサーバー ↔ エージェント間 | 訪問者のブラウザ内（この preview ではサーバーへのラウンドトリップなし） |
| エージェントの操作方法 | ツール呼び出し | ツール呼び出し（DOM 推測クリックの置き換え） |
| トラフィック・帰属 | クローラー型では原サイトにトラフィックが戻らない問題 | 人間のブラウザ内で完結するため「クリエイターがトラフィックを保つ」と主張 |

特に認証の差は大きい。リモート MCP サーバーでは「ユーザーとしての権限」をエージェントに与えるために OAuth 等の連携をサーバー側で作り込む必要があるが、WebMCP ではツールが**ユーザーが今ログインしているページの中で実行される**ため、既存のセッション・アクセス制御がそのまま効く。API キーやトークンをエージェントへ渡す必要もない。Cloudflare はこの構図を、クローラーが「コンテンツをサーバーへコピーし、元サイトにトラフィックもクレジットもほとんど返さない」現状へのカウンターとして提示している——エージェントがブラウザ内で動けば「the human stays in control and creators keep their traffic」というわけである。

## セキュリティ・プライバシー上の考慮点

- **同一オリジン境界の維持**: Cloudflare の bridge・パックはすべて同一オリジンで動き、MCP 呼び出しも `credentials: "same-origin"`。第三者オリジンへの資格情報送出は設計上避けられている。
- **「セッションごと渡す」ことの裏返し**: ログイン済みセッションでツールが動くということは、**エージェントがユーザー権限で書き込み系操作をできる**ことを意味する。WebMCP 提案自体は human-in-the-loop（ユーザー同席・確認）を前提とした設計であり、Chrome の[エージェントセキュリティガイダンス](https://developer.chrome.com/docs/agents/security)は破壊的操作の前にユーザー確認を挟むモデル（`requestUserInteraction()` 等）や、ツール出力・第三者コンテンツを命令ではなくデータとして扱わせる spotlighting を挙げている（二次情報を含む）。
- **prompt injection は未解決の前提**: ツールの `description` やツールの返り値はサイト側が自由に書ける文字列であり、悪意あるサイトがエージェントを誘導する攻撃面になる。Chrome 側のガイダンスは「攻撃者が悪意ある指示の設置に成功する前提で設計せよ」という立場と報じられており（[Search Engine Journal](https://www.searchenginejournal.com/webmcp-can-be-used-to-hijack-ai-agents-chrome-warns/578904/)）、複数タブにまたがるツール連鎖によるデータ持ち出し（いわゆる cross-context の連鎖）も W3C レビューで懸念として挙がっていると見られる。
- **Content Credentials pack の抑制的設計**: 前述の通り現段階では署名検証を行わず `signatureVerified: false` を明示する。読み取るのも画像先頭のメタデータ数 KB のみで、過剰な信頼付与・過剰な読み取りを避けている。
- **訪問者側のオプトアウト**: Cloudflare 記事は訪問者（エンドユーザー）側の同意・無効化メカニズムについては詳述しておらず、この層の制御は主にブラウザ／エージェント実装側の責務になると見られる。

## サポート状況と今後の見通し

**ブラウザ**:

- Cloudflare 記事は「Chrome 146 で experimental に出荷」と記載。二次情報では **Chrome 149〜156 で public origin trial** を実施中とされ（[InfoQ](https://www.infoq.com/news/2026/06/webmcp-web-agent-standard-chrome/)、[ppc.land](https://ppc.land/chrome-149-origin-trial-puts-webmcp-in-developers-hands-at-last/)）、フラグでの実験提供と origin trial が段階的に進んでいると見られる。
- API 名は `navigator.modelContext` → `document.modelContext` へ移行中（Chrome 150 で前者が deprecated と報じられている）。仕様が動いている段階なので、実装時は [webmachinelearning/webmcp](https://github.com/webmachinelearning/webmcp) の最新を確認すべき。
- Edge はフラグ付きで対応、Firefox / Safari は様子見と報じられている（二次情報）。標準化は W3C Community Group のインキュベーション段階であり、正式な W3C 勧告トラックにはまだ乗っていない。

**エージェント / クライアント側**:

- Cloudflare の BrowserRun が対応済み。MCP 互換エージェントであれば追加実装なしにツールを呼べるというのが売りで、ブラウザ拡張型・ブラウザ内蔵型のエージェント（Chrome の Gemini 統合など）が主要なクライアントになると見られる。

**Cloudflare のロードマップ**（記事より）:

- パックは今後追加され、サイトは「再デプロイなしでトグルを増やすだけ」でオプトインできる。
- 将来のパックは、ページ単体ではできない処理（例: **Workers AI** によるサイトマップ要約、**AI Search** インデックスへのクエリ）のために Worker を呼び出せるようにする構想。
- **Cloudflare Radar** も独自の WebMCP ツールを近く提供予定。
- フィードバック窓口は Cloudflare Developers Discord と Community forum。

**所感（推測を含む）**: WebMCP は「エージェント向けにサイトを二重実装する」コストが普及の最大障壁であり、Cloudflare の「エッジで注入して全ゾーンに一括配布する」アプローチはこの鶏卵問題への現実的な回答と見られる。一方で、仕様（API の生える場所すら移動中）・ブラウザ実装・セキュリティモデルのいずれも流動的であり、本番サイトでの採用判断は origin trial の帰結と prompt injection 対策の標準化を見てからでも遅くないと見られる。

## 参考リンク

- [WebMCP on Cloudflare（Cloudflare Blog, 2026-08-06）](https://blog.cloudflare.com/webmcp/) — 一次出典
- [webmachinelearning/webmcp（GitHub, W3C Web Machine Learning CG）](https://github.com/webmachinelearning/webmcp) — 提案リポジトリ
- [WebMCP proposal.md](https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md) — 提案文書
- [WebMCP 仕様ドラフト](https://webmachinelearning.github.io/webmcp/)
- [awesome-webmcp](https://github.com/webmachinelearning/awesome-webmcp) — 関連リソース集
- [InfoQ: WebMCP Standard Proposal for Agentic Web Actuation Now Available in Chrome (Origin Trials)](https://www.infoq.com/news/2026/06/webmcp-web-agent-standard-chrome/)
- [ppc.land: Chrome 149 origin trial puts WebMCP in developers' hands at last](https://ppc.land/chrome-149-origin-trial-puts-webmcp-in-developers-hands-at-last/)
- [DEV Community: WebMCP in Chrome 149: web pages get a tool API for AI agents](https://dev.to/thousand_miles_ai/webmcp-in-chrome-149-web-pages-get-a-tool-api-for-ai-agents-bfi)
- [Chrome for Developers: Agent security considerations for WebMCP](https://developer.chrome.com/docs/agents/security)
- [Search Engine Journal: WebMCP Can Be Used To Hijack AI Agents, Chrome Warns](https://www.searchenginejournal.com/webmcp-can-be-used-to-hijack-ai-agents-chrome-warns/578904/)
