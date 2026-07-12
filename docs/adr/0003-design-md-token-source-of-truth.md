---
status: Accepted
applyTo: frontend/**
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0003. DESIGN.md frontmatter as the design-token source of truth

## Status
Accepted

## Context
DESIGN.md D2 (recorded as a design memo in `frontend/DESIGN.md`, not a formal
ADR) declared the single source of truth for design tokens to be the `:root`
block of `frontend/src/index.css`, with `DESIGN.md` acting only as a mirror.
That leaves two hand-maintained copies of every color/size/spacing value that
drift silently — a value can be changed in `index.css` and forgotten in the
prose, with no mechanical check to catch the divergence.

`@google/design.md` (npm `@google/design.md@0.3.0`, Google Labs) turns a
Markdown file's YAML frontmatter into a lintable, exportable token spec: it can
`lint` (WCAG contrast, canonical section order, broken token refs) and `export`
tokens to CSS. Making `DESIGN.md` frontmatter the token source lets CI enforce
"the design follows DESIGN.md" instead of trusting humans to keep a mirror.

Live verification surfaced hard constraints that shape the decision:
- `export` has **no generic `:root` output**. It emits either a Tailwind v4
  `@theme { … }` block (fixed namespaces `--color-*`/`--text-*`/`--spacing-*`/
  `--radius-*`) or DTCG JSON. This project does **not** adopt Tailwind, so a raw
  browser ignores `@theme` and never registers the custom properties inside it.
- Some tokens are **not expressible** via export at all: `lineHeight`,
  `fontFeature`/`fontVariation` (dropped; design values, not current `:root`
  custom properties), the shared `--font-mono`, the multi-family `--font-sans`
  fallback chain (family is emitted as a single-quoted string, not a list), and
  `--transition-*` (no such category).
- The tool is **alpha** (`version: alpha`; the README states the format will
  change), ships no `engines`/`license` in npm metadata, and unpinned `npx`
  would resolve the latest alpha at run time.

`docs/adr/INDEX.md` next free id is `0003` (0001 Accepted, 0002 Proposed). This
ADR inverts D2 and is the wave-1 prerequisite for the dependent implementation
issues, which carry `prerequisite-adr: 0003`; merging this ADR PR promotes it to
Accepted and unblocks them.

## Decision

- **D-A — Invert the token source to DESIGN.md frontmatter.** `frontend/src/index.css`
  token blocks become generated artifacts derived from `DESIGN.md`, superseding
  D2. The inversion is **complete only for export-modelable tokens**; the
  residue that `@google/design.md` cannot express (`--font-mono`, the
  multi-family `--font-sans` fallback chain, `--transition-*`, and design values
  such as `line-height`/`fontFeature` that are not `:root` tokens today)
  stays hand-authored in an explicitly demarcated region of `index.css` and is
  out of scope for the export drift gate. `index.css` is partitioned by comment
  into "GENERATED import", "hand-authored residue", and "reset/focus/scrollbar",
  and DESIGN.md carries a generated-vs-hand-authored token table so the boundary
  cannot silently re-drift. The claim is precisely "the source of truth for
  export-modelable tokens is DESIGN.md", not "single source of truth".

- **D-B — Export mechanism: `css-tailwind` + `@theme`→`:root` rewrite + flat
  alias layer.** Run `design.md export --format css-tailwind`, rewrite the
  emitted `@theme {` to `:root {` (verified to yield browser-valid custom
  properties) into a committed `src/design-tokens.css` carrying a DO NOT EDIT
  header, `@import` it from `index.css`, and keep a flat alias layer
  (`--bg-primary: var(--color-bg-primary)`, `--space-N: var(--spacing-N)`,
  `--text-xs…2xl: var(--text-<level>)`; `--radius-*` maps 1:1 so needs no alias)
  so the ~80–109 `var(--…)` references in existing `*.module.css` change zero.

- **D-C — Pin `@google/design.md@0.3.0` as an exact devDependency.** Install it
  locally and run the local bin (`npm run lint:design`, `npm run export:design`).
  Unpinned `npx` (latest-resolution = alpha drift at run time) is prohibited; the
  committed lockfile plus `npm ci` reproduce the toolchain.

- **D-D — CI lint is blocking, scoped to stable signals.** `lint:design` runs in
  the credential-free `test-frontend` job (never in `deploy-production.yml`).
  By default only `broken-ref` (error) exits non-zero; WCAG contrast and
  section-order are warnings (exit 0). Blocking on contrast additionally requires
  a `--format json` + gate and depends on the D-E fix landing first. An export
  drift gate (`export:design` then `git diff --exit-code src/design-tokens.css`,
  path not prefixed with `frontend/` because the job's `working-directory` is
  already `frontend`) makes "DESIGN.md is the source" verifiable.

- **D-E — Raise `--text-tertiary` to meet WCAG AA.** `#737373` fails AA on
  `bg-primary` (4.18:1, and 3.98/3.78 on secondary/tertiary). This ADR introduces
  a new AA contrast requirement for tertiary text: it moves to ~`#8a8a8a`
  (≈5.7:1 on bg-primary, clearing 4.5:1 on all three backgrounds), accepting a
  slightly brighter tertiary text as the trade-off.

## Consequences
- Positive: CI mechanically enforces that export-modelable tokens track
  DESIGN.md (lint + drift gate), the mirror-drift risk of D2 is eliminated for
  those tokens, the `var()` references across `*.module.css` are untouched by the
  alias layer, and `--text-tertiary` reaches AA.
- Negative — partial source of truth: the hand-authored residue
  (`--font-mono`, the multi-family `--font-sans` chain, `--transition-*`, and
  design values like `line-height`/`fontFeature`) is outside the drift gate, so
  the DESIGN.md↔index.css
  responsibility boundary must be documented and reviewed or it re-drifts. This
  is why "single source of truth" is deliberately not claimed.
- Negative — alpha / supply-chain exposure: `@google/design.md@0.3.0` is alpha
  with a format the README says will change; a token generator now sits in the
  build/CI path. Exact pinning + lockfile + `npm ci` + `npm audit --audit-level=high`
  + local-bin execution (no unpinned `npx`) contain it, and every format change
  surfaces as a reviewable PR via the drift gate.
- License note: this repository is MIT (see `LICENSE`); `@google/design.md` is
  reported as Apache-2.0 upstream but ships no `license` field in its npm
  metadata, so the license is confirmed out-of-band rather than from the package
  manifest — a devDependency (build-time only), not shipped in the frontend
  bundle.

### Rejected alternatives
- **Rename every `var()` to the export namespace (`--color-*` etc.)** — drops
  the alias layer, but rewrites ~80–109 references across 5 files, cannot express
  `--font-mono`/`--transition-*`, and degrades the semantic token names into
  Tailwind-shaped ones. Rejected.
- **DTCG JSON + a bespoke generator** — could model `line-height` from a single
  source, but is overkill for this small CSS surface and adds a generator to
  maintain. Rejected now, retained as a future option if single-sourcing
  line-height becomes necessary.
- **Adopt Tailwind so `@theme` works natively** — makes the export output valid
  without the `@theme`→`:root` rewrite, but pulls a whole utility-CSS framework
  into a project that does not otherwise want it. Overkill; rejected.
