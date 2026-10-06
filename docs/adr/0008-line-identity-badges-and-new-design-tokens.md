---
status: Accepted
applyTo: src/index.mjs, frontend/DESIGN.md, frontend/src/index.css, frontend/src/design-tokens.css, frontend/src/types/transit.ts, frontend/src/components/**, frontend/tests/design-tokens.test.ts
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0008. Line identity badges and new design tokens

## Status
Accepted

## Context
The rider identifies a train by its line (南北線, 京王線, ...) as fast as by its
time, and Japanese rail lines carry well-known letter codes and colors. Today
the board shows none of that:

- The backend returns each route as a text block, and the frontend recovers
  line names by parsing it (`parseRoute` in `frontend/src/types/transit.ts`
  reads the `｜` lines). No field in today's response identifies a line in a
  machine-readable way.
- ADR 0006 D-2 already decided that the structured API carries "a `lineCode`
  per leg", but it did not fix the set of codes, what an unmapped line gets,
  or how the frontend turns a code into a color.
- Jorudan's line strings are decorated with an operator prefix, a direction
  and a distance (`東京メトロ南北線(浦和美園行)   3.1km`, `京王井の頭線(吉祥寺行)` in
  `tests/handler.test.mjs`), so a loose substring match on a short name such
  as 京王 would also catch lines outside the set.
- `frontend/src/components/RouteDetail.tsx` renders the line name as plain
  text (`styles.lineName`); there is no line color or letter code anywhere in
  the UI.
- `frontend/DESIGN.md` frontmatter declares no line color, no amber accent, and
  a type scale that ends at `2xl` (20px), which is small for the departure time
  the rider scans for first.

Any new color or size has to pass the token pipeline set by ADR 0003 and the
contrast tier set by ADR 0004. The gates in `frontend/tests/design-tokens.test.ts`
that a new token must survive are:

- no raw `rgba()`/hex color in any stylesheet outside the generated file and
  `:root` blocks;
- custom properties declared only at `:root`, never under a scoped selector;
- no orphaned role token (every declared token has a `var()` call site);
- the generated `src/design-tokens.css` matches a fresh export byte for byte;
- `design.md lint` reports zero errors and zero warnings;
- the deleted tokens (`--accent-yellow` among them) stay absent from every
  layer; the frontmatter check is a substring match on `accent-yellow`.

The card fill is `--bg-elevated` (`#1a1a1a`, `TransitCard.module.css`), so
the line colors, which paint on cards, are measured against that ground.

No official hex values were found for the lines this board serves. The values
in common use come from the line-color modules that Wikipedia's rail articles
reuse.

## Decision

- **D-1 — The backend emits `lineCode` from a closed set.** This refines
  ADR 0006 D-2: each leg of the structured response carries a `lineCode` from
  this closed set, and `null` for any line not in it. The legacy `routes`
  string tuples carry no `lineCode`.

  | lineCode | Line |
  | --- | --- |
  | `N` | 南北線 |
  | `M` | 丸ノ内線 |
  | `H` | 日比谷線 |
  | `Z` | 半蔵門線 |
  | `E` | 都営大江戸線 |
  | `S` | 都営新宿線 |
  | `KO` | 京王線 / 京王新線 |

  The backend normalizes the Jorudan line string before matching (drops the
  operator prefix, the direction in parentheses and the distance) and
  compares the result exactly against the names above, so a line outside the
  set, such as 京王井の頭線, maps to `null` rather than to `KO`.

  The frontend maps `lineCode` to a DESIGN.md `line-*` token through an
  allow-listed class (one CSS-Modules class per code). Response data never
  becomes a CSS value: an unknown or `null` code gets no line class, and no
  string from the response is written into `style` or into a custom property.
  A leg with a `null` code shows the line name only, with no badge circle.

- **D-2 — The badge does not rely on color alone.** A line badge is a white
  circle with a ring in the line color and the letter code in dark text,
  followed by the line name. Code and name carry the identity; the ring color
  is supplementary (WCAG 1.4.1, Use of Color).

- **D-3 — Contrast contracts enforced in Vitest.** Following ADR 0004 D-2, each
  contract is a test in `frontend/tests/design-tokens.test.ts`:
  - every `line-*` color **>= 3:1** against the card fill `--bg-elevated`
    (WCAG 1.4.11, Non-text Contrast). Where a line's brand hex falls below 3:1
    on that fill (都営大江戸線 is the expected case), the token takes an on-dark
    variant of the brand color instead of the brand hex;
  - amber text **>= 4.5:1** (WCAG 1.4.3, Contrast Minimum) against the
    surface it paints on; on the translucent `accent-amber-tint` the ground is
    the tint composited over its backdrop, as the existing error-banner test
    does for `accent-red-tint`.

- **D-4 — New tokens.** The DESIGN.md frontmatter gains:
  - `accent-amber`, `accent-amber-tint`, and `accent-amber-tint-border`, named
    after the existing `accent-red` / `accent-red-tint` /
    `accent-red-tint-border` triple. The name `accent-yellow` is not reused,
    because `design-tokens.test.ts` bans it from every layer of the pipeline;
  - the `line-*` colors of D-1;
  - a `3xl` rung on the typography scale for large departure times, exposed
    through a `--font-size-3xl` alias like the existing rungs; its size is
    chosen by the implementing issue. Because the exporter emits per-level
    weight and tracking tokens that call sites do not use, the implementing
    change also adds `--font-weight-3xl` (and `--tracking-3xl` if the rung
    sets a letter spacing) to `UNREFERENCED_GENERATED`, and `--font-size-3xl`
    to `FONT_SIZE_ALIASES`, in `design-tokens.test.ts`.

- **D-5 — Hex provenance.** The `line-*` hex values are taken from the
  line-color modules widely reused across Wikipedia rail articles, because no
  official operator hex values were found. DESIGN.md records this provenance
  next to the tokens, and each on-dark variant from D-3 names the brand hex it
  replaces.

This ADR records the decision only; `frontend/DESIGN.md`, the token files, the
components, the backend, and `docs/architecture.md` are changed by the issues
that implement it.

## Consequences
- Positive: the rider recognizes a line by code, name, and color, and the
  identity still reads for a color-blind rider or under glare, because the
  code and name carry it.
- Positive: every new color and size enters through the DESIGN.md frontmatter
  and the existing gates, so the raw-hex ban, the `:root`-only rule, the
  orphan check, the export drift gate, and `design.md lint` keep covering them.
  The only new allowlist entries are the generated `3xl` weight and tracking
  tokens named in D-4, which follow the pattern the existing rungs already use.
- Positive: because only allow-listed codes reach a class name, a malformed or
  hostile line string from Jorudan cannot inject CSS.
- Negative: the line set is closed. A new line on the route shows only its
  name, with no badge, until the backend map, the frontmatter, the class
  allow-list, and the contrast tests are extended together.
- Negative: hex values come from a community source, not from the operators,
  and an on-dark variant deliberately departs from the brand color, so a badge
  can look slightly off-brand next to station signage.
- Negative: the orphan gate means each `line-*` and amber token must ship with
  its call site in the same change; tokens cannot land ahead of the UI that
  uses them.
- Negative: the closed code set and its normalization rule become part of the
  API contract that ADR 0006 opened, so the frontend types and the backend
  tests must track every change to the set.

### Rejected alternatives
- **A TypeScript hex map applied with inline styles** — rejected. It puts hex
  literals in `.ts`/`.tsx` files, which the raw-hex gate in
  `design-tokens.test.ts` never scans, and it bypasses the DESIGN.md token
  pipeline of ADR 0003, so `design.md lint` and the export drift gate would not
  see the line colors at all.
- **A per-element `--line-color` custom property** — rejected. Declaring it
  under each line class in a module stylesheet breaks the gate that allows
  custom properties only at `:root`, and setting it from the response through
  an inline `style` turns response data into a CSS value, which D-1 forbids.
- **Reusing the name `accent-yellow` for the amber accent** — rejected. The
  name is on the deleted-token list in `design-tokens.test.ts`, whose
  frontmatter check fails on any token containing it.
