---
name: lambda-function-transit Frontend
description: 個人用乗換案内ボード（React 19 + Vite）のデザインシステム仕様
theme: dark-only
source_of_truth: frontend/src/index.css
language: ja
---

# DESIGN.md — 乗換案内UIのデザインシステム

個人用乗換案内（`lambda-function-transit`）のフロントエンドが**実際に従っている**デザイン規則を文書化する。本書は
`kzhrknt/awesome-design-md-jp` の9セクション構成（日本語タイポグラフィ拡張つき）を範とする。

## 前提（Preamble）

- **トークンの正は `frontend/src/index.css` の `:root`。** 本書はその**ミラー（写し）**であり、第二の権威を作らない。
  値が競合した場合は **CSS が正**。`:root` のトークンを変更したら本書も更新すること。新しい色・サイズの語彙を本書側で発明しない。
- **テーマはダーク固定（OS 未追従）。** `prefers-color-scheme` 分岐を持たない。Linear / Raycast 風の最小クローム。
- **フォントはシステムファースト・スタックのみ。** webフォントは一切ロードしておらず、CDN webフォントの追加は禁止
  （理由は §7・§9）。
- **各章の構成。** 各章は「**Current Spec（現状仕様 = 実装事実）**」と「**Gaps & Proposals（ギャップ／改善提案）**」を
  見出しで分離する。日本語タイポグラフィのフル規範（CJKスタック・行間・禁則など）は**改善提案側**に置き、
  現状仕様には実装値のみを記す。本書は「いま何であるか」を追う spec トラックの生きた文書であり、ADR ではない。
- **設計メモ（ADR ではない）。** D1: `frontend/DESIGN.md` を新設し設計面を独立させる。D2: トークンの唯一の真実は
  `index.css` の `:root`。D3: 日本語フォントはシステムファースト・スタックのみ、CDN webフォント禁止（必要時のみ
  同一オリジン自前ホスト）。D4: ダーク固定・OS 未追従。

---

## 1. ビジュアルテーマ（Visual Theme）

### Current Spec

- **ダーク専用**の単一テーマ。`index.html` は `<html lang="ja">`、`<meta name="theme-color" content="#0a0a0a">`、
  `<title>Transit - 六本木一丁目 → つつじヶ丘</title>`。
- **影を使わない border ベースの奥行き**（詳細は §6）。背景4段とボーダー2段で階層を表現する。
- **4px グリッド**（`--space-*`、§5）。**最大幅 600px の単一カラム**を中央寄せした、グランス用（一瞥用）ボード。
- 日本語（駅名・所要時間・`つつじヶ丘`）と Latin 等幅（時刻・ステータスのタイムスタンプ）の**混植**。
- 出典: `frontend/index.html`、`frontend/src/index.css`、ルート `CLAUDE.md` の "Frontend Design"。

### Gaps & Proposals

- ライトテーマ・テーマ切替は意図的に持たない（単一ユーザー・単一ロケール）。将来も追加しない方針を維持する。

---

## 2. カラーパレットと役割（Color Palette & Roles）

### Current Spec

`index.css` の `:root`（L3–20）を逐語転記する。値は CSS が正。

| トークン | 値 | 役割（実使用） |
|---|---|---|
| `--bg-primary` | `#0a0a0a` | ページ地・ヘッダー地（純黒を避けた最暗段） |
| `--bg-secondary` | `#111111` | カード地・タブ active 地・refresh ボタン地・StatusIndicator 地 |
| `--bg-tertiary` | `#171717` | バッジ地・RouteDetail コンテナ地・refresh hover 地 |
| `--bg-elevated` | `#1a1a1a` | 最上段の面（宣言済み・現状未使用に近い予備段） |
| `--border-primary` | `#262626` | 既定のボーダー（カード・タブ・ボタン・区切り線） |
| `--border-secondary` | `#333333` | hover / active 時の一段明るいボーダー・タイムライン縦線・lineName 左罫 |
| `--border-accent` | `#3b82f6` | アクセントボーダー（`--accent-blue` と同値）。**宣言済み・未使用**（active 罫は `--border-secondary`、focus は `--accent-blue` を直接参照） |
| `--text-primary` | `#fafafa` | 本文・主要テキスト |
| `--text-secondary` | `#a1a1a1` | 補助テキスト（タブ非選択・ステータスラベル・ローディング文言） |
| `--text-tertiary` | `#737373` | 装飾・最小ウェイト（矢印・フッター・タイムスタンプ・路線名） |
| `--accent-blue` | `#3b82f6` | 到着時刻・ロゴ・タイムライン dot・active ボーダー・focus リング |
| `--accent-blue-hover` | `#2563eb` | ホバー用アクセント。**宣言済み・未使用** |
| `--accent-green` | `#22c55e` | status OK アイコン（Connected） |
| `--accent-red` | `#ef4444` | エラーテキスト・status error アイコン |
| `--accent-yellow` | `#eab308` | **宣言済みだが未使用**（どのコンポーネントからも参照されていない） |

