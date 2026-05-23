# TypeScript Branded Types（ブランド型）調査レポート

> 発行日: 2026-05-23
> テーマ: TypeScriptの構造的型付けの穴を埋める「Branded Types（ブランド型 / 公称型エミュレーション）」の仕組み・実装手法・実践パターン・落とし穴の整理

## TL;DR

- TypeScriptは**構造的型付け（structural typing）**なので、`string` の `UserId` と `ProductId` は型的に区別されず、取り違えてもコンパイルが通ってしまう。
- **Branded Types** は、プリミティブ型に**コンパイル時だけのタグ（ブランド）**を交差型で付与し、見た目が同じでも別物として扱わせるテクニック。**実行時コストはゼロ**（ブランドは実体を持たない）。
- ブランドのキーは **`unique symbol` を推奨**（文字列キー `__brand` は衝突・IDE補完ノイズのリスク）。
- 値をブランド型に「昇格」させる入口を**スマートコンストラクタ**に集約し、そこで**検証（parse, don't validate）**するのが定石。
- Zod の `.brand()` 等で「I/O境界で検証してブランドを付ける」と、検証済みであることを型で保証できる。
- 代償: 一度ブランド化すると、生の値を直接代入できず**昇格（キャスト/コンストラクタ）が必須**になる。テストやモック作成にはヘルパーを用意する。

---

## 1. なぜ必要か — 構造的型付けの落とし穴

TypeScriptは「同じ形なら同じ型」とみなす。次は**バグだがコンパイルが通る**:

```ts
function getUser(userId: string) { /* ... */ }

const productId: string = "prod_123";
getUser(productId); // ❌ 取り違えだが string 同士なのでエラーにならない
```

`UserId` も `ProductId` も実体は `string`。**意味的に別物なのに型が同じ**ため、引数の順序ミスや取り違えを型システムが検出できない。これがブランド型で解こうとする中心的な問題。

---

## 2. 基本パターン（交差型によるブランド付与）

ブランド型は、プリミティブ型に「実在しないタグ用プロパティ」を交差（intersection）して作る。

```ts
type Brand<T, B> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type ProductId = Brand<string, "ProductId">;

function getUser(userId: UserId) { /* ... */ }

const raw = "user_123";
getUser(raw);            // ❌ string は UserId に代入不可
getUser(raw as UserId);  // ✅ 明示的に「昇格」すれば通る
```

- `__brand` プロパティは**コンパイル時のみの幻**で、実行時には存在しない（`as` でキャストするだけで実体は付かない）。
- `UserId` と `ProductId` はブランド文字列が異なるため、相互代入できない＝**公称型（nominal typing）的な区別**が得られる。

---

## 3. ブランドのキー: `unique symbol` を推奨

文字列キー（`__brand: "UserId"`）には2つの弱点がある:

1. **衝突リスク**: サードパーティの実オブジェクトが偶然 `__brand` プロパティを持つ可能性。
2. **補完ノイズ**: `obj.` で `__brand` が候補に出る。

これらを `unique symbol` で解消できる（**本番コードはこちらを推奨**）:

```ts
declare const brand: unique symbol;

type Brand<T, B> = T & { readonly [brand]: B };

type UserId = Brand<string, "UserId">;
type Email  = Brand<string, "Email">;
```

- `declare const brand: unique symbol` は型空間専用の一意なキー。実行時には何も生成しない。
- symbolキーは**補完に出ず**、外部コードと**衝突しない**。

### 手法の比較

| 手法 | 衝突耐性 | 補完ノイズ | 実行時コスト | 備考 |
| --- | --- | --- | --- | --- |
| 文字列キー `__brand: "X"` | △ 偶発衝突あり | あり | 0 | 最も手軽・学習向け |
| **`unique symbol` キー** | ◎ | なし | 0 | **本番推奨** |
| クラス + `private` フィールド | ◎ | なし | あり（インスタンス） | 真の公称型だが値がオブジェクトになる |

---

## 4. スマートコンストラクタと「Parse, don't validate」

`as` を現場のあちこちで書くと、ブランドの意味（不変条件）が崩れる。**昇格の入口を1か所に集約**し、そこで検証する。

```ts
type Email = Brand<string, "Email">;

// スマートコンストラクタ: 検証を通った値だけがブランド型になる
function Email(value: string): Email {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return value as Email; // 検証済みなのでここでのキャストは安全
}

function sendMail(to: Email) { /* ... */ }

sendMail("foo");              // ❌ string は Email でない
sendMail(Email("a@b.com"));   // ✅ コンストラクタ経由でのみ昇格
```

これは **Parse, don't validate**（境界で一度検証して「検証済み」を型に焼き込み、以降は再検証しない）の実践。`Email` 型を受け取った関数は「この文字列は検証済み」という不変条件を**型で保証**される。

例外を投げない `Result` 型を返す形にすると、よりこの哲学に沿う:

```ts
function parseEmail(value: string): Email | undefined {
  return /.../.test(value) ? (value as Email) : undefined;
}
```

---

## 5. ライブラリ・エコシステム

### Zod の `.brand()`

スキーマ検証ライブラリと組み合わせると「I/O境界で検証 → ブランド付与」が自然に書ける。

```ts
import { z } from "zod";

const UserId = z.string().uuid().brand<"UserId">();
type UserId = z.infer<typeof UserId>; // string & brand

const id = UserId.parse(input); // 検証を通った値だけ UserId になる
```

