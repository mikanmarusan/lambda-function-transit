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
  badge:
    backgroundColor: "{colors.bg-tertiary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.xs}"
    rounded: "{rounded.sm}"
  badge-border:
    backgroundColor: "{colors.border-tertiary}"
    height: 1px
  status-indicator:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.sm}"
    rounded: "{rounded.md}"
  status-indicator-ok:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.accent-green}"
    size: 10px
  status-indicator-error:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.accent-red}"
    size: 12px
  status-indicator-loading:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.text-tertiary}"
    size: 10px
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
  route-timeline-dot:
    backgroundColor: "{colors.accent-blue}"
    size: 8px
  route-timeline-line:
    backgroundColor: "{colors.border-secondary}"
    width: 2px
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
| **生成（frontmatter が正）** | 色（`--color-*`。**α付き tint 色を含む**）・font-size 階梯（`--text-xs…2xl`）・weight（`--font-weight-*`）・tracking（`--tracking-*`）・角丸（`--radius-*`）・spacing（`--spacing-*`） | `src/design-tokens.css`（DO NOT EDIT） |
| **別名（生成物への薄いエイリアス）** | `--bg-*` / `--border-*` / `--text-primary`・`--text-secondary`・`--text-tertiary` / `--accent-*`（`--accent-red-tint` 系を含む） / `--space-1…12` / `--font-size-xs…2xl` | `src/index.css` の別名レイヤ |
| **手書き残余（export 表現不可）** | `--font-sans`（CJK 込みの連鎖）・`--font-mono`・`--transition-fast` | `src/index.css` の手書き残余区画（`:root`） |
| **非トークンの設計値** | `line-height`（`body` と `.rawRoute`）・`font-feature-settings`（**提案のみ・未実装**） | 各 CSS の宣言に直書き（`:root` トークンではない） |

- `--radius-sm/md/lg` は生成名と現行名が 1:1 で一致するため別名を張らず、`@import` した生成物をそのまま使う。
- font-size 階梯は生成名が `--text-xs…--text-2xl` で、**色の `--text-primary/secondary/tertiary` と名前空間が衝突する**
  （`color: var(--text-sm)` が無言で無効値になる）。そのため呼び出し側は必ず別名 **`--font-size-xs…--font-size-2xl`**
  を使う。**呼び出し側の直書き px は全廃済み**（Tech Debt #2 クローズ。`tests/design-tokens.test.ts` が
  `*.module.css` の `font-size` を階梯別名のみに拘束する）。
- **α付きの色は export 可能。** `@google/design.md` は 8桁 hex（`#rrggbbaa`）をそのまま通し、`rgba()` 記法も 8桁 hex に
  正規化する。したがって `.error` の tint は frontmatter の色として持てる（Tech Debt #3 クローズ）。ただし
  **lint の contrast チェックは α 非対応**（下地との合成をせず 8桁 hex をそのまま前景色と比較して無意味な 1.00:1 を出す）。
  そのため α色は `textColor` を持たない**面だけのコンポーネント**（`error-banner-surface` / `error-banner-border`）として
  モデル化し、実効コントラストは Vitest 側（合成してから比率を出す）で担保する。
  なお `components.error-banner.backgroundColor` は `{colors.bg-primary}` を指すが、これは**実際に塗る色ではなく
  「tint の下地」**である（CSS が塗るのは `--accent-red-tint`）。lint の非 α コントラスト検査を意味のある比較に
  するための**モデル**であり、実装事実としての地の色は上の `.error` の記述を正とする。

### ビジュアルテーマ（Visual Theme）

#### Current Spec

- **ダーク専用**の単一テーマ。`index.html` は `<html lang="ja">`、`<meta name="theme-color" content="#0a0a0a">`、
  `<title>Transit - 六本木一丁目 → つつじヶ丘</title>`。