### Gaps & Proposals

- **`--accent-yellow`（`#eab308`）は未使用。** 用途が無いなら削除、または「遅延・注意」表現として正式に役割付けする。
- **非トークンの error 色。** `App.module.css` の `.error` は `background-color: rgba(239, 68, 68, 0.1)` /
  `border: 1px solid rgba(239, 68, 68, 0.2)` を直書きしている（`239, 68, 68` は `--accent-red`（`#ef4444`）の
  10進表現）。`--accent-red` を基にした tint トークン（例: `--accent-red-tint`）へ寄せ、生 `rgba()` 直書きを解消する。

---

## 3. タイポグラフィ規則（Typography）

最重要章。本リポは日本語と Latin を混植するが、**現状の `--font-sans` は CJK フォント面を含まない**。
この章は現状仕様と、参照リポジトリ中核である日本語タイポグラフィのフル規範（改善提案）を**明確に分離**する。

### 3.0 Current Spec（現状仕様）

- ルート `font-size: 14px`（`html`）、`body { line-height: 1.5 }`。
- フォントスタック（`index.css` L23–24、逐語）:
  - `--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;`
  - `--font-mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;`
- **`Inter` は一切ロードされていない**（`@font-face` も Google Fonts もリンク無し）。`Inter` 不在時は
  `-apple-system` 以降のシステム sans にフォールバックする。
- **`--font-sans` に CJK フォント面が無い**ため、日本語（駅名・`つつじヶ丘`・所要時間表記）は **OS 既定の sans
  に丸投げ**されている。
- **font-size はすべてハードコード（非トークン）**。実値は `10, 11, 12, 13, 14, 16, 18, 20px`
  （10px は status の Circle アイコンサイズ）。ウェイトは `500` と `600` の2種のみ。
- 等幅は時刻列（TransitCard の `.departure`/`.arrival`、`--font-mono`）と StatusIndicator の `.timestamp` に適用。
- 字間 `letter-spacing: -0.02em` は **Latin/数字のみ**に適用（`.title`、`.departure`/`.arrival`）。CJK には掛けていない。
- 縦書きは使用しない。

### 3.1–3.7 Gaps & Proposals（日本語タイポグラフィのフル規範）

> 以下は**未実装の目標仕様**。doc-only のため本タスクでは CSS を変更しない。フォローアップで適用する。

- **3.1 CJK 書体スタック（依存追加なし）。** `--font-sans` の `'Inter'` の後・`sans-serif` の前へシステム日本語書体を
  挿入する: `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', YuGothic, Meiryo`。
  バンドルも CDN ホスティングも不要（OS 同梱書体のみ）。
- **3.2 Latin。** `Inter` を使うならローカル/同一オリジン woff2 をサブセット自前ホスト。未ホストのままなら宣言から外し、
  実フォールバック（system-ui 系）を先頭にする。
- **3.3 フォールバック連鎖。** Latin → CJK → 総称（`sans-serif`）の順で連鎖させ、CJK 面の欠落を埋める。
- **3.4 型階梯。** 現状のハードコード `10–20px` をトークン化（例: `--text-xs … --text-xl`）し、スケール外の px を禁止する。
- **3.5 行間・字間。** CJK 本文は `line-height >= 1.6`（現状 1.5 はやや窮屈）。字間 `-0.02em` は Latin/数字のみに限定し、
  **CJK には字間を掛けない**。
