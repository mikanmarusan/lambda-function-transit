---
version: alpha
name: lambda-function-transit Frontend
description: 個人用乗換案内ボード（React 19 + Vite）のデザインシステム仕様。ダーク固定・影なし・4px グリッド。
source_of_truth: frontend/DESIGN.md (frontmatter) — export-modelable tokens only
theme: dark-only
language: ja
colors:
  primary: "{colors.accent-blue}"
  bg-primary: "#0a0a0a"
  bg-secondary: "#111111"
  bg-tertiary: "#171717"
  bg-elevated: "#1a1a1a"
  border-primary: "#262626"
  border-secondary: "#333333"
  border-tertiary: "#666666"
  border-elevated: "#8a8a8a"
  text-primary: "#fafafa"
  text-secondary: "#a1a1a1"
  text-tertiary: "#8a8a8a"
  bg-inverted: "#fafafa"
  text-inverted: "#0a0a0a"
  accent-blue: "#3b82f6"
  accent-blue-hover: "#2563eb"
  accent-green: "#22c55e"
  accent-red: "#ef4444"
  accent-red-tint: "#ef44441a"
  accent-red-tint-border: "#ef444433"
  accent-amber: "#f59e0b"
  accent-amber-tint: "#f59e0b1a"
  accent-amber-tint-border: "#f59e0b33"
  line-n: "#00ac9b"
  line-m: "#f62e36"
  line-h: "#b5b5ac"
  line-z: "#8f76d6"
  line-e: "#cf3e96"
  line-s: "#6cbb5a"
  line-ko: "#dd0077"
  line-neutral: "{colors.border-elevated}"
typography:
  xs:
    fontSize: 11px
    fontWeight: 500
  sm:
    fontSize: 12px
    fontWeight: 500
  base:
    fontSize: 13px
    fontWeight: 500
  md:
    fontSize: 14px
    fontWeight: 500
  lg:
    fontSize: 16px
    fontWeight: 600
    letterSpacing: "-0.02em"
  xl:
    fontSize: 18px
    fontWeight: 600
    letterSpacing: "-0.02em"
  2xl:
    fontSize: 20px
    fontWeight: 600
    letterSpacing: "-0.02em"
  3xl:
    fontSize: 28px
    fontWeight: 600
    letterSpacing: "-0.02em"
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
components:
  card:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.base}"
    rounded: "{rounded.lg}"
    padding: "{spacing.4}"
  card-border:
    backgroundColor: "{colors.border-tertiary}"
    height: 1px
  card-border-hover:
    backgroundColor: "{colors.border-elevated}"
    height: 1px
  card-marker-next:
    backgroundColor: "{colors.accent-blue}"
    width: "{spacing.1}"
  tab:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.base}"
    rounded: "{rounded.md}"
    padding: "{spacing.1}"
  tab-active:
    backgroundColor: "{colors.bg-inverted}"
    textColor: "{colors.text-inverted}"
    typography: "{typography.base}"
    rounded: "{rounded.md}"
  tab-border:
    backgroundColor: "{colors.border-primary}"
    height: 1px
  refresh-button:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    size: 32px
  refresh-button-hover:
    backgroundColor: "{colors.bg-tertiary}"
    rounded: "{rounded.md}"
    size: 32px
  refresh-button-border-hover:
    backgroundColor: "{colors.border-secondary}"
    height: 1px
  badge:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.xs}"
    rounded: "{rounded.sm}"
  badge-border:
    backgroundColor: "{colors.border-tertiary}"
    height: 1px
  status-indicator:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.xs}"
  status-indicator-ok:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.accent-green}"
    size: 6px
  status-indicator-error:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.accent-red}"
    size: 6px
  status-indicator-loading:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.text-tertiary}"
    size: 6px
  stale-pill:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.accent-amber}"
    typography: "{typography.sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.1}"
  stale-pill-surface:
    backgroundColor: "{colors.accent-amber-tint}"
    rounded: "{rounded.md}"
  stale-pill-border:
    backgroundColor: "{colors.accent-amber-tint-border}"
    height: 1px
  error-banner:
    backgroundColor: "{colors.bg-primary}"
    textColor: "{colors.accent-red}"
    typography: "{typography.base}"
    rounded: "{rounded.md}"
    padding: "{spacing.4}"
  error-banner-surface:
    backgroundColor: "{colors.accent-red-tint}"
    rounded: "{rounded.md}"
  error-banner-border:
    backgroundColor: "{colors.accent-red-tint-border}"
    height: 1px
  empty-state:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.base}"
    rounded: "{rounded.lg}"
    padding: "{spacing.12}"
  departure-time:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-primary}"
    typography: "{typography.3xl}"
  countdown-go:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.accent-green}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
  countdown-now:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.accent-amber}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
  countdown-now-surface:
    backgroundColor: "{colors.accent-amber-tint}"
    rounded: "{rounded.sm}"
  countdown-missed:
    backgroundColor: "{colors.bg-elevated}"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.sm}"
    rounded: "{rounded.sm}"
  line-pill:
    backgroundColor: "{colors.bg-inverted}"
    textColor: "{colors.text-inverted}"
    typography: "{typography.xs}"
    size: 20px
  line-pill-ring-n:
    backgroundColor: "{colors.line-n}"
    width: 2px
  line-pill-ring-m:
    backgroundColor: "{colors.line-m}"
    width: 2px
  line-pill-ring-h:
    backgroundColor: "{colors.line-h}"
    width: 2px
  line-pill-ring-z:
    backgroundColor: "{colors.line-z}"
    width: 2px
  line-pill-ring-e:
    backgroundColor: "{colors.line-e}"
    width: 2px
  line-pill-ring-s:
    backgroundColor: "{colors.line-s}"
    width: 2px
  line-pill-ring-ko:
    backgroundColor: "{colors.line-ko}"
    width: 2px
  line-pill-neutral-border:
    backgroundColor: "{colors.line-neutral}"
    height: 1px
  route-timeline-dot:
    backgroundColor: "{colors.accent-blue}"
    size: 8px
  focus-ring:
    backgroundColor: "{colors.accent-blue}"
    size: 2px
  refresh-button-active:
    backgroundColor: "{colors.accent-blue-hover}"
    rounded: "{rounded.md}"
    size: 32px
---

# DESIGN.md — 乗換案内UIのデザインシステム

個人用乗換案内（`lambda-function-transit`）のフロントエンドが**実際に従っている**デザイン規則を文書化する。本書は
`kzhrknt/awesome-design-md-jp` の構成を範としつつ、`@google/design.md`（alpha）の canonical セクション順に従う。

## Overview

### 前提（Preamble）

- **export 可能なトークンの正は本書の frontmatter。** `frontend/src/design-tokens.css` は
  `npm run export:design`（`@google/design.md`）が frontmatter から**生成**するファイルで、手で編集しない。
  `frontend/src/index.css` はそれを `@import` し、既存の呼び出し名へ**フラット別名**を張る（ADR 0003 / D-A・D-B）。
  値を変えるときは frontmatter を編集し、`npm run export:design` を実行して生成物をコミットする。
- **ただし「唯一の真実」ではない。** `@google/design.md` が表現できないトークン（`--font-sans` の複数フォールバック連鎖・
  `--font-mono`・`--transition-*`、および `line-height` / `font-feature-settings` のような非トークン設計値）は
  `index.css` の**手書き残余**区画に残る。生成／手書きの境界は下表と `index.css` のコメント区画で明示する
  （ADR 0003 が「single source of truth」を意図的に主張しない理由）。
- **テーマはダーク固定（OS 未追従）。** `prefers-color-scheme` 分岐を持たない。Linear / Raycast 風の最小クローム。
- **フォントはシステムファースト・スタックのみ。** webフォントは一切ロードしておらず、CDN webフォントの追加は禁止
  （理由は Do's and Don'ts / Agent Prompt Guide）。
- **各章の構成。** 各章は「**Current Spec（現状仕様 = 実装事実）**」と「**Gaps & Proposals（ギャップ／改善提案）**」を
  見出しで分離する。本書は「いま何であるか」を追う spec トラックの生きた文書であり、ADR ではない。
- **設計メモ（ADR ではない）。** D1: `frontend/DESIGN.md` を新設し設計面を独立させる。**D2（反転済み）: export 可能な
  トークンの正は本書 frontmatter であり、`index.css` のトークンブロックは生成物・別名層である**（旧 D2「`index.css` の
  `:root` が唯一の真実」は ADR 0003 D-A により破棄）。D3: 日本語フォントはシステムファースト・スタックのみ、CDN
  webフォント禁止（必要時のみ同一オリジン自前ホスト）。D4: ダーク固定・OS 未追従。

### 生成トークン / 手書きトークンの境界

| 区分 | 対象 | 置き場所 |
|---|---|---|
| **生成（frontmatter が正）** | 色（`--color-*`。**α付き tint 色を含む**）・font-size 階梯（`--text-xs…3xl`）・weight（`--font-weight-*`）・tracking（`--tracking-*`）・角丸（`--radius-*`）・spacing（`--spacing-*`） | `src/design-tokens.css`（DO NOT EDIT） |
| **別名（生成物への薄いエイリアス）** | `--bg-*` / `--border-*` / `--text-primary`・`--text-secondary`・`--text-tertiary` / `--accent-*`（`--accent-red-tint` 系・`--accent-amber-tint` 系を含む） / `--line-*`（路線色） / `--space-1…12` / `--font-size-xs…3xl` | `src/index.css` の別名レイヤ |
| **手書き残余（export 表現不可）** | `--font-sans`（CJK 込みの連鎖）・`--font-mono`・`--transition-fast` | `src/index.css` の手書き残余区画（`:root`） |
| **非トークンの設計値** | `line-height`（`body` と CJK ラベル）・`font-feature-settings`（**提案のみ・未実装**） | 各 CSS の宣言に直書き（`:root` トークンではない） |