- **影を使わない border ベースの奥行き**（詳細は Elevation & Depth）。背景4段とボーダー4段で階層を表現する。
- **4px グリッド**（`--space-*`、Layout）。**最大幅 600px の単一カラム**を中央寄せした、グランス用（一瞥用）ボード。
- 日本語（駅名・所要時間・`つつじヶ丘`）と Latin 等幅（時刻・ステータスのタイムスタンプ）の**混植**。
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
| `--bg-secondary` | `colors.bg-secondary` | `#111111` | タブ hover 地・refresh ボタン地・StatusIndicator 地 |
| `--bg-tertiary` | `colors.bg-tertiary` | `#171717` | RouteDetail コンテナ地・refresh hover 地 |
| `--bg-elevated` | `colors.bg-elevated` | `#1a1a1a` | 最上段の面。**カード地**（TransitCard・空状態カード `.empty`）。屋外可読性のためカード地をこの段まで引き上げた（issue #96 / ADR 0004 D-4 が上限。`--accent-blue` 到着時刻が 4.73:1 でぎりぎり AA） |
| `--border-primary` | `colors.border-primary` | `#262626` | 既定のボーダー（タブ・ボタン・区切り線・空状態カード） |
| `--border-secondary` | `colors.border-secondary` | `#333333` | refresh ボタン hover / active の一段明るいボーダー・タイムライン縦線・lineName 左罫・スクロールバー thumb |
| `--border-tertiary` | `colors.border-tertiary` | `#666666` | カードの既定アウトライン・バッジのアウトライン。ページ地に 3.45:1 / カード地に 3.03:1（issue #96 / ADR 0004。2:1 の house 閾値を満たす） |
| `--border-elevated` | `colors.border-elevated` | `#8a8a8a` | カード hover 時のアウトライン（resting `--border-tertiary` より明るい＝ボーダーランプは単調） |
| `--text-primary` | `colors.text-primary` | `#fafafa` | 本文・主要テキスト |
| `--text-secondary` | `colors.text-secondary` | `#a1a1a1` | 補助テキスト（タブ非選択・ステータスラベル・ローディング文言・空状態文言） |
| `--text-tertiary` | `colors.text-tertiary` | `#8a8a8a` | 装飾・最小ウェイト（矢印・フッター・タイムスタンプ・路線名）。**WCAG AA 達成値**（ADR 0003 D-E） |
| `--bg-inverted` | `colors.bg-inverted` | `#fafafa` | 選択中タブ（反転チップ）の地。屋外グレア下で選択状態が唯一残る近白面（ADR 0004。地に `--text-*` を塗らないための専用ロール） |
| `--text-inverted` | `colors.text-inverted` | `#0a0a0a` | 選択中タブ（反転チップ）のラベル。近白地に対し 18.97:1（ADR 0004） |
| `--accent-blue` | `colors.accent-blue` | `#3b82f6` | 到着時刻・ロゴ・タイムライン dot・active ボーダー・focus リング |
| `--accent-blue-hover` | `colors.accent-blue-hover` | `#2563eb` | refresh ボタンの**押下（`:active`）地／罫**（TD#4 で役割確定） |
| `--accent-green` | `colors.accent-green` | `#22c55e` | status OK アイコン（Connected） |
| `--accent-red` | `colors.accent-red` | `#ef4444` | エラーテキスト・status error アイコン |
| `--accent-red-tint` | `colors.accent-red-tint` | `#ef44441a` | エラーバナーの地（`--accent-red` の α10%。TD#3 でトークン化） |
| `--accent-red-tint-border` | `colors.accent-red-tint-border` | `#ef444433` | エラーバナーの罫（`--accent-red` の α20%） |

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
  2xl:20px`）。生成物に `--text-xs…--text-2xl`・`--font-weight-*`・`--tracking-*` として出力される。
  **呼び出し側（`*.module.css`）はすべて別名 `--font-size-xs…--font-size-2xl` を参照し、直書き px は 0 件**
  （Tech Debt #2 クローズ。Vitest が `font-size` を階梯別名のみに拘束する）。
- **アイコン寸法は font-size ではない。** status の `Circle`(10px) / `Warning`(12px) は Phosphor の `size` prop で渡す
  （他の全アイコンと同じ作法）。10px は型階梯の外だが、これはテキストではないため階梯に足さない。
- ウェイトは `500` と `600` の2種のみ。
- 等幅は時刻列（TransitCard の `.departure`/`.arrival`、`--font-mono`）と StatusIndicator の `.timestamp` に適用。
- 字間 `letter-spacing: -0.02em` は **Latin/数字のみ**に適用（`.title`、`.departure`/`.arrival`）。CJK には掛けていない。
- **CJK 本文の行間・禁則（実装済み。Typography の Gaps からクローズ）。** 日本語ラベル（駅名・路線名・タブ）は
  `line-height: 1.6`（`body` の `1.5` を局所的に上書き）・`word-break: normal`・`line-break: strict` を持つ。適用先は
  `App.module.css` の `.tab` / `.station`、`RouteDetail.module.css` の `.station` / `.stationIntermediate` / `.lineName`。
  これらに `letter-spacing` は掛けない。**`word-break: break-word` は `.rawRoute`（生 `<pre>` フォールバック）専用**で、
  駅名・路線名には波及させない（mid-glyph 折返しを防ぐ）。Playwright は computed 値（`line-break` / 行間比 /
  `letter-spacing` / `word-break`）と、`break-word` が `.rawRoute` に閉じていることを固定する。
  ただし `word-break: normal` と `letter-spacing: normal` は**CSS の初期値でもある**（宣言はグローバル上書きに対する
  前向きのガードで、テストが落ちるのは `line-break` / 行間 / `.rawRoute` の分離が壊れたとき）。
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
  `.content` は gap を持たない（`.status` と `.cards` が排他のため。Components 参照）。モバイルファースト。
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
  | `--radius-sm` | `rounded.sm` | `4px` | バッジ・RouteDetail コンテナ・スクロールバー thumb |
  | `--radius-md` | `rounded.md` | `6px` | タブ・refresh ボタン・StatusIndicator |
  | `--radius-lg` | `rounded.lg` | `8px` | カード |

- 円形は RouteDetail の dot（`8px`）と status アイコン（Phosphor `Circle`）のみ。

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
- `.tab`: `inline-flex`（`align-items: center; justify-content: center`）、**`flex: 0 0 auto`**、
  **`min-width` / `min-height: 44px`**（タッチターゲット。Layout 参照）。
  `flex: 0 0 auto` は必須: flex アイテムの既定 `min-width: auto`（＝内容幅の下限）が `.tabs` の `overflow-x: auto`
  スクロールを成立させているところへ `min-width: 44px` を宣言すると、その下限を**より小さい値に置き換えて**しまい、
  タブが 44px まで潰れて `nowrap` のラベルが隣へはみ出す。
  padding `--space-1 --space-3`、ボーダー `1px solid --border-primary`、
  `--radius-md`、色 `--text-secondary`、`--font-size-base`/`500`、`line-height: 1.6`・`word-break: normal`・
  `line-break: strict`（CJK 体裁）、`white-space: nowrap`、`transition: all --transition-fast`。
  選択状態は **`aria-pressed`**（`origin === activeOrigin`）で支援技術に出す。
- `.tab:hover:not(.tabActive)`: 地 `--bg-secondary`、色 `--text-primary`。**`:not(.tabActive)` で非選択タブに限定する**のは
  必須: 無印 `.tab:hover`(0,2,0) は `.tabActive`(0,1,0) を出し抜くため、反転チップが白になった瞬間、選択中タブをホバー
  すると地が暗く塗り戻る（iOS ではタップ後に `:hover` が残る）。`.tabActive`: **反転チップ**。地/ボーダー `--bg-inverted`
  （近白）、ラベル `--text-inverted`（近黒）。選択 vs 非選択のコントラストを 1.05:1 → **18.97:1** に上げ、屋外の 20% グレア
  veil 下でも選択状態が残る唯一の要素（ADR 0004）。非選択タブの 1px ボーダーは `--border-primary`（frontmatter
  `components.tab-border`）。
- `.route`: `activeOrigin` + `ArrowRight`（16, 色 `--text-tertiary`）+ `つつじヶ丘`。`.station` は `--font-size-md`/`500`/
  `--text-primary`、`line-height: 1.6`・`word-break: normal`・`line-break: strict`。
- `.refreshButton`: **視覚 `32px × 32px`**、地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-md`、
  `aria-label="Refresh"`、`aria-busy={loading}`。`position: relative` + 透明な `::after`（`44px × 44px`・中央）で
  **ヒット領域だけ 44×44** に広げる（視覚寸法とフォーカスリングは 32×32 のまま）。
  `:hover:not(:disabled)` で地 `--bg-tertiary`・ボーダー `--border-secondary`。
  `:active:not(:disabled)` で地/罫 `--accent-blue-hover`（押下。`components.refresh-button-active`）。
  `:disabled` は `opacity: 0.5; cursor: not-allowed`。
  ローディング中は `Spinner`（16）を回し、通常は `ArrowClockwise`（16）。