- **3.6 禁則処理。** CJK には `line-break: strict` と `word-break: normal` を適用し、駅名・路線名に `break-all`/`break-word`
  を波及させない（`.rawRoute` の `word-break: break-word` は生フォールバック専用に留める）。
- **3.7 OpenType。** `font-feature-settings: "palt" 1, "kern" 1` は**見出し／リード限定**。本文・数値列には適用しない。
  Latin 時刻列は等幅に加えて `font-variant-numeric: tabular-nums` を付与（本リポは `--font-mono` で近似達成済み）。
- **3.8 縦書き（Vertical Writing）。** **Not applicable**（横組みのみ）。

---

## 4. コンポーネント・スタイリング（Component Stylings）

各値は `*.module.css` と `*.tsx` から逐語転記（出典を併記）。

### Current Spec

#### App（`App.tsx` / `App.module.css`）

- `.header`: `position: sticky; top: 0; z-index: 10`、地 `--bg-primary`、下罫 `1px solid --border-primary`。
- `.headerContent` / `.container`: `max-width: 600px; margin: 0 auto`、padding `--space-4`。
- `.titleGroup`: ロゴ `Train`（size 20, weight bold, 色 `--accent-blue`）+ `.title`（`Transit`、`16px`/`600`、`letter-spacing: -0.02em`）。
- `.tabs`: `display: flex; gap: --space-1; flex: 1; overflow-x: auto`（出発地タブを横スクロール）。
- `.tab`: padding `--space-1 --space-3`、ボーダー `1px solid --border-primary`、`--radius-md`、色 `--text-secondary`、
  `13px`/`500`、`white-space: nowrap`、`transition: all --transition-fast`。
- `.tab:hover`: 地 `--bg-secondary`、色 `--text-primary`。`.tabActive`: 地 `--bg-secondary`、ボーダー `--border-secondary`、色 `--text-primary`。
- `.route`: `activeOrigin` + `ArrowRight`（16, 色 `--text-tertiary`）+ `つつじヶ丘`。`.station` は `14px`/`500`/`--text-primary`。
- `.refreshButton`: `32px × 32px`、地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-md`、`aria-label="Refresh"`。
  `:hover:not(:disabled)` で地 `--bg-tertiary`・ボーダー `--border-secondary`。`:disabled` は `opacity: 0.5; cursor: not-allowed`。
  ローディング中は `Spinner`（16）を回し、通常は `ArrowClockwise`（16）。
- `.loading`: 縦中央寄せ、`Spinner`（24）+ `Loading transit information...`、padding `--space-12`、色 `--text-secondary`、`13px`。
- `.error`: `Failed to load transit information`、padding `--space-4`、地/罫は非トークンの `rgba(239, 68, 68, 0.1)` /
  `rgba(239, 68, 68, 0.2)`、色 `--accent-red`、`13px`（§2 参照）。
- `.footer`: `Data from Jorudan`、padding `--space-4`、中央寄せ、`11px`、色 `--text-tertiary`、上罫 `1px solid --border-primary`。

#### TransitCard（`TransitCard.tsx` / `TransitCard.module.css`）

- `.card`: 地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-lg`、`overflow: hidden`、
  `transition: border-color --transition-fast`。`.card:hover` でボーダー `--border-secondary`。
- `.header`（button）: `gap: --space-4`、padding `--space-4`、`background: none; border: none; font: inherit`、`aria-expanded={expanded}`。
- `.times`: `.departure`/`.arrival` は `18px`/`600`/`--font-mono`/`letter-spacing: -0.02em`。`.arrival` は色 `--accent-blue`。
  区切りの `.arrow`（`→`）は `--text-tertiary`/`14px`。