- `--radius-sm/md/lg` は生成名と現行名が 1:1 で一致するため別名を張らず、`@import` した生成物をそのまま使う。
- font-size 階梯は生成名が `--text-xs…--text-3xl` で、**色の `--text-primary/secondary/tertiary` と名前空間が衝突する**
  （`color: var(--text-sm)` が無言で無効値になる）。そのため呼び出し側は必ず別名 **`--font-size-xs…--font-size-3xl`**
  を使う。**呼び出し側の直書き px は全廃済み**（Tech Debt #2 クローズ。`tests/design-tokens.test.ts` が
  `*.module.css` の `font-size` を階梯別名のみに拘束する）。
- **α付きの色は export 可能。** `@google/design.md` は 8桁 hex（`#rrggbbaa`）をそのまま通し、`rgba()` 記法も 8桁 hex に
  正規化する。したがって `.error` の tint は frontmatter の色として持てる（Tech Debt #3 クローズ。鮮度ピルの `--accent-amber-tint` 系も同じ作法）。ただし
  **lint の contrast チェックは α 非対応**（下地との合成をせず 8桁 hex をそのまま前景色と比較して無意味な 1.00:1 を出す）。
  そのため α色は `textColor` を持たない**面だけのコンポーネント**（`error-banner-surface` / `error-banner-border`、`stale-pill-surface` / `stale-pill-border`）として
  モデル化し、実効コントラストは Vitest 側（合成してから比率を出す）で担保する。
  なお `components.error-banner.backgroundColor` は `{colors.bg-primary}` を指すが、これは**実際に塗る色ではなく
  「tint の下地」**である（CSS が塗るのは `--accent-red-tint`）。lint の非 α コントラスト検査を意味のある比較に
  するための**モデル**であり、実装事実としての地の色は上の `.error` の記述を正とする。
  `components.stale-pill.backgroundColor`（`{colors.bg-primary}`）も同じく「tint の下地」＝ヘッダー地のモデルである
  （CSS が塗るのは `--accent-amber-tint`）。

### ビジュアルテーマ（Visual Theme）

#### Current Spec

- **ダーク専用**の単一テーマ。`index.html` は `<html lang="ja">`、`<meta name="theme-color" content="#0a0a0a">`、
  `<title>Transit - 六本木一丁目 → つつじヶ丘</title>`（初回取得までの静的タイトル。タブが出ると `App.tsx` が
  `document.title` を `{出発駅} → つつじヶ丘 · HH:MM発` に差し替え、アンマウントで戻す。ADR 0007 D-3）。
- **影を使わない border ベースの奥行き**（詳細は Elevation & Depth）。背景4段とボーダー4段で階層を表現する。
- **4px グリッド**（`--space-*`、Layout）。**最大幅 600px の単一カラム**を中央寄せした、グランス用（一瞥用）ボード。
- 日本語（駅名・所要時間・`つつじヶ丘`）と Latin 等幅（カードの出発・到着時刻）の**混植**。
- 出典: `frontend/index.html`、`frontend/src/index.css`、ルート `CLAUDE.md` の "Frontend Design"。

#### Gaps & Proposals

- ライトテーマ・テーマ切替は意図的に持たない（単一ユーザー・単一ロケール）。将来も追加しない方針を維持する。

---

## Colors

### Current Spec

値の正は frontmatter の `colors`。下表はその役割注釈（実使用）であり、値は frontmatter を写している。

| トークン（呼び出し名） | frontmatter | 値 | 役割（実使用） |
|---|---|---|---|
| `--bg-primary` | `colors.bg-primary` | `#0a0a0a` | ページ地・ヘッダー地（純黒を避けた最暗段） |
| `--bg-secondary` | `colors.bg-secondary` | `#111111` | タブ hover 地・refresh ボタン地 |
| `--bg-tertiary` | `colors.bg-tertiary` | `#171717` | RouteDetail コンテナ地・refresh hover 地 |
| `--bg-elevated` | `colors.bg-elevated` | `#1a1a1a` | 最上段の面。**カード地**（TransitCard・空状態カード `.empty`）。RouteDetail の乗車位置コールアウト `.car` と `降車不要` チップの地。屋外可読性のためカード地をこの段まで引き上げた（issue #96 / ADR 0004 D-4 が上限。`--accent-blue` 到着時刻が 4.73:1 でぎりぎり AA） |
| `--border-primary` | `colors.border-primary` | `#262626` | 既定のボーダー（タブ・ボタン・区切り線・空状態カード・`間に合いません` バッジの罫） |
| `--border-secondary` | `colors.border-secondary` | `#333333` | refresh ボタン hover / active の一段明るいボーダー（`components.refresh-button-border-hover`）・スクロールバー thumb |
| `--border-tertiary` | `colors.border-tertiary` | `#666666` | カードの既定アウトライン・バッジ（`最速` / `乗換少`・`あとN分で出る`、RouteDetail の `乗換` / `待ち` / `降車不要`）と RouteDetail の乗車位置コールアウトのアウトライン。ページ地に 3.45:1 / カード地に 3.03:1（issue #96 / ADR 0004。2:1 の house 閾値を満たす） |
| `--border-elevated` | `colors.border-elevated` | `#8a8a8a` | カード hover 時のアウトライン（resting `--border-tertiary` より明るい＝ボーダーランプは単調） |
| `--text-primary` | `colors.text-primary` | `#fafafa` | 本文・主要テキスト |
| `--text-secondary` | `colors.text-secondary` | `#a1a1a1` | 補助テキスト（タブ非選択・ローディング文言・空状態文言・カードの `N分 · 乗換N回`・`乗換少`・路線ピルの路線名・RouteDetail の種別/行先/距離・`乗車位置` ラベル・`乗換` / `待ち` バッジ） |
| `--text-tertiary` | `colors.text-tertiary` | `#8a8a8a` | 装飾・最小ウェイト（矢印・フッター・タイムスタンプ・路線ピル間のシェブロン・`間に合いません` バッジ）。**WCAG AA 達成値**（ADR 0003 D-E） |
| `--bg-inverted` | `colors.bg-inverted` | `#fafafa` | 選択中タブ（反転チップ）の地。屋外グレア下で選択状態が唯一残る近白面（ADR 0004。地に `--text-*` を塗らないための専用ロール）。路線ピルの白い円の地（ADR 0008 D-2） |
| `--text-inverted` | `colors.text-inverted` | `#0a0a0a` | 選択中タブ（反転チップ）のラベル。近白地に対し 18.97:1（ADR 0004）。路線ピルの円内の英字コード |
| `--accent-blue` | `colors.accent-blue` | `#3b82f6` | 到着時刻（`HH:MM着`）・カードの `最速` ラベル・ロゴ・タイムライン dot・active ボーダー・focus リング |
| `--accent-blue-hover` | `colors.accent-blue-hover` | `#2563eb` | refresh ボタンの**押下（`:active`）地／罫**（TD#4 で役割確定） |
| `--accent-green` | `colors.accent-green` | `#22c55e` | status OK ドット（`サーバー接続: 正常`）・カウントダウン `あとN分で出る` の文字 |
| `--accent-red` | `colors.accent-red` | `#ef4444` | エラーテキスト・再試行ボタン文字・status error ドット |
| `--accent-red-tint` | `colors.accent-red-tint` | `#ef44441a` | エラーバナーの地（`--accent-red` の α10%。TD#3 でトークン化） |
| `--accent-red-tint-border` | `colors.accent-red-tint-border` | `#ef444433` | エラーバナーの罫・再試行ボタンの罫（`--accent-red` の α20%） |
| `--accent-amber` | `colors.accent-amber` | `#f59e0b` | 鮮度ピル（`N分前のデータ`）の文字と `更新` ボタン文字（ADR 0008 D-4）・カウントダウン `今すぐ出発` の文字・RouteDetail の `余裕なし` の文字 |
| `--accent-amber-tint` | `colors.accent-amber-tint` | `#f59e0b1a` | 鮮度ピルと `今すぐ出発` バッジ・`余裕なし` バッジの地（`--accent-amber` の α10%） |
| `--accent-amber-tint-border` | `colors.accent-amber-tint-border` | `#f59e0b33` | 鮮度ピル・`更新` ボタン・`今すぐ出発` バッジ・`余裕なし` バッジの罫（`--accent-amber` の α20%） |
| `--line-n` | `colors.line-n` | `#00ac9b` | 路線ピルのリングと RouteDetail の leg レール（`.rail*`）: `N` 南北線（カード地に 6.11:1） |
| `--line-m` | `colors.line-m` | `#f62e36` | 同: `M` 丸ノ内線（4.44:1） |
| `--line-h` | `colors.line-h` | `#b5b5ac` | 同: `H` 日比谷線（8.43:1） |
| `--line-z` | `colors.line-z` | `#8f76d6` | 同: `Z` 半蔵門線（4.75:1） |
| `--line-e` | `colors.line-e` | `#cf3e96` | 同: `E` 都営大江戸線（3.96:1）。**on-dark 変種**: ブランド hex `#b6007a` はカード地に 2.71:1 で 3:1 未満のため置き換えた（ADR 0008 D-3 / D-5） |
| `--line-s` | `colors.line-s` | `#6cbb5a` | 同: `S` 都営新宿線（7.37:1） |
| `--line-ko` | `colors.line-ko` | `#dd0077` | 同: `KO` 京王線 / 京王新線（3.60:1） |
| `--line-neutral` | `colors.line-neutral` | `{colors.border-elevated}` = `#8a8a8a` | `lineCode` が `null` の路線名を囲む罫（円なし・路線名のみ。5.04:1）と、その leg の RouteDetail レール（`.railNeutral`） |

- `colors.primary` は `{colors.accent-blue}` への参照（`@google/design.md` の色ロール `primary` を満たすためのエイリアス）。
  生成物では `--color-primary` として出力されるが、UI からは `--accent-blue` 名で参照する。