- `.spinner`（`spin` 1s linear infinite）は **`@media (prefers-reduced-motion: reduce)` で `animation: none`**。
- `.content`: 4 分岐（error / loading / empty / cards）の器。うち**状態3分岐（error / loading / empty）だけ**を
  `.status`（**常設の `aria-live="polite"`**）で包む。分岐ノードは文言ごと条件マウントされるため、差し替えを
  読み上げさせるには**それらより長生きするコンテナ**側に live region を置く必要がある。
  **`.cards` は live region の外**に置く: 中に入れるとタブ切替のたびに時刻表全体が読み上げられてしまう
  （ユーザー起点の遷移に告知は要らない）。空の `.status` は**高さ 0 のまま表示し続ける**（`display: none` は
  live region をアクセシビリティツリーから削除してしまい、「内容と同時に現れるリージョン」＝条件マウントと
  同じ振る舞いに戻ってしまう）。`.content` に `gap` を置かないのはこのため: `.status` と `.cards` は排他
  （cards は `activeRoutes.length > 0`、`.status` の3分岐はいずれもその否定）なので、`gap` は幽霊行しか生まない。
- `.loading`: 縦中央寄せ、`Spinner`（24）+ `Loading transit information...`、padding `--space-12`、色 `--text-secondary`、`--font-size-base`。
- `.error`: `Failed to load transit information`、**`role="alert"`**、padding `--space-4`、地 `--accent-red-tint`、罫
  `1px solid --accent-red-tint-border`、`--radius-md`、色 `--accent-red`、`--font-size-base`（Colors 参照）。
