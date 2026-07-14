---
title: "SPAのfetch APIを zod・OpenAPI で型安全にする調査レポート"
---

> 発行日: 2026-06-08
> テーマ: SPAで`fetch`を使ってAPIを叩くとき、**リクエストパラメータの型**・**レスポンスのパース型**を、**OpenAPI** と **Zod** を組み合わせて省力化する。さらに「スキーマから生成した型でモデルにパースする」までの現実的な構成を整理する

## TL;DR

- `fetch`そのものはレスポンスを`any`（実質）で返す。**型を付ける**ことと**実行時に検証する**ことは別問題で、両方を一度に解決する銀の弾丸は「ソース・オブ・トゥルース（信頼できる単一の定義）を1つに絞ること」。
- 信頼の起点をどこに置くかで構成が二分される:
  - **スキーマ駆動（spec-first）**: OpenAPI仕様が正。仕様から **TS型** と **Zodスキーマ** と **APIクライアント** を生成する。バックエンドが別言語/別チームのときの定番。
  - **コード駆動（code-first）**: Zodスキーマが正。Zodから **OpenAPI仕様** を出力する（Zod 4ネイティブの`z.toJSONSchema`、`zod-to-openapi`、Hey API等）。フロント/バックともTSで握れるときに強い。
- **型だけ**で十分なら `openapi-typescript` + `openapi-fetch` が最軽量（**実行時コストゼロ**、パスパラメータ・クエリ・ボディ・レスポンスが全部型補完される）。ただし**実行時検証はしない**ので、バックエンドが仕様を破ったときに気づけない。
- **実行時にもパースしたい**なら、`openapi-typescript`の型に **Zodの検証層**を足すか、最初から **Hey API（`@hey-api/openapi-ts` + Zodプラグイン）/ orval / openapi-zod-client** で **Zodスキーマごと生成**する。
- 「**スキーマから型生成したものでパースしたい**」という要望そのものは、Zodの **`z.infer<typeof schema>`** が答え。スキーマを1つ書けば、`parse()`で実行時検証しつつ、`z.infer`で同じ定義から静的型が降ってくる（**二重管理が消える**）。
- 推奨は **目的別**:
  - とにかく軽く・型補完だけ欲しい → `openapi-typescript` + `openapi-fetch`
  - 型補完 ＋ レスポンスの実行時検証も欲しい → **Hey API（Zodプラグイン）** か **orval（zodモード）**
  - フロント/バック両方TSで、Zodを正にしたい → **Zod 4 + `z.toJSONSchema` / ts-rest / zodios**

---

## 1. 問題の整理 ── 「型」と「実行時検証」は別物

`fetch`の戻りは標準では型が付かない:

```ts
const res = await fetch("/api/users/1");
const user = await res.json(); // user: any（実質なんでも代入できる）
user.naem; // ❌ typoしてもコンパイルが通る
```

ここでやりたいことは2つある。混同しやすいので分ける。

| やりたいこと | 性質 | 担う技術 |
| --- | --- | --- |
| ① リクエストの**パラメータ型**（パス/クエリ/ボディ）を補完したい | **コンパイル時** | TypeScript型（OpenAPIから生成 or 手書き） |
| ② レスポンスを**型付きで受け取りたい** | **コンパイル時** | 同上 |
| ③ レスポンスが**本当にその形か実行時に検証**したい | **実行時** | Zod 等のバリデータ |

重要な事実: **TypeScriptの型はビルド時に消える**。`as User`しようが`openapi-typescript`の型を当てようが、**実行時にバックエンドが違う形を返したら何も起きない**（`undefined`が後段で爆発するだけ）。HTTP越しに来るデータは「外部入力」なので、本当に堅くしたいなら③の実行時検証が要る。これがZodを併用する動機。

> 一言でいうと: **型生成（OpenAPI）＝開発体験と仕様追従、Zod＝実行時の安全網**。両者は競合せず役割が違う。

---

## 2. 2つの設計方向 ── どちらを「正」にするか

### 2-1. スキーマ駆動（spec-first）

OpenAPI（`openapi.yaml` / `openapi.json`）を**唯一の正**とし、そこから生成する。

```
openapi.yaml ──┬──> TypeScript型（openapi-typescript）
               ├──> Zodスキーマ（hey-api / orval / openapi-zod-client）
               └──> APIクライアント（openapi-fetch / 生成クライアント）
```

- 向いているケース: バックエンドが別言語・別チーム、複数クライアント（Web/モバイル）が同じ仕様を共有する、仕様がドキュメントとして先に存在する。
- メリット: 仕様が変わればフロントの型・検証が**生成し直すだけ**で追従。フロント側の手書きが消える。
- デメリット: OpenAPI仕様の品質に全部依存する。仕様が雑だと生成物も雑。

