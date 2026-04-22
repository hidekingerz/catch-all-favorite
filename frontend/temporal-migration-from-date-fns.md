# date-fns / date-fns-tz から Temporal API への移行可能性レポート

> 調査日: 2026-04-22

## TL;DR

**移行は技術的に可能だが、現時点では「完全置き換え」ではなく「段階的移行」を推奨する。**

Temporal API は ES2026 Stage 4 に到達し、Chrome 144+ / Firefox 139+ / Edge 144+ で利用可能。date-fns / date-fns-tz が担っていた日付演算・タイムゾーン処理の大半を置き換えられる。ただし **Safari が未対応（ポリフィル必須）**、**カスタムフォーマット文字列（`format(date, 'yyyy/MM/dd')`）に相当する API がない**、**相対時間表現（「2時間前」）は別途対応が必要** という制約があり、ドロップインリプレースにはならない。

---

## 1. Temporal API の現状（2026年4月時点）

### 仕様策定

| マイルストーン | 日付 |
|---|---|
| TC39 Stage 4 到達 | 2026-03-11 |
| ES2026 RC に収録 | 2026-03-31 |
| ES2026 正式リリース予定 | 2026-06（Ecma GA 承認後）|

### ブラウザ対応状況

| ブラウザ | バージョン | ステータス |
|---|---|---|
| Chrome | 144+ | ✅ ネイティブサポート（2026年1月〜） |
| Firefox | 139+ | ✅ ネイティブサポート（2025年5月〜、初の実装） |
| Edge | 144+ | ✅ ネイティブサポート |
| Safari | Technology Preview のみ | ⚠️ フラグ付き実験的。リリース時期未公表 |
| Node.js | 24+ | ✅ 完全安定サポート |

**グローバルカバレッジ**: 約 64%（Can I use 基準）。iOS ユーザーがいるプロジェクトではポリフィル必須。

### ポリフィル

| パッケージ | 特徴 |
|---|---|
| `@js-temporal/polyfill` | TC39 公式。フル機能。バンドルサイズ大きめ |
| `temporal-polyfill` | 軽量版。公式と API 互換 |
| `temporal-polyfill-lite` | Gregorian カレンダー限定。`@js-temporal/polyfill` 比 60% 小、`temporal-polyfill` 比 10% 小 |

仕様が Stage 4 で確定済みのため、ポリフィルの API が今後変わるリスクはない。

---

## 2. date-fns / date-fns-tz の主要機能と Temporal 対応表

### 日付の生成・パース

| date-fns | Temporal | 備考 |
|---|---|---|
| `new Date()` | `Temporal.Now.plainDateTimeISO()` | ✅ 直接置換可能 |
| `new Date('2026-04-22')` | `Temporal.PlainDate.from('2026-04-22')` | ✅ ISO 8601 パースは完全対応 |
| `parse(str, 'yyyy/MM/dd', new Date())` | ❌ なし | ⚠️ カスタムフォーマットのパースは Temporal に存在しない。自前パースか補助ライブラリが必要 |

### 日付演算

| date-fns | Temporal | 備考 |
|---|---|---|
| `addDays(date, 7)` | `date.add({ days: 7 })` | ✅ Temporal は immutable で返す |
| `subMonths(date, 3)` | `date.subtract({ months: 3 })` | ✅ |
| `differenceInDays(a, b)` | `a.until(b, { largestUnit: 'day' }).days` | ✅ |
| `differenceInCalendarMonths(a, b)` | `a.until(b, { largestUnit: 'month' }).months` | ✅ |
| `intervalToDuration({ start, end })` | `start.until(end)` → `Temporal.Duration` | ✅ Temporal の Duration 型が自然に対応 |

### 比較・判定

| date-fns | Temporal | 備考 |
|---|---|---|
| `isBefore(a, b)` | `Temporal.PlainDate.compare(a, b) < 0` | ✅ |
| `isAfter(a, b)` | `Temporal.PlainDate.compare(a, b) > 0` | ✅ |
| `isEqual(a, b)` | `a.equals(b)` | ✅ |
| `isWeekend(date)` | `[6, 7].includes(date.dayOfWeek)` | ✅ 1行で代替可能 |
| `isValid(date)` | `try { Temporal.PlainDate.from(str) }` | ⚠️ バリデーション API はないが try-catch で代替 |

### フォーマット（最大の差分）