- `.empty`: **`Tray`（24, 色 `--text-tertiary` = `.emptyIcon`）** + `No departures found`、**`role="status"`**、
  縦積み `gap --space-3`、padding `--space-12`、地 `--bg-elevated`、罫 `1px solid --border-primary`、`--radius-lg`、
  色 `--text-secondary`、`--font-size-base`、中央寄せ（`components.empty-state`）。**赤もボタンも持たない**
  （エラーではなく「結果ゼロ」の告知）。描画条件は `!error && !loading && lastUpdated && activeRoutes.length === 0`。
  **`lastUpdated` で門番する**のは、`loading` の初期値が `false` のため、これが無いと初回ペイントで空状態が
  一瞬ちらつくため。
- `.error` / `.empty` の `role` は**必須**（バナー／カードを支援技術に「アラート」「ステータス」として提示する）。
  `tests/App.test.tsx` が 4 分岐（error / loading / empty / cards）と role・`aria-live`・`aria-busy`・`aria-pressed` を
  固定している。
- `.footer`: `Data from Jorudan`、padding `--space-4`、中央寄せ、`--font-size-xs`、色 `--text-tertiary`、上罫 `1px solid --border-primary`。

#### TransitCard（`TransitCard.tsx` / `TransitCard.module.css`）

- `.card`: 地 `--bg-elevated`、ボーダー `--border-tertiary`、`--radius-lg`、`overflow: hidden`、
  `transition: border-color --transition-fast`。`.card:hover` でボーダー `--border-elevated`（resting `--border-tertiary` より
  **明るい**。旧 `--border-secondary` #333333 は今や resting より暗く、残すと hover がカードを暗く沈ませる逆ランプになる。issue #96 / ADR 0004）。
- `.header`（button）: `gap: --space-4`、padding `--space-4`、`background: none; border: none; font: inherit`、`aria-expanded={expanded}`。
- `.times`: `.departure`/`.arrival` は `--font-size-xl`/`600`/`--font-mono`/`letter-spacing: -0.02em`。`.arrival` は色 `--accent-blue`。
  区切りの `.arrow`（`→`）は `--text-tertiary`/`--font-size-md`。