### 2-2. コード駆動（code-first）

Zodスキーマ（TS）を**唯一の正**とし、そこからOpenAPI仕様を**出力**する。

```
Zodスキーマ(.ts) ──┬──> z.infer で静的型
                   ├──> parse() で実行時検証
                   └──> OpenAPI仕様（z.toJSONSchema / zod-to-openapi / hey-api）
```

- 向いているケース: フロントもバックもTypeScript、いわゆるフルスタックTS（Next.js / Hono / tRPC / ts-rest）。
- メリット: Zodを1か所書けば「型・実行時検証・APIドキュメント」が同期する。**二重管理が原理的に発生しない**。
- デメリット: バックがTSでないと成立しない。OpenAPIはあくまで副産物。

> 本レポートの主眼（fetchで叩く側＝フロント）では、バックの仕様が既にOpenAPIで存在するなら **スキーマ駆動** が素直。フロント/バック両方を握れるなら **コード駆動** が最も二重管理を減らせる。

---

## 3. 「スキーマから生成した型でパースする」の核心 ── `z.infer`

ユーザーの要望「**モデルにパースする際に、スキーマから型生成したものでパースしたい**」の答えは、Zodの基本機能 `z.infer` に尽きる。**スキーマを1つ書けば型が自動で降りてくる**ので、型とバリデーションを別々に書く必要がない。

```ts
import { z } from "zod"; // v4 系

// 1) スキーマを1か所だけ定義する（これが正）
const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.email(),          // v4: z.string().email() は非推奨化、トップレベルに移動
  role: z.enum(["admin", "user"]),
  createdAt: z.iso.datetime(),
});

// 2) スキーマから静的型を「生成」する（手書きの interface は不要）
type User = z.infer<typeof UserSchema>;
//   { id: number; name: string; email: string;
//     role: "admin" | "user"; createdAt: string }

// 3) fetch のレスポンスを “パース” する＝実行時検証 + 型確定が同時に起きる
async function getUser(id: number): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: unknown = await res.json();
  return UserSchema.parse(json); // 形が違えば即 throw。戻りは User 型に確定
}
```

ポイント:

- `z.infer<typeof UserSchema>` が「**スキーマから型生成したもの**」。これでパースすれば、**実行時の保証**と**静的型**が同じ定義から来る。
- 例外を投げたくないなら `safeParse`:

  ```ts
  const r = UserSchema.safeParse(json);
  if (!r.success) { /* r.error に詳細 */ }
  else { const user = r.data; /* User型 */ }
  ```

- 入力と出力で型が変わる変換（`z.coerce` や `.transform()`）を使うときは `z.input<>` / `z.output<>` を使い分ける。

**この `z.infer` パターンが、スキーマ駆動でもコード駆動でも共通の土台**になる。違うのは「Zodスキーマを手書きするか、OpenAPIから生成するか」だけ。

---

## 4. ツール比較 ── 何を生成し、実行時検証があるか

| ツール | 入力→出力 | 生成物 | 実行時検証 | HTTPクライアント | 主な用途 |
| --- | --- | --- | --- | --- | --- |
| **openapi-typescript** | OpenAPI→TS | 型のみ（`paths`型） | ❌ なし | なし | 最軽量。型補完だけ欲しい |
| **openapi-fetch** | （上の型を利用） | 型安全な`fetch`ラッパ | ❌ なし | 独自(fetchラップ) | ↑とセットで定番 |
| **Hey API** (`@hey-api/openapi-ts`) | OpenAPI→TS | クライアント＋型＋**Zod**(プラグイン) | ✅ Zodプラグインで可 | fetch/axios選択可 | 生成クライアント＋検証 |
| **orval** | OpenAPI→TS | クライアント＋**Zod**＋react-query等 | ✅ zodモードで可 | fetch/axios | RustなしのフルセットDX |
| **openapi-zod-client** | OpenAPI→TS | **zodios**クライアント(Zod内蔵) | ✅ あり | axios(zodios) | Zod中心の生成クライアント |
| **ts-rest** | TSの契約(Zod) | 型安全クライアント/サーバ | ✅ Zod契約 | fetch | code-first・RPC的契約 |
| **zodios** | TSのZod定義 | 型安全クライアント | ✅ Zod | axios | code-first・Zod前提 |
| **tRPC** | TSのprocedure | 型安全RPC | ✅(入力) | 独自 | フルスタックTS・非REST |
| **Zod 4 `z.toJSONSchema`** | Zod→JSON Schema/OpenAPI | OpenAPI仕様 | （Zod自体が検証） | なし | code-firstで仕様を出力 |
| **zod-to-openapi** | Zod→OpenAPI | OpenAPI仕様 | （同上） | なし | code-firstで仕様を出力 |

