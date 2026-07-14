---
title: "React Compilerの最適化を効かせるための型・Lint整理"
---

> 発行日: 2026-05-22
> テーマ: React Compiler（自動メモ化）が前提とする「純粋性 / Rules of React」を、TypeScriptの型と各Linter（ESLint / Biome / Oxlint）でどこまで担保できるかの整理

## TL;DR

- React Compilerは**コンポーネント/フックが純粋（pure）であること**を前提に自動メモ化する。純粋性を静的に証明できない箇所は**保守的に最適化をスキップ（bailout）**する。つまり「最適化が効くコードを書く＝Rules of Reactを守る」こと。
- 役割分担はこう整理できる:
  - **型（TypeScript）**: props/stateの**変異（mutation）を型レベルで防ぐ**（`readonly` / `Readonly<T>`）。ただしレンダー中の副作用そのものは検出できない。
  - **Lint**: Rules of Reactの違反（純粋性・不変性・refの誤用・レンダー中のsetState等）を検出する。**コンパイラ由来の純粋性ルールを持つのは現状ESLint（`eslint-plugin-react-hooks` v6）が唯一**。
  - **コンパイラ自身**: 最終的な番人。違反箇所はビルド時に診断＋スキップする。
- 推奨は **TypeScript（readonly中心）＋ `eslint-plugin-react-hooks` v6（`recommended-latest`）** を軸に、速度が必要なら Biome / Oxlint を Rules of Hooks・exhaustive-deps の高速チェックとして併用する構成。

---

## 1. なぜ「純粋性」が最適化に効くのか

React Compiler v1.0 は `useMemo` / `useCallback` / `React.memo` を手書きしなくても、コンポーネントとフックを自動でメモ化する。その前提が **Rules of React** で、特に純粋性が重要になる。

コンパイラは「子コンポーネントのprops」や「effectの依存配列」など**同一性（identity）が意味を持つ位置に流れる値**を、その計算が純粋であると証明できる場合に限ってメモ化する。証明できなければ保守的に最適化を見送る。したがって、純粋でないコードは「壊れる」のではなく「**最適化されないまま残る**」。

最適化のために守るべき Rules of React（純粋性に関わる主なもの）:

- コンポーネント/フックは**冪等**で、レンダー中に副作用を起こさない
- **props / state は不変**として扱い、変異しない
- JSXで使った後の値を**後から書き換えない**
- レンダー中に **ref を読み書きしない**
- レンダー中に **setState を呼ばない**（制御された例外を除く）
- レンダー中に `Date.now()` / `Math.random()` など**非決定的な値を読まない**
- フックは**トップレベルでのみ**呼ぶ（Rules of Hooks）

---

## 2. React Compilerがbailoutする主な条件

| 状況 | 振る舞い |
| --- | --- |
| 純粋性を静的に証明できない | その値のメモ化を見送る（保守的にopt-out） |
| props/state/グローバルを変異している | 最適化対象から外れやすい |
| 既存の手動メモ化を保持できない | `CannotPreserveMemoization` でそのコンポーネントを丸ごとスキップ |
| 未対応構文を含む | 該当コンポーネント/フックをスキップして、残りはコンパイル |

ポイントは**「全部か無か」ではなく関数単位でスキップ**される点。だからこそ、Lintで違反箇所を可視化して潰すほど、最適化のカバレッジが上がる。

> 重要: React公式は「**コンパイラを導入する前でも `eslint-plugin-react-hooks` でルール違反を洗い出せる**」という段階的アプローチを推奨している。Lint整備はコンパイラ採用の前提作業になる。

---

## 3. 型（TypeScript）でできること・できないこと

TypeScriptは「副作用の有無」は判定できないが、**変異を型で禁止する**ことで純粋性違反の大きな一群（props/stateの書き換え）を未然に防げる。

### できること

- **propsを読み取り専用にする**: 関数コンポーネントのpropsはデフォルトで `Readonly` 相当だが、ネストしたオブジェクト/配列は浅い。深い不変を意図するなら明示する。

  ```ts
  type Props = Readonly<{
    items: readonly Item[];        // 配列の push/splice を型エラーに
    user: Readonly<{ name: string }>;
  }>;
  ```

- **`readonly` 修飾子 / `ReadonlyArray<T>` / `as const`** でデータ構造の変異を禁止する。
- **`tsconfig` の `strict` 系**（特に `noUncheckedIndexedAccess`）で「使う前の値」の扱いを厳格化する。

