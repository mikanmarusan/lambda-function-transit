---
status: Accepted
applyTo: src/index.mjs, frontend/src/App.tsx, frontend/src/hooks/useTransit.ts, frontend/src/types/transit.ts, frontend/src/components/**
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0006. Server-side catchable search and structured transit API

## Status
Accepted

## Context
The goal this decision serves is a board that answers "which station should I
walk to, and which train will get me home first?" for the three origins in
`JORUDAN_ORIGINS` (六本木一丁目, 神谷町, 麻布十番). The current implementation
cannot answer that question correctly:

- `src/index.mjs` builds one fixed `nori.cgi` URL per origin in
  `JORUDAN_ORIGINS` and carries no time parameter, so Jorudan searches from
  "now". A train that departs "now" from a station that is several minutes'
  walk away is not catchable, yet it is returned as a candidate.
- The handler keeps `routeBlocks.slice(0, MAX_CANDIDATES)` (`MAX_CANDIDATES =
  2`) in Jorudan's own order and returns `routes[].transfers` as
  `[summary, route]` string tuples. Every structured value (departure, arrival,
  duration, transfer count, stops) is recovered on the client by regex
  (`parseSummary` / `parseRoute` in `frontend/src/types/transit.ts`).
- `frontend/src/App.tsx` `deriveNextIndex` marks the card with the earliest
  departure time within the active origin tab only (ADR 0004 D-3 forbids
  inferring it from card position). It never compares origins, and earliest
  departure is not earliest arrival.

Cross-station "fastest" therefore needs two things the frontend cannot
produce from the current API: a search per origin that starts at the moment the
rider can actually board, and arrival times that are comparable across origins.

## Decision

- **D-1 — Search each origin from "JST now + walk minutes".** The backend
  searches each origin on Jorudan from the JST time at which the rider reaches
  that station, passing the date/time through Jorudan's `Dym` (year-month),
  `Ddd` (day), `Dhh` (hour) and `Dmn` (minute) query parameters together with
  `Cway=0` (depart-at; `Cway=0` is already in `JORUDAN_URL_SUFFIX`, so only
  the date/time parameters are new). Issue #115 records these parameters as
  verified live against Jorudan on 2026-10-01. The walk minutes live in the
  backend origin config next to each origin, starting from the placeholder
  values 六本木一丁目 4, 神谷町 7 and 麻布十番 11 minutes. Every candidate Jorudan
  then returns is catchable, given that the configured walk time is right.
  One search per origin feeds both response fields below; no second handshake
  is added.

- **D-2 — `GET /api/transit` gains a structured `origins` field.** The server
  owns parsing, sorting and ranking; the frontend only computes values that
  depend on the viewer's clock (for example "leaves in N minutes"). The field
  carries, per origin:
  - `status: ok | no_candidates | error`;
  - candidates sorted by arrival time, each with ISO 8601 JST timestamps
    (including per-leg departure/arrival times), stops, legs and a `lineCode`
    per leg;
  - `isFastest` / `isFewestTransfers` flags computed on the server, each scoped
    to its own origin: `isFastest` marks that origin's earliest-arriving
    candidate and `isFewestTransfers` its candidate with the fewest transfers.

  At the top level, `fastestOrigin: string | null` names the origin whose best
  candidate arrives first, or `null` when no origin has a candidate.

- **D-3 — Migrate additively.** `routes` stays in the response with its current
  shape (its candidates now come from the same walk-shifted search as D-1) until
  the frontend that reads `origins` has shipped to production; `routes` is then
  removed in a separate, later release. The ordering is safe because the
  `Deploy to Production` workflow runs `SAM Deploy` before
  `Sync frontend to S3`, so the backend serving both fields is always live
  before any frontend that depends on `origins`.

- **D-4 — Amend the meaning of ADR 0004 D-3 (ADR 0004 itself is not edited).**
  ADR 0004 D-3 requires the "next departure" marker to be derived from data,
  never from card position; that rule still holds. What changes is the datum:
  the keyline marker now means **the earliest-arriving catchable candidate**,
  not the earliest departure. Within the active origin tab, the marker is
  driven by the server's per-origin `isFastest` flag instead of
  `deriveNextIndex`'s departure-time minimum; the cross-origin winner is
  carried separately by `fastestOrigin`. The marker's accessible label
  (today the visually-hidden "Next departure" text in
  `frontend/src/components/TransitCard.tsx`) must change with the datum.

## Consequences
- Positive: "fastest" becomes correct across stations, because every candidate
  is catchable (D-1) and candidates are ranked by arrival, the quantity the
  rider actually cares about.
- Positive: parsing, sorting and ranking happen once, on the server, against
  typed fields; the frontend's regex parsing of `summary`/`route` strings can be
  retired once `routes` is removed, and the ranking logic gets backend unit
  tests in one place.
- Negative: the Lambda now owns clock and time-zone handling (JST "now" +
  walk minutes, date rollover around midnight), which is new surface for bugs
  and depends on Jorudan continuing to honor the `Dym`/`Ddd`/`Dhh`/`Dmn`
  parameters — the same unannounced-upstream-change exposure ADR 0001 records.
- Negative: during the additive window the response carries both `routes` and
  `origins`, so the payload grows and the backend serializes the same
  candidates twice, and the removal of `routes` is a second release someone has
  to remember to ship. Clients still reading `routes` also see walk-shifted
  candidates instead of "now" ones from the first release onward.
- Negative: walk minutes are hard-coded placeholders in backend config; a wrong
  value silently either hides a catchable train or offers an uncatchable one,
  and changing it requires a backend deploy.

### Rejected alternatives
- **Keep the API as-is and compute catchability and ranking in the frontend** —
  rejected. `src/index.mjs` searches only from "now" and keeps at most
  `MAX_CANDIDATES` (2) candidates per origin in Jorudan's own order, so the
  frontend has no catchable, arrival-comparable candidate set to rank:
  filtering out trains that leave before the rider can reach the station is
  expected to leave few or no candidates, and comparing the survivors across
  origins could name the wrong "fastest" station.