### Gaps & Proposals

- **宣言済み・未使用トークンは解消済み（Tech Debt #4 クローズ）。** 役割の無かった5トークンの処分結果:
  - `--border-accent`（`#3b82f6`・`--accent-blue` と同値）と `--transition-normal`（`150ms ease`）は**削除**。
  - `--accent-blue-hover` は refresh ボタンの**押下（`:active`）**に役割付け。hover は「ボーダーのみで強調する」という
    本書の Do's があるため、青のアクセントは hover ではなく押下状態に置いた（frontmatter `components.refresh-button-active`）。
  - `--bg-elevated` は**空状態カードの地**に役割付け（`.empty`。UI も同時に実装、Verification Artifacts B の状態 #4）。
  - `--accent-yellow`（`#eab308`）は役割が無いため**削除**（「遅延・注意」表現は現 UI に存在しない）。
  - これに伴い**予約スロットは全廃**した（`badge-caution` / `card-border-accent` / `surface-elevated` を frontmatter から
    削除。`refresh-button-active` は実装済みへ昇格）。以後 frontmatter の `components` は**実装事実のみ**を載せる。
- **`--text-tertiary` は WCAG AA 達成済み**（ADR 0003 D-E 実施）。`#737373`（bg-primary 4.18:1）→ **`#8a8a8a`**:
  bg-primary **5.73:1** / bg-secondary **5.47:1** / bg-tertiary **5.19:1**（いずれも 4.5:1 超）。
  `lint:design` の `contrast-ratio` warning は解消し、現在 warning 0 件。
- **error 色はトークン化済み**（Tech Debt #3 クローズ）。生 `rgba(239, 68, 68, …)` は `--accent-red-tint` /
  `--accent-red-tint-border` に置換した。tint は半透明なので、実効コントラストは**下地（`--bg-primary`）に合成した色**
  `rgb(33, 16, 16)` に対して評価する必要があり、`--accent-red` はそこで **4.87:1**（AA 達成）。
  `lint:design` はこの合成を行えない（α 非対応）ため、この比率は Vitest の contrast テストで固定している。
- **amber（鮮度ピル）も同じ扱い**（issue #121 / ADR 0008 D-3）。`--accent-amber` はカード地 `--bg-elevated` に対し
  **8.10:1**、ヘッダー地 `--bg-primary` に `--accent-amber-tint` を合成した面に対し **8.07:1**。どちらも 4.5:1 以上を
  Vitest が `StatusIndicator.module.css` の `.stale` 宣言から解決して固定する（`#b45309` が 3.47:1 で落ちる歯止めテスト付き）。
- **路線色（issue #123 / ADR 0008）。** `line-*` の hex は、公式の hex が見つからないため Wikipedia の鉄道記事が共有する
  路線色モジュールで通用している値を採った（ADR 0008 D-5）。路線ピルのリングはカード地 `--bg-elevated` に対する非テキスト
  コントラスト **3:1 以上**（WCAG 1.4.11）を Vitest が固定する（生成物の `--color-line-*` がちょうど 8 個であること、
  `LinePill.module.css` の各 `.line*` が自分の路線トークンを塗ること、ブランド hex `#b6007a` が 2.71:1 で落ちる歯止めテスト付き）。
  識別は円内の英字コードと路線名が担い、リング色は補助（ADR 0008 D-2）。RouteDetail の leg レール（issue #124）は
  `RouteDetail.module.css` の各 `.rail*` が `color` に自分の路線トークン（`null` は `--line-neutral`）を置き、`.rail` が
  `currentColor` で塗る。レールは RouteDetail 地 `--bg-tertiary` に対し 3:1 以上、`余裕なし` の amber は tint を同じ地に合成した面に
  4.5:1 以上であることを Vitest が宣言から解決して固定する。
- 残る色の課題は無い。新色を足すときは frontmatter に追加し、必ずどこかの `components` から参照する
  （未参照だと `lint:design` の `orphaned-tokens` warning が出る）。
- **ただし `orphaned-tokens` warning だけでは不十分。** この warning は `components` に**何か1つ**エントリがあれば黙る。
  つまり「UI 実装は無いがコンポーネント定義だけ置く」（＝本 PR で全廃した予約スロット）で回避できてしまう。
  そこで **Vitest 側で「実 CSS に `var()` 呼び出しが1つも無いトークン」を落とす**ゲートを別に持つ（別名層・生成層の両方。
  例外は `--color-primary`・`--font-weight-*`・`--tracking-*` の明示 allowlist と、spacing の飛び番のみ）。
  役割の無いトークンを機械的に検出しているのは、`lint:design` ではなくこちらである。

---

## Typography

最重要章。本リポは日本語と Latin を混植する。`--font-sans` は **CJK フォント面を含む**（Tech Debt #1 クローズ）。
この章は現状仕様と、日本語タイポグラフィのフル規範（改善提案）を**明確に分離**する。

### Current Spec

- ルート `font-size: 14px`（`html`）、`body { line-height: 1.5 }`（`line-height` は export 表現不可 → 手書き残余）。
- フォントスタック（`index.css` の手書き残余区画、逐語）:
  - `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', YuGothic, Meiryo, system-ui, sans-serif;`
  - `--font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;`
  - どちらも**複数フォールバックの連鎖**で、`@google/design.md` は family を単一文字列としてしか出力できないため
    **frontmatter に載せず手書きで維持**する（`typography.*` に `fontFamily` を置かないのはこのため）。
  - 連鎖の順は **Latin → CJK → 総称**。Latin 面（`Inter` → システム UI 書体）を先に置くことで、英数字が日本語書体で
    描画されるのを防ぎ、かな・漢字は後続の**OS 同梱**日本語書体（Hiragino / Noto Sans JP / Yu Gothic / Meiryo）が拾う。
    **バンドルも CDN も追加していない**（webフォント禁止。Agent Prompt Guide のセキュリティ規約）。
- **`Inter` は一切ロードされていない**（`@font-face` も Google Fonts もリンク無し）。`Inter` 不在時は
  `-apple-system` 以降のシステム sans にフォールバックする。
- **font-size 階梯の正は frontmatter `typography`**（`xs:11px / sm:12px / base:13px / md:14px / lg:16px / xl:18px /
  2xl:20px / 3xl:28px`）。生成物に `--text-xs…--text-3xl`・`--font-weight-*`・`--tracking-*` として出力される。
  `3xl` はカードの出発時刻専用の最上段（issue #123 / ADR 0008 D-4）。
  **呼び出し側（`*.module.css`）はすべて別名 `--font-size-xs…--font-size-3xl` を参照し、直書き px は 0 件**
  （Tech Debt #2 クローズ。Vitest が `font-size` を階梯別名のみに拘束する）。
- **アイコン寸法は font-size ではない。** status ドットの `Circle`(6px) は Phosphor の `size` prop で渡す
  （他の全アイコンと同じ作法）。6px は型階梯の外だが、これはテキストではないため階梯に足さない。
- ウェイトは `500` と `600` の2種のみ。
- 等幅は時刻列（TransitCard の `.departure`/`.arrival`、RouteDetail の `.times`、`--font-mono`）と路線ピルの英字コード（`LinePill` の `.code`）に適用。StatusIndicator の `.timestamp` は
  日本語の相対表記（`N秒前に更新`）になったため等幅を外した。
- 字間 `letter-spacing: -0.02em` は **Latin/数字のみ**に適用（`.title`、`.departure`）。CJK には掛けていない。
- **CJK 本文の行間・禁則（実装済み。Typography の Gaps からクローズ）。** 日本語ラベル（駅名・路線名・タブ）は
  `line-height: 1.6`（`body` の `1.5` を局所的に上書き）・`word-break: normal`・`line-break: strict` を持つ。適用先は
  `App.module.css` の `.tab` / `.station`、`RouteDetail.module.css` の `.station` / `.stationIntermediate` /
  `.legMeta` / `.carLabel` / `.carValue` / `.badge`、
  `TransitCard.module.css` の `.duration` / `.countdown` / `.badge`、`LinePill.module.css` の `.name`。
  これらに `letter-spacing` は掛けない。**`word-break: break-word` を宣言するスタイルシートは無い**ので、
  駅名・路線名が mid-glyph で折り返すことはない。Playwright は computed 値（`line-break` / 行間比 /
  `letter-spacing` / `word-break`）を固定する。
  ただし `word-break: normal` と `letter-spacing: normal` は**CSS の初期値でもある**（宣言はグローバル上書きに対する
  前向きのガードで、テストが落ちるのは `line-break` / 行間が壊れたとき）。
- 縦書きは使用しない。

### Gaps & Proposals（日本語タイポグラフィのフル規範）

> 以下は**未実装の目標仕様**。CJK 書体スタック・フォールバック連鎖・型階梯の適用・**行間 1.6 / 禁則処理**は
> **実装済みへ移動**した（Current Spec 参照。Tech Debt #1 / #2 クローズ、CJK 体裁は本 PR でクローズ）。

- **Latin。** `Inter` を使うならローカル/同一オリジン woff2 をサブセット自前ホスト。未ホストのままなら宣言から外し、
  実フォールバック（system-ui 系）を先頭にする。**CDN からのロードは禁止**（現状は宣言のみで未ロード）。
- **OpenType。** `font-feature-settings: "palt" 1, "kern" 1` は**見出し／リード限定**（`fontFeature` は export で drop
  されるため CSS 手書き）。Latin 時刻列は等幅に加えて `font-variant-numeric: tabular-nums` を付与
  （本リポは `--font-mono` で近似達成済み）。
- **縦書き（Vertical Writing）。** **Not applicable**（横組みのみ）。

---

## Layout

### Current Spec

