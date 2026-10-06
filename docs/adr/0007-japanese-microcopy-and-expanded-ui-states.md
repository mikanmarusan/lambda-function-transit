---
status: Accepted
applyTo: frontend/index.html, frontend/DESIGN.md, frontend/src/App.tsx, frontend/src/hooks/useTransit.ts, frontend/src/components/**
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0007. Japanese UI microcopy and expanded UI states

## Status
Accepted

## Context
ADR 0006 makes the board answer "which station should I walk to?" across the
three origins, with a per-origin `status: ok | no_candidates | error` and a
top-level `fastestOrigin`. Two policies in `frontend/DESIGN.md` block the UI that
answer needs:

- **English-only copy.** DESIGN.md section C (Microcopy) states that UI copy
  stays English and is never translated; the only Japanese is `つつじヶ丘` and the
  `ja-JP` time format. Today's strings are English: `Failed to load transit
  information`, `Loading transit information...`, `No departures found`,
  `Updated HH:MM:SS`, `Connected` / `Error` / `Connecting`, `Refresh`
  (`frontend/src/App.tsx`, `frontend/src/components/StatusIndicator.tsx`). Every
  station name the rider reads is Japanese, so the board mixes two languages in
  one glance.
- **A closed set of 14 states.** DESIGN.md section B (Key UI States) lists 14
  states extracted from code and says not to invent states beyond them. The
  current code cannot express what ADR 0006 returns:
  - `lastUpdated` (`frontend/src/hooks/useTransit.ts`) is shown only as an
    `Updated HH:MM:SS` timestamp; nothing marks the data as stale or prompts a
    refresh.
  - On a fetch error the hook keeps the previous `originRoutes`, yet
    `frontend/src/App.tsx` renders the cards only under `!error`, so a failed
    refresh hides the last good data behind the error banner.
  - The empty state (`No departures found`) carries no action.
  - `src/index.mjs` drops an origin whose search fails or yields no valid
    route (`Promise.allSettled`, then a filter on `fulfilled`), so its tab
    silently disappears; the frontend has no way to show a failed or
    uncatchable origin.
  - Origin tabs exist (DESIGN.md states 7 and 8), but the active tab is
    `selectedOrigin ?? origins[0]`: the first origin in response order, not
    the fastest one, and a manual pick is never released.
- **Static title.** `frontend/index.html` sets a fixed
  `<title>Transit - 六本木一丁目 → つつじヶ丘</title>`, naming one origin no matter
  which origin is active or fastest.

## Decision

- **D-1 — UI microcopy becomes Japanese.** This reverses the DESIGN.md
  "UI copy stays English, never translated" policy. Status text, actions,
  and empty and error messages are written in Japanese (for example
  「30秒前に更新」, 「間に合いません」, 「再試行」). Station names and the `ja-JP` time
  format are unchanged.

- **D-2 — The UI state set is opened to the states the multi-origin board
  needs.** This reverses the DESIGN.md rule "do not invent states beyond the
  14". The following states become allowed in addition to the existing 14:
  - **Data freshness**: when the data on screen is 180 s old or older, the
    board shows a stale state with an 「更新」 action.
  - **Per-origin outcome**: an origin whose search failed shows 「取得できず」 and
    an origin with no catchable candidate shows 「便なし」, mapping ADR 0006's
    per-origin `error` and `no_candidates`, instead of being hidden.
  - **Actionable empty state**: the empty state carries an 「更新」 action.
  - **Error banner that keeps last-known data**: a failed refresh shows the
    error banner while the last-known data stays on screen, instead of the
    banner replacing it.
  - **Station selection**: the existing origin tabs become segmented tabs
    with auto-select of the fastest origin (`fastestOrigin`, ADR 0006 D-2); a
    manual pick holds until the next successful fetch.

- **D-3 — `document.title` becomes dynamic.** The page sets `document.title` to
  `{origin} → つつじヶ丘 · HH:MM発` from the fetched data. This replaces the static
  `<title>` in `frontend/index.html` as the visible title. Which candidate
  supplies `HH:MM` is left to the implementing issue.

This ADR records the decision only; `frontend/DESIGN.md` and
`docs/architecture.md` are updated by the issues that implement it.

## Consequences
- Positive: the board reads in one language, matching the Japanese station
  names the rider scans for.
- Positive: the rider can tell fresh data from old data, a failed origin from
  an empty one, and keeps the last good timetable during a failed refresh,
  which is when they most need it.
- Positive: after each successful fetch the active tab is the fastest origin,
  so the answer is visible without a tap, and the browser tab title names an
  origin and departure time instead of a fixed string.
- Negative: DESIGN.md's closed state list stops being a hard boundary; each new
  state adds rendering branches and test cases, and future states need their
  own justification instead of a blanket "no".
- Negative: every existing English string and the tests that assert it
  (unit and Playwright) change together, and DESIGN.md sections B and C must
  be re-listed with the new states and Japanese strings; until the
  implementing issues land, DESIGN.md describes the old policy that this ADR
  reverses.
- Negative: releasing a manual pick on each successful fetch means the active
  tab can move away from the origin the rider was looking at.
- Negative: a dynamic `document.title` adds a side effect outside the React
  tree that has to be kept in sync with the active origin and data, and the
  static `index.html` title still shows before the first fetch completes.

### Rejected alternatives
- **Keep English UI copy** — rejected. The strings in
  `frontend/src/App.tsx` and `frontend/src/components/StatusIndicator.tsx`
  would stay English next to Japanese station names, and Japanese phrases such
  as 「間に合いません」 or 「便なし」 have no short English equivalent that reads at a
  glance on this board.
- **Keep the 14-state set and hide uncatchable or failed origins silently** —
  rejected. With ADR 0006 returning `no_candidates` and `error` per origin,
  silently dropping those origins makes a station disappear from the tabs
  without explanation, so the rider cannot tell "no train you can catch" from
  "the search failed", and the existing error branch in `frontend/src/App.tsx`
  would keep hiding the last good data on every failed refresh.