### できないこと（Lint/コンパイラに任せる領域）

- レンダー中の `Date.now()` / `Math.random()` 呼び出しなど**非決定的な副作用**の検出
- レンダー中の **ref 読み書き** や **setState** の検出
- 毎レンダーで**コンポーネントを再生成している**（static-components違反）といったReact特有のパターン

→ 型は「変異の入り口を塞ぐ」ところまで。**Reactのレンダー意味論に踏み込む検査はLintの仕事**。

---

## 4. Lint: 3ツールの守備範囲

### 4-1. ESLint（`eslint-plugin-react-hooks` v6）— 唯一、コンパイラ由来の純粋性ルールを持つ

v6.x から、React Compilerが生成するルール群が `react-hooks/` プレフィックスでバンドルされた。純粋性・不変性に直結するのはこのセット。

| ルール | 検出内容 |
| --- | --- |
| `react-hooks/purity` | コンポーネント/フック内の既知の不純な関数呼び出し |
| `react-hooks/immutability` | props/state/不変値への変異 |
| `react-hooks/refs` | レンダー中のref読み書きなど不正なref使用 |
| `react-hooks/set-state-in-render` | レンダー中のsetState |
| `react-hooks/set-state-in-effect` | effect内での同期的なsetState |
| `react-hooks/static-components` | 毎レンダー再生成される非静的コンポーネント |
| `react-hooks/preserve-manual-memoization` | 既存の手動メモ化が保持可能か |
| `react-hooks/globals` | レンダー中のグローバル値の代入/変異 |
| `react-hooks/error-boundaries` | try/catchではなくError Boundaryを使うべき箇所 |
| `react-hooks/rules-of-hooks` / `react-hooks/exhaustive-deps` | 従来のコアルール |

設定（ESLint v9 / flat config）:

```js
// eslint.config.js
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // recommended-latest はコンパイラ由来の実験的ルールまで含む
  reactHooks.configs.flat['recommended-latest'],
];
```

- `recommended`: 安定版の推奨ルール
- `recommended-latest`: 上記＋**コンパイラ由来の実験的（bleeding edge）ルール**。純粋性チェックを最大限効かせたいならこちら。

### 4-2. Biome — Rules of Hooks系は速い、コンパイラ純粋性ルールは未提供

- `useExhaustiveDependencies`（依存配列）、`useHookAtTopLevel`（Rules of Hooks）など**フック系の基本ルールは高速に実行できる**。
- **React Compiler専用の純粋性ルールは未実装**。これらはコンパイラ本体との統合が必要なため（議論: biomejs/biome #5290）。
- 既知の相性問題: `useExhaustiveDependencies` はコンパイラが自動ラップする関数に対して誤検知し得るため、`reactCompiler` オプションの追加が提案中（#5293）。
- 型認識（type-aware）: Biome v2 でScanner＋型推論が入り、`noFloatingPromises` 等を**typescript-eslintの約85%の精度**で低コストに検出。ただし完全な型検査ではない。

```jsonc
// biome.json
{
  "linter": {
    "rules": {
      "correctness": {
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error"
      }
    }
  }
}
```

### 4-3. Oxlint（Oxc）— Rules of Hooksはネイティブ高速、コンパイラルールはJSプラグイン経由

- `react` / react-hooks 系のルール（rules-of-hooks、exhaustive-deps）は**Rustでネイティブ実装され高速**。
- **React Compilerルールはネイティブには実装しない方針**（コンパイラ統合が必要なため）。ただし **JSプラグイン機能（`jsPlugins`）経由でコンパイラ由来ルールを読み込める**（デモ: `TheAlexLichter/oxlint-react-compiler-rules`、Issue: oxc #20791 / #15258）。`react-hooks` は予約名のため、JSプラグインでは別ネームスペースを使う。
- 型認識（type-aware）: **tsgolint** により typescript-eslint の type-aware ルール 61個中59個をサポート。

```jsonc
// .oxlintrc.json（概念例。コンパイラルールはjsPlugins経由）
{
  "plugins": ["react"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn"
  }
}
```

---

## 5. 比較表