- **4px グリッド**。spacing の正は frontmatter `spacing`（生成 `--spacing-N` → 別名 `--space-N`）:

  | 呼び出し名 | frontmatter | 値 |
  |---|---|---|
  | `--space-1` | `spacing.1` | `4px` |
  | `--space-2` | `spacing.2` | `8px` |
  | `--space-3` | `spacing.3` | `12px` |
  | `--space-4` | `spacing.4` | `16px` |
  | `--space-5` | `spacing.5` | `20px` |
  | `--space-6` | `spacing.6` | `24px` |
  | `--space-8` | `spacing.8` | `32px` |
  | `--space-10` | `spacing.10` | `40px` |
  | `--space-12` | `spacing.12` | `48px` |

  **`--space-7` / `--space-9` / `--space-11` は欠番**（飛び番）。
- **transition**: `--transition-fast: 100ms ease` のみ（**export 表現不可 → 手書き残余**）。
  未使用だった `--transition-normal`（`150ms ease`）は削除した（Tech Debt #4）。
- **配置**: `max-width: 600px` の単一カラムを `margin: 0 auto` で中央寄せ。カード間の縦 gap は `.cards` の `--space-3`。
  `.content` は gap を持たない（空の `.status` に幽霊行を作らないため。エラーバナーとカードが並ぶときの間隔は
  `.status:not(:empty)` の `margin-bottom: --space-3`。Components 参照）。モバイルファースト。
- **ブレークポイントは `max-width: 480px` の 1 本のみ**（Tech Debt #5 クローズ）。規約:
  - 値は **480px 固定**。第 2 のブレークポイントを足さない（他は流動レイアウトで解く）。
  - **寸法ブレークポイント（`min-width`/`max-width`）を書いてよい唯一のファイルは `TransitCard.module.css`**
    （カード内リフロー。Responsive Behavior 参照）。`prefers-reduced-motion` のような**寸法でない media feature** は
    ブレークポイントではないため、この規約の対象外（`App.module.css` / `StatusIndicator.module.css` で使用中）。
  - 検証: `grep -RnE '@media[^{]*(min-width|max-width)' src/**/*.module.css` が `TransitCard` の `480px` 1 件のみを返すこと。
  - `@google/design.md` の frontmatter に breakpoint カテゴリは無いため、この規約は**本文が正**（トークン化しない）。
- **タッチターゲットは 44×44 以上**（Tech Debt #6 クローズ）。視覚寸法とヒット領域は別物でよい: `.refreshButton` は
  視覚 32×32 のまま透明な `::after`（44×44・`position: relative` の中央）でヒット領域だけを広げ、`.tab` は
  `min-width` / `min-height: 44px` + `inline-flex` で**可視ボックスごと** 44×44 にする。
  **フォーカスリングは可視ボックスに密着**する（`::after` は `outline` を持たないため、`:focus-visible` は
  ボタン自身のボーダーボックスを描く）。

### Gaps & Proposals

- 欠番（`--space-7/9/11`）は意図的か未定義かを明記し、使うなら frontmatter に足す。スケール外 px の直書きは禁止。
- ヒット領域の 44px は spacing スケール外の生 px（`--space-11` が欠番のため）。44 を再利用する箇所が増えるなら
  frontmatter に `spacing.11: 44px` として足すか、専用の touch-target トークンを検討する（現状 2 箇所のみ）。

---

## Elevation & Depth

### Current Spec

- **影（box-shadow）を一切使わない。** 参照テンプレートの shadow 立体モデルからの**意図的な乖離**。
- 奥行きは**背景4段**（`--bg-primary` → `--bg-secondary` → `--bg-tertiary` → `--bg-elevated`）と
  **ボーダー4段**（`--border-primary` → `--border-secondary` → `--border-tertiary` → `--border-elevated`）で表現する。
  ボーダーランプは単調に明るくなる（`#262626` → `#333333` → `#666666` → `#8a8a8a`）。カードは屋外グレア下でも
  縁が残るよう `--border-tertiary`（ページ地に 3.45:1、house 閾値 2:1 を満たす）を既定アウトラインに使う（issue #96 / ADR 0004）。
- hover はボーダーを一段明るくする（refresh ボタン: `--border-primary` → `--border-secondary`／
  カード: `--border-tertiary` → `--border-elevated`）。
- **focus-visible**: `outline: 2px solid var(--accent-blue); outline-offset: 2px`（全要素共通、`index.css` の
  reset/focus 区画）。frontmatter では `components.focus-ring` として記録。

### Gaps & Proposals

- 影なし方針は維持。将来 elevation を増やす場合も影ではなく `--bg-elevated` + ボーダー差で表現する。

---

## Shapes

### Current Spec

- 角丸の正は frontmatter `rounded`。生成名が現行名と 1:1 で一致するため、`index.css` に別名を張らず生成物をそのまま使う。

  | トークン | frontmatter | 値 | 用途 |
  |---|---|---|---|
  | `--radius-sm` | `rounded.sm` | `4px` | バッジ・カウントダウンバッジ・`null` 路線名の罫・RouteDetail コンテナ・RouteDetail の乗換バッジと乗車位置コールアウト・スクロールバー thumb・鮮度ピルの `更新` ボタン |
  | `--radius-md` | `rounded.md` | `6px` | タブ・refresh ボタン・鮮度ピル・再試行ボタン |
  | `--radius-lg` | `rounded.lg` | `8px` | カード |

- 円形は RouteDetail の dot（`8px`）、status ドット（Phosphor `Circle`、6px）、路線ピルの円（`--space-5` = 20px、`border-radius: 50%`）のみ。

### Gaps & Proposals

- 角丸は3段で足りている。新しい半径を足す前に既存3段で表現できないかを検討する。

---

## Components

各値は `*.module.css` と `*.tsx` から逐語転記（出典を併記）。frontmatter の `components` は**実装済みの部品だけ**を、
`@google/design.md` が認識する sub-token
（`backgroundColor` / `textColor` / `typography` / `rounded` / `padding` / `size` / `height` / `width`）だけで記述する。
（予約スロット＝UI の無いコンポーネント定義は Tech Debt #4 で全廃した。`empty-state` も実装済み。）
ボーダー色は「1px の面」として `card-border` / `card-border-hover` のように面トークンでモデル化している
（`borderColor` は仕様外の sub-token 名で、使うと lint warning になるため）。

### Current Spec

#### App（`App.tsx` / `App.module.css`）

- `.header`: `position: sticky; top: 0; z-index: 10`、地 `--bg-primary`、下罫 `1px solid --border-primary`。
- `.headerContent` / `.container`: `max-width: 600px; margin: 0 auto`、padding `--space-4`。
- `.titleGroup`: ロゴ `Train`（size 20, weight bold, 色 `--accent-blue`）+ `.title`（`Transit`、`--font-size-lg`/`600`、`letter-spacing: -0.02em`）。
- `.tabs`: `display: flex; gap: --space-1; flex: 1; overflow-x: auto`（出発地タブを横スクロール）。
  **`role="tablist"`**（`aria-label="出発駅"`。issue #122 / ADR 0007 D-2）。タブは `origins` からサーバーの設定順に描画する。
- `.tab`: `inline-flex`（**`flex-direction: column`**、`align-items: center; justify-content: center`）、**`flex: 0 0 auto`**、
  **`min-width` / `min-height: 44px`**（タッチターゲット。Layout 参照）。
  `flex: 0 0 auto` は必須: flex アイテムの既定 `min-width: auto`（＝内容幅の下限）が `.tabs` の `overflow-x: auto`
  スクロールを成立させているところへ `min-width: 44px` を宣言すると、その下限を**より小さい値に置き換えて**しまい、
  タブが 44px まで潰れて `nowrap` のラベルが隣へはみ出す。
  padding `--space-1 --space-3`、ボーダー `1px solid --border-primary`、
  `--radius-md`、色 `--text-secondary`、`--font-size-base`/`500`、`line-height: 1.6`・`word-break: normal`・
  `line-break: strict`（CJK 体裁）、`white-space: nowrap`、`transition: all --transition-fast`。
  **`role="tab"`** + **`aria-selected`** + `aria-controls`（共有の 1 枚の `role="tabpanel"`。文脈行と内容分岐を包み、
  選択中タブで `aria-labelledby`）。**ロービング tabindex**（選択中 `0`・他 `-1`）で、`ArrowRight` / `ArrowLeft`
  （端で折り返し）・`Home` / `End` が選択とフォーカスを同時に動かす（自動アクティベーション）。Alt / Ctrl / Meta / Shift
  付きのキーはブラウザに任せる（Alt+ArrowLeft は「戻る」）。
  2 行目 `.tabSummary`（`--font-size-xs`、各要素は半角スペース区切り、色はタブから継承＝反転チップ上は近黒）:
  その出発地の `isFastest` 候補の到着 `HH:MM着` + `fastestOrigin` なら `最速`、他は最速との到着差 `+N分`。
  `status: error` は `取得できず`、`no_candidates` は `便なし`。
  **初期選択は `fastestOrigin`**（`null` なら先頭）。手動選択は選択時の `lastUpdated` を刻印し、それが最新の成功取得で
  ある間だけ保持する（`Date` を参照比較。取得中・失敗では `lastUpdated` が変わらない）ので、**次の成功取得で最速の出発地へ戻る**。
- `.tab:hover:not(.tabActive)`: 地 `--bg-secondary`、色 `--text-primary`。**`:not(.tabActive)` で非選択タブに限定する**のは
  必須: 無印 `.tab:hover`(0,2,0) は `.tabActive`(0,1,0) を出し抜くため、反転チップが白になった瞬間、選択中タブをホバー
  すると地が暗く塗り戻る（iOS ではタップ後に `:hover` が残る）。`.tabActive`: **反転チップ**。地/ボーダー `--bg-inverted`
  （近白）、ラベル `--text-inverted`（近黒）。選択 vs 非選択のコントラストを 1.05:1 → **18.97:1** に上げ、屋外の 20% グレア
  veil 下でも選択状態が残る唯一の要素（ADR 0004）。非選択タブの 1px ボーダーは `--border-primary`（frontmatter
  `components.tab-border`）。