- `.meta`: `.badge` ×2（`Clock` 12/bold + 所要、`ArrowsDownUp` 12/bold + 乗換回数）。バッジは地 `--bg-tertiary`、`--radius-sm`、`11px`/`500`、色 `--text-secondary`。
- `.expandIcon`: `CaretUp`（展開時）/ `CaretDown`（折りたたみ時）、16、色 `--text-tertiary`。
- `.body`: padding `0 --space-4 --space-4`、`RouteDetail` を内包。
- **先頭カード（`index === 0`）は既定で展開**（`useState(index === 0)`）。

#### RouteDetail（`RouteDetail.tsx` / `RouteDetail.module.css`）

- `.container`: padding `--space-3 --space-4`、地 `--bg-tertiary`、`--radius-sm`。
- 縦タイムライン。`.dotTerminal`（始発・終着）= `8px` 塗り `--accent-blue` dot。`.dotTransfer`（乗換）= `8px`
  中空 dot（`background: transparent; border: 2px solid --accent-blue`）。両者 `margin-top: 4px`。
- `.line`: `width: 2px` のコネクタ、色 `--border-secondary`、最終 stop 以外に描画。
- `.station`（terminal）`13px`/`500`、`.stationIntermediate` `12px`/`500`、ともに `--text-primary`。
- `.lineName`: 路線名、`11px`、色 `--text-tertiary`、左罫 `2px solid --border-secondary`、`padding-left: --space-2`。
- **生 `<pre>` フォールバック**: `parseRoute()` が 0 件のとき `.rawRoute`（`--font-mono`/`11px`/`--text-secondary`/
  `white-space: pre-wrap`/`word-break: break-word`/`line-height: 1.6`）で生文字列をそのまま表示。

#### StatusIndicator（`StatusIndicator.tsx` / `StatusIndicator.module.css`）

- `.container`: 地 `--bg-secondary`、ボーダー `--border-primary`、`--radius-md`、`12px`。
- 状態は**アイコン形 + ラベル + 色**の三重表現（色単独に依存しない）:
  - `ok` → `Circle`（weight fill, 色 `--accent-green`, `10px`）+ ラベル `Connected`。
  - `error` → `Warning`（weight fill, 色 `--accent-red`, `12px`）+ ラベル `Error`。
  - `loading` → `Circle`（色 `--text-tertiary`, `10px`, `pulse` アニメ）+ ラベル `Connecting`。
- `.timestamp`: `lastUpdated` があるとき `Updated HH:MM:SS`（`--font-mono`/`11px`/`--text-tertiary`、§ マイクロコピー参照）。

### Gaps & Proposals

- font-size とアニメ時間が非トークン。型階梯トークン化（§3.4）に合わせて整理する。
- `.error` の生 `rgba()` を tint トークンへ（§2）。

---

## 5. レイアウト原則（Layout Principles）

### Current Spec

- **4px グリッド**。spacing トークン（`index.css` L27–35、逐語）:

  | トークン | 値 |
  |---|---|
  | `--space-1` | `4px` |
  | `--space-2` | `8px` |
  | `--space-3` | `12px` |
  | `--space-4` | `16px` |
  | `--space-5` | `20px` |
  | `--space-6` | `24px` |
  | `--space-8` | `32px` |
  | `--space-10` | `40px` |
  | `--space-12` | `48px` |

  **`--space-7` / `--space-9` / `--space-11` は欠番**（飛び番）。
- **radius**: `--radius-sm: 4px` / `--radius-md: 6px` / `--radius-lg: 8px`。
- **transition**: `--transition-fast: 100ms ease` / `--transition-normal: 150ms ease`（実 CSS では `--transition-fast`
  のみ参照、`--transition-normal` は宣言済み）。
- **配置**: `max-width: 600px` の単一カラムを `margin: 0 auto` で中央寄せ。`.content`・`.cards` の縦 gap は `--space-3`。
  モバイルファースト。

### Gaps & Proposals

- 欠番（`--space-7/9/11`）は意図的か未定義かを明記し、使うならトークンを足す。スケール外 px の直書きは禁止（§7）。

---

## 6. 奥行きと立体感（Depth & Elevation）

### Current Spec