| 観点 | TypeScript | ESLint (`react-hooks` v6) | Biome | Oxlint (Oxc) |
| --- | --- | --- | --- | --- |
| props/stateの**変異禁止**（型) | ◎ `readonly`/`Readonly<T>` | △（immutabilityルールで実行時パターンを検出） | × | × |
| Rules of Hooks / exhaustive-deps | × | ◎ | ◎ | ◎（ネイティブ高速） |
| **コンパイラ純粋性ルール**（purity/immutability/refs/setState等） | × | ◎（唯一ネイティブ提供） | ×（未実装） | △（JSプラグイン経由で可） |
| static-components / preserve-manual-memoization | × | ◎ | × | △（JSプラグイン経由） |
| 型認識（type-aware）lint | ―（型検査本体） | ◎ typescript-eslint | △ 部分推論（v2 Scanner） | ◎ tsgolint（59/61） |
| 速度 | 遅め | 標準 | 速い | 最速級 |

凡例: ◎=得意 / △=条件付き・部分的 / ×=非対応

---

## 6. 推奨スタックと組み合わせ方

純粋性を最大限担保しつつ実用速度も確保する構成:

1. **型で変異を塞ぐ**（土台）
   - props/stateを `readonly` / `Readonly<T>` / `ReadonlyArray<T>` で固める
   - `tsconfig` は `strict` + `noUncheckedIndexedAccess`

2. **純粋性Lintの本命は ESLint の `eslint-plugin-react-hooks` v6**
   - `recommended-latest` を有効化し、`purity` / `immutability` / `refs` / `set-state-in-*` / `static-components` / `preserve-manual-memoization` で違反を洗い出す
   - これがコンパイラのbailoutを減らす最重要施策

3. **速度が要るならエディタ/コミット時に Biome か Oxlint を併用**
   - Rules of Hooks・exhaustive-deps・フォーマットを高速チェック
   - 「高速な一次フィルタ（Biome/Oxlint）＋ CIで純粋性まで含む ESLint」の二段構えが現実的
   - OxlintはコンパイラルールもJSプラグインで取り込めるため、ESLintを段階的に置き換える選択肢にもなる

4. **最後はコンパイラ自身**
   - 残ったbailoutはビルド診断で確認し、純粋性違反を順次修正してメモ化カバレッジを上げる

---

## 7. チートシート

| やりたいこと | 使うもの |
| --- | --- |
| propsを書き換えさせない | TypeScript `Readonly<T>` / `readonly` |
| レンダー中の副作用・非純粋呼び出しを検出 | ESLint `react-hooks/purity` |
| props/stateの変異を検出 | ESLint `react-hooks/immutability` |
| レンダー中のref/setStateを検出 | ESLint `react-hooks/refs` / `set-state-in-render` |
| 手動メモ化が壊れていないか | ESLint `react-hooks/preserve-manual-memoization` |
| フックの基本ルールを高速チェック | Biome `useHookAtTopLevel` / Oxlint `react/rules-of-hooks` |
| 依存配列の漏れ | いずれかの `exhaustive-deps` 系 |
| 型認識linterを高速に | Oxlint（tsgolint）/ Biome v2 |

---

## ソース

- [React Compiler – Introduction（react.dev）](https://react.dev/learn/react-compiler/introduction)
- [React Compiler v1.0（react.dev blog, 2025-10-07）](https://react.dev/blog/2025/10/07/react-compiler-1)
- [eslint-plugin-react-hooks（react.dev reference）](https://react.dev/reference/eslint-plugin-react-hooks)
- [eslint-plugin-react-hooks（npm）](https://www.npmjs.com/package/eslint-plugin-react-hooks)
- [Compiler bailout not caught by linter（reactwg/react-compiler Discussion #24）](https://github.com/reactwg/react-compiler/discussions/24)
- [React Compiler lint rules（biomejs/biome Discussion #5290）](https://github.com/biomejs/biome/discussions/5290)
- [Add `reactCompiler` option for `useExhaustiveDependencies`（biome #5293）](https://github.com/biomejs/biome/issues/5293)
- [useExhaustiveDependencies（Biome）](https://biomejs.dev/linter/rules/use-exhaustive-dependencies/)
- [Support for React Compiler rules（oxc #20791）](https://github.com/oxc-project/oxc/issues/20791)
- [oxlint-react-compiler-rules（JSプラグインデモ）](https://github.com/TheAlexLichter/oxlint-react-compiler-rules)
- [Type-Aware Linting（Oxlint）](https://oxc.rs/docs/guide/usage/linter/type-aware.html)
- [OXC vs ESLint vs Biome: JavaScript Linting in 2026（PkgPulse）](https://www.pkgpulse.com/guides/oxc-vs-eslint-vs-biome-javascript-linting-2026)