- `.context`（文脈行、`margin-bottom --space-3`）: `.route` = `activeOrigin` + `ArrowRight`（16, 色 `--text-tertiary`）+
  `つつじヶ丘`。`.station` は `--font-size-md`/`500`/`--text-primary`、`line-height: 1.6`・`word-break: normal`・
  `line-break: strict`。選択中の構造化出発地に候補が 1 件以上あるときは下に `.contextNote` `オフィスから徒歩N分 · 到着が早い順`
  （`walkMinutes`。`margin-top --space-1`、`--font-size-sm`、`--text-secondary`、同じ CJK 体裁）。
- `.refreshButton`: **視覚 `32px × 32px`**、地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-md`、
  `aria-label="Refresh"`、`aria-busy={loading}`。`position: relative` + 透明な `::after`（`44px × 44px`・中央）で
  **ヒット領域だけ 44×44** に広げる（視覚寸法とフォーカスリングは 32×32 のまま）。
  `:hover:not(:disabled)` で地 `--bg-tertiary`・ボーダー `--border-secondary`。
  `:active:not(:disabled)` で地/罫 `--accent-blue-hover`（押下。`components.refresh-button-active`）。
  `:disabled` は `opacity: 0.5; cursor: not-allowed`。
  ローディング中は `Spinner`（16）を回し、通常は `ArrowClockwise`（16）。
- `.spinner`（`spin` 1s linear infinite）は **`@media (prefers-reduced-motion: reduce)` で `animation: none`**。
- `.content`: 5 分岐の器（issue #121。`hasCards` = 選択中出発地のカードが 1 枚以上、`hasData` = 出発地タブが 1 つ以上。カードは選択中出発地の
  `origins[].candidates` をそのまま `TransitCard` に渡して描く）:
  エラー×データ無し（バナーのみ）/ エラー×既存データ（バナー + 直前のカード）/ loading / empty / 通常（カード）。
  **エラーでもカードを隠さない**: `useTransit` は失敗時に直前の `origins` を保持するので、カードは
  `hasCards` だけで描画し、バナーはその上に重ねる（ADR 0007 D-2）。
  うち**状態3分岐（error / loading / empty）だけ**を `.status`（**常設の `aria-live="polite"`**）で包む。分岐ノードは
  文言ごと条件マウントされるため、差し替えを読み上げさせるには**それらより長生きするコンテナ**側に live region を
  置く必要がある。**`.cards` は live region の外**に置く: 中に入れるとタブ切替のたびに時刻表全体が読み上げられてしまう
  （ユーザー起点の遷移に告知は要らない）。空の `.status` は**高さ 0 のまま表示し続ける**（`display: none` は
  live region をアクセシビリティツリーから削除してしまい、「内容と同時に現れるリージョン」＝条件マウントと
  同じ振る舞いに戻ってしまう）。`.content` に `gap` を置かないのはこのため（空の `.status` に幽霊行を作る）。
  バナーとカードが並ぶときの間隔は `.status:not(:empty) { margin-bottom: --space-3 }` が受け持つ。
- `.loading`: 縦中央寄せ、`Spinner`（24）+ `Loading transit information...`、padding `--space-12`、色 `--text-secondary`、`--font-size-base`。
- `.error`: 見出し `サーバーに接続できません`、既存カードがあるときは 2 行目 `表示中は HH:MM 時点のデータです`
  （`.errorDetail`、`--font-size-sm`。`HH:MM` は `lastUpdated` を `formatClockTime()` で JST 表記）、右端に
  `再試行` ボタン（`.retryButton`。`refresh` を呼ぶ前にフォーカスを `<main>`（`tabIndex={-1}`）へ退避する。押下でバナーごとアンマウントされ、
  フォーカスが `<body>` へ落ちるのを防ぐため。`useTransit` は取得開始時に `error` を消すので `disabled` は持たない。地なし・罫
  `1px solid --accent-red-tint-border`・`--radius-md`・**可視ボックス自体が 44×44 以上**）。**`role="alert"`**、
  padding `--space-4`、地 `--accent-red-tint`、罫 `1px solid --accent-red-tint-border`、`--radius-md`、
  色 `--accent-red`、`--font-size-base`（Colors 参照）。**hook の error 文字列（`HTTP error: 500` 等）は描画しない**。
- `.empty`: **`Tray`（24, 色 `--text-tertiary` = `.emptyIcon`）** + 選択中出発地の結果（`status: error` → `取得できず`、
  他の構造化出発地 → `便なし`、構造化出発地が無いとき → `No departures found`）、**`role="status"`**、
  縦積み `gap --space-3`、padding `--space-12`、地 `--bg-elevated`、罫 `1px solid --border-primary`、`--radius-lg`、
  色 `--text-secondary`、`--font-size-base`、中央寄せ（`components.empty-state`）。**赤もボタンも持たない**
  （エラーではなく「結果ゼロ」の告知）。描画条件は `!error && !hasCards && (hasData || !loading) && lastUpdated`（カードの無いタブでは再取得中も
  スピナーに替えず結果を出し続ける）。
  **`lastUpdated` で門番する**のは、`loading` の初期値が `false` のため、これが無いと初回ペイントで空状態が
  一瞬ちらつくため。
- `.error` / `.empty` の `role` は**必須**（バナー／カードを支援技術に「アラート」「ステータス」として提示する）。
  `tests/App.test.tsx` が 5 分岐（1 分岐 1 テスト）・生エラー文字列の非表示・`再試行` の配線と
  role・`aria-live`・`aria-busy`、固定クロック下の出発地タブ（tablist / `aria-selected` / ロービング tabindex・
  最速の自動選択・次の成功取得までの手動選択保持・矢印キー・要約行・`document.title`）と最速マーカーを固定している。
- `.footer`: `Data from Jorudan`、padding `--space-4`、中央寄せ、`--font-size-xs`、色 `--text-tertiary`、上罫 `1px solid --border-primary`。

#### TransitCard（`TransitCard.tsx` / `TransitCard.module.css`）

- `.card`: 地 `--bg-elevated`、ボーダー `--border-tertiary`、`--radius-lg`、`overflow: hidden`、
  `transition: border-color --transition-fast`。`.card:hover` でボーダー `--border-elevated`（resting `--border-tertiary` より
  **明るい**。旧 `--border-secondary` #333333 は今や resting より暗く、残すと hover がカードを暗く沈ませる逆ランプになる。issue #96 / ADR 0004）。
- `.header`（button）: `align-items: flex-start`、`gap: --space-4`、padding `--space-4`、`background: none; border: none; font: inherit`、`aria-expanded={expanded}`。
  中身は `.summary`（縦積み 3 行、`gap --space-2`、`flex: 1; min-width: 0`）と `.expandIcon`。ボタン内なので全てフレージング要素（`span`）で組む。
  props は `candidate`（構造化候補 `Candidate`。時刻・所要・乗換回数・ラベル・路線ピルの元）・`walkMinutes`（その出発地の徒歩分。カウントダウン用。issue #123）・`isNext`。
  展開時は `candidate` を `RouteDetail` に渡し、構造化経路を描かせる（issue #124）。
- 1 行目 `.lead`: **出発時刻 `.departure` が主役**（`departureAt` を `formatClockTime()` で `HH:MM`。`--font-size-3xl` = 28px/`600`/`--font-mono`/`letter-spacing: -0.02em`/`line-height: 1.2`。
  `components.departure-time`）+ カウントダウンバッジ `.countdown`（下記）。
- 2 行目 `.meta`: 到着 `.arrival` `HH:MM着`（`--font-size-xl`/`600`/`--font-mono`、色 `--accent-blue`）、`.duration` `N分 · 乗換N回`
  （`formatDuration(durationMinutes)` と `transferCount`。`--font-size-sm`、`--text-secondary`）、ラベル `.badge` `最速`（`isFastest`。`.badgeFastest` で色 `--accent-blue`）/
  `乗換少`（`isFewestTransfers`）。バッジは**アウトライン idiom**（地 `transparent`・`1px solid --border-tertiary`。`components.badge-border`）、
  `--radius-sm`、`--font-size-xs`/`500`、色 `--text-secondary`、CJK 体裁（`line-height: 1.6`・`word-break: normal`・`line-break: strict`）。
  旧 `--bg-tertiary` #171717 塗りは引き上げたカード地 #1a1a1a に対し 1.03:1 でカードより暗く沈むため、未選択 `.tab` と同じアウトライン idiom に寄せた（issue #96）。ラベルはカード地 #1a1a1a で 6.74:1。
- 3 行目 `.lines`: 各 leg の `LinePill`（下記）を `CaretRight`（12/bold、`aria-hidden`、色 `--text-tertiary` = `.chevron`）でつなぐ。
  **折りたたみ中も表示**する（展開しなくても経路が読める）。`legs` が空なら行ごと描かない。
- **カウントダウンバッジ `.countdown`**（issue #123）: `minutesUntilLeave(departureAt, walkMinutes, now)` を `leaveCountdown()` で文言化。
  `now` は共有クロック `useNow()`（1 秒刻み）。2 分以上 → `あとN分で出る`（`.countdownGo`、色 `--accent-green`、罫 `--border-tertiary`。`components.countdown-go`）、
  0〜1 分 → `今すぐ出発`（`.countdownNow`、色 `--accent-amber`・地 `--accent-amber-tint`・罫 `--accent-amber-tint-border`。`countdown-now` / `countdown-now-surface`）、
  負 → `間に合いません`（`.countdownMissed`、色 `--text-tertiary`・罫 `--border-primary` で減光。`countdown-missed`）。
  padding `--space-1 --space-2`、`--radius-sm`、`--font-size-sm`/`600`、CJK 体裁。文言が状態を運ぶので色だけに頼らない。
  **一覧は取得したまま**: 刻みごとにバッジの文言が変わるだけで、カードの並べ替え・除去はしない（`間に合いません` の便も残る）。
  文字のコントラスト（緑・減光はカード地に、amber は tint をカード地に合成した面に 4.5:1 以上）を Vitest が `.countdown*` 宣言から固定する。
- `.expandIcon`: `CaretUp`（展開時）/ `CaretDown`（折りたたみ時）、16、色 `--text-tertiary`。
- `.body`: padding `0 --space-4 --space-4`、`RouteDetail` を内包。
- **最速マーカー `.cardNext`**（issue #97 / ADR 0004 D-3、ADR 0006 D-4 で改定・issue #122）: **到着が最も早い候補**
  （サーバーが出発地ごとに立てる `isFastest`）のカードの左端に `width: --space-1`（4px）・
  `--accent-blue` の縦キーライン（`components.card-marker-next`）。`position: absolute` の `::before` で描く
  （左ボーダーは `--radius-lg` の角で楔状に潰れ、カード内容を 4px 右へずらして 2 枚の出発時刻の縦揃えを壊す。
  影は Elevation & Depth で全面禁止）。`pointer-events: none` 必須: 擬似要素のヒットテストは `.card` に落ちるため、
  無いと 4px 帯が `.header` ボタンへのクリックを飲み込む。
  **マーク対象はデータから導出し、カード位置から推定しない**（ADR 0004 D-3 は維持）。導出元が最早出発
  （旧 `deriveNextIndex()`、削除済み）からサーバーの `isFastest` に変わった。屋外 20% グレア veil 下で青は ~1.92:1 まで潰れるため、マーカーは単独キャリアではない:
  既定展開と `visually-hidden` ラベルが冗長キューを担う（ADR 0004 の honest limits）。
  擬似要素は支援技術に見えないため、`isNext` のとき `.header` ボタン内に
  `<span className="visually-hidden">最速の便 </span>`（グローバル `index.css` のユーティリティ）を置く。
- **最速カード（`isNext`）は既定で展開**（`useState(isNext)`）。カードの `key` は位置ではなく列車の同一性
  （`` `${activeOrigin}-${departureAt}-${index}` ``）: React は key でインスタンスを再利用し `useState` の初期化子は
  マウント時しか走らないため、`key={index}` ではタブ切替・リフレッシュ後にマーカーと展開カードがズレる。

#### LinePill（`LinePill.tsx` / `LinePill.module.css`）

- 1 leg の路線識別（issue #123 / ADR 0008 D-1・D-2）。props は `lineCode`（`LineCode | null`）と `lineName`。
- 既知の `lineCode`: `.code` = **白い円**（`--space-5` = 20px 角、`border-radius: 50%`、地 `--bg-inverted`、`2px` のリング、
  英字コードを `--text-inverted`・`--font-mono`・`--font-size-xs`/`600` で）+ `.name` 路線名（`--font-size-xs`/`500`、`--text-secondary`、CJK 体裁）。
  リング色は `lineCode` ごとの**許可リストのクラス**（`.lineN` / `.lineM` / `.lineH` / `.lineZ` / `.lineE` / `.lineS` / `.lineKo`）が
  `border-color: var(--line-*)` で塗る（`components.line-pill` / `line-pill-ring-*`）。クラスは `Object.hasOwn` で引ける既知コードだけが選ぶ。
- `null`（または許可リスト外）の `lineCode`: **円を出さず路線名のみ**、`.nameNeutral`（padding `0 --space-1`、`1px solid --line-neutral`、
  `--radius-sm`。`components.line-pill-neutral-border`）の中立スタイル。
- **応答データを CSS 値にしない**: `style` 属性もカスタムプロパティも書かない（ADR 0008 D-1。Agent Prompt Guide のセキュリティ規約 2）。
  `tests/TransitCard.test.tsx` が各コードのクラス・`null` / 許可リスト外の中立表示・`style` 属性が無いことを固定する。

#### RouteDetail（`RouteDetail.tsx` / `RouteDetail.module.css`）

- `.container`: padding `--space-3 --space-4`、地 `--bg-tertiary`、`--radius-sm`。
- props は `candidate`（構造化候補）のみ。常に下記の**構造化経路**を描く（旧 `routes` と文字列のタイムラインは issue #125 で削除。ADR 0006 D-3）。
- **構造化経路**（issue #124）: `.route` = `<ol>`。stop 行 `.stopRow` と leg 行 `.legRow` を経路順に交互に並べ、各 `<li>` は
  共通の 3 列グリッド（時刻列 `--space-12 + --space-2` 幅・マーカー列 `12px`・本文。`column-gap: --space-3`）。
  - 時刻列 `.times`（`--font-mono`/`--font-size-sm`/`600`/`--text-primary`、右寄せ）: 始発は `HH:MM発`、乗換駅は前 leg の
    `arriveAt` を `HH:MM着`、次 leg の `departAt` を `HH:MM発` の 2 段、終着は `HH:MM着`。各値は `<time dateTime>`。
  - stop のマーカーは下記の dot（始発・終着 = `.dotTerminal`、乗換駅 = `.dotTransfer`）、駅名は `.station` / `.stationIntermediate`。
  - leg のマーカーは**路線レール** `.rail`（`width: 4px`、行の高さいっぱい（縦 padding は行でなく `.legBody` 側）、短い leg でも見えるよう `min-height: --space-6`、`background-color: currentColor`）。色は `lineCode` ごとの
    許可リストのクラス（`.railN` / `.railM` / `.railH` / `.railZ` / `.railE` / `.railS` / `.railKo`）が `color: var(--line-*)` で与え、
    `null` または許可リスト外は `.railNeutral`（`--line-neutral`）。`Object.hasOwn` で引き、`style` 属性もカスタムプロパティも書かない（ADR 0008 D-1）。
  - leg 本文 `.legBody`: `LinePill`（路線識別の再利用）、`.legMeta`（種別・`<行先>行`・`Nkm` を ` · ` で連結、欠けた要素は省く。
    `--font-size-xs`、`--text-secondary`）、**乗車位置コールアウト** `.car`（`乗車位置` ラベル `.carLabel` `--font-size-xs`/`--text-secondary` +
    値 `.carValue` `--font-size-md`/`600`/`--text-primary`。地 `--bg-elevated`・`1px solid --border-tertiary`・`--radius-sm`。
    例 `3・6号車` / `前／1号車` / `後方`。`carPosition` が `null` なら出さない）。
  - 乗換駅のバッジ `.badges`（`.badge` = TransitCard ラベルと同じアウトライン idiom、`--font-size-xs`/`500`、`--text-secondary`）:
    `乗換 N分`（`transferMinutes`）・`待ち N分`（`waitMinutes`）。`waitMinutes` が `0` なら amber の `余裕なし`（`.badgeTight`、色
    `--accent-amber`・地 `--accent-amber-tint`・罫 `--accent-amber-tint-border`・`600`）を足す。直通で降りない駅（`noAlight`）は
    `乗換` の代わりに `降車不要` チップ（`.badgeThrough`、地 `--bg-elevated`・色 `--text-primary`）を出し、乗り換えが無いので
    `余裕なし` は出さない（`待ち N分` は停車時間として残す）。文言が状態を運ぶので色だけに頼らない。
  - `tests/RouteDetail.test.tsx` が `<ol>` の行構成・区間ごとの時刻・種別/行先/距離・乗車位置 3 形式・レールのクラス・
    `余裕なし` / `降車不要` の出し分け・leg の無い候補の描画を固定する。
- **stop の dot**: `.dotTerminal`（始発・終着）= `8px` 塗り `--accent-blue` dot（frontmatter `components.route-timeline-dot`）。
  `.dotTransfer`（乗換）= `8px` 中空 dot（`background: transparent; border: 2px solid --accent-blue`）。両者 `margin-top: 4px`。
- `.station`（terminal）`--font-size-base`/`500`、`.stationIntermediate` `--font-size-sm`/`500`、ともに `--text-primary`。
- サーバーは候補ごとに leg を 1 本以上出す（`src/parse.mjs` の `parseCandidate()`）。leg の無い候補が届いた場合は、
  同じ `.route` の中に唯一の stop を終着扱いの 1 行（時刻・レールなし）で描く。

#### StatusIndicator（`StatusIndicator.tsx` / `StatusIndicator.module.css`）

- **控えめなドット + 相対鮮度**（issue #121）。`.container` は箱を持たない（地・罫・padding なし。ヘッダー地
  `--bg-primary` の上にそのまま載る）、`gap --space-2`、`--font-size-sm`。props は `status` / `lastUpdated` /
  `onRefresh`（App の `refresh`。`再試行` と同じくフォーカスを `<main>` へ退避してから呼ぶ）/ `refreshing`（App の `loading`）。現在時刻は `useNow()`（1 秒刻みの共有クロック）。
- **ドット**: Phosphor `Circle`（`size={6}`, weight fill, `aria-hidden`）。色は API status で
  `ok` → `--accent-green`（`components.status-indicator-ok`）/ `error` → `--accent-red`（`status-indicator-error`）/
  `loading` → `--text-tertiary` + `pulse`（`status-indicator-loading`）。色だけに頼らないよう、隣に
  `visually-hidden` のラベル `サーバー接続: 正常` / `サーバー接続: エラー` / `サーバー接続: 確認中` を置く。
- **鮮度テキスト**（`lastUpdated` があるときだけ）: 最後の成功取得から 180 秒未満は `.timestamp`
  （`--font-size-xs`/`--text-tertiary`）に `N秒前に更新` / `N分前に更新`（`relativeTimeLabel()`）。
- **鮮度ピル**: 180 秒以上（`isStale()`、`STALE_AFTER_MS = 180_000`、境界は 180 秒ちょうどで stale）で `.timestamp` の
  代わりに `.stale` ピル `N分前のデータ` + `更新` ボタン（`.staleRefresh`。`onRefresh` を呼び、`refreshing` 中は
  `disabled`/`aria-busy`）。ピルは padding `--space-1 --space-2`、地 `--accent-amber-tint`、罫
  `1px solid --accent-amber-tint-border`、`--radius-md`、色 `--accent-amber`（`components.stale-pill` /
  `stale-pill-surface` / `stale-pill-border`）。ボタンは地なし・罫 `--accent-amber-tint-border`・`--radius-sm`、
  `position: relative` + 透明な `::after`（44×44・中央）でヒット領域だけ広げる（`.refreshButton` と同じ作法）。
- `.iconLoading`（`pulse` 1.5s ease-in-out infinite）は **`@media (prefers-reduced-motion: reduce)` で
  `animation: none` + `opacity: 1`**（キーフレーム始点の `0.3` に凍結させず、不透明で止める）。
- `tests/StatusIndicator.test.tsx` が 179 秒 / 180 秒の境界・`更新` の配線・ドットの隠しラベルを固定している。

#### empty-state（**実装済み**）

- 選択中の出発地にカードが無い / `lastUpdated` あり / `error=null`（Verification Artifacts B の状態 #4）で `.empty`
  カードを描画する。地は `--bg-elevated`（Tech Debt #4 でこの段に役割が付いた）、文字 `--text-secondary`、
  padding `--space-12`、`Tray`（24）+ 文言 `取得できず` / `便なし` / `No departures found`。詳細は上の App の `.empty` を参照。

### Gaps & Proposals

- アニメ時間（`spin` 1s / `pulse` 1.5s）が呼び出し側で非トークン。`--transition-*` は UI トランジション用で
  キーフレーム尺とは別物のため、必要になったら別カテゴリとして足す（現状は 2 箇所のみで、前倒しはしない）。
- 空状態は**アクションを持たない**（再取得は共通の refresh ボタン）。カード内ボタンを足さない。

---

## Do's and Don'ts

### Do's

- **色・余白・角丸・font-size は frontmatter を編集し、`npm run export:design` で生成物を更新する。**
  `src/design-tokens.css` を直接編集しない（DO NOT EDIT）。
- 色・余白・角丸は**トークン名**で参照する（`var(--bg-secondary)` 等）。値を直書きしない。
- 余白は **4px グリッド**（`--space-*`）に乗せる。
- 時刻・数値列は**等幅**（`--font-mono`）+（提案）`tabular-nums` で桁を揃える。
- hover の強調は**ボーダーのみ**で表現する。
- focus は共通の `:focus-visible`（2px `--accent-blue`）を維持する。
- 状態は色だけに頼らず**テキスト**でも表す（StatusIndicator のドットは `visually-hidden` ラベル、鮮度は文言とピル）。
- export 表現不可のトークン（`--font-sans` / `--font-mono` / `--transition-*`）は `index.css` の
  **手書き残余区画にだけ**足す。
- `@google/design.md` は `npm run lint:design` / `npm run export:design`（ローカル bin）で実行する。

### Don'ts

- **`src/design-tokens.css` を手で編集しない**（次の `export:design` で上書きされ、ドリフトゲートで落ちる）。
- **トークン値を `index.css` の別名レイヤに直書きしない**（別名は必ず `var(--color-*)` 等の生成トークンを指す）。
- **無印 `npx @google/design.md` を実行しない**（実行時に最新 alpha を解決してしまう。0.3.0 に厳密固定済み）。
- **影（box-shadow）を足さない**（Elevation & Depth）。
- **スケール外の px を新規追加しない**（型階梯・spacing トークンの外）。`font-size` は必ず
  `--font-size-xs…--font-size-3xl` を使う（Vitest が拘束）。アイコン寸法は font-size ではなく `size` prop で渡す。
- **生 `rgba()` / hex を直書きしない。** 半透明が要るときも frontmatter に **8桁 hex**（`#rrggbbaa`）の色として足す
  （`--accent-red-tint` が前例）。`*.module.css` の生 `rgba()` / hex は Vitest が落とす。