- `.meta`: `.badge` ×2（`Clock` 12/bold + 所要、`ArrowsDownUp` 12/bold + 乗換回数）。バッジは**アウトライン idiom**
  （地 `transparent`・`1px solid --border-tertiary`。`components.badge-border`）、`--radius-sm`、`--font-size-xs`/`500`、色 `--text-secondary`。
  旧 `--bg-tertiary` #171717 塗りは引き上げたカード地 #1a1a1a に対し 1.03:1 でカードより暗く沈むため、未選択 `.tab` と同じアウトライン idiom に寄せた（issue #96）。ラベルはカード地 #1a1a1a で 6.74:1。
- `.expandIcon`: `CaretUp`（展開時）/ `CaretDown`（折りたたみ時）、16、色 `--text-tertiary`。
- `.body`: padding `0 --space-4 --space-4`、`RouteDetail` を内包。
- **次発マーカー `.cardNext`**（issue #97 / ADR 0004 D-3）: **最早出発のカード**の左端に `width: --space-1`（4px）・
  `--accent-blue` の縦キーライン（`components.card-marker-next`）。`position: absolute` の `::before` で描く
  （左ボーダーは `--radius-lg` の角で楔状に潰れ、カード内容を 4px 右へずらして 2 枚の出発時刻の縦揃えを壊す。
  影は Elevation & Depth で全面禁止）。`pointer-events: none` 必須: 擬似要素のヒットテストは `.card` に落ちるため、
  無いと 4px 帯が `.header` ボタンへのクリックを飲み込む。
  **マーク対象はデータから導出し、カード位置から推定しない**: バックエンドは Jorudan の候補を**ソートせずに** slice し、
  Jorudan は経路品質順に並べるため、`index === 0` は「最早」を意味しない。`App.tsx` の `deriveNextIndex()` が
  `parseSummary().departureTime` から最早出発の index を導出する。ガード 3 件: いずれかが `--:--`（パース失敗）なら
  マークなし（文字列比較で `--:--` が全数字に先勝ちするため）、時刻差が 6 時間超なら深夜跨ぎを疑いマークなし、
  同時刻タイは先頭。屋外 20% グレア veil 下で青は ~1.92:1 まで潰れるため、マーカーは単独キャリアではない:
  既定展開と `visually-hidden` ラベルが冗長キューを担う（ADR 0004 の honest limits）。
  擬似要素は支援技術に見えないため、`isNext` のとき `.header` ボタン内に
  `<span className="visually-hidden">Next departure </span>`（グローバル `index.css` のユーティリティ）を置く。
- **次発カード（`isNext`）は既定で展開**（`useState(isNext)`）。カードの `key` は位置ではなく列車の同一性
  （`` `${activeOrigin}-${departureTime}-${index}` ``）: React は key でインスタンスを再利用し `useState` の初期化子は
  マウント時しか走らないため、`key={index}` ではタブ切替・リフレッシュ後にマーカーと展開カードがズレる。

#### RouteDetail（`RouteDetail.tsx` / `RouteDetail.module.css`）

- `.container`: padding `--space-3 --space-4`、地 `--bg-tertiary`、`--radius-sm`。
- 縦タイムライン。`.dotTerminal`（始発・終着）= `8px` 塗り `--accent-blue` dot（frontmatter `components.route-timeline-dot`）。
  `.dotTransfer`（乗換）= `8px` 中空 dot（`background: transparent; border: 2px solid --accent-blue`）。両者 `margin-top: 4px`。
- `.line`: `width: 2px` のコネクタ、色 `--border-secondary`（`components.route-timeline-line`）、最終 stop 以外に描画。
- `.station`（terminal）`--font-size-base`/`500`、`.stationIntermediate` `--font-size-sm`/`500`、ともに `--text-primary`。
- `.lineName`: 路線名、`--font-size-xs`、色 `--text-tertiary`、左罫 `2px solid --border-secondary`、`padding-left: --space-2`。
- **生 `<pre>` フォールバック**: `parseRoute()` が 0 件のとき `.rawRoute`（`--font-mono`/`--font-size-xs`/`--text-secondary`/
  `white-space: pre-wrap`/`word-break: break-word`/`line-height: 1.6`）で生文字列をそのまま表示。

#### StatusIndicator（`StatusIndicator.tsx` / `StatusIndicator.module.css`）