要点:

- **`openapi-typescript`系は「型だけ・実行時検証なし」**。最速・最軽量だが③（実行時検証）は別途。
- **Hey API / orval / openapi-zod-client は Zodスキーマも生成**できるので、③まで含めて省力化できる。
- **ts-rest / zodios / tRPC / Zod 4 `toJSONSchema`** は code-first（Zodが正）。

---

## 5. 実装パターン別レシピ

### パターンA: 最軽量・型補完だけ（openapi-typescript + openapi-fetch）

実行時検証は要らない／別レイヤでやる場合。**実行時コストはほぼゼロ**（生成物は純粋な型と薄いfetchラッパ）。

```bash
# 型を生成（CIやpreスクリプトで回す）
npx openapi-typescript ./openapi.yaml -o ./src/api/schema.d.ts
```

```ts
// src/api/client.ts
import createClient from "openapi-fetch";
import type { paths } from "./schema"; // ↑で生成した型

export const api = createClient<paths>({ baseUrl: "/api" });
```

```ts
// 利用側: パスパラメータ・クエリ・ボディ・レスポンスが全部型付き
const { data, error } = await api.GET("/users/{id}", {
  params: {
    path: { id: 1 },          // ✅ number 必須・補完される
    query: { include: "org" },// ✅ 定義外のキーは型エラー
  },
});
// data は openapi.yaml で定義したレスポンス型に確定
// （ただし “実行時に本当にその形か” は検証していない点に注意）

const created = await api.POST("/users", {
  body: { name: "Alice", email: "a@example.com" }, // ✅ ボディも型付き
});
```

- ①②（リクエスト型・レスポンス型）はこれで完全に満たせる。
- ③（実行時検証）が要るなら次のパターンBへ。

### パターンB: 型補完 ＋ 実行時検証（生成型 + Zod検証層）

「`openapi-typescript`の型は便利だが、外部APIなので実行時にも守りたい」ケース。**境界（重要なエンドポイント）だけ**Zodを挟むのが現実的。

```ts
import { z } from "zod";
import { api } from "./client";

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.email(),
});

export async function fetchUser(id: number) {
  const { data, error } = await api.GET("/users/{id}", { params: { path: { id } } });
  if (error) throw error;
  return UserSchema.parse(data); // ← ここで実行時の最終防衛線
}
```

- メリット: 軽い生成物（型）はそのまま、検証は本当に必要な箇所だけに限定できる。
- デメリット: Zodスキーマを手書きするので、OpenAPI定義との**二重管理**が発生する。これが嫌なら次のパターンC（Zodごと生成）。

### パターンC: Zodスキーマごと生成（Hey API / orval）

OpenAPIからZodスキーマまで生成し、二重管理を消す。**スキーマ駆動で③まで自動化**したい場合の本命。

```bash
# Hey API の例（Zod プラグインを有効化）
npx @hey-api/openapi-ts \
  -i ./openapi.yaml \
  -o ./src/api \
  -c @hey-api/client-fetch
# 設定で plugins に 'zod' を加えると、各スキーマの Zod 版が出力される
```

- 生成された Zodスキーマで `parse()` すれば、③が**仕様から自動追従**する。`z.infer`相当の型も生成物に含まれる。
- **orval** も同様に `client: 'fetch'` + `zod` モードで、APIクライアント＋Zodスキーマ＋（任意で）react-queryフックまで生成できる。
- 注意: orvalのZod生成は **split/標準モードで既知の不具合**が報告されており（GitHub issue #2933 等）、本番投入チームが後処理で回避している例がある。採用時は生成物を必ず確認する。

### パターンD: code-first（Zodが正、OpenAPIは出力）

フロント/バックともTSで、Zodを唯一の正にしたいケース。Zod 4は **ネイティブで`z.toJSONSchema`** を持つ（`zod-to-json-schema`はもう不要）。

```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.email(),
}).meta({ id: "User", description: "アプリのユーザー" }); // .meta でOpenAPIメタ情報

// Zod → JSON Schema / OpenAPI 3.0 を出力
const jsonSchema = z.toJSONSchema(UserSchema, { target: "openapi-3.0" });
```

- `.meta()` に付けた `description` / `title` / `examples` は `z.globalRegistry` 経由で出力に反映される。
- これでZodが「型(`z.infer`)・実行時検証(`parse`)・APIドキュメント(OpenAPI)」を**1ソースで賄う**。バックも `ts-rest` / `zodios` / Hono+`@hono/zod-openapi` などZodベースなら契約をそのまま共有できる。

---

## 6. 落とし穴・注意点

