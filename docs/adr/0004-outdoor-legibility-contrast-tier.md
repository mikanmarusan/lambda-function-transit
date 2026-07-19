---
status: Accepted
applyTo: frontend/**
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0004. Outdoor-legibility contrast tier

## Status
Accepted

## Context
This board is read on a phone, outdoors, on the way home from work, in a few
seconds. The dominant viewing environment is ambient glare, not a dark room.
Yet the current UI carries state and outline separation with luminance steps
that are imperceptible under that glare:

- Selected tab `#111111` vs page `#0a0a0a` = **1.05:1**.
- Card border `#262626` vs page `#0a0a0a` = **1.31:1**.

Both were measured today (source: `.plans/planning-outdoor-legibility-20260714.md`).
Neither survives outdoor light, so "which tab is selected" and "where does this
card end" stop being answerable at a glance — the exact questions the board
exists to answer in a few seconds.

There is no numeric contract anywhere in the code or design that pins these
separations, so any future color edit can silently reintroduce a
sub-perceptible step. The forces are: (a) identifiability under ambient glare,
(b) the standards that back each separation (and, crucially, the ones that do
*not*), and (c) an upper bound on card-ground elevation set by an unrelated AA
requirement on the arrival-time text color.

This is the prerequisite decision for three implementation issues that cite it
as `prerequisite-adr: 0004`. `docs/adr/INDEX.md` next free id is `0004` (0001,
0002, 0003 all Accepted). Following the ADR 0003 precedent, this ADR is written
`status: Accepted`; the human PR merge is the accept act that lands it on
`main`. Writing `Proposed` would block issues #2-#4 forever, because their
`prerequisite-adr: 0004` guard requires the INDEX row to read `Accepted` on
`main`.

## Decision

- **D-1 — Optimize for the outdoor viewing context.** The board is read on a
  phone, outdoors, on the way home from work, in a few seconds. Identifiability
  under ambient glare outranks subtlety in a dark room. All future color
  decisions follow from this premise.

- **D-2 — Carry state and outline with luminance separation, pinned by test
  contracts.** Each separation is held to a numeric contrast contract enforced
  by a test, and each contract is labeled with its provenance so the next reader
  is never misled about which standard backs it:
  - Selected vs unselected state **>= 3:1** — WCAG 1.4.11 (Non-text Contrast),
    which explicitly covers "whether a component is selected".
  - Text **>= 4.5:1** — WCAG 1.4.3 (Contrast Minimum).
  - Card border vs page **>= 2:1** — **a house threshold, NOT a WCAG one.**
    WCAG 1.4.11 explicitly does *not* require a boundary on a container ("a
    border or other indication of the overall boundary of the hit area is not
    required"), and no 2:1 threshold exists anywhere in WCAG. Its provenance is
    parity with Material 3's `outlineVariant`, which sits at 1.99:1 against its
    dark surface. This 2:1 value MUST be stated as a house threshold in this ADR
    and in the guarding test's comment, and MUST NEVER be labeled WCAG.

- **D-3 — Derive "next departure" from data, never from card position.**
  `src/index.mjs:403-404` slices Jorudan's candidate blocks
  (`routeBlocks.slice(0, MAX_CANDIDATES)`) with **no sort**, and Jorudan orders
  its results by route quality, not by departure time — so a later-departing
  express routinely outranks an earlier local. Card index 0 therefore does
  **not** mean "soonest". Any "next departure" affordance must be computed from
  the departure-time data, never inferred from the card's position in the list.

- **D-4 — Cap the card ground at `--bg-elevated` (`#1a1a1a`).** Raising the card
  ground any further drops the arrival time (`--accent-blue` `#3b82f6`) below
  WCAG AA: it measures 4.73:1 on `#1a1a1a`, 4.53:1 on `#1e1e1e`, and 4.38:1 on
  `#212121` (**fails 4.5:1**). `#1a1a1a` is the ceiling; the mock's `#212121` is
  not adopted.

## Consequences
- Positive: state selection, card outline, and the arrival-time text each carry
  a numeric contrast contract that a test can enforce, so no future color edit
  can silently reintroduce a sub-perceptible separation. The card-ground ceiling
  (D-4) makes the AA constraint on the blue arrival time mechanically visible
  instead of implicit.
- Positive: labeling the 2:1 card-border threshold as a house value (D-2)
  prevents the next reader from mistaking it for a WCAG requirement and either
  over-trusting it or "correcting" it to a WCAG number that does not exist.
- Negative — honest limits of surface elevation outdoors: at a ~20% ambient veil
  (10,000-20,000 lux on a ~4.5%-reflectance phone), surface-fill elevation
  collapses to ~1.03:1, and even the blue marker (`--accent-blue`) compresses to
  ~1.92:1. Only the inverted white chip survives, at ~4.60:1 (these veil figures
  are illustrative of a ~20% additive-veil model, not reproducible contract
  numbers like the D-2/D-4 ratios). Outdoors, cards are
  found by whitespace, type size, and the marker — the border is a supporting
  device, not the carrier. The contracts in D-2 make the indoor separations
  perceptible and drift-proof, but they cannot make a dark-surface elevation step
  legible under full glare; that is a physical limit, not a tunable one.
- Negative — the 2:1 card-border threshold is a house convention with no external
  standard behind it, so it must be re-justified (not merely cited) if Material 3
  changes `outlineVariant` or the design moves off a dark surface.

### Rejected alternatives
- **Label the 2:1 card-border threshold as WCAG** — would give the contract the
  appearance of external backing, but no 2:1 threshold exists in WCAG and 1.4.11
  explicitly exempts container boundaries. Dishonest; rejected. It is recorded as
  a house threshold instead.
- **Raise the card ground past `#1a1a1a` (e.g. `#212121`) for a stronger
  elevation step** — improves perceived depth indoors but drops `--accent-blue`
  arrival text to 4.38:1, below WCAG AA. Rejected; the ground is capped at
  `#1a1a1a`.
- **Rely on surface-fill elevation to find cards outdoors** — the honest-limits
  analysis shows surface steps collapse to ~1.03:1 under a 20% veil. Rejected as
  the primary carrier; elevation stays an indoor-only supporting device, with
  whitespace, type size, and the marker doing the outdoor work.