- `.container`: 地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-md`、`--font-size-sm`。
- 状態は**アイコン形 + ラベル + 色**の三重表現（色単独に依存しない）。**アイコン寸法は `size` prop**（CSS の
  `font-size` ではない。`.icon*` クラスは色とアニメだけを持つ）:
  - `ok` → `Circle`（`size={10}`, weight fill, 色 `--accent-green`）+ ラベル `Connected`（`components.status-indicator-ok`）。
  - `error` → `Warning`（`size={12}`, weight fill, 色 `--accent-red`）+ ラベル `Error`（`components.status-indicator-error`）。
  - `loading` → `Circle`（`size={10}`, 色 `--text-tertiary`, `pulse` アニメ）+ ラベル `Connecting`
    （`components.status-indicator-loading`。`--text-tertiary` は AA 達成済みで warning は出ない）。
- `.iconLoading`（`pulse` 1.5s ease-in-out infinite）は **`@media (prefers-reduced-motion: reduce)` で
  `animation: none` + `opacity: 1`**（キーフレーム始点の `0.3` に凍結させず、不透明で止める）。
- `.timestamp`: `lastUpdated` があるとき `Updated HH:MM:SS`（`--font-mono`/`--font-size-xs`/`--text-tertiary`）。

#### empty-state（**実装済み**）

- `routes=[]` / `loading=false` / `lastUpdated` あり / `error=null`（Verification Artifacts B の状態 #4）で `.empty`
  カードを描画する。地は `--bg-elevated`（Tech Debt #4 でこの段に役割が付いた）、文字 `--text-secondary`、
  padding `--space-12`、`Tray`（24）+ 文言 `No departures found`。詳細は上の App の `.empty` を参照。

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
- 状態は色だけでなく**アイコン形 + ラベル**でも表す（StatusIndicator）。
- export 表現不可のトークン（`--font-sans` / `--font-mono` / `--transition-*`）は `index.css` の
  **手書き残余区画にだけ**足す。
- `@google/design.md` は `npm run lint:design` / `npm run export:design`（ローカル bin）で実行する。

### Don'ts

- **`src/design-tokens.css` を手で編集しない**（次の `export:design` で上書きされ、ドリフトゲートで落ちる）。
- **トークン値を `index.css` の別名レイヤに直書きしない**（別名は必ず `var(--color-*)` 等の生成トークンを指す）。
- **無印 `npx @google/design.md` を実行しない**（実行時に最新 alpha を解決してしまう。0.3.0 に厳密固定済み）。
- **影（box-shadow）を足さない**（Elevation & Depth）。
- **スケール外の px を新規追加しない**（型階梯・spacing トークンの外）。`font-size` は必ず
  `--font-size-xs…--font-size-2xl` を使う（Vitest が拘束）。アイコン寸法は font-size ではなく `size` prop で渡す。
- **生 `rgba()` / hex を直書きしない。** 半透明が要るときも frontmatter に **8桁 hex**（`#rrggbbaa`）の色として足す
  （`--accent-red-tint` が前例）。`*.module.css` の生 `rgba()` / hex は Vitest が落とす。
- **CJK に字間（letter-spacing）や `break-all`/`break-word` を適用しない**（駅名・路線名が壊れる）。
- **CDN webフォントを追加しない**（Agent Prompt Guide のセキュリティ規約）。
- ライトテーマ / `prefers-color-scheme` 分岐を足さない（ダーク固定）。

---

## Responsive Behavior

### Current Spec

- **ブレークポイントは単一**: `@media (max-width: 480px)`（`TransitCard.module.css` のみ。規約は §Layout）。
  - `.header` が `flex-wrap: wrap` + `gap: --space-3` になり、`.times` が `flex-basis: 100%; order: 1`（時刻を上段へ）、
    `.meta` が `order: 2`、`.expandIcon` が `order: 3`。
  - `.departure`/`.arrival` が `--font-size-xl` → `--font-size-2xl`（`18px` → `20px`）に拡大。