- **型 ≠ 実行時保証**: `openapi-typescript`だけだと「コンパイルは通るが本番で`undefined`爆発」が起こりうる。クリティカルな境界はZodで`parse`する。
- **二重管理**: 「OpenAPI手書き」＋「Zod手書き」は最悪。どちらかを正にして他方を生成する（パターンC or D）。
- **Zod v3 / v4 の差**: v4で`z.string().email()`等が`z.email()`などトップレベルに移動・一部非推奨化。`z.toJSONSchema`はv4の新機能。生成ツール（orval等）は**インストール済みZodのバージョンを検出**して出力を変える実装が増えているが、混在に注意。
- **バンドルサイズ**: Zodは実行時ライブラリなのでSPAのバンドルに乗る。全レスポンスを検証すると重い → **境界・重要エンドポイントに絞る**、もしくはより軽量な`valibot`を検討（tree-shakingに強い）。
- **生成物の品質**: orvalのZod生成バグ（#2933）のように、生成系は仕様の書き方次第で破綻する。生成物をコミットして差分レビューする運用が安全。
- **`coerce`/`transform`時の入出力型**: 変換を挟むと入力型と出力型がズレる。クライアント側で`z.input`/`z.output`を取り違えない。

---

## 7. 結論 ── 要望へのマッピング

ユーザーの要望は「fetchの**リクエストパラメータ型**・**レスポンスパース型**を、**zod/openapiで楽に**し、**スキーマから生成した型でパース**したい」だった。これに対する最短経路:

| 要望 | 解 |
| --- | --- |
| リクエスト（パス/クエリ/ボディ）の型補完 | `openapi-typescript` + `openapi-fetch`（`api.GET("/users/{id}", { params })`） |
| レスポンスの型付き受け取り | 同上（`data`が仕様の型に確定） |
| レスポンスの**実行時パース** | Zodの`schema.parse()`／`safeParse()` を境界に挿す |
| **スキーマから型生成してパース** | `type User = z.infer<typeof UserSchema>`（スキーマ1つで型と検証を兼ねる） |
| OpenAPIとZodの**二重管理を消す** | スキーマ駆動なら **Hey API(Zodプラグイン) / orval** でZodごと生成。code-firstなら **Zod 4 `z.toJSONSchema`** で逆生成 |

**おすすめの初手**:

1. バックの仕様がOpenAPIで存在する → **`openapi-typescript` + `openapi-fetch`** で①②を即達成。実行時検証が要る境界だけ手書きZod、または不要なら型だけで運用。
2. 実行時検証も全面的に省力化したい → **Hey API（Zodプラグイン）** か **orval（zodモード）** で③まで生成。
3. フロント/バック両方TSで握れる → **Zod 4 を正**にして `z.toJSONSchema` でOpenAPIを出力（または `ts-rest` / `zodios`）。これが二重管理ゼロで最もスケールする。

---

## ソース

- [openapi-typescript / openapi-fetch 公式ドキュメント（openapi-ts.dev）](https://openapi-ts.dev/examples)
- [Building Type-Safe API Clients with OpenAPI and TypeScript（OpenReplay）](https://blog.openreplay.com/type-safe-openapi-typescript-client/)
- [Creating a Type-Safe Fetch API Client（nirtamir.com）](https://www.nirtamir.com/articles/creating-a-type-safe-fetch-api-client/)
- [Request Validation at the Edge: Zod Schemas, OpenAPI, and Type-Safe APIs（DEV, 2026）](https://dev.to/young_gao/request-validation-at-the-edge-zod-schemas-openapi-and-type-safe-apis-1kib)
- [Zod 公式 — JSON Schema（z.toJSONSchema）](https://zod.dev/json-schema)
- [Zod 公式 — Metadata and registries（.meta / globalRegistry）](https://zod.dev/metadata)
- [Zod 公式 — Release notes（v4）](https://zod.dev/v4)
- [Hey API — Zod v4 Plugin](https://heyapi.dev/openapi-ts/plugins/zod)
- [Orval — Zod ガイド](https://orval.dev/docs/guides/zod/)
- [Orval — Zod Generation Configuration（DeepWiki）](https://deepwiki.com/orval-labs/orval/5.1-zod-generation-configuration)
- [orval Issue #2933 — Zod schema generation (split mode) のバグ](https://github.com/orval-labs/orval/issues/2933)
- [openapi-zod-client（GitHub, astahmer）](https://github.com/astahmer/openapi-zod-client)
- [zod-to-openapi（GitHub, asteasolutions）](https://github.com/asteasolutions/zod-to-openapi)
- [Migrating to Zod 4: Breaking Changes & New Features（DEV）](https://dev.to/pockit_tools/migrating-to-zod-4-the-complete-guide-to-breaking-changes-performance-gains-and-new-features-3ll0)
