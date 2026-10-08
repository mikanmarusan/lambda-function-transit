# lambda-function-transit - Architecture Spec
<!-- spec-synced-through: 886edd0c1ff0a032c371990b7fc550f6c8cb7c94 -->

## 1. Overview

Fetches train transit information from [Jorudan](https://www.jorudan.co.jp/) (a Japanese transit search service) for a fixed commute route and exposes it through a small JSON API consumed by a React dashboard. Jorudan does not publish a public API and fronts its site with a JavaScript-based bot check, so a hand-rolled cookie-flow scraper running on AWS Lambda is the cheapest way to keep a personal commute board working.

```
CloudFront + S3 (Frontend) → API Gateway → Lambda → Jorudan
```

The full AWS architecture diagram lives at [`diagrams/lambda-function-transit-aws-architecture.drawio`](./diagrams/lambda-function-transit-aws-architecture.drawio) (rendered at [`diagrams/lambda-function-transit-aws-architecture.png`](./diagrams/lambda-function-transit-aws-architecture.png)).

## 2. System Context

| Layer | Component | Notes |
|-------|-----------|-------|
| Edge | CloudFront | Serves the React SPA from S3 and proxies `/api/*` to API Gateway. Protected by an AWS WAF Web ACL required by the CloudFront flat-rate pricing plan. |
| Static hosting | S3 | Hosts the built Vite bundle. Sync target after `cd frontend && npm run build`. |
| API | API Gateway (HTTP) | Routes `GET /api/transit` and `GET /api/status` to the Lambda function. |
| Compute | AWS Lambda (Node.js 24, ESM) | Entry point: `src/index.mjs` → `handler(event, context)`. Region: `ap-northeast-1`. |
| Upstream | Jorudan | Public Japanese transit search. Requires a 6-hop, cross-subdomain cookie handshake to bypass bot detection (see §5 Data Flow). |

## 3. Layers & Modules

| Module | Responsibility | Source path |
| --- | --- | --- |
| `handler(event, context)` | Entry point; normalizes the request path, orchestrates the cookie flow across origins, parses the results HTML, and returns the JSON response (the structured `origins` contract) | `src/index.mjs` |
| `buildOriginResult()` | Builds one `origins[]` entry: classifies the origin as `ok` / `no_candidates` / `error`, parses its route blocks and ranks the candidates | `src/index.mjs` |
| `parseCandidate()` | Parses one route block line by line into a structured candidate (summary, `stops[]`, `legs[]`) with ISO 8601 JST timestamps and midnight-crossing resolution | `src/parse.mjs` |
| `rankCandidates()` / `pickFastestOrigin()` | Sort an origin's candidates by arrival, keep `MAX_CANDIDATES` (3), set `isFastest` / `isFewestTransfers`; name the origin whose best candidate arrives first | `src/parse.mjs` |
| `describeLine()` / `lineCodeFor()` | Split a Jorudan line string into line name, train type, via and destination, and map the line name to a `lineCode` from the closed set of ADR 0008 D-1 | `src/lines.mjs` |
| `buildSearchUrl()` / `buildDepartureParams()` | Build each origin's `nori.cgi` search URL per request, appending the JST departure date/time (`Dym`/`Ddd`/`Dhh`/`Dmn`) for "now + that origin's `walkMinutes`" (see §5 Jorudan Search Request) | `src/index.mjs` |
| `performBotHandshake()` | Emulates the browser bot-check flow for each origin, with one `CookieJar` and one overall timeout budget per call | `src/index.mjs` |
| `extractJsRedirect()` | Reads the (single- or double-quoted) `window.location.href` from the JS redirect stub, using a non-backtracking negated character class | `src/index.mjs` |
| `splitRoutes()` | Splits the target HTML block on the `(?=発着時間：)` lookahead to separate individual route candidates | `src/index.mjs` |
| `isAllowedUrl()` | SSRF allowlist guard applied to every hop URL and the plaintext `verify_uuid` body | `src/index.mjs` |
| `CookieJar` | Domain-attribute–honouring cookie store built on `Headers.getSetCookie()` | `src/index.mjs` |
| Local dev server | Serves the unprefixed `/transit` and `/status` paths for local development | `src/dev-server.mjs` |
| `isValidStructuredTransit()` | Validates the structured `origins` / `generatedAt` / `destination` / `fastestOrigin` fields against `STRUCTURED_LIMITS` (≤ 10 origins, ≤ 10 candidates, ≤ 20 stops — legs bounded through `stops.length === legs.length + 1` — strings ≤ 100 chars, minute and count fields integers 0–1440, ISO 8601 `+09:00` timestamps) and the `LINE_CODES` allow-list, and requires `fastestOrigin` to be `null` or one of the `origins[].origin` names; `useTransit()` treats a payload that fails it as an error (`Invalid API response format`), keeping the previous state rather than rendering any part of it | `frontend/src/types/transit.ts`, `frontend/src/hooks/useTransit.ts` |
| `useNow()` | One app-wide clock: a single `setInterval` (`NOW_TICK_MS`, 1 s) shared by every subscriber via `useSyncExternalStore`, cleared when the last subscriber unmounts and re-sampled on `visibilitychange` to visible, so no component calls `Date.now()` during render | `frontend/src/hooks/useNow.ts` |
| `minutesUntilLeave()` / `leaveCountdown()` / `relativeTimeLabel()` / `isStale()` / `formatClockTime()` / `formatDuration()` | Whole minutes before the rider must leave (`departureAt − walkMinutes − now`, floored; `0` = leave now, negative = missed), its card badge (`あとN分で出る` from 2 minutes, `今すぐ出発` at 0–1, `間に合いません` below 0), the `N秒前` / `N分前` label, the stale check (`now − lastUpdated ≥ STALE_AFTER_MS`, 180 000 ms; a non-finite input is never stale), the JST `HH:MM` clock label (`Intl.DateTimeFormat` with `timeZone: 'Asia/Tokyo'`), and a whole-minute duration in Jorudan's spelling (`M分` under an hour, else `N時間` / `N時間M分`); the clock helpers take absolute instants, so results do not depend on the runtime time zone | `frontend/src/lib/time.ts` |
| `StatusIndicator` | Header freshness indicator: a 6px status dot (API status by colour, with a `visually-hidden` text label), `N秒前に更新` / `N分前に更新` while fresh, and an amber `N分前のデータ` pill with an `更新` button wired to `refresh` once stale (see §5 Frontend Render Branches) | `frontend/src/components/StatusIndicator.tsx` |
| Station tabs (`App`, `fastestCandidate()` / `tabSummary()`) | Renders `origins` as a `role="tablist"` of origin tabs, each summarising its earliest arrival (`HH:MM着` + `最速` / `+N分`) or its outcome (`取得できず` / `便なし`); auto-selects `fastestOrigin`, holds a manual pick until the next successful fetch, and keeps `document.title` on the active origin (see §5 Station Tabs) | `frontend/src/App.tsx` |
| `TransitCard` | One candidate card, drawn from the structured `Candidate` and its origin's `walkMinutes`: the departure time on the `3xl` rung, a leave-by countdown badge from `useNow()` (see §5 Transit Card), `HH:MM着` / `N分 · 乗換N回`, the `最速` / `乗換少` labels, and the line pills, all inside the disclosure button; expands to `RouteDetail`, handing it the candidate | `frontend/src/components/TransitCard.tsx` |
| `LinePill` | One leg's line identity: a white circle ringed in the `lineCode`'s colour through an allow-listed CSS-Modules class, the letter code, and the line name; a `null` or unknown code shows the name alone in the neutral style (ADR 0008 D-1 / D-2) | `frontend/src/components/LinePill.tsx` |
| `RouteDetail` | The expanded route: for a structured candidate an `<ol>` of stop and leg rows with per-leg `HH:MM着` / `HH:MM発` times, a `lineCode`-coloured rail and `LinePill` per leg, train type / destination / distance, a boarding-position callout, and `乗換 N分` / `待ち N分` / `余裕なし` / `降車不要` badges on transfer stops (see §5 Route Detail) | `frontend/src/components/RouteDetail.tsx` |
| Design token source | YAML frontmatter holding every export-modelable token (colors, typography scale, radii, spacing) | `frontend/DESIGN.md` |
| `buildTokensCss()` | Runs the pinned local `design.md` bin, rewrites the exporter's Tailwind `@theme {` block into `:root {`, and fails closed rather than writing empty or untransformed output | `frontend/scripts/export-design.mjs` |
| Generated token stylesheet | The `:root` custom properties exported from the DESIGN.md frontmatter. **Generated — never hand-edited** | `frontend/src/design-tokens.css` |
| Global stylesheet | Imports the generated tokens, then declares the hand-authored residue (aliases + non-modelable tokens) and the reset/base/focus/scrollbar rules | `frontend/src/index.css` |
| Token pipeline test | Vitest suite guarding token integrity and generated-file drift (see §7) | `frontend/tests/design-tokens.test.ts` |
| App render-branch test | Vitest + Testing Library suite pinning the five content branches (one test per branch, including the last-known cards staying visible under the error banner), that the hook's raw error string never renders, the `再試行` and `更新` → `refresh` wiring with focus parked on `<main>`, the `loading` → `refreshing` pass-through to `StatusIndicator`, the station tabs under a pinned clock (`vi.useFakeTimers({ toFake: ['Date'] })`: tablist / `aria-selected` / roving tabindex, auto-select of `fastestOrigin`, a manual pick held through an in-flight and a failed fetch and released by the next successful one, arrow-key / Home / End navigation and modified arrows left to the browser, the `HH:MM着` + `最速` / `+N分` / `取得できず` / `便なし` summaries, the context line and its ordering note appearing only with candidates, the per-origin `取得できず` / `便なし` empty card (kept while a refresh is in flight, with the `表示中は` line on a failed one), the `document.title` update and its restore on unmount, and each card's countdown driven by its own origin's `walkMinutes`), the fastest-arrival marker (`isFastest` not first card, the accessible text equivalent, no marker on the empty state / failed origin, identity-keyed expansion), their ARIA roles, and the accessibility affordances (`aria-live` wrapper, `aria-busy`) (see §5); mocks `useTransit`/`useApiStatus` so each branch — including the pre-fetch instant — is driven rather than raced. `frontend/tsconfig.json` includes `tests/*.tsx` so it is typechecked | `frontend/tests/App.test.tsx` |
| Structured-transit test | Vitest suite pinning `isValidStructuredTransit()` (a well-formed payload, `fastestOrigin: null` and every allow-listed `lineCode` plus `null`, malformed top-level / origin / candidate / stop / leg fields rejected, each `STRUCTURED_LIMITS` count and string length accepted at the limit and rejected one over), and `useTransit()` returning `origins` / `generatedAt` / `fastestOrigin` from a valid payload and failing closed on an invalid one (the `Invalid API response format` error, no data on a first fetch, and the last valid `origins` / `fastestOrigin` / `lastUpdated` kept when a later refresh returns one) | `frontend/tests/structured-transit.test.ts` |
| Legacy-removal test | Vitest suite pinning that the legacy `routes` contract is gone: `frontend/src/types/transit.ts` exports none of `parseSummary` / `parseRoute` / `parseTransitResponse` / `candidateToRoute`, `isValidStructuredTransit()` rejects a `routes`-only payload, and `useTransit()` surfaces one as the `Invalid API response format` error with no `originRoutes` state | `frontend/tests/transit.test.ts` |
| Time helpers test | Vitest suite pinning the `frontend/src/lib/time.ts` helpers, including `formatDuration()`'s `0分` / `52分` / `59分` / `1時間` / `1時間15分` / `2時間` / `2時間15分` spellings | `frontend/tests/time.test.ts` |
| TransitCard test | Vitest + Testing Library suite that mocks `useNow` and pins the countdown badge at 10 / 2 / 1 / 0 / −1 minutes before leave-by (text and tone class) and its change on a later tick, `HH:MM着` / `N分 · 乗換N回` (including the `1時間15分 · 乗換0回` hour-long spelling), the `最速` / `乗換少` labels from the flags, the line pills and their chevron while collapsed, every closed-set code's ring class, the neutral name-only style for a `null` or out-of-allow-list code, that no element carries a `style` attribute, and that an expanded card hands its candidate to `RouteDetail` (the `.route` list with `<time>` values) | `frontend/tests/TransitCard.test.tsx` |
| RouteDetail test | Vitest + Testing Library suite pinning the structured route's `<ol>` of stop and leg rows, the per-leg departure / transfer arrival and departure / final arrival times with their `dateTime`, the train type / destination / distance line (an empty part dropped rather than leaving a dangling separator), the boarding-position callout for `3・6号車` / `前／1号車` / `後方` and its absence, every closed-set code's rail class and the neutral rail for a `null` or out-of-allow-list code with no `style` attribute, the `乗換` / `待ち` badges, `余裕なし` only at a 0-minute wait, the `降車不要` chip replacing `乗換` with no `余裕なし`, no badges on a transfer stop that carries no transfer fields, and a leg-less candidate drawn as its lone terminal stop in the same `.route` list with no times, rail or `<pre>` | `frontend/tests/RouteDetail.test.tsx` |
| StatusIndicator test | Vitest + Testing Library suite that mocks `useNow` and pins the 179 s / 180 s stale boundary, the `N秒前に更新` / `N分前に更新` / `N分前のデータ` copy, the `更新` → `refresh` wiring and its in-flight `disabled` / `aria-busy`, no freshness text before the first successful fetch, the dot's hidden text labels, and the absence of the old English `Connected` / `Updated` copy | `frontend/tests/StatusIndicator.test.tsx` |
| Frontend E2E suite | Playwright suite that stubs the API with `page.route` and pins the rendered accessibility / touch-target / motion / typography contract in a real browser (see §7) | `frontend/tests/e2e/transit.spec.ts`, `frontend/playwright.config.ts` |

The SAM function is a Zip package of `./src` (`CodeUri`), so every backend module ships with it. The `production` stage of the root `Dockerfile` (the `api-prod` container) instead copies `src/index.mjs`, `src/parse.mjs`, and `src/lines.mjs` by name, so a new backend module must be added to that `COPY` line.

## 4. Data Model

`GET /transit` or `GET /api/transit` (HTTP 200):

```json
{
  "generatedAt": "2026-10-06T20:40:12+09:00",
  "destination": "つつじヶ丘（東京）",
  "fastestOrigin": "六本木一丁目",
  "origins": [
    {
      "origin": "六本木一丁目",
      "walkMinutes": 4,
      "searchedFrom": "2026-10-06T20:44:00+09:00",
      "status": "ok",
      "candidates": [
        {
          "departureAt": "2026-10-06T20:45:00+09:00",
          "arrivalAt": "2026-10-06T21:24:00+09:00",
          "durationMinutes": 39,
          "transferCount": 2,
          "isFastest": true,
          "isFewestTransfers": true,
          "stops": [
            { "station": "六本木一丁目", "arrivalPlatform": null, "departurePlatform": "1番線", "transferMinutes": null, "waitMinutes": null, "noAlight": false },
            { "station": "四ッ谷", "arrivalPlatform": "3番線", "departurePlatform": "1番線", "transferMinutes": 4, "waitMinutes": 0, "noAlight": false },
            { "station": "新宿", "arrivalPlatform": "1番線", "departurePlatform": "3番線", "transferMinutes": 6, "waitMinutes": 0, "noAlight": false },
            { "station": "つつじヶ丘（東京）", "arrivalPlatform": "1・2番線", "departurePlatform": null, "transferMinutes": null, "waitMinutes": null, "noAlight": false }
          ],
          "legs": [
            { "lineName": "東京メトロ南北線", "lineCode": "N", "trainType": null, "via": null, "destination": "浦和美園", "departAt": "2026-10-06T20:45:00+09:00", "arriveAt": "2026-10-06T20:51:00+09:00", "minutes": 6, "distanceKm": 3.1, "carPosition": "3・6号車" },
            { "lineName": "東京メトロ丸ノ内線", "lineCode": "M", "trainType": null, "via": null, "destination": "荻窪", "departAt": "2026-10-06T20:55:00+09:00", "arriveAt": "2026-10-06T21:02:00+09:00", "minutes": 7, "distanceKm": 2.9, "carPosition": "前／1号車" },
            { "lineName": "京王線", "lineCode": "KO", "trainType": "急行", "via": null, "destination": "京王八王子", "departAt": "2026-10-06T21:08:00+09:00", "arriveAt": "2026-10-06T21:24:00+09:00", "minutes": 16, "distanceKm": 12.5, "carPosition": "後方" }
          ]
        }
      ]
    },
    { "origin": "神谷町", "walkMinutes": 7, "searchedFrom": "2026-10-06T20:47:00+09:00", "status": "error", "candidates": [] }
  ]
}
```

| Field | Contract |
| --- | --- |
| `generatedAt` | Request instant, ISO 8601 JST (`+09:00`), truncated to the second. |
| `destination` | The fixed destination station. |
| `fastestOrigin` | `string \| null` — the origin whose first (earliest-arriving) candidate arrives first; ties go to `JORUDAN_ORIGINS` order. `null` when no origin has a candidate. |
| `origins[]` | One entry per `JORUDAN_ORIGINS` entry, in config order, always present. |
| `origins[].searchedFrom` | JST now (truncated to the minute) + `walkMinutes`, ISO 8601 JST — the instant Jorudan was asked to depart from. |
| `origins[].status` | `ok`: at least one candidate parsed. `no_candidates`: the results page held no route block. `error`: the fetch/handshake failed, the page had too few `<hr>` blocks, or route blocks existed but none parsed (see §5 HTML Parsing for the drop rules). Non-`ok` entries carry `candidates: []`. |
| `origins[].candidates[]` | Up to `MAX_CANDIDATES` (3), sorted by `arrivalAt` (ties: fewer transfers first). `isFastest` marks the first candidate; `isFewestTransfers` marks one candidate with the fewest transfers (the earliest-arriving one on a tie). Both are scoped to the origin. |
| `stops[]` / `legs[]` | `legs[i]` runs from `stops[i]` to `stops[i + 1]`, so `stops.length === legs.length + 1`. Platforms keep Jorudan's text (`1・2番線`, `59番のりば`); `transferMinutes`/`waitMinutes` come from `［乗換N分+待ちM分］` and are `null` on terminals; `noAlight` is `true` for `≪降車不要≫` (stay on the train). A station such as `新宿/新線新宿` (walking transfer between two stations) is kept as one string. |
| `legs[].lineName` / `lineCode` | `lineName` is the line string with the `［地下鉄］`/`［私鉄］`/`［ＪＲ］`… category, `X経由` via, `(…行)` direction and trailing train type removed. `lineCode` is one of `N` `M` `H` `Z` `E` `S` `KO`, matched exactly after also dropping the `東京メトロ` operator prefix, or `null` (e.g. 京王井の頭線, 徒歩, buses). |
| `legs[].trainType` / `via` / `destination` | `trainType` (e.g. `急行`, `各停`, `区間急行`) is stripped only when what remains still ends in `線`/`ライン`; `via` from `…線X経由`; `destination` from `(X行)`. Each is `null` when absent. |
| `legs[].distanceKm` / `carPosition` | `distanceKm` is `null` when Jorudan prints `↓` (the train continues through); `carPosition` keeps Jorudan's text (`3・6号車`, `前／1号車`, `後方`) or is `null`. |

The response carries exactly these four top-level keys; the legacy `routes` field and its `[summary, route]` string tuples were removed once the `origins`-based frontend shipped (ADR 0006 D-3, issue #125). The handler returns HTTP 500 `{ "error": "Failed to fetch transit information" }` only when every origin is `error` — including when route blocks exist at every origin but none parses. An origin with `no_candidates` is not a failure: when no origin is `ok`, the response is still 200 with `fastestOrigin: null`.

`GET /status` or `GET /api/status`:

```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## 5. Data Flow

### API Path Normalization

The Lambda handler accepts paths from both direct API Gateway invocations and CloudFront-proxied calls:

- `/transit` and `/api/transit` → transit endpoint
- `/status` and `/api/status` → status endpoint

This lets the dev server (which exposes the unprefixed paths) and CloudFront (which prefixes with `/api`) hit the same handler without per-environment branching.

### Jorudan Search Request — Departure Time per Origin

`JORUDAN_ORIGINS` in `src/index.mjs` is the origin config: each entry holds the station name and its `walkMinutes` (六本木一丁目 4, 神谷町 7, 麻布十番 11 — placeholder values kept in that one place). The destination is fixed to つつじヶ丘（東京）.

On every `/transit` request the handler reads the current instant once and, for each origin, `buildSearchUrl()` builds the `nori.cgi` search URL: the percent-encoded origin as `eki1`, the fixed query string (including `Cway=0`, depart-at mode), then the departure date/time from `buildDepartureParams()`:

| Param | Meaning | Example (JST 2026-10-01 11:51, walk 11 min) |
| --- | --- | --- |
| `Dym` | Year and zero-padded month, `YYYYMM` | `202610` |
| `Ddd` | Day of month, no padding | `1` |
| `Dhh` | Hour `0`–`23`, no padding | `12` |
| `Dmn` | Minute `0`–`59`, no padding | `2` |

The departure time is "JST now + `walkMinutes`", so Jorudan is asked for departures at or after the time the rider can reach that station. JST is computed explicitly with `Intl.DateTimeFormat` (`timeZone: 'Asia/Tokyo'`, `hourCycle: 'h23'`) because Lambda runs in UTC; adding the walk minutes to the instant before formatting carries day, month and year rollover (e.g. 2026-12-31 23:55 + 11 min → `Dym=202701&Ddd=1&Dhh=0&Dmn=6`). The parameters are built server-side from numbers only; nothing in the request feeds them. The same instant, truncated to the minute, is reported per origin as `origins[].searchedFrom` and is the date base for that origin's parsed timestamps (§5 HTML Parsing).

### Jorudan Bot Detection — 6-Hop `jrd_uuid` Cookie Handshake

Jorudan fronts its site with CloudFront and a JavaScript-based bot check. A naive `fetch()` against the search URL receives an HTML stub instead of the transit results page, because the real URL is computed client-side and gated behind a UUID-cookie handshake performed on a **separate subdomain** (`jid.jorudan.co.jp`).

`performBotHandshake()` in `src/index.mjs` emulates the browser flow for each origin (one `CookieJar` and one overall budget per call):

1. **Initial request** — GET the `nori.cgi` search URL (built per request as above) on `www.jorudan.co.jp`. The body is a JS redirect page; `extractJsRedirect()` reads the (single- or double-quoted) `window.location.href`, which is now an **absolute cross-host URL** to `https://jid.jorudan.co.jp/jrd_uuid/?returl=...`. (Fast-path: if this first response already contains the results marker `<hr size="1"`, it is returned directly.)
2. **jid page** — GET the `jrd_uuid` page on `jid.jorudan.co.jp`. In a real browser its inline JS drives the next two AJAX calls; the handler derives those URLs directly from this page URL's querystring.
3. **set_uuid** — **POST** `jid.../jrd_uuid/set_uuid.cgi?<returl...>&ts=<epoch>` with browser-`fetch()`-equivalent AJAX headers (`Accept: */*`, `Referer` = the jid **origin root** `https://jid.jorudan.co.jp/`, `Sec-Fetch-Site: same-origin`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`) and a urlencoded browser-fingerprint body (`tz, lang, sw, sh, cd, mem, hc, ua, ts`). A bare **GET** (or a POST missing the fingerprint body/headers) returns **403** (`./error.html`). Responds with `Set-Cookie jrd_cuid` (`Domain=jid.jorudan.co.jp`, short `max-age`).
4. **verify_uuid** — **POST** `jid.../jrd_uuid/verify_uuid.cgi?<returl...>&ts=<epoch>` with the same AJAX headers, fingerprint body, and the `jrd_cuid` cookie. The **response body is the plaintext final URL** (`https://www.jorudan.co.jp/webuser/redirect2.cgi?url=...`) and it sets `Set-Cookie jrd_uuid` with `Domain=.jorudan.co.jp` (shared across subdomains). `jrd_uuid` is the sole gating cookie — once set, the final `nori.cgi` renders directly, so a single `set_uuid → verify_uuid` pair is sufficient (no second `set_uuid` is required).
5. **redirect2** — GET `www.../webuser/redirect2.cgi?url=...` → `302` whose `Location` is the authoritative `nori.cgi` URL.
6. **Authoritative fetch** — GET the final `nori.cgi` with the cookie jar. Because `jrd_uuid` is a parent-domain (`.jorudan.co.jp`) cookie it is sent to `www`; the jid-host-only `jrd_cuid` is not. The response is the rendered transit results HTML (verified by the `<hr size="1"` marker).

### HTML Parsing

The transit results page is server-rendered HTML. The handler:

- Splits by `<hr size="1" color="black">` (handles both self-closing and non-self-closing forms).
- Normalizes line endings via `/\r?\n\r?\n/` so CRLF and LF responses parse identically.
- Picks `blocks[TARGET_BLOCK_INDEX]` (index `2`) — the block that contains all candidate transit routes.
- Calls `splitRoutes()`, which splits on the lookahead `(?=発着時間：)` to separate individual route candidates.
- **Candidates**: `parseCandidate()` (`src/parse.mjs`) reads every block line by line — `発着時間：HH:MM発 → HH:MM着` (any of the four summary/leg times may be parenthesised, as Jorudan prints walking times `(HH:MM)`), `所要時間：[H時間]M分`, `乗換回数：N回`, `■`/`◇` stop lines, and the `｜` rows under each stop: a line row starts a leg, the following `HH:MM-HH:MM［N分］` row gives its times, and fare (`178円`), arrow (`↓`) and empty rows are skipped. A block is dropped (fail closed) when a summary field is missing, a leg has no time row or no line name, a time is out of range (hour > 23 or minute > 59), `stops.length !== legs.length + 1`, or the resolved arrival minus departure differs from `所要時間` (so a summary arrival earlier than the last leg is never rolled to the next day). `rankCandidates()` then sorts the survivors by arrival and keeps `MAX_CANDIDATES` (`3`).
- **Dates**: every `HH:MM` is resolved against the origin's `searchedFrom`. The departure is on the search day unless it is more than 12 hours earlier than the search time (then it is the next day, e.g. search 23:55, departure 00:01). Each later time that is earlier than the previous one is the next day, so a leg `23:58-00:05` arrives at `…T00:05:00+09:00` on the following date. JST is a fixed UTC+9 offset (no DST).

The parser follows the ReDoS rules in §7 Guards.

### Frontend Render Branches

`frontend/src/App.tsx` renders the fetched candidates through five mutually exclusive content branches (issue #121), each keyed off the `useTransit()` state (`loading`, `error`, `lastUpdated`), `hasCards` (at least one card for the active origin) and `hasData` (at least one origin tab on screen). The cards are the active origin's `origins[].candidates` (issue #122), each passed to `TransitCard` with its origin's `walkMinutes` (see Transit Card below). A response that fails `isValidStructuredTransit()` is a fetch error (`Invalid API response format`), not partial data. `generatedAt` is returned by the hook but read by no component. The three *status* nodes (error banner, loading, empty) are wrapped in a single, unconditionally mounted `<div aria-live="polite">`; the cards render as a sibling **outside** that region:

| Branch | Condition | Rendered | Live region |
| --- | --- | --- | --- |
| Error, no cards for the active origin | `error && !hasCards` | Error banner `サーバーに接続できません` + `再試行` button, `role="alert"` (plus the `表示中は HH:MM 時点のデータです` line while `hasData`); no cards | inside |
| Error, cards for the active origin | `error && hasCards` | Error banner `サーバーに接続できません` + `表示中は HH:MM 時点のデータです` + `再試行`, `role="alert"`, **plus** the last-known cards | banner inside, cards outside |
| Loading | `!error && !hasData && loading` | `Spinner` + `Loading transit information...` | inside |
| Empty | `!error && !hasCards && (hasData \|\| !loading) && lastUpdated` | Empty-state card: `Tray` glyph (`--text-tertiary`, never the error red) + the active origin's own outcome — `取得できず` for `status: "error"`, `便なし` for any other structured origin — or `No departures found` when the active origin has no structured entry, `role="status"` | inside |
| Normal | `!error && hasCards` | `TransitCard` per candidate of the active origin | outside |

The remaining combination — `!error && !hasCards` with no `lastUpdated` and not loading, the pre-fetch instant — renders no content branch. A refresh in flight on a card-less tab (`hasData`) therefore keeps that tab's empty card instead of the first-load spinner. The cards render on `hasCards` alone, so a failed refresh no longer hides them: `useTransit` keeps the previous `origins` on failure (it spreads `prev` and sets only `loading` and `error`), so the last-known cards stay on screen under the banner (ADR 0007 D-2). The banner shows fixed copy only — the hook's `error` string (`HTTP error: 500`, `Invalid API response format`, …) is never rendered. `HH:MM` is `lastUpdated` (the time of the last successful fetch) formatted by `formatClockTime()` in JST; the line renders whenever `hasData` (any origin tab on screen), including on a card-less tab. `再試行` moves focus to `<main>` (`tabIndex={-1}`, no focus ring, `preventScroll`) and then calls `refresh`: `useTransit` clears `error` as a fetch starts, so the click unmounts the banner, button included, and focus would otherwise fall to `<body>`. For the same reason the button carries no `disabled` / `aria-busy` — it is never mounted while `loading` is true. It is a 44×44-minimum visible box (`min-width` / `min-height: 44px`).

The status branches are condition-mounted, so the live region must be a container that outlives them — a role on the branch node itself is announced only by some assistive tech. When no status branch is active the wrapper stays in the DOM as an **empty, zero-height box**: it is never `display: none`, which would prune it from the accessibility tree and leave it no better than a conditionally mounted region. Its parent `.content` therefore declares no `gap` — a gap would reserve a phantom row above the cards for the empty wrapper. The one branch that shows both the banner and the cards gets its spacing from `.status:not(:empty) { margin-bottom: var(--space-3) }` instead, which applies only while the region has content. The cards sit outside the region deliberately: inside it, every tab switch would re-announce the whole timetable.

#### Header Freshness Indicator (issue #121, ADR 0007 D-2)

`StatusIndicator` (in the header) takes `status` (from `useApiStatus()`), `lastUpdated`, `onRefresh` (`refresh`) and `refreshing` (`loading`), and reads the shared clock through `useNow()`. It has no box of its own — no background, border or padding — and renders:

- a Phosphor `Circle` dot (`size={6}`, `aria-hidden`), coloured `--accent-green` / `--accent-red` / `--text-tertiary` (pulsing) for `ok` / `error` / `loading`, next to a `visually-hidden` label `サーバー接続: 正常` / `サーバー接続: エラー` / `サーバー接続: 確認中` so the state does not rely on colour alone;
- while `lastUpdated` is set and `isStale()` is false (under 180 s since the last successful fetch): `.timestamp` with `relativeTimeLabel()` + `に更新` (`N秒前に更新` / `N分前に更新`);
- from exactly 180 s on: an amber `.stale` pill — `relativeTimeLabel()` + `のデータ` (`N分前のデータ`) on `--accent-amber-tint` with a `--accent-amber-tint-border` outline and `--accent-amber` text — holding an `更新` button that calls `onRefresh` and is `disabled` / `aria-busy` while `refreshing`. App passes the same focus-keeping handler as `再試行` (focus `<main>`, then `refresh`), because a successful fetch unmounts the pill. The button grows its hit area to 44×44 with a transparent, centred `::after`, the same idiom as `.refreshButton`.

Before the first successful fetch (`lastUpdated === null`) only the dot and its hidden label render.

The empty state is gated on `lastUpdated` (set only by a completed fetch), not merely on `!loading`: `useTransit` starts with `loading === false`, so without the guard the first paint — before the fetch effect runs — would satisfy `!loading && origins.length === 0` and flash the empty card on every visit.

#### Station Tabs (issue #122, ADR 0007 D-2 / D-3)

The origin tabs render from `origins`, in the server's config order. The strip is a `role="tablist"` (`aria-label="出発駅"`) of `role="tab"` buttons carrying `aria-selected`, `aria-controls` (the one shared panel) and a roving tabindex — `0` on the selected tab, `-1` on the rest — so only the selected tab sits in the Tab order. The context line and the content branches sit in a single `role="tabpanel"` wrapper `aria-labelledby` the selected tab (a plain wrapper while there are no tabs). `ArrowRight` / `ArrowLeft` (wrapping) and `Home` / `End` move selection and focus together (automatic activation); with Alt, Ctrl, Meta or Shift held the key is left to the browser (Alt+ArrowLeft is Back). The tabs keep the `.tab` / `.tabActive` class names and the inverted selected chip (ADR 0004 D-2); `.tab` stacks its two lines (`flex-direction: column`).

Each tab's second line (`.tabSummary`, `--font-size-xs`, inheriting the tab's colour; its parts joined by a space) reads from the origin's `isFastest` candidate (`fastestCandidate()`): `HH:MM着` (its `arrivalAt` through `formatClockTime()`), then `最速` on `fastestOrigin` or `+N分` — the minutes its arrival trails `fastestOrigin`'s, never below 0 — on the others (no rank when `fastestOrigin` is `null`). `status: "error"` reads `取得できず`; `no_candidates` (or no `isFastest` candidate) reads `便なし`.

Selection is derived on every render, not stored: the active origin is a held manual pick if there is one, else `fastestOrigin`, else the first tab. A click or an arrow / `Home` / `End` key stores the pick stamped with the current `lastUpdated` `Date`, and the pick holds only while `lastUpdated` is still that same object (compared by reference, so two fetches within one millisecond still release it). `useTransit` replaces `lastUpdated` on a successful fetch alone (an in-flight or failed fetch keeps it), so a manual pick survives refreshes in flight and failures and is released by the next successful fetch, which re-selects `fastestOrigin`. A pick naming an origin that is no longer a tab is ignored.

Above the cards the context line reads `{origin} → つつじヶ丘` (an `ArrowRight` glyph between the two stations) and, when the active structured origin has at least one candidate, `オフィスから徒歩N分 · 到着が早い順` (`walkMinutes`; candidates arrive sorted by arrival from the server).

`document.title` follows the active origin, set in a `useEffect` and restored to the previous title on cleanup: `{origin} → つつじヶ丘 · HH:MM発`, where `HH:MM` is the departure of the active origin's `isFastest` candidate, or `{origin} → つつじヶ丘` when that origin has none. Before any tab exists the effect leaves the static `index.html` title in place.

#### Fastest-Arrival Marker (issue #97, ADR 0004 D-3, amended by ADR 0006 D-4 in issue #122)

The cards branch marks the active origin's **earliest-arriving candidate** — the one the server flags `isFastest` — with a 4px `--accent-blue` keyline on the card's left edge. The marked card is still **derived from the data, never inferred from card position** (ADR 0004 D-3); only the datum changed from earliest departure to the server's per-origin `isFastest` (ADR 0006 D-4), which retired the client-side `deriveNextIndex()` departure-time minimum.

`TransitCard` receives the flag as its `isNext` prop. The keyline is a `position: absolute` `::before` on the `.cardNext` modifier in `TransitCard.module.css` — not a left border, which the `--radius-lg` corner would miter into a wedge and which would shift the card's content 4px right and break the vertical alignment of the two cards' departure times, and not a shadow, which DESIGN.md bans. It declares `width: var(--space-1)` (4px), `background-color: var(--accent-blue)`, and a load-bearing `pointer-events: none`: a pseudo-element hit-tests to `.card`, so without it the strip would swallow clicks aimed at the `.header` disclosure button. The marker is modeled in the DESIGN.md frontmatter as the component entry `components.card-marker-next` (`accent-blue` fill, `spacing.1` width). Because a pseudo-element is invisible to assistive tech, the marked card's header button also renders a `visually-hidden` `最速の便 ` span (the global `index.css` utility) as the marker's accessible text equivalent. Under a ~20% outdoor glare veil the blue compresses to roughly 1.92:1, so the keyline is deliberately **not the sole carrier** — default expansion and the hidden label are its redundant cues (ADR 0004's honest limit).

Default expansion follows the marker, not position: `TransitCard` initializes `useState(isNext)` (formerly `useState(index === 0)`), so the marked candidate opens expanded and the rest collapsed. Cards are keyed by the train's identity — `` `${activeOrigin}-${departureAt}-${index}` ``, `departureAt` the candidate's ISO 8601 departure — not by index: React reuses component instances by key and `useState` initializers only run on mount, so a positional `key={index}` would leave a stale card expanded (split from the marker) after a tab switch or refresh. The `index` tiebreaker only disambiguates two candidates sharing a departure time (duplicate keys); the origin + time prefix is what forces the remount.

The controls expose their own state: the origin tabs carry the tablist semantics above, and the refresh button carries `aria-busy={loading}` alongside its `aria-label="Refresh"` and `disabled={loading}`. `frontend/tests/App.test.tsx` pins all five branches (one test each, including the cards staying visible under the error banner), that pre-fetch instant, that the raw error string never renders, the `再試行` and `更新` → `refresh` wiring with focus parked on `<main>`, the `loading` → `refreshing` pass-through, the two ARIA roles, and the `aria-live` / `aria-busy` attributes — plus, under a pinned clock, the station tabs (tablist / `aria-selected` / roving tabindex and no `aria-pressed`, auto-select of `fastestOrigin` and the first-tab fallback when it is `null`, every summary form, a manual pick held through an in-flight and a failed fetch and released by the next successful one, arrow-key / Home / End navigation and modified arrows left to the browser, the context line and its ordering note appearing only with candidates, the per-origin `取得できず` / `便なし` empty card (kept while a refresh is in flight, with the `表示中は` line on a failed one), the `document.title` update and its restore on unmount, and each card's countdown driven by its own origin's `walkMinutes`) and the fastest-arrival marker (`isFastest` rather than the first card, the visually-hidden text equivalent inside the marked header's accessible name, no marker on the empty state / failed origin, and identity-keyed expansion staying on the same train across a tab switch).

#### Transit Card (issue #123, ADR 0008)

`TransitCard` takes `candidate` (one `Candidate`), `walkMinutes` (its origin's) and `isNext`. Its disclosure button stacks three rows of `span`s (phrasing content only, since they sit inside a `<button>`):

1. the departure time (`.departure`, `--font-size-3xl` = 28px, mono; `departureAt` through `formatClockTime()`) and a countdown badge: `leaveCountdown(minutesUntilLeave(departureAt, walkMinutes, now))`, where `now` is the shared `useNow()` clock. Two minutes or more reads `あとN分で出る` in `--accent-green`; 0 or 1 minute reads `今すぐ出発` in `--accent-amber` on the `--accent-amber-tint` wash; below 0 reads `間に合いません` dimmed to `--text-tertiary`. A tick changes only the badge text: the card list keeps the fetched order and nothing is re-sorted or removed;
2. `HH:MM着` (`arrivalAt` through `formatClockTime()`; `--accent-blue`, `--font-size-xl`, `--font-size-2xl` under the 480px breakpoint), `N分 · 乗換N回` (`formatDuration(durationMinutes)` and `transferCount`), and outline badges `最速` (`isFastest`, `--accent-blue`) and `乗換少` (`isFewestTransfers`);
3. the legs as `LinePill`s joined by `CaretRight` chevrons, visible while the card is collapsed.

`LinePill` maps a `lineCode` to one of seven allow-listed CSS-Modules classes (`.lineN` … `.lineKo`, looked up with `Object.hasOwn`), each declaring `border-color: var(--line-*)` on the white circle; a `null` or unknown code renders the line name alone inside a `--line-neutral` outline, with no circle. No response string reaches a `style` attribute or a custom property (ADR 0008 D-1).

#### Route Detail (issue #124)

`TransitCard` passes its candidate to `RouteDetail` as `candidate`, and `RouteDetail` renders an `<ol>` (`.route`) whose `<li>`s alternate stop and leg rows in route order, all on one three-column grid (time, marker, body):

- **stop rows** show the times from the adjacent legs as `<time dateTime>` elements: the first stop `HH:MM発` from `legs[0].departAt`, each transfer stop `HH:MM着` from the arriving leg's `arriveAt` above `HH:MM発` from the leaving leg's `departAt`, and the last stop `HH:MM着`. The first and last stops take the filled dot, transfer stops the hollow one. A transfer stop shows `乗換 N分` (`transferMinutes`) and `待ち N分` (`waitMinutes`) outline badges, each only when its field is non-null, plus an amber `余裕なし` badge (`--accent-amber` on `--accent-amber-tint`) when `waitMinutes` is `0`. A `noAlight` (through-running) stop shows a filled `降車不要` chip in place of `乗換` and never `余裕なし`, since the rider stays aboard;
- **leg rows** show a vertical rail painted `background-color: currentColor`, its `color` set by one of eight allow-listed classes (`.railN` … `.railKo`, looked up with `Object.hasOwn`, and `.railNeutral` for a `null` or unknown code), so no response string reaches `style` (ADR 0008 D-1). Beside it sit the leg's `LinePill`, the train type, `<destination>行` and `Nkm` joined by ` · ` (missing parts skipped), and, when `carPosition` is set, a bordered `乗車位置` callout with the position (`3・6号車`, `前／1号車`, `後方`) on the `md` rung.

The server emits at least one leg per candidate (`parseCandidate()` in `src/parse.mjs`); a candidate that arrived with none would draw its lone stop as a terminal row in the same list, with no times and no rail.

Phosphor icon dimensions are passed as the component's `size` prop, never as CSS `font-size` — including `StatusIndicator`'s `Circle` dot (`size={6}`), whose `.icon*` classes carry colour and motion only. Icon glyph sizes therefore sit outside the type scale by construction (they are not text), which is what lets §7's call-site-hygiene check forbid raw `px` font sizes outright.

### Design Token Generation (build time)

The frontmatter of [`frontend/DESIGN.md`](../frontend/DESIGN.md) is the source of truth for every export-modelable design token. `npm run export:design` (in `frontend/`) runs `node scripts/export-design.mjs`, which:

1. Executes the pinned local bin `frontend/node_modules/.bin/design.md` as `design.md export --format css-tailwind DESIGN.md`.
2. Rewrites every `@theme {` block the exporter emits into `:root {` — this project does not use Tailwind, and a browser ignores `@theme`, so the custom properties inside it would never register.
3. Fails closed: it throws instead of writing if no `:root {` block resulted, if an unconverted `@theme` remains, or if the output declares zero `--token:` properties.
4. Writes the result — prefixed with a `GENERATED FILE - DO NOT EDIT` header naming DESIGN.md as the source — to `frontend/src/design-tokens.css`, which carries `--color-*` (including the `--color-line-*` line colors), `--text-<level>` (`xs` … `3xl`), `--font-weight-*`, `--tracking-*`, `--radius-*`, and `--spacing-*`.

`frontend/src/index.css` `@import`s the generated file and then declares the hand-authored residue in a single `:root` block:

- **Alias layer** — maps generated names onto the names the existing `*.module.css` call sites use: `--bg-*` (including `--bg-inverted`, the selected-tab chip ground), `--border-*`, `--text-primary/secondary/tertiary/inverted`, `--accent-*` and `--line-*` (from `--color-*`), `--font-size-*` (from `--text-<level>`, which would otherwise collide with the `--text-*` color family), and `--space-*` (from `--spacing-*`). `--radius-sm/md/lg` need no alias — the export already emits those exact names.
- **Residue proper** — the tokens `@google/design.md` cannot model, which are their own source of truth: the multi-family font stacks `--font-sans` (Latin → CJK → generic, all OS-bundled faces; no webfont is loaded) / `--font-mono`, and the transition `--transition-fast`.

Translucent colors *are* export-modelable: the exporter passes 8-digit hex (`#rrggbbaa`) through and normalizes `rgba()` into it, so the error-banner tints (`--accent-red-tint` / `--accent-red-tint-border`) and the stale-pill tints (`--accent-amber-tint` / `--accent-amber-tint-border`) live in the frontmatter like any other color. The `design.md` contrast lint is not alpha-aware, though, so those tints are modeled as `textColor`-less surface components and their real (composited) contrast is pinned in Vitest instead.

`npm run lint:design` (`design.md lint DESIGN.md`) lints the source document.

## 6. External Integrations

### Jorudan

The upstream Japanese transit search at `www.jorudan.co.jp` (with the UUID handshake on `jid.jorudan.co.jp`). It publishes no API and gates results behind the bot-check handshake detailed in §5.

### `@google/design.md` (build-time tool)

`@google/design.md` is an exact-pinned devDependency of `frontend/` (`"0.3.0"`, no range). It is invoked only through its local bin — the export script resolves `frontend/node_modules/.bin/design.md` by absolute path rather than an unpinned `npx` lookup — and only for two commands: `export --format css-tailwind DESIGN.md` (token generation, §5) and `lint DESIGN.md` (`npm run lint:design`). It is a build/author-time dependency: nothing from it ships in the browser bundle, and the generated stylesheet contains no `@import` or remote `url(...)` reference.

### Production Deploy Constraint

CloudFront's flat-rate pricing plan requires the distribution to keep an attached AWS WAF Web ACL at all times. The Web ACL ARN lives in the `WEB_ACL_ARN_PROD` GitHub Actions secret on the `production` environment, and the `Deploy to Production` workflow injects it via `--parameter-overrides`. The Web ACL itself is **not** managed by this stack — it was created by the pricing-plan opt-in. See [`CLAUDE.md`](../CLAUDE.md#how--development-workflow) for the operational procedure.

### CI/CD Deploy Role IAM Policy

The `Deploy to Production` workflow assumes the OIDC role `gh-actions-deploy-prod` (`arn:aws:iam::<ACCT>:role/gh-actions-deploy-prod`). The role's permissions are a least-privilege custom policy — `gh-actions-deploy-prod-leastpriv` — scoped to exactly what `sam deploy` of [`template.yml`](../template.yml) plus the post-deploy steps in [`deploy-production.yml`](../.github/workflows/deploy-production.yml) require. No `*FullAccess` AWS managed policy (and in particular no `IAMFullAccess` / `iam:*`) is attached.

#### What the workflow touches

| Service | Why | Scope |
|---------|-----|-------|
| CloudFormation | Drift detect, change set create/execute, stack + output reads | `stack/transitmikanmarusan/*`; read-only on `stack/aws-sam-cli-managed-default/*` (so `--resolve-s3` can discover the artifact bucket) |
| S3 | `--resolve-s3` artifact upload + `aws s3 sync` of the frontend bundle | SAM managed bucket `<SAM_ARTIFACT_BUCKET>` and frontend bucket `<FRONTEND_BUCKET>` |
| Lambda | Function create/update/permission/tag during the change set | `function:transitmikanmarusan-*` |
| API Gateway | REST API + stage + deployment managed by the change set | `/restapis`, `/restapis/*`, and `/tags/*` |
| CloudFront | `GetDistributionConfig`, `UpdateDistribution`, OAC reads, `CreateInvalidation` | distribution `<CF_DISTRIBUTION_ID>` and OAC `<OAC_ID>` |
| IAM | Lambda execution role lifecycle (`CAPABILITY_IAM`) + `PassRole` to Lambda | `role/transitmikanmarusan-*`; `PassRole` further gated by `iam:PassedToService = lambda.amazonaws.com` |

#### Policy JSON

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationDeployStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:SetStackPolicy",
        "cloudformation:DetectStackDrift",
        "cloudformation:DetectStackResourceDrift",
        "cloudformation:TagResource",
        "cloudformation:UntagResource",
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:<ACCT>:stack/transitmikanmarusan/*"
    },
    {
      "Sid": "CloudFormationSamManagedStackRead",
      "Effect": "Allow",
      "Action": [
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:<ACCT>:stack/aws-sam-cli-managed-default/*"
    },
    {
      "Sid": "CloudFormationGlobalReads",
      "Effect": "Allow",
      "Action": [
        "cloudformation:ValidateTemplate",
        "cloudformation:ListStacks",
        "cloudformation:DescribeStackDriftDetectionStatus",
        "cloudformation:GetTemplateSummary"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFormationServerlessTransform",
      "Effect": "Allow",
      "Action": "cloudformation:CreateChangeSet",
      "Resource": "arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31"
    },
    {
      "Sid": "S3BucketLevel",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucket*",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetReplicationConfiguration",
        "s3:GetAccelerateConfiguration",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketTagging",
        "s3:PutBucketVersioning",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock"
      ],
      "Resource": [
        "arn:aws:s3:::<SAM_ARTIFACT_BUCKET>",
        "arn:aws:s3:::<FRONTEND_BUCKET>"
      ]
    },
    {
      "Sid": "S3ObjectLevel",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectTagging",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:PutObjectTagging",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::<SAM_ARTIFACT_BUCKET>/*",
        "arn:aws:s3:::<FRONTEND_BUCKET>/*"
      ]
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:PublishVersion",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:PutFunctionEventInvokeConfig",
        "lambda:UpdateFunctionEventInvokeConfig",
        "lambda:DeleteFunctionEventInvokeConfig",
        "lambda:Get*",
        "lambda:List*"
      ],
      "Resource": "arn:aws:lambda:ap-northeast-1:<ACCT>:function:transitmikanmarusan-*"
    },
    {
      "Sid": "ApiGateway",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": [
        "arn:aws:apigateway:ap-northeast-1::/restapis",
        "arn:aws:apigateway:ap-northeast-1::/restapis/*",
        "arn:aws:apigateway:ap-northeast-1::/tags/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetOriginAccessControlConfig",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": [
        "arn:aws:cloudfront::<ACCT>:distribution/<CF_DISTRIBUTION_ID>",
        "arn:aws:cloudfront::<ACCT>:origin-access-control/<OAC_ID>"
      ]
    },
    {
      "Sid": "IamRoleLifecycle",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:ListRoleTags",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": "arn:aws:iam::<ACCT>:role/transitmikanmarusan-*"
    },
    {
      "Sid": "IamPassRoleToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCT>:role/transitmikanmarusan-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

#### Notes on scoping decisions

- **Account-wide reads are unavoidable for four CloudFormation actions.** `ValidateTemplate`, `ListStacks`, `DescribeStackDriftDetectionStatus`, and `GetTemplateSummary` do not support resource-level permissions, so they sit in their own `Resource: "*"` statement. They are read/validate-only and carry no write blast radius.
- **No `logs:*` is granted.** The template puts `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents` inside the Lambda execution role's inline policy (created via `iam:PutRolePolicy`), so the deploy role itself needs no CloudWatch Logs permissions. This omission is deliberate but load-bearing: if an explicit `AWS::Logs::LogGroup` resource is ever added to the template (e.g. to set log retention), grant the deploy role `logs:CreateLogGroup` / `DeleteLogGroup` / `PutRetentionPolicy` / `TagResource` scoped to `log-group:/aws/lambda/transitmikanmarusan-*`.
- **`cloudformation:DeleteStack` is intentionally excluded.** The workflow only ever updates the existing stack via change sets, so a deploy-only role has no reason to delete the production stack; re-grant it temporarily only for an intentional teardown.
- **`--resolve-s3` reads the SAM managed stack.** SAM discovers the artifact bucket by describing the `aws-sam-cli-managed-default` CloudFormation stack, hence the read-only second statement. Bucket *creation* is not granted because the bucket already exists; if it is ever deleted, temporarily widen S3/CloudFormation create permissions to re-bootstrap it.
- **The SAM transform needs its own `CreateChangeSet` grant.** Because `template.yml` uses `Transform: AWS::Serverless-2016-10-31`, CloudFormation evaluates the macro during change-set creation and authorizes `cloudformation:CreateChangeSet` against the transform ARN `arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31` (an AWS-owned resource), separately from the stack ARN. The `CloudFormationServerlessTransform` statement covers exactly that ARN.
- **`DetectStackDrift` also requires `DetectStackResourceDrift`.** The async drift API fans out to a per-resource `cloudformation:DetectStackResourceDrift` call, so both actions are granted on the stack ARN.
- **API Gateway is scoped by path, not by REST API id.** `apigateway:*` resource ARNs are path-based; pinning `/restapis/<REST_API_ID>` would break the deploy if CloudFormation ever replaces the REST API. `/restapis/*` keeps the deploy resilient while still excluding every other AWS service.
- **CloudFront resource-level scoping.** The distribution and OAC are pinned by id. Distribution/OAC *replacement* (which needs account-level `cloudfront:CreateDistribution` / `CreateOriginAccessControl`) is intentionally excluded as least-privilege; grant it temporarily only if a future change forces a replace.
- **`iam:PassRole` is gated by `iam:PassedToService`.** Even within `role/transitmikanmarusan-*`, the role can only be passed to Lambda, closing the pass-role-to-arbitrary-service escalation path.

#### Applying and verifying

This policy is the documented target. Apply and verify it against the live role with the following sequence (the `dry-run` path must pass before detaching the managed policies, per the rollback risk noted in #52):

```bash
ACCOUNT=<ACCT>
ROLE=gh-actions-deploy-prod

# 1. Create the customer-managed policy from the JSON above (saved locally as policy.json).
#    If the policy already exists (re-runs), instead publish a new default version:
#    aws iam create-policy-version --set-as-default \
#      --policy-arn "arn:aws:iam::${ACCOUNT}:policy/gh-actions-deploy-prod-leastpriv" \
#      --policy-document file://policy.json
aws iam create-policy \
  --policy-name gh-actions-deploy-prod-leastpriv \
  --policy-document file://policy.json

# 2. Attach it alongside the existing managed policies (do NOT detach yet).
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn "arn:aws:iam::${ACCOUNT}:policy/gh-actions-deploy-prod-leastpriv"

# 3. Verify end-to-end via the GitHub Actions "Deploy to Production" workflow:
#    dry-run=true first, then dry-run=false. Both must succeed (sam deploy,
#    S3 sync, CloudFront invalidation, and both health checks including the
#    strict-transport-security / x-content-type-options / x-frame-options headers).

# 4. Only once both runs are green, detach the six *FullAccess managed policies:
for p in AmazonAPIGatewayAdministrator CloudFrontFullAccess IAMFullAccess \
         AmazonS3FullAccess AWSCloudFormationFullAccess AWSLambda_FullAccess; do
  aws iam detach-role-policy --role-name "$ROLE" \
    --policy-arn "arn:aws:iam::aws:policy/${p}"
done

# 5. Re-run dry-run=false once more to confirm the scoped policy alone is sufficient.
```

If any step fails with an `AccessDenied`, read the denied action/resource from the error, widen the matching statement minimally, and re-run — rather than re-attaching the broad managed policies. Keep the six managed policies attached until step 5 is green so a mid-deploy denial cannot leave the stack in `UPDATE_ROLLBACK_FAILED`.

## 7. Cross-cutting

### Guards

- **SSRF — `isAllowedUrl()`**: every hop's URL (and the plaintext `verify_uuid` body) is parsed with the WHATWG `URL` API and accepted only if it is `https:` and its exact `.hostname` is in the allowlist `{www.jorudan.co.jp, jid.jorudan.co.jp}` (with no embedded credentials). This rejects off-allowlist hosts, look-alike suffixes (`jorudan.co.jp.evil.com`), the bare apex, TLS downgrades (`http://169.254.169.254/...`), protocol-relative `//host`, and `data:`/`javascript:`/`file:`/`ftp:` schemes.
- **Cookies — Domain-attribute scoping**: a `CookieJar` (built on `Headers.getSetCookie()`) honours each `Set-Cookie` `Domain` — host-only when absent, shared only when `Domain=.jorudan.co.jp` — so no jid-scoped cookie leaks to `www` and vice versa.
- **Timeout budget**: each hop is capped at `PER_HOP_TIMEOUT_MS` (2.5s) and the whole per-origin chain at `OVERALL_BUDGET_MS` (7s), via `AbortSignal.timeout(min(perHop, remaining))`, keeping the 6-hop chain inside the Lambda `Timeout` (15s). The 3 origins run concurrently via `Promise.allSettled`, so one origin failing still returns the others (HTTP 200, the failed origin reported as `status: "error"` in `origins`); the handler returns 500 only when every origin is `error` (see §4 Data Model).
- **ReDoS**: `extractJsRedirect()` uses a non-backtracking negated character class (`[^'"]+`). `src/parse.mjs` and `src/lines.mjs` parse line by line, skip any line longer than 200 characters (and `describeLine()` refuses input over 120), and use only literal-anchored regexes with bounded quantifiers (`\d{1,3}`, `[^［］\n]{1,10}`, ` {2,80}`). `tests/parse.test.mjs` asserts adversarial inputs return within 250 ms at two scales: 100,000-character lines (which exercise the length cap) and worst-case lines that fit under the caps, repeated 500 times (which exercise the regexes themselves).

### Design Token Integrity

`frontend/tests/design-tokens.test.ts` (Vitest, run by `npm test` in `frontend/`) imports the same `buildTokensCss()` that `npm run export:design` writes with, so it exercises the real export path rather than a re-implementation. It asserts that:

- every `var(--token)` referenced anywhere under `frontend/src/**/*.css` resolves to a custom property declared at `:root` in either the generated file or `index.css`;
- no CSS file declares a custom property outside a `:root` block;
- the alias layer never redeclares a generated token name (a redeclaration would shadow the import and make `--x: var(--x)` a self-referential cycle);
- every `:root` declaration in `index.css` delegates through `var(--…)` except the three residue tokens (`--font-sans`, `--font-mono`, `--transition-fast`), and `index.css` still imports `./design-tokens.css`;
- the generated file keeps its `DO NOT EDIT` header, holds a plain `:root {` block with no `@theme`, and pulls in no external `@import` / remote font URL;
- the committed `design-tokens.css` is **byte-identical** to a fresh export (exact equality, catching hand-edits) and the export is idempotent;
- **no orphaned role token**: every token declared in `index.css`, and every generated token outside a small documented allowlist, has at least one `var()` call site — so a token with no role cannot be introduced (or left behind) silently. Spacing rungs are exempt: the 4px grid is a deliberately complete vocabulary, so an unused rung is a vacancy, not an orphan;
- **call-site hygiene**: `*.module.css` sizes text only from the `--font-size-*` scale (never a raw px), writes no raw `rgba()`/hex color, and no stylesheet loads a webfont (`@font-face` / CDN URL);
- **`--font-sans` carries a CJK face**, ordered Latin → CJK → generic;
- **WCAG AA contrast**: `--text-tertiary` clears 4.5:1 on `bg-primary`/`secondary`/`tertiary`, the error banner's text clears 4.5:1 against its *composited* translucent tint, and the empty-state text clears 4.5:1 on its elevated card. A negative control asserts the pre-ADR value (`#737373`) still fails, so the ratio maths cannot go vacuously green;
- **outdoor-legibility inverted chip (ADR 0004)**: reads the actual `.tabActive` declarations out of `App.module.css` and resolves them through the alias/generated pipeline — not just the token value, so repointing the chip back at `--bg-secondary` fails the test rather than passing vacuously — then asserts the selected chip fill clears 3:1 against the unselected-tab substrate (WCAG 1.4.11), its label clears 4.5:1 on the chip fill (WCAG 1.4.3), and the `--accent-blue` focus ring clears 3:1 against both the near-white chip and `--bg-primary`. A teeth test pins the old `#111111` fill at 1.05:1 (< 3:1) so the 3:1 checks cannot go vacuously green;
- **outdoor-legibility card outline (issue #96, ADR 0004)**: reads the actual `.card` / `.card:hover` declarations out of `TransitCard.module.css` and resolves them through the token pipeline — not just the token value, so repointing the card back at `--border-primary` fails the test rather than passing vacuously — then asserts the resting card outline (`--border-tertiary`) clears 2:1 against both the page ground and the card's own `--bg-elevated` fill (a **house** threshold matching Material 3's `outlineVariant` parity, explicitly not a WCAG boundary requirement), the hover outline (`--border-elevated`) is strictly brighter than the resting outline (no inverted ramp), and `--accent-blue` clears 4.5:1 on the elevated card fill (pinning the card ground at its AA ceiling). A teeth test pins the old `#262626` and `#333333` outlines below 2:1 against the page so the checks cannot go vacuously green;
- **next-departure keyline (issue #97, ADR 0004 D-3)**: reads the actual `.cardNext::before` declarations out of `TransitCard.module.css` — an explicit assertion fails when the rule is missing, so deleting the keyline fails the test rather than skipping it — then asserts the keyline fill clears 3:1 against the card's `--bg-elevated` fill (WCAG 1.4.11 non-text contrast), the width resolves to `4px` (a spacing token on the 4px grid, never off-scale px), and `pointer-events: none` is declared (the pseudo-element hit-tests to `.card`, so the strip would otherwise swallow header clicks). A companion test simulates a 20% ambient glare veil over both colors and asserts the veiled ratio falls *below* 4.5:1 — pinning ADR 0004's recorded limit that the keyline alone is not a text-grade outdoor carrier, so nobody can later claim it satisfies an outdoor contrast requirement without its redundant cues (default expansion + hidden label);
- **stale-data amber pill (issue #121, ADR 0008 D-3)**: reads the actual `.stale` declarations out of `StatusIndicator.module.css` and resolves them through the token pipeline — an absent rule or property throws, so deleting or repointing the pill fails the test — then asserts the amber text clears 4.5:1 (WCAG 1.4.3) both against the card fill (`.card`'s `--bg-elevated`) and against the pill's translucent `--accent-amber-tint` composited over the header ground (`.header`'s `--bg-primary`), and that the `更新` button's `.staleRefresh` text declares `color: inherit` so it stays under those amber contracts. A teeth test pins a darker amber (`#b45309`) below 4.5:1 on the card fill so the checks cannot go vacuously green;
- **line identity rings (issue #123, ADR 0008 D-3)**: the generated file declares exactly the eight `--color-line-*` tokens (`n`, `m`, `h`, `z`, `e`, `s`, `ko`, `neutral`); each clears 3:1 (WCAG 1.4.11) against the card fill read off `.card`; each `.line*` rule in `LinePill.module.css` resolves to its own line token, and `.nameNeutral` to `--line-neutral`. A teeth test pins the 都営大江戸線 brand hex `#b6007a` at 2.71:1 (< 3:1), the reason `--line-e` takes the on-dark `#cf3e96`;
- **route detail rails and badges (issue #124, ADR 0008 D-3)**: reads `RouteDetail.module.css` and asserts `.rail` declares `background-color: currentColor`, each `.rail*` class sets `color` to its own line token (`.railNeutral` to `--line-neutral`) at ≥ 3:1 against the detail's own `.container` fill (`--bg-tertiary`), and the `.badgeTight` amber text clears 4.5:1 over its `--accent-amber-tint` composited on that fill;
- **leave-by countdown badge (issue #123)**: the `.countdownGo` and `.countdownMissed` text clears 4.5:1 on the card fill, the `.countdownNow` amber text clears 4.5:1 over its `--accent-amber-tint` composited on the card fill, and `.departure` declares `var(--font-size-3xl)`. The generated `--font-weight-3xl` / `--tracking-3xl` are on the unreferenced-generated allowlist and `--font-size-3xl` on the font-size alias list;
- **`design.md lint` reports zero errors and zero warnings** — this runs the pinned local bin from the test suite, so the frontmatter's lint cleanliness is enforced by `npm test` (which CI runs) rather than only by hand.

### Frontend Accessibility & Responsive Conventions

Rules that hold across the frontend's stylesheets, not just one component:

- **Touch targets — 44×44 minimum.** The visible box and the hit area may differ. `.refreshButton` keeps its 32×32 painted box and grows *only* its hit area, through a transparent, centred `::after` of 44×44 (the button is `position: relative`); a pseudo-element takes no outline, so `:focus-visible` still traces the button's own 32×32 border box rather than the expanded hit area. The stale pill's `更新` button uses the same `::after` idiom. Origin tabs take the other route and grow the visible control: `inline-flex` (stacked as a column for the summary line) + `min-width`/`min-height: 44px`; the error banner's `再試行` button likewise declares `min-width`/`min-height: 44px`. `.tab` must also declare `flex: 0 0 auto`, because `min-width: 44px` *replaces* a flex item's default `min-width: auto` (its content-width floor) — without it a crowded strip would squeeze every tab to 44px and spill its `nowrap` label over its neighbours instead of letting `.tabs { overflow-x: auto }` scroll. `.routeHeader`'s `gap` is load-bearing for the same reason: the refresh button's hit area overhangs its visual box by 6px per side, so the gap must stay ≥ `--space-2` or it would swallow clicks aimed at the last tab.
- **Reduced motion.** Under `@media (prefers-reduced-motion: reduce)`, the `spin` animation on `.spinner` (`App.module.css`, used by both the loading branch and the in-flight refresh button) becomes `animation: none`, and `StatusIndicator`'s `pulse` dot becomes `animation: none; opacity: 1` — pinned opaque rather than frozen at the keyframe's `0.3`. Both animations are decorative; the adjacent label and `aria-busy` still carry the state.
- **CJK typography.** Japanese labels — `.tab`, `.station` and `.contextNote` in `App.module.css`, `.station` / `.stationIntermediate` / `.legMeta` / `.carLabel` / `.carValue` / `.badge` in `RouteDetail.module.css`, `.duration` / `.countdown` / `.badge` in `TransitCard.module.css`, `.name` in `LinePill.module.css` — declare `line-height: 1.6` (overriding the `1.5` base), `word-break: normal`, and `line-break: strict`, and take no `letter-spacing` (tracking stays Latin/numeral-only). No stylesheet declares `word-break: break-word`, so a station or line name never breaks mid-glyph.
- **A single breakpoint.** The only dimensional media query in the frontend is `@media (max-width: 480px)` in `frontend/src/components/TransitCard.module.css` (a tighter card header gap and the arrival time one rung larger); every other component is fluid. `prefers-reduced-motion` is not a dimensional media feature, so it is outside this convention.

### Frontend E2E Suite

`frontend/tests/e2e/transit.spec.ts` runs under Playwright (`npm run test:e2e` in `frontend/`; `@playwright/test` is a devDependency). `frontend/playwright.config.ts` targets chromium + Pixel 5 and starts `npm run dev` on `http://localhost:3000` as its `webServer`. Every test stubs `/api/status` and `/api/transit` at the network layer with `page.route`, so the suite runs against the Vite dev server alone — no Lambda, no Jorudan, no docker-compose — and each state (populated / empty / error / error over last-known data / stale / in-flight) is a fixture — every fixture is a structured `origins` payload — rather than whatever the scraper happens to return. It pins:

- the header, status indicator (the dot's hidden `サーバー接続: 正常` label, an `N秒前に更新` timestamp, and no `Connected` text), refresh button, cards, and footer chrome, plus `aria-selected` flipping when a tab is clicked;
- the station tabs under `timezoneId: 'Asia/Tokyo'` and a pinned `page.clock`: a `出発駅` tablist with no `aria-pressed`, auto-selection of a `fastestOrigin` that is not the first tab, the roving tabindex, the `HH:MM着` + `最速` / `+N分` / `取得できず` / `便なし` summaries, the `tabpanel` labelled by the selected tab with its context line, arrow-key / Home / End navigation moving selection and focus, a ≥ 44×44 hit area on every tab, `document.title` following the active origin, and a manual pick held through a failed refresh and released by the next successful one;
- that a refresh failing after a successful load keeps the cards visible under the `role="alert"` banner, which carries `サーバーに接続できません`, a `表示中は HH:MM 時点のデータです` line and a `再試行` button with a ≥ 44×44 hit area, and never the raw `HTTP error` string;
- the stale pill under a fake clock (`page.clock`): an `N秒前に更新` timestamp after load, `3分前のデータ` after fast-forwarding 3 min 1 s, a ≥ 44×44 hit area on its `更新` button, and that clicking `更新` re-requests `/api/transit` and returns the indicator to `N秒前に更新`;
- the empty state (`Tray` glyph, no error banner, no cards) and the live region: exactly one `[aria-live="polite"]` node, containing no cards, and — while cards are showing — computing a `display` other than `none` at a `0`-height box;
- the 44×44 hit areas, measured by probing `document.elementFromPoint` outwards from each control's centre (`boundingBox()` cannot see the `::after`), plus that a crowded tab strip scrolls rather than clipping its labels;
- `animation-name: none` for the spinner and the pulse dot under an emulated `reducedMotion: 'reduce'`, and that both animate when no preference is set;
- the computed CJK values (`line-break`, line-height ratio, `letter-spacing`, `word-break`) on the tab, a station label and, in the expanded structured route, the line name, leg meta, boarding position and transfer badge;
- the expanded structured route (issue #124): the first leg's rail computes the `--line-n` colour (`rgb(0, 172, 155)`) and spans its leg row's full height, and the boarding position `3・6号車` is visible;
- the redesigned card under `timezoneId: 'Asia/Tokyo'` and a `page.clock` started at 18:40:30: the departure at a computed 28px, `19:38着`, `49分 · 乗換1回`, `最速` / `乗換少` on the flagged card and no `最速` on the other; the countdown reading `あと4分で出る` in green, `今すぐ出発` in amber after 3 min 30 s, and `間に合いません` in `--text-tertiary` 2 min later with both cards still listed in order; and, on the collapsed card, the `N` / `Z` circles with their `--line-n` / `--line-z` ring colors on a near-white fill and no `style` attribute;
- the computed accent/surface colors of the arrival time, the error banner, and the empty card, plus the card's elevated `--bg-elevated` fill (`rgb(26, 26, 26)`) and `--border-tertiary` outdoor-legibility outline (`rgb(102, 102, 102)`);
- that the selected origin tab stays a near-white inverted chip (`rgb(250, 250, 250)`, `--bg-inverted`) even while hovered — reading the settled colour after the 100ms transition — which guards the `.tab:hover:not(.tabActive)` specificity fix (ADR 0004).

CI (`.github/workflows/ci.yml`) runs `npm test` (Vitest) for both packages but **does not run Playwright** — the E2E suite is a local gate.

### Observability

The handler emits structured JSON logs to CloudWatch so each step of the cookie flow (initial fetch, cookie set, final fetch, parse outcome) is queryable. Every origin whose `origins[].status` is not `ok` emits one `level: "warn"` `Partial origin fetch failure` line carrying `origin`, `status`, and `errorMessage` (the rejection message, or a fixed reason for an unparseable or route-less page).

## 8. Glossary

- **`jrd_uuid`** — the sole gating cookie, set by `verify_uuid` with `Domain=.jorudan.co.jp` (shared across subdomains). Once present, the final `nori.cgi` renders the results HTML directly.
- **`jrd_cuid`** — the jid-host-only cookie set by `set_uuid` with `Domain=jid.jorudan.co.jp` and a short `max-age`; not sent to `www`.
- **`nori.cgi`** — Jorudan's transit search/results endpoint on `www.jorudan.co.jp`.
- **`jid.jorudan.co.jp`** — the separate subdomain that hosts the `jrd_uuid` UUID-cookie handshake (`set_uuid.cgi`, `verify_uuid.cgi`).
- **`TARGET_BLOCK_INDEX`** — index `2`, the HTML block (between `<hr>` separators) that contains all candidate transit routes.
- **`MAX_CANDIDATES`** — the maximum number of structured candidates per origin in `origins` (`3`).
- **`lineCode`** — a leg's line identity from the closed set `N` (南北線), `M` (丸ノ内線), `H` (日比谷線), `Z` (半蔵門線), `E` (都営大江戸線), `S` (都営新宿線), `KO` (京王線 / 京王新線), or `null` (ADR 0008 D-1).
- **WAF Web ACL** — the AWS WAF resource that must stay attached to the CloudFront distribution under its flat-rate pricing plan; ARN held in `WEB_ACL_ARN_PROD`.
- **OAC** — CloudFront Origin Access Control, fronting the S3 origin.
- **`gh-actions-deploy-prod`** — the GitHub OIDC IAM role assumed by the `Deploy to Production` workflow; backed by the least-privilege `gh-actions-deploy-prod-leastpriv` policy.
- **DESIGN.md** — `frontend/DESIGN.md`; its YAML frontmatter is the source of truth for the export-modelable design tokens.
- **`design-tokens.css`** — `frontend/src/design-tokens.css`, generated from the DESIGN.md frontmatter by `npm run export:design`. Never hand-edited.
- **Residue layer** — the hand-authored `:root` block in `frontend/src/index.css`: aliases from the generated token names onto the names call sites use, plus the tokens the exporter cannot model (font stacks, transitions).
- **SSRF** — Server-Side Request Forgery; mitigated by `isAllowedUrl()`.
- **ReDoS** — Regular-expression Denial of Service; mitigated by length caps and non-backtracking, bounded-quantifier patterns.