- **CJK に字間（letter-spacing）や `break-all`/`break-word` を適用しない**（駅名・路線名が壊れる）。
- **CDN webフォントを追加しない**（Agent Prompt Guide のセキュリティ規約）。
- ライトテーマ / `prefers-color-scheme` 分岐を足さない（ダーク固定）。

---

## Responsive Behavior

### Current Spec

- **ブレークポイントは単一**: `@media (max-width: 480px)`（`TransitCard.module.css` のみ。規約は §Layout）。
  - カードは常に縦積み（出発＋カウントダウン / 到着・所要・ラベル / 路線ピル）なので段の組み替えはしない。各行は `flex-wrap: wrap`。
  - `.header` の `gap` が `--space-4` → `--space-3` に詰まる。
  - `.arrival` が `--font-size-xl` → `--font-size-2xl`（`18px` → `20px`）に拡大（出発時刻は既に最上段 `3xl`）。
- 他のコンポーネントは**流動レイアウト**（固定ブレークポイント無し）。タブは `overflow-x: auto` で横スクロール。
- **タッチターゲットは 44×44 以上**（Tech Debt #6 クローズ）: refresh と鮮度ピルの `更新` は `::after` 44×44 の
  ヒット領域、タブとエラーバナーの `再試行` は `min-width`/`min-height: 44px`。Playwright が `elementFromPoint` でヒット領域を実測して固定している
  （`boundingBox()` は擬似要素を見ないため、可視ボックスではなく**当たり判定**を測る）。