- 他のコンポーネントは**流動レイアウト**（固定ブレークポイント無し）。タブは `overflow-x: auto` で横スクロール。
- **タッチターゲットは 44×44 以上**（Tech Debt #6 クローズ）: refresh は視覚 32×32 + `::after` 44×44 のヒット領域、
  タブは `min-width`/`min-height: 44px`。Playwright が `elementFromPoint` でヒット領域を実測して固定している
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
`Spinner`(16・24) / `Tray`(24, 空状態) / `Clock`(12,bold) / `ArrowsDownUp`(12,bold) / `CaretUp`・`CaretDown`(16) /
`Circle`(status, 10) / `Warning`(status, 12)。アニメ: `spin` 1s linear infinite / `pulse` 1.5s ease-in-out infinite
（どちらも `prefers-reduced-motion: reduce` で停止）。タッチターゲット: 44×44（refresh は `::after`、タブは
`min-width`/`min-height`）。ブレークポイント: `max-width: 480px` の 1 本のみ。

### B. 主要 UI 状態（Key UI States）— 実在する14状態

コードから抽出した実 UI 状態。**この14状態以外を発明しない**（スケルトン・カード別エラー等は存在しない）。

| # | 状態 | 根拠 |
|---|---|---|
| 1 | 初回ローディング（`Spinner` 24 + `Loading transit information...`） | `App.tsx` `!error && activeRoutes.length === 0 && loading` |
| 2 | エラーバナー（固定 `Failed to load transit information`、`role="alert"`。hook の error 文字列は非表示） | `App.tsx` `error &&` / `.error` |
| 3 | リフレッシュ中（refresh ボタン内 `Spinner` 16・既存カードは残る） | `App.tsx` `refreshButton disabled={loading}` |
| 4 | 空状態（`routes=[]`・`loading=false`・`lastUpdated` あり・`error=null` → `.empty` カード `Tray`(24) + `No departures found`、`role="status"`） | `App.tsx` `.empty` / `components.empty-state` |
| 5 | 次発カード既定展開＋左キーライン（最早出発をデータから導出。パース失敗・6時間超の時刻差ではマークなし） | `TransitCard.tsx` `useState(isNext)` / `App.tsx` `deriveNextIndex()` / `.cardNext` |
| 6 | カード展開／折りたたみ | `TransitCard.tsx` `expanded` トグル |
| 7 | タブ active | `App.module.css` `.tabActive` |
| 8 | タブ inactive | `.tab` 既定 |
| 9 | status: ok（`Connected`・緑 `Circle`） | `StatusIndicator.tsx` `status === 'ok'` |
| 10 | status: error（`Error`・赤 `Warning`） | `status === 'error'` |
| 11 | status: loading（`Connecting`・pulse する `Circle`） | `status === 'loading'` |
| 12 | RouteDetail タイムライン（始発終着 = 塗り dot / 乗換 = 中空 dot） | `RouteDetail.tsx` `isTerminal` |
| 13 | RouteDetail 生 `<pre>` フォールバック | `parseRoute()` が 0 件のとき `.rawRoute` |
| 14 | 不正サマリ（`--:--` / `--` 表示） | `parseSummary()` の既定値 |

横断挙動（独立した状態ではない）: 長い日本語名の折返し（`line-break: strict` / `word-break: normal`）/
タブ多数時の横スクロール（`overflow-x: auto`）/ `@media (max-width: 480px)` リフロー / refresh ボタンの押下
（`:active`）/ `prefers-reduced-motion: reduce` でのアニメ停止。

**既知ギャップ**: 無し（状態 #4 の空状態は実装済み）。

### C. マイクロコピー一覧（Microcopy）— 逐語

UI 文言は**英語のまま**。翻訳しない。日本語は `つつじヶ丘` と `ja-JP` 時刻フォーマットのみ。

| 文言 | 場所 |
|---|---|
| `Transit` | ヘッダータイトル |
| `Refresh` | refresh ボタン `aria-label` |
| `Loading transit information...` | 初回ローディング |
| `Failed to load transit information` | エラーバナー |
| `No departures found` | 空状態カード（`.empty`） |
| `Connected` / `Error` / `Connecting` | StatusIndicator ラベル |
| `Updated HH:MM:SS` | StatusIndicator タイムスタンプ（`ja-JP`・`2-digit` 時分秒） |
| `Data from Jorudan` | フッター |
| `つつじヶ丘` | 固定の到着駅（唯一の常時表示日本語ラベル） |

> ブラウザタブの `<title>` のみ日本語を含む: `Transit - 六本木一丁目 → つつじヶ丘`（`index.html`）。