| date-fns | Temporal | 備考 |
|---|---|---|
| `format(date, 'yyyy-MM-dd')` | `date.toString()` | ✅ ISO 形式なら直接対応 |
| `format(date, 'yyyy年M月d日(E)')` | `date.toLocaleString('ja-JP', { ... })` | ⚠️ Intl.DateTimeFormat 経由。トークン指定ではなくオプションオブジェクトで制御。完全に同じ出力を再現するのが難しい場合がある |
| `format(date, 'HH:mm:ss.SSS')` | ❌ なし | ⚠️ Temporal は意図的にカスタムフォーマット文字列 API を持たない。Temporal v2 で提案中（`Format a Temporal object into a user-supplied string format` Issue #5） |
| `formatDistance(a, b)` | ❌ なし | ⚠️ 相対時間（「3日前」）は Temporal の範囲外。`Intl.RelativeTimeFormat` で部分的に代替可能だが、date-fns の自動単位選択は自前実装が必要 |
| `formatRelative(date, base)` | ❌ なし | ⚠️ 「昨日 14:30」のような表現は Temporal + Intl では直接できない |

### タイムゾーン（date-fns-tz → Temporal）

| date-fns-tz | Temporal | 備考 |
|---|---|---|
| `utcToZonedTime(date, tz)` | `Temporal.Instant.from(iso).toZonedDateTimeISO(tz)` | ✅ Temporal のタイムゾーンモデルの方がはるかに堅牢 |
| `zonedTimeToUtc(date, tz)` | `zdt.toInstant()` | ✅ |
| `format(zonedDate, 'yyyy-MM-dd HH:mm zzz', { timeZone })` | `zdt.toLocaleString('ja-JP', { timeZoneName: 'short', ... })` | ⚠️ Intl 経由。カスタムトークンは不可 |
| `getTimezoneOffset(tz, date)` | `zdt.offsetNanoseconds` | ✅ |
| DST 境界の扱い | `Temporal.ZonedDateTime` が DST を完全にモデル化 | ✅ date-fns-tz の最大の弱点が解消。曖昧な時刻の `disambiguation` オプション（`compatible` / `earlier` / `later` / `reject`）で明示的に制御可能 |

**タイムゾーン処理は Temporal の最大の強みであり、date-fns-tz の完全上位互換。**

date-fns-tz が内部で `Intl.DateTimeFormat` のハックを使って IANA タイムゾーンを処理していたのに対し、Temporal はエンジンレベルで `Temporal.ZonedDateTime` 型を持ち、DST 境界・曖昧な時刻・UTC オフセット変動をすべて型安全に表現する。

---

## 3. 移行できないもの・追加対応が必要なもの

### カスタムフォーマット文字列

**最大のギャップ。** date-fns の `format(date, 'yyyy/MM/dd (EEE) HH:mm')` のようなトークンベースのフォーマットは、Temporal に相当する API がない。

Temporal の設計方針として「フォーマットは `Intl.DateTimeFormat` に委譲する」と明示されており、V1 では意図的に未実装。Temporal v2 提案（`js-temporal/proposal-temporal-v2#5`）でカスタムフォーマット文字列の追加が議論されているが、策定時期は未定。

**対策**:
- `Intl.DateTimeFormat` + `formatToParts()` で組み立てる（冗長だが可能）
- 軽量フォーマットヘルパーを自前で用意する
- `date-fns` の `format()` のみ残す（Temporal オブジェクト → ISO 文字列 → date-fns format のブリッジ）

### 相対時間表現

`formatDistance` / `formatRelative` は Temporal の範囲外。`Intl.RelativeTimeFormat` で「3日前」「2時間後」は可能だが、date-fns のように自動で最適な単位を選んでくれる機能はないため、単位選択ロジックは自前で書く必要がある。

### ユーティリティ関数群

date-fns の `eachDayOfInterval` / `eachWeekOfInterval` / `closestTo` / `clamp` などの便利関数は Temporal にはない。ただし Temporal の `.until()` / `.add()` のループで容易に代替可能。

---

## 4. 移行戦略の選択肢

### A. 段階的移行（推奨）

```
現在: date-fns + date-fns-tz
  ↓
Phase 1: date-fns v4 に更新（date-fns-tz を統合、tz 系 import を整理）
  ↓
Phase 2: 内部ロジック（演算・比較・TZ 処理）を Temporal に置換
         フォーマットは date-fns format() を残す
  ↓
Phase 3: Safari がネイティブ対応後、ポリフィル除去
         カスタムフォーマットは Intl.DateTimeFormat または
         Temporal v2 のフォーマット API で置換
```

**メリット**: リスクが小さい。各フェーズで動作確認可能。Safari 対応を待てる。
**デメリット**: 完了まで時間がかかる。過渡期は date-fns と Temporal が混在する。