- 検証（uuid形式など）と公称型付けを一度に達成できる。
- 注意: `.brand()` は Zod 内部型に依存するため、**Zodに密結合する**のを嫌い、独自の `transform` パイプラインで自前ブランドを付ける流派もある。

### その他

- **ts-brand**: ブランド型ヘルパーを提供する軽量ユーティリティ。
- **newtype-ts**: fp-ts エコシステムでの newtype 表現。
- **ArkType**: parse-don't-validate 志向のバリデータ。ただし**モジュール境界をまたぐブランド合成**で問題が出た事例があり、実プロジェクト構成での検証が推奨される。

---

## 6. Branding と Flavoring（厳格 vs 緩い）

ブランドを**必須プロパティ**にすると「生の値を直接渡せない」厳格さが出る。逆に**任意プロパティ**にする「Flavoring（フレーバー）」は緩い区別を与える。

```ts
// Flavoring: ブランドを optional にする
type Flavor<T, F> = T & { readonly __flavor?: F };
type UserId = Flavor<string, "UserId">;

const id: UserId = "user_1"; // ✅ 生の string も代入できる（緩い）
```

- **Branding（必須）**: 昇格を強制。安全だが書き味は固い。
- **Flavoring（任意）**: 生値の代入を許す。取り違え検出は効くが、検証の強制力は弱い。

「IDの取り違えだけ防げれば十分でキャストの手間は避けたい」場合は Flavoring、「検証済みであることを保証したい」場合は Branding、と使い分ける。

---

## 7. 落とし穴・注意点

| 注意点 | 内容・対策 |
| --- | --- |
| **昇格の手間** | ブランド化すると生値を直接代入できない。テスト・モック・自動生成コードで `as` が増えがち → コンストラクタ／ファクトリを用意して集約する。 |
| **キャストの安全性は人間任せ** | `value as Brand` はTSが正しさを保証しない。検証はコンストラクタに閉じ込め、現場での生キャストを避ける。 |
| **実行時には消える** | ブランドはコンパイル時のみ。`JSON.stringify` 等では普通の `string`/`number` として扱われる（直列化は問題なし。ただし「実行時に型を判別」はできない）。 |
| **ジェネリックヘルパーの共有** | `Brand<T,B>` のキーを使い回すと別ブランド同士が緩く混ざる実装もある。`unique symbol` 採用＋ブランド名を型引数で分けることで区別を維持する。 |
| **過剰適用** | あらゆる文字列をブランド化すると記述コストが跳ねる。**取り違えると痛い値（ID・通貨・単位・検証済み入力）に絞る**のが費用対効果が高い。 |

---

## 8. 実践で効く適用先

- **識別子**: `UserId` / `ProductId` / `OrderId` の取り違え防止。
- **検証済み文字列**: `Email` / `Url` / `Uuid` / `NonEmptyString`。
- **単位・数値の意味**: `Meters` と `Feet`、`Cents`（最小通貨単位）、`Timestamp`（ミリ秒 vs 秒）。
- **エスケープ済み/サニタイズ済み**: `SafeHtml` のような「処理済み」状態の表現。

---

## 9. チートシート

```ts
// 推奨ベース: unique symbol ブランド
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

// 1) ID の取り違え防止
type UserId = Brand<string, "UserId">;
const UserId = (v: string): UserId => v as UserId;

// 2) 検証済み文字列（スマートコンストラクタで parse）
type Email = Brand<string, "Email">;
const Email = (v: string): Email => {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("invalid");
  return v as Email;
};

// 3) 単位
type Cents = Brand<number, "Cents">;
const Cents = (n: number): Cents => Math.round(n) as Cents;
```

| やりたいこと | 選択 |
| --- | --- |
| 衝突・補完ノイズを避けたい | `unique symbol` キー |
| 検証済みを型で保証したい | スマートコンストラクタ＋Parse, don't validate |
| スキーマ検証と統合したい | Zod `.brand()` |
| 取り違え検出だけ・キャスト省略 | Flavoring（optionalブランド） |
| 真の公称型が要る | クラス＋privateフィールド（実行時コストあり） |

---

## ソース

- [TypeScript Playground — Nominal Typing（公式）](https://www.typescriptlang.org/play/typescript/language-extensions/nominal-typing.ts.html)
- [Nominal `unique type` brands（microsoft/TypeScript PR #33038）](https://github.com/microsoft/TypeScript/pull/33038)
- [Branded Types in TypeScript: From Structural to Nominal Typing](https://nanamanu.com/posts/branded-types-typescript/)
- [Preventing Accidental Interchangeability — Branding & the Unique Property Pattern](https://dev.to/silentwatcher_95/preventing-accidental-interchangeability-in-typescript-branding-the-unique-property-pattern-hda)
- [Understanding Branded Types in TypeScript（typescript.tv）](https://typescript.tv/hands-on/understanding-branded-types-in-typescript/)
- [Type Branding with Zod（Steve Kinney）](https://stevekinney.com/courses/full-stack-typescript/type-branding-with-zod)
- [Avoid stupid mistakes with type Branding and Flavoring](https://dev.to/shaharke/avoid-stupid-mistakes-with-type-branding-and-flavoring-1g8p)
- [ArkType: The Parse-Don't-Validate Sequel](https://cekrem.github.io/posts/arktype-parse-dont-validate-sequel/)
- [How to Implement Branded Types in TypeScript（oneuptime）](https://oneuptime.com/blog/post/2026-01-30-how-to-implement-branded-types-in-typescript/view)