- **`prefers-reduced-motion: reduce`** で `spin` / `pulse` を停止（Tech Debt #7a クローズ）。これは寸法の
  ブレークポイントではないため、単一ブレークポイント規約の対象外。

### Gaps & Proposals

- ブレークポイントは 480px の 1 本で足りている。2 本目が必要になったら、まず流動レイアウトで解けないかを検討する。

---

## Agent Prompt Guide

後続のコード生成エージェントへの指示。

### 守るべき規約（Current Spec の固定点）

- **export 可能なトークン（色・font-size 階梯・weight・tracking・角丸・spacing）の正は本書の frontmatter。**
  新しい色・サイズは frontmatter に足し、`npm run export:design` を実行して `src/design-tokens.css` を再生成・コミットする。
  `index.css` には別名か手書き残余だけを置く。
- **`@google/design.md` は `0.3.0` に厳密固定した devDependency。** 実行は必ず `npm run lint:design` /
  `npm run export:design`（ローカル bin）で行い、**無印 `npx` を使わない**（実行時に最新 alpha を解決してしまう）。
- **テーマはダーク固定**（OS 未追従）。アイコンは **Phosphor Icons（`@phosphor-icons/react`）固定**。
- UI は**単一ルート**（検索フォーム・出発地選択 UI・運賃比較・ソート・広告は持たない）。最小クロームのグランスボードを維持。
- データは**マウント時 1 回のみ取得・自動更新なし**（`/api/transit`）。status のみ `/api/status` を **30 秒ポーリング**
  （`setInterval(checkStatus, 30000)`、transit のエラーとは独立）。

### セキュリティ規約（2件）

1. **エスケープ描画を維持する。** transit / route 由来の文字列（Jorudan 由来）は**常に JSX のテキスト子要素として描画**し、
   React の自動エスケープに委ねる。`dangerouslySetInnerHTML` は禁止（`RouteDetail` は現状この姿勢）。
2. **インライン `style` を使わない。** スタイルは CSS Modules + カスタムプロパティで表現する（将来の CSP 対応のため
   `style-src`/`font-src` を絞れる状態を保つ）。**CDN webフォントを追加しない**（第三者 egress・訪問者 IP/Referer の
   漏えい・CSP 緩和を招く。日本語ブランド書体が真に必要なら**同一オリジンでサブセット woff2 を自前ホスト**する）。
   生成物である `src/design-tokens.css` にも `@import` / `url(http…)` を持ち込まない。
- 内部ホスト名・AWS ARN・シークレット名・Jorudan `jrd_uuid` ハンドシェイク詳細を本書に書かない。内部詳細は
  `docs/architecture.md` を参照。

---

## Tech Debt

**全件クローズ済み**（トークン層 #1〜#4・#8、UI 層 #5〜#7・#9）。番号は履歴の追跡性のため据え置く。

1. ~~`--font-sans` に CJK 面が無い~~ → **クローズ**。OS 同梱の日本語書体を Latin の後・総称の前に挿入した
   （`Inter` 自体は宣言のみで未ロードのまま。自前ホストの是非は Typography の Gaps に残す）。
2. ~~呼び出し側のハードコード px~~ → **クローズ**。`*.module.css` の `font-size` は全て `--font-size-*` 別名に置換し、
   Vitest で拘束した（status アイコンの 10/12px はテキストではないため `size` prop へ移動）。
3. ~~`.error` の生 `rgba()`~~ → **クローズ**。`--accent-red-tint` / `--accent-red-tint-border`（8桁 hex）に置換。
4. ~~宣言済み・未使用の5トークン~~ → **クローズ**。`--border-accent` / `--transition-normal` / `--accent-yellow` を削除、
   `--accent-blue-hover`（refresh 押下）と `--bg-elevated`（空状態カード）に役割を付与。予約スロットも全廃（Colors 参照）。
5. ~~レスポンシブのブレークポイントが `TransitCard` ローカルに閉じ不統一~~ → **クローズ**。`max-width: 480px` を
   単一ブレークポイントとして §Layout に規約化し、`@media` を書いてよい唯一のファイルを `TransitCard.module.css` に
   固定した（新規ブレークポイントは足さない。`prefers-reduced-motion` は寸法 media feature ではないため対象外）。