### B. 一括移行 + ポリフィル

```
date-fns + date-fns-tz
  ↓
Temporal（ネイティブ）+ temporal-polyfill-lite（Safari 向け）
  + 自前フォーマットヘルパー or Intl.DateTimeFormat
```

codemod `date-fns-to-temporal` を活用して機械的に変換し、残りを手動で対応する。

**メリット**: 依存ライブラリを一気に削減。コードベースが統一される。
**デメリット**: ポリフィルのバンドルサイズ増加。カスタムフォーマットの書き直しが大量に発生する可能性。Safari ネイティブ対応まではポリフィルへの依存が残る。

### C. date-fns v4 + interim（様子見）

date-fns チームが開発中の `date-fns/interim`（Temporal API の軽量サブセット）を使い、将来的に import パスを切り替えるだけで Temporal に移行する戦略。

**メリット**: date-fns エコシステム内で完結。移行コストが最小。
**デメリット**: interim はまだ WIP（リリース未公開）。時期が読めない。

---

## 5. 判定マトリクス

| 判定項目 | 評価 | コメント |
|---|---|---|
| 日付演算の置換 | ✅ 問題なし | `add` / `subtract` / `until` / `since` で完全対応 |
| タイムゾーン処理の置換 | ✅ 上位互換 | date-fns-tz の弱点（DST 境界、曖昧時刻）を解消 |
| 比較・判定の置換 | ✅ 問題なし | `compare` / `equals` で直接対応 |
| ISO フォーマット | ✅ 問題なし | `toString()` で対応 |
| カスタムフォーマット | ❌ ギャップあり | Temporal に API なし。Intl 経由 or 自前ヘルパー |
| 相対時間表現 | ❌ ギャップあり | `Intl.RelativeTimeFormat` で部分対応。単位自動選択は自前 |
| ブラウザ対応 | ⚠️ Safari 未対応 | ポリフィル必須。グローバル 64% カバレッジ |
| Node.js 対応 | ✅ 問題なし | v24+ でネイティブ |
| ポリフィル安定性 | ✅ 問題なし | Stage 4 確定済み。API 変更リスクなし |
| codemod 支援 | ✅ あり | `date-fns-to-temporal` で機械的変換可能 |

---

## 6. 結論と推奨

### 移行は可能か？

**可能。ただし「完全置換」ではなく「大部分の置換 + フォーマット層の補完」が必要。**

- 日付演算・タイムゾーン処理（date-fns-tz の領域）: **100% 置換可能で、むしろ Temporal の方が優れている**
- フォーマット: **カスタムトークンベースのフォーマットが頻出するなら、フォーマット層だけ date-fns を残すか自前ヘルパーが必要**

### 推奨アクション

1. **まず date-fns v4 に更新し、date-fns-tz を統合する**（date-fns v4 は date-fns-tz の機能を本体に取り込み済み）。これだけでも依存を 1 つ減らせる
2. **新規コードは Temporal で書く**（特にタイムゾーン処理、日付演算）
3. **既存のフォーマット呼び出しは無理に書き換えない**。Temporal v2 のカスタムフォーマット API の策定を待つか、`Intl.DateTimeFormat` で要件が満たせる箇所から順次移行する
4. **Safari 対応が必要なプロジェクトでは `temporal-polyfill-lite` を導入**し、Safari がネイティブ対応した時点で除去する

## 参考リンク

- [Temporal | Can I use](https://caniuse.com/temporal)
- [Temporal - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal)
- [TC39 proposal-temporal](https://github.com/tc39/proposal-temporal)
- [date-fns v4 タイムゾーンサポート](https://blog.date-fns.org/v40-with-time-zone-support/)
- [date-fns/interim（Temporal サブセット、WIP）](https://github.com/date-fns/interim)
- [date-fns-to-temporal codemod](https://app.codemod.com/registry/date-fns-to-temporal)
- [Temporal v2 カスタムフォーマット提案](https://github.com/js-temporal/proposal-temporal-v2/issues/5)
- [JavaScript Temporal in 2026 - Bryntum](https://bryntum.com/blog/javascript-temporal-is-it-finally-here/)
- [Temporal API: Replace Moment.js and date-fns — PkgPulse](https://www.pkgpulse.com/blog/temporal-api-replace-momentjs-date-fns-2026)
- [@js-temporal/polyfill (npm)](https://www.npmjs.com/package/@js-temporal/polyfill)
- [temporal-polyfill-lite (GitHub)](https://github.com/fabon-f/temporal-polyfill-lite)