- **影（box-shadow）を一切使わない。** 参照テンプレートの shadow 立体モデルからの**意図的な乖離**。
- 奥行きは**背景4段**（`--bg-primary` → `--bg-secondary` → `--bg-tertiary` → `--bg-elevated`）と
  **ボーダー2段**（`--border-primary` → `--border-secondary`）で表現する。
- hover はボーダーを一段明るく（`--border-primary` → `--border-secondary`）。
- **focus-visible**: `outline: 2px solid var(--accent-blue); outline-offset: 2px`（全要素共通、`index.css` L87–94）。

### Gaps & Proposals

- 影なし方針は維持。将来 elevation を増やす場合も影ではなく `--bg-elevated` + ボーダー差で表現する。

---

## 7. Do's & Don'ts

### Do's

- 色・余白・角丸は**トークン名**で参照する（`var(--bg-secondary)` 等）。値を直書きしない。
- 余白は **4px グリッド**（`--space-*`）に乗せる。
- 時刻・数値列は**等幅**（`--font-mono`）+（提案）`tabular-nums` で桁を揃える。
- hover の強調は**ボーダーのみ**で表現する。
- focus は共通の `:focus-visible`（2px `--accent-blue`）を維持する。
- 状態は色だけでなく**アイコン形 + ラベル**でも表す（StatusIndicator）。

### Don'ts

- **影（box-shadow）を足さない**（§6）。
- **スケール外の px を新規追加しない**（型階梯・spacing トークンの外）。
- **生 `rgba()` / hex を直書きしない**（`.error` の `rgba(239, 68, 68, …)` は既存の負債）。
- **CJK に字間（letter-spacing）や `break-all`/`break-word` を適用しない**（駅名・路線名が壊れる）。
- **CDN webフォントを追加しない**（§9 のセキュリティ規約）。
- ライトテーマ / `prefers-color-scheme` 分岐を足さない（ダーク固定）。

---

## 8. レスポンシブ挙動（Responsive Behavior）

### Current Spec

- **ブレークポイントは単一**: `@media (max-width: 480px)`（`TransitCard.module.css` のみ）。
  - `.header` が `flex-wrap: wrap` + `gap: --space-3` になり、`.times` が `flex-basis: 100%; order: 1`（時刻を上段へ）、
    `.meta` が `order: 2`、`.expandIcon` が `order: 3`。
  - `.departure`/`.arrival` が `18px` → `20px` に拡大。
- 他のコンポーネントは**流動レイアウト**（固定ブレークポイント無し）。タブは `overflow-x: auto` で横スクロール。

### Gaps & Proposals

- **タッチターゲット 44×44 の指針に未達**: refresh ボタンは `32px × 32px`、タブは高さ約 24px。モバイル操作性のため
  44×44 への拡大を検討。
- ブレークポイントが `TransitCard` ローカルに閉じており不統一。共通ブレークポイントの定義を検討。

---

## 9. エージェント・プロンプトガイド（Agent Prompt Guide）

後続のコード生成エージェントへの指示。

### 守るべき規約（Current Spec の固定点）

- **トークンの唯一の真実は `frontend/src/index.css` の `:root`。** 新しい色・サイズは必ずトークン化してから使う。
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
- 内部ホスト名・AWS ARN・シークレット名・Jorudan `jrd_uuid` ハンドシェイク詳細を本書に書かない。内部詳細は
  `docs/architecture.md` を参照。

### 技術的負債（Tech Debt）

1. `--font-sans` に CJK 面が無く、`Inter` も未ロード（日本語が OS 既定 sans に丸投げ）。
2. font-size がすべて非トークン（ハードコード `10–20px`）。
3. `.error` の背景/罫が非トークンの生 `rgba(239, 68, 68, …)`。
4. 宣言済み・未使用のトークン: `--accent-yellow`（`#eab308`）/ `--border-accent`（`#3b82f6`）/ `--accent-blue-hover`（`#2563eb`）/ `--bg-elevated`（`#1a1a1a`）/ `--transition-normal`（`150ms ease`）。
5. レスポンシブのブレークポイントが `TransitCard` ローカルに閉じ不統一。
6. タッチターゲットが 44×44 指針に未達（refresh 32×32・タブ約 24px 高）。
7. `prefers-reduced-motion` 未ガード（`spin` / `pulse` アニメ）。空状態が未処理（§ 検証）。