6. ~~タッチターゲットが 44×44 指針に未達~~ → **クローズ**。refresh は視覚 32×32 のまま `::after` で 44×44 のヒット
   領域を持ち（フォーカスリングは可視ボックスに密着）、タブは `min-width`/`min-height: 44px` + `inline-flex`。
7. ~~`prefers-reduced-motion` 未ガード（`spin` / `pulse` アニメ）~~ → **クローズ**。両アニメに
   `@media (prefers-reduced-motion: reduce) { animation: none }`（pulse は `opacity: 1` 固定）。
   ※空状態の UI 未実装（#7b）は #4 の一環で解消済み。本 PR で `Tray`(24) と aria 属性を足して仕上げた。
8. ~~`--text-tertiary` が WCAG AA 未達~~ → **クローズ**。`#737373` → `#8a8a8a`（bg-primary 5.73:1 / bg-secondary 5.47:1 /
   bg-tertiary 5.19:1）。ADR 0003 D-E を実施。
9. ~~live region が文言ごと条件マウントされる~~ → **クローズ**。状態3分岐（error / loading / empty）を包む `.status` に
   `aria-live="polite"` を常設し、分岐ノードより長生きするリージョンで差し替えを告知する（`.error` の
   `role="alert"` / `.empty` の `role="status"` は据え置き）。空のときも**高さ 0 で表示し続ける**（`display: none`
   ではツリーから消えて常設の意味が無くなる。Playwright が computed `display` を固定）。`.cards` は**意図的に
   リージョン外**に置き、タブ切替で時刻表全体が読み上げられるのを避ける。

---

## Verification Artifacts

執筆時に逐語確認した3点。**トークン値の正は frontmatter**（生成物 `src/design-tokens.css` は `export:design` で自動更新）。

### A. トークン表（Token Table）

Colors / Layout / Shapes の各表が frontmatter のミラー（生成／手書きの境界は Overview の表を参照）。
Phosphor アイコン（**全て `size` prop で寸法指定**）: `Train`(20,bold) / `ArrowRight`(16) / `ArrowClockwise`(16) /
`Spinner`(16・24) / `Tray`(24, 空状態) / `CaretRight`(12,bold, 路線ピル間) / `CaretUp`・`CaretDown`(16) /
`Circle`(status ドット, 6)。アニメ: `spin` 1s linear infinite / `pulse` 1.5s ease-in-out infinite
（どちらも `prefers-reduced-motion: reduce` で停止）。タッチターゲット: 44×44（refresh と `更新` は `::after`、タブと `再試行` は
`min-width`/`min-height`）。ブレークポイント: `max-width: 480px` の 1 本のみ。

### B. 主要 UI 状態（Key UI States）— 実在する17状態（#13・#14 は欠番）

コードから抽出した実 UI 状態。ADR 0007 D-2 が旧「14状態以外を発明しない」規則を開き、#15〜#18 を足した。#19 は ADR 0006 D-2（クライアント時刻に依存する値はフロントエンドが計算する）に基づく。
**新しい状態は ADR で正当化してから足す**（スケルトン・カード別エラー等は存在しない）。#13・#14 は旧 `routes` の文字列表示に固有の状態で、
issue #125 の旧 `routes` 削除とともに消えた（番号は他所からの参照を保つため詰めない）。

| # | 状態 | 根拠 |
|---|---|---|
| 1 | 初回ローディング（`Spinner` 24 + `Loading transit information...`） | `App.tsx` `!error && !hasData && loading` |
| 2 | エラーバナー・カード無し（固定 `サーバーに接続できません` + `再試行`、`role="alert"`。タブがあれば `表示中は HH:MM 時点のデータです` も出す。hook の error 文字列は非表示） | `App.tsx` `error && !hasCards` / `.error` |
| 3 | リフレッシュ中（refresh ボタン内 `Spinner` 16・既存カードは残る） | `App.tsx` `refreshButton disabled={loading}` |
| 4 | 空状態（選択中の出発地にカードが無い・`lastUpdated` あり・`error=null`、タブが無ければ `loading=false` → `.empty` カード `Tray`(24) + `取得できず` / `便なし` / `No departures found`、`role="status"`） | `App.tsx` `.empty` / `components.empty-state` |
| 5 | 最速カード既定展開＋左キーライン（サーバーの `isFastest` 候補） | `TransitCard.tsx` `useState(isNext)` / `App.tsx` `isNext: candidate.isFastest` / `.cardNext` |
| 6 | カード展開／折りたたみ | `TransitCard.tsx` `expanded` トグル |
| 7 | タブ active（`aria-selected="true"`・`tabindex="0"`） | `App.module.css` `.tabActive` |
| 8 | タブ inactive（`aria-selected="false"`・`tabindex="-1"`） | `.tab` 既定 |
| 9 | status: ok（緑ドット・隠しラベル `サーバー接続: 正常`） | `StatusIndicator.tsx` `status === 'ok'` |
| 10 | status: error（赤ドット・隠しラベル `サーバー接続: エラー`） | `status === 'error'` |
| 11 | status: loading（pulse するドット・隠しラベル `サーバー接続: 確認中`） | `status === 'loading'` |
| 12 | RouteDetail タイムライン（始発終着 = 塗り dot / 乗換 = 中空 dot。路線レール・区間時刻・乗車位置・`乗換` / `待ち` / `余裕なし` / `降車不要` バッジを持つ `<ol>`） | `RouteDetail.tsx` `StructuredRoute` |
| 13 | ~~RouteDetail 生 `<pre>` フォールバック~~ → **削除**（issue #125） | — |
| 14 | ~~不正サマリ（`--:--` / `--` 表示）~~ → **削除**（issue #125。時刻・所要は検証済みの構造化値から描く） | — |
| 15 | データ鮮度切れ（最後の成功取得から 180 秒以上 → amber ピル `N分前のデータ` + `更新`。未満は `N秒前に更新` / `N分前に更新`） | `StatusIndicator.tsx` `isStale()` / `.stale` / `components.stale-pill` |
| 16 | エラーバナー・既存データあり（`サーバーに接続できません` + `表示中は HH:MM 時点のデータです` + `再試行`、直前のカードは表示したまま） | `App.tsx` `error && hasCards` / `.error` + `.cards` |
| 17 | 出発地ごとの結果（タブ 2 行目: `HH:MM着` + `最速` / `+N分`、`status: error` → `取得できず`、`no_candidates` → `便なし`） | `App.tsx` `tabSummary()` / `.tabSummary` |
| 18 | 出発地の自動選択（`fastestOrigin`、`null` なら先頭。手動選択は次の成功取得まで保持） | `App.tsx` `heldOrigin ?? autoOrigin` |
| 19 | 出発カウントダウン（`あとN分で出る` 緑 / `今すぐ出発` amber（0〜1 分）/ `間に合いません` 減光（負）。一覧は並べ替えない。ADR 0006 D-2 のクライアント側時刻値） | `TransitCard.tsx` `leaveCountdown()` / `.countdown*` |

横断挙動（独立した状態ではない）: 長い日本語名の折返し（`line-break: strict` / `word-break: normal`）/
タブ多数時の横スクロール（`overflow-x: auto`）/ `@media (max-width: 480px)` リフロー / refresh ボタンの押下
（`:active`）/ `prefers-reduced-motion: reduce` でのアニメ停止。

**既知ギャップ**: 無し（状態 #4 の空状態は実装済み）。

### C. マイクロコピー一覧（Microcopy）— 逐語

ADR 0007 D-1 で UI 文言は**日本語へ移行中**（旧「英語のまま・翻訳しない」方針は撤回）。下表は現時点の逐語で、
英語の文言（`Transit` / `Refresh` / `Loading transit information...` / `No departures found` / `Data from Jorudan`）はまだ置き換えていない。

| 文言 | 場所 |
|---|---|
| `Transit` | ヘッダータイトル |
| `Refresh` | refresh ボタン `aria-label` |
| `Loading transit information...` | 初回ローディング |
| `サーバーに接続できません` | エラーバナー見出し |
| `表示中は HH:MM 時点のデータです` | エラーバナー 2 行目（既存カードがあるときのみ。`HH:MM` は JST） |
| `再試行` | エラーバナーのボタン |
| `No departures found` | 空状態カード（`.empty`） |
| `サーバー接続: 正常` / `サーバー接続: エラー` / `サーバー接続: 確認中` | StatusIndicator ドットの `visually-hidden` ラベル |
| `N秒前に更新` / `N分前に更新` | StatusIndicator 鮮度テキスト（180 秒未満） |
| `N分前のデータ` / `更新` | StatusIndicator 鮮度ピルとそのボタン（180 秒以上） |
| `Data from Jorudan` | フッター |
| `つつじヶ丘` | 固定の到着駅 |
| `出発駅` | 出発地タブの tablist `aria-label` |
| `HH:MM着` / `最速` / `+N分` | 出発地タブ 2 行目（`ok` の出発地） |
| `取得できず` / `便なし` | 出発地タブ 2 行目（`status: error` / `no_candidates`）と、その出発地を選択中の空状態カード |
| `オフィスから徒歩N分 · 到着が早い順` | 文脈行 2 行目（選択中の構造化出発地に候補があるときのみ） |
| `最速の便` | 最速カードの `visually-hidden` ラベル |
| `HH:MM着` / `N分 · 乗換N回` | カード 2 行目（到着時刻・所要と乗換回数） |
| `最速` / `乗換少` | カード 2 行目のラベル（`isFastest` / `isFewestTransfers`） |
| `あとN分で出る` / `今すぐ出発` / `間に合いません` | カードのカウントダウンバッジ |

> ブラウザタブの `<title>`: 初回取得までは `index.html` の `Transit - 六本木一丁目 → つつじヶ丘`、タブが出た後は
> `document.title` = `{出発駅} → つつじヶ丘 · HH:MM発`（選択中出発地の `isFastest` 候補の出発時刻。候補が無ければ
> `{出発駅} → つつじヶ丘`）。