---

## 検証アーティファクト（Verification Artifacts）

執筆時に一度だけ逐語確認した3点。トークン値の正は常に `index.css`。

### A. トークン表（Token Table）

§2（色）・§5（spacing / radius / transition）の表が `index.css` `:root`（L3–44）のミラー。
Phosphor アイコン: `Train`(20,bold) / `ArrowRight`(16) / `ArrowClockwise`(16) / `Spinner`(16・24) /
`Clock`(12,bold) / `ArrowsDownUp`(12,bold) / `CaretUp`・`CaretDown`(16) / `Circle`(status, 10px) /
`Warning`(status, 12px)。アニメ: `spin` 1s linear infinite / `pulse` 1.5s ease-in-out infinite。

### B. 主要 UI 状態（Key UI States）— 実在する14状態

コードから抽出した実 UI 状態。**この14状態以外を発明しない**（スケルトン・カード別エラー等は存在しない）。

| # | 状態 | 根拠 |
|---|---|---|
| 1 | 初回ローディング（`Spinner` 24 + `Loading transit information...`） | `App.tsx` `!error && activeRoutes.length === 0 && loading` |
| 2 | エラーバナー（固定 `Failed to load transit information`、hook の error 文字列は非表示） | `App.tsx` `error &&` / `.error` |
| 3 | リフレッシュ中（refresh ボタン内 `Spinner` 16・既存カードは残る） | `App.tsx` `refreshButton disabled={loading}` |
| 4 | **空状態（`routes=[]`・`loading=false`・`error=null` で何も描画されない＝未処理ギャップ）** | `App.tsx` の3分岐がいずれも false |
| 5 | 先頭カード既定展開（`index === 0`） | `TransitCard.tsx` `useState(index === 0)` |
| 6 | カード展開／折りたたみ | `TransitCard.tsx` `expanded` トグル |
| 7 | タブ active | `App.module.css` `.tabActive` |
| 8 | タブ inactive | `.tab` 既定 |
| 9 | status: ok（`Connected`・緑 `Circle`） | `StatusIndicator.tsx` `status === 'ok'` |
| 10 | status: error（`Error`・赤 `Warning`） | `status === 'error'` |
| 11 | status: loading（`Connecting`・pulse する `Circle`） | `status === 'loading'` |
| 12 | RouteDetail タイムライン（始発終着 = 塗り dot / 乗換 = 中空 dot） | `RouteDetail.tsx` `isTerminal` |
| 13 | RouteDetail 生 `<pre>` フォールバック | `parseRoute()` が 0 件のとき `.rawRoute` |
| 14 | 不正サマリ（`--:--` / `--` 表示） | `parseSummary()` の既定値 |

横断挙動（独立した状態ではない）: 長い日本語名の折返し / タブ多数時の横スクロール（`overflow-x: auto`）/
`@media (max-width: 480px)` リフロー。

**既知ギャップ**: 状態 #4 の空状態は沈黙の空白になる（空状態 UI 未実装）。デザイン状態として偽装せず、ギャップとして記録する。

### C. マイクロコピー一覧（Microcopy）— 逐語

UI 文言は**英語のまま**。翻訳しない。日本語は `つつじヶ丘` と `ja-JP` 時刻フォーマットのみ。

| 文言 | 場所 |
|---|---|
| `Transit` | ヘッダータイトル |
| `Refresh` | refresh ボタン `aria-label` |
| `Loading transit information...` | 初回ローディング |
| `Failed to load transit information` | エラーバナー |
| `Connected` / `Error` / `Connecting` | StatusIndicator ラベル |
| `Updated HH:MM:SS` | StatusIndicator タイムスタンプ（`ja-JP`・`2-digit` 時分秒） |
| `Data from Jorudan` | フッター |
| `つつじヶ丘` | 固定の到着駅（唯一の常時表示日本語ラベル） |

> ブラウザタブの `<title>` のみ日本語を含む: `Transit - 六本木一丁目 → つつじヶ丘`（`index.html`）。
