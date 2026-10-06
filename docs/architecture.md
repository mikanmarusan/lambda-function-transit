# lambda-function-transit - Architecture Spec
<!-- spec-synced-through: aa04709be858a9d6fa2e5eb834bf0f07cb494967 -->

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
| `handler(event, context)` | Entry point; normalizes the request path, orchestrates the cookie flow across origins, parses the results HTML, and returns the JSON response (legacy `routes` plus the structured `origins` field) | `src/index.mjs` |
| `buildOriginResult()` | Builds one `origins[]` entry: classifies the origin as `ok` / `no_candidates` / `error`, parses its route blocks and ranks the candidates | `src/index.mjs` |
| `parseCandidate()` | Parses one route block line by line into a structured candidate (summary, `stops[]`, `legs[]`) with ISO 8601 JST timestamps and midnight-crossing resolution | `src/parse.mjs` |
| `rankCandidates()` / `pickFastestOrigin()` | Sort an origin's candidates by arrival, keep `MAX_CANDIDATES` (3), set `isFastest` / `isFewestTransfers`; name the origin whose best candidate arrives first | `src/parse.mjs` |
| `describeLine()` / `lineCodeFor()` | Split a Jorudan line string into line name, train type, via and destination, and map the line name to a `lineCode` from the closed set of ADR 0008 D-1 | `src/lines.mjs` |
| `buildSearchUrl()` / `buildDepartureParams()` | Build each origin's `nori.cgi` search URL per request, appending the JST departure date/time (`Dym`/`Ddd`/`Dhh`/`Dmn`) for "now + that origin's `walkMinutes`" (see §5 Jorudan Search Request) | `src/index.mjs` |
| `performBotHandshake()` | Emulates the browser bot-check flow for each origin, with one `CookieJar` and one overall timeout budget per call | `src/index.mjs` |
| `extractJsRedirect()` | Reads the (single- or double-quoted) `window.location.href` from the JS redirect stub, using a non-backtracking negated character class | `src/index.mjs` |
| `splitRoutes()` | Splits the target HTML block on the `(?=発着時間：)` lookahead to separate individual route candidates | `src/index.mjs` |
| `isAllowedUrl()` | SSRF allowlist guard applied to every hop URL and the plaintext `verify_uuid` body | `src/index.mjs` |
| `escapeRegExp()` | Escapes dynamic substrings used inside route-parsing regular expressions to prevent ReDoS | `src/index.mjs` |
| `CookieJar` | Domain-attribute–honouring cookie store built on `Headers.getSetCookie()` | `src/index.mjs` |
| Local dev server | Serves the unprefixed `/transit` and `/status` paths for local development | `src/dev-server.mjs` |
| `isValidStructuredTransit()` | Validates the structured `origins` / `generatedAt` / `destination` / `fastestOrigin` fields against `STRUCTURED_LIMITS` (≤ 10 origins, ≤ 10 candidates, ≤ 20 stops — legs bounded through `stops.length === legs.length + 1` — strings ≤ 100 chars, ISO 8601 `+09:00` timestamps) and the `LINE_CODES` allow-list; `useTransit()` drops a payload that fails it (empty `origins`, `null` fields) while still returning the legacy `routes` | `frontend/src/types/transit.ts`, `frontend/src/hooks/useTransit.ts` |
| `useNow()` | One app-wide clock: a single `setInterval` (`NOW_TICK_MS`, 1 s) shared by every subscriber via `useSyncExternalStore`, cleared when the last subscriber unmounts and re-sampled on `visibilitychange` to visible, so no component calls `Date.now()` during render | `frontend/src/hooks/useNow.ts` |
| `minutesUntilLeave()` / `relativeTimeLabel()` | Whole minutes before the rider must leave (`departureAt − walkMinutes − now`, floored; `0` = leave now, negative = missed) and the `N秒前` / `N分前` label; both take absolute instants, so results do not depend on the runtime time zone | `frontend/src/lib/time.ts` |
| `deriveNextIndex()` | Derives the index of the earliest departure from the parsed `departureTime`s — never from card position — or `null` to mark nothing (see §5 Frontend Render Branches) | `frontend/src/App.tsx` |
| Design token source | YAML frontmatter holding every export-modelable token (colors, typography scale, radii, spacing) | `frontend/DESIGN.md` |
| `buildTokensCss()` | Runs the pinned local `design.md` bin, rewrites the exporter's Tailwind `@theme {` block into `:root {`, and fails closed rather than writing empty or untransformed output | `frontend/scripts/export-design.mjs` |
| Generated token stylesheet | The `:root` custom properties exported from the DESIGN.md frontmatter. **Generated — never hand-edited** | `frontend/src/design-tokens.css` |
| Global stylesheet | Imports the generated tokens, then declares the hand-authored residue (aliases + non-modelable tokens) and the reset/base/focus/scrollbar rules | `frontend/src/index.css` |
| Token pipeline test | Vitest suite guarding token integrity and generated-file drift (see §7) | `frontend/tests/design-tokens.test.ts` |
| App render-branch test | Vitest + Testing Library suite pinning the four content branches, the next-departure marker (earliest-not-first selection, its guards, the accessible text equivalent, identity-keyed expansion), their ARIA roles, and the accessibility affordances (`aria-live` wrapper, `aria-busy`, `aria-pressed`) (see §5); mocks `useTransit`/`useApiStatus` so each branch — including the pre-fetch instant — is driven rather than raced. `frontend/tsconfig.json` includes `tests/*.tsx` so it is typechecked | `frontend/tests/App.test.tsx` |
| Frontend E2E suite | Playwright suite that stubs the API with `page.route` and pins the rendered accessibility / touch-target / motion / typography contract in a real browser (see §7) | `frontend/tests/e2e/transit.spec.ts`, `frontend/playwright.config.ts` |

The SAM function is a Zip package of `./src` (`CodeUri`), so every backend module ships with it. The `production` stage of the root `Dockerfile` (the `api-prod` container) instead copies `src/index.mjs`, `src/parse.mjs`, and `src/lines.mjs` by name, so a new backend module must be added to that `COPY` line.

## 4. Data Model

`GET /transit` or `GET /api/transit` (HTTP 200):

```json
{
  "routes": [
    {
      "origin": "六本木一丁目",
      "destination": "つつじヶ丘（東京）",
      "transfers": [
        ["20:45発 → 21:24着(39分)(2回)", "■六本木一丁目\n｜［地下鉄］東京メトロ南北線(浦和美園行)   3.1km   3・6号車\n◇四ッ谷 ...\n■つつじヶ丘（東京）    1・2番線着"]
      ]
    }
  ],
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
| `routes` | **Legacy** (ADR 0006 D-3): unchanged shape; only origins whose legacy parse produced a transfer are listed; up to `LEGACY_MAX_CANDIDATES` (2) `[summary, route]` string tuples per origin, in Jorudan's order. Removed in a later release once the frontend reads `origins`. |
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

The handler returns HTTP 500 `{ "error": "Failed to fetch transit information" }` only when every origin is `error` **and** the legacy path produced no `routes` entry, so the stricter structured parse alone never turns a response the legacy field could serve into a 500. An origin with `no_candidates` is not a failure: when no origin is `ok`, the response is still 200 with `fastestOrigin: null` (and `routes: []` when every origin is `no_candidates`).

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
- **Legacy `routes`**: keeps the first `LEGACY_MAX_CANDIDATES` (`2`) blocks in Jorudan's order as `[getSummary(), getRoute()]` string tuples.
- **Structured `origins`**: `parseCandidate()` (`src/parse.mjs`) reads every block line by line — `発着時間：HH:MM発 → HH:MM着` (any of the four summary/leg times may be parenthesised, as Jorudan prints walking times `(HH:MM)`), `所要時間：[H時間]M分`, `乗換回数：N回`, `■`/`◇` stop lines, and the `｜` rows under each stop: a line row starts a leg, the following `HH:MM-HH:MM［N分］` row gives its times, and fare (`178円`), arrow (`↓`) and empty rows are skipped. A block is dropped (fail closed) when a summary field is missing, a leg has no time row or no line name, a time is out of range (hour > 23 or minute > 59), `stops.length !== legs.length + 1`, or the resolved arrival minus departure differs from `所要時間` (so a summary arrival earlier than the last leg is never rolled to the next day). `rankCandidates()` then sorts the survivors by arrival and keeps `MAX_CANDIDATES` (`3`).
- **Dates**: every `HH:MM` is resolved against the origin's `searchedFrom`. The departure is on the search day unless it is more than 12 hours earlier than the search time (then it is the next day, e.g. search 23:55, departure 00:01). Each later time that is earlier than the previous one is the next day, so a leg `23:58-00:05` arrives at `…T00:05:00+09:00` on the following date. JST is a fixed UTC+9 offset (no DST).

Dynamic substrings used inside regular expressions are escaped via `escapeRegExp()` to prevent ReDoS. The structured parser follows the ReDoS rules in §7 Guards.

### Frontend Render Branches

`frontend/src/App.tsx` renders the fetched routes through four content branches, each keyed off the `useTransit()` state (`originRoutes`, `loading`, `error`, `lastUpdated`). The hook also returns the validated structured fields `origins`, `generatedAt` and `fastestOrigin` (issue #120); no component reads them yet. The three *status* branches are wrapped in a single, unconditionally mounted `<div aria-live="polite">`; the cards render as a sibling **outside** that region:

| Branch | Condition | Rendered | Live region |
| --- | --- | --- | --- |
| Error | `error` | Error banner `Failed to load transit information`, `role="alert"` | inside |
| Loading | `!error && activeRoutes.length === 0 && loading` | `Spinner` + `Loading transit information...` | inside |
| Empty | `!error && !loading && lastUpdated && activeRoutes.length === 0` | Empty-state card: `Tray` glyph (`--text-tertiary`, never the error red) + `No departures found`, `role="status"` | inside |
| Cards | `!error && activeRoutes.length > 0` | `TransitCard` per route | outside |

The status branches are condition-mounted, so the live region must be a container that outlives them — a role on the branch node itself is announced only by some assistive tech. When no status branch is active the wrapper stays in the DOM as an **empty, zero-height box**: it is never `display: none`, which would prune it from the accessibility tree and leave it no better than a conditionally mounted region. Its parent `.content` therefore declares no `gap` — the wrapper and the cards are mutually exclusive, so a gap could only reserve a phantom row above the cards. The cards sit outside the region deliberately: inside it, every tab switch would re-announce the whole timetable.

The empty state is gated on `lastUpdated` (set only by a completed fetch), not merely on `!loading`: `useTransit` starts with `loading === false`, so without the guard the first paint — before the fetch effect runs — would satisfy `!loading && routes.length === 0` and flash the empty card on every visit.

#### Next-Departure Marker (issue #97, ADR 0004 D-3)

The cards branch marks the **next departure** — the card with the earliest parsed `departureTime` — with a 4px `--accent-blue` keyline on the card's left edge. The marked card is **derived from the data, never inferred from card position**: the backend slices Jorudan's candidate blocks with no sort, and Jorudan ranks by route quality, so index 0 does not mean "soonest". `deriveNextIndex()` in `App.tsx` maps the active routes through `parseSummary().departureTime`, converts each strict `HH:MM` to minutes since midnight, and returns the index of the minimum — or `null` (mark nothing) under three guards:

- any `--:--` (the `parseSummary` fallback for a failed time parse) marks nothing — a string compare would sort `--:--` before every digit and falsely win;
- a spread over 6 hours (> 360 minutes) suggests a midnight wrap (`23:58` vs `00:12`), where marking either card would be a guess — mark nothing;
- a tie marks the first occurrence.

`TransitCard` receives the result as an `isNext` prop (replacing the former `index` prop). The keyline is a `position: absolute` `::before` on the `.cardNext` modifier in `TransitCard.module.css` — not a left border, which the `--radius-lg` corner would miter into a wedge and which would shift the card's content 4px right and break the vertical alignment of the two cards' departure times, and not a shadow, which DESIGN.md bans. It declares `width: var(--space-1)` (4px), `background-color: var(--accent-blue)`, and a load-bearing `pointer-events: none`: a pseudo-element hit-tests to `.card`, so without it the strip would swallow clicks aimed at the `.header` disclosure button. The marker is modeled in the DESIGN.md frontmatter as the component entry `components.card-marker-next` (`accent-blue` fill, `spacing.1` width). Because a pseudo-element is invisible to assistive tech, the marked card's header button also renders a `visually-hidden` `Next departure ` span (the global `index.css` utility) as the marker's accessible text equivalent. Under a ~20% outdoor glare veil the blue compresses to roughly 1.92:1, so the keyline is deliberately **not the sole carrier** — default expansion and the hidden label are its redundant cues (ADR 0004's honest limit).

Default expansion follows the marker, not position: `TransitCard` initializes `useState(isNext)` (formerly `useState(index === 0)`), so the next departure opens expanded and the rest collapsed. Cards are keyed by the train's identity — `` `${activeOrigin}-${departureTime}-${index}` `` — not by index: React reuses component instances by key and `useState` initializers only run on mount, so a positional `key={index}` would leave a stale card expanded (split from the marker) after a tab switch or refresh. The `index` tiebreaker only disambiguates two candidates sharing a departure time (duplicate keys); the origin + time prefix is what forces the remount.

The controls expose their own state: each origin tab carries `aria-pressed` (`origin === activeOrigin`), and the refresh button carries `aria-busy={loading}` alongside its `aria-label="Refresh"` and `disabled={loading}`. `frontend/tests/App.test.tsx` pins all four branches, that pre-fetch instant, the two ARIA roles, and the `aria-live` / `aria-busy` / `aria-pressed` attributes — plus the next-departure marker: earliest-not-first selection (the test that kills a regression back to `index === 0`), an exactly-one-marker invariant whenever cards render, the tie / parse-failure / midnight-wrap guards, no marker in the empty and error states, the visually-hidden text equivalent inside the marked header's accessible name, and identity-keyed expansion staying on the same train across a tab switch.

Phosphor icon dimensions are passed as the component's `size` prop, never as CSS `font-size` — including `StatusIndicator`'s `Circle` (`size={10}`) and `Warning` (`size={12}`), whose `.icon*` classes carry colour and motion only. Icon glyph sizes therefore sit outside the type scale by construction (they are not text), which is what lets §7's call-site-hygiene check forbid raw `px` font sizes outright.

### Design Token Generation (build time)

The frontmatter of [`frontend/DESIGN.md`](../frontend/DESIGN.md) is the source of truth for every export-modelable design token. `npm run export:design` (in `frontend/`) runs `node scripts/export-design.mjs`, which:

1. Executes the pinned local bin `frontend/node_modules/.bin/design.md` as `design.md export --format css-tailwind DESIGN.md`.
2. Rewrites every `@theme {` block the exporter emits into `:root {` — this project does not use Tailwind, and a browser ignores `@theme`, so the custom properties inside it would never register.
3. Fails closed: it throws instead of writing if no `:root {` block resulted, if an unconverted `@theme` remains, or if the output declares zero `--token:` properties.
4. Writes the result — prefixed with a `GENERATED FILE - DO NOT EDIT` header naming DESIGN.md as the source — to `frontend/src/design-tokens.css`, which carries `--color-*`, `--text-<level>`, `--font-weight-*`, `--tracking-*`, `--radius-*`, and `--spacing-*`.

`frontend/src/index.css` `@import`s the generated file and then declares the hand-authored residue in a single `:root` block:

- **Alias layer** — maps generated names onto the names the existing `*.module.css` call sites use: `--bg-*` (including `--bg-inverted`, the selected-tab chip ground), `--border-*`, `--text-primary/secondary/tertiary/inverted`, `--accent-*` (from `--color-*`), `--font-size-*` (from `--text-<level>`, which would otherwise collide with the `--text-*` color family), and `--space-*` (from `--spacing-*`). `--radius-sm/md/lg` need no alias — the export already emits those exact names.
- **Residue proper** — the tokens `@google/design.md` cannot model, which are their own source of truth: the multi-family font stacks `--font-sans` (Latin → CJK → generic, all OS-bundled faces; no webfont is loaded) / `--font-mono`, and the transition `--transition-fast`.

Translucent colors *are* export-modelable: the exporter passes 8-digit hex (`#rrggbbaa`) through and normalizes `rgba()` into it, so the error-banner tints (`--accent-red-tint` / `--accent-red-tint-border`) live in the frontmatter like any other color. The `design.md` contrast lint is not alpha-aware, though, so those tints are modeled as `textColor`-less surface components and their real (composited) contrast is pinned in Vitest instead.

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
- **Timeout budget**: each hop is capped at `PER_HOP_TIMEOUT_MS` (2.5s) and the whole per-origin chain at `OVERALL_BUDGET_MS` (7s), via `AbortSignal.timeout(min(perHop, remaining))`, keeping the 6-hop chain inside the Lambda `Timeout` (15s). The 3 origins run concurrently via `Promise.allSettled`, so one origin failing still returns the others (HTTP 200, the failed origin reported as `status: "error"` in `origins`); the handler returns 500 only when every origin is `error` and the legacy `routes` is empty (see §4 Data Model).
- **ReDoS**: `extractJsRedirect()` uses a non-backtracking negated character class (`[^'"]+`), and dynamic substrings used in route-parsing regexes are escaped via `escapeRegExp()`. `src/parse.mjs` and `src/lines.mjs` parse line by line, skip any line longer than 200 characters (and `describeLine()` refuses input over 120), and use only literal-anchored regexes with bounded quantifiers (`\d{1,3}`, `[^［］\n]{1,10}`, ` {2,80}`). `tests/parse.test.mjs` asserts adversarial inputs return within 250 ms at two scales: 100,000-character lines (which exercise the length cap) and worst-case lines that fit under the caps, repeated 500 times (which exercise the regexes themselves).

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
- **`design.md lint` reports zero errors and zero warnings** — this runs the pinned local bin from the test suite, so the frontmatter's lint cleanliness is enforced by `npm test` (which CI runs) rather than only by hand.

### Frontend Accessibility & Responsive Conventions

Rules that hold across the frontend's stylesheets, not just one component:

- **Touch targets — 44×44 minimum.** The visible box and the hit area may differ. `.refreshButton` keeps its 32×32 painted box and grows *only* its hit area, through a transparent, centred `::after` of 44×44 (the button is `position: relative`); a pseudo-element takes no outline, so `:focus-visible` still traces the button's own 32×32 border box rather than the expanded hit area. Origin tabs take the other route and grow the visible control: `inline-flex` + `min-width`/`min-height: 44px`. `.tab` must also declare `flex: 0 0 auto`, because `min-width: 44px` *replaces* a flex item's default `min-width: auto` (its content-width floor) — without it a crowded strip would squeeze every tab to 44px and spill its `nowrap` label over its neighbours instead of letting `.tabs { overflow-x: auto }` scroll. `.routeHeader`'s `gap` is load-bearing for the same reason: the refresh button's hit area overhangs its visual box by 6px per side, so the gap must stay ≥ `--space-2` or it would swallow clicks aimed at the last tab.
- **Reduced motion.** Under `@media (prefers-reduced-motion: reduce)`, the `spin` animation on `.spinner` (`App.module.css`, used by both the loading branch and the in-flight refresh button) becomes `animation: none`, and `StatusIndicator`'s `pulse` dot becomes `animation: none; opacity: 1` — pinned opaque rather than frozen at the keyframe's `0.3`. Both animations are decorative; the adjacent label and `aria-busy` still carry the state.
- **CJK typography.** Japanese labels — `.tab` and `.station` in `App.module.css`, `.station` / `.stationIntermediate` / `.lineName` in `RouteDetail.module.css` — declare `line-height: 1.6` (overriding the `1.5` base), `word-break: normal`, and `line-break: strict`, and take no `letter-spacing` (tracking stays Latin/numeral-only). `word-break: break-word` is confined to `.rawRoute`, the raw `<pre>` fallback, so a station or line name never breaks mid-glyph.
- **A single breakpoint.** The only dimensional media query in the frontend is `@media (max-width: 480px)` in `frontend/src/components/TransitCard.module.css` (the card's internal reflow); every other component is fluid. `prefers-reduced-motion` is not a dimensional media feature, so it is outside this convention.

### Frontend E2E Suite

`frontend/tests/e2e/transit.spec.ts` runs under Playwright (`npm run test:e2e` in `frontend/`; `@playwright/test` is a devDependency). `frontend/playwright.config.ts` targets chromium + Pixel 5 and starts `npm run dev` on `http://localhost:3000` as its `webServer`. Every test stubs `/api/status` and `/api/transit` at the network layer with `page.route`, so the suite runs against the Vite dev server alone — no Lambda, no Jorudan, no docker-compose — and each state (populated / empty / error / in-flight) is a fixture rather than whatever the scraper happens to return. It pins:

- the header, status indicator, refresh button, cards, and footer chrome, plus `aria-pressed` flipping when a tab is clicked;
- the empty state (`Tray` glyph, no error banner, no cards) and the live region: exactly one `[aria-live="polite"]` node, containing no cards, and — while cards are showing — computing a `display` other than `none` at a `0`-height box;
- the 44×44 hit areas, measured by probing `document.elementFromPoint` outwards from each control's centre (`boundingBox()` cannot see the `::after`), plus that a crowded tab strip scrolls rather than clipping its labels;
- `animation-name: none` for the spinner and the pulse dot under an emulated `reducedMotion: 'reduce'`, and that both animate when no preference is set;
- the computed CJK values (`line-break`, line-height ratio, `letter-spacing`, `word-break`) and that `break-word` reaches `.rawRoute` alone;
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
- **`LEGACY_MAX_CANDIDATES`** — the maximum number of `[summary, route]` tuples per origin in the legacy `routes` field (`2`).
- **`lineCode`** — a leg's line identity from the closed set `N` (南北線), `M` (丸ノ内線), `H` (日比谷線), `Z` (半蔵門線), `E` (都営大江戸線), `S` (都営新宿線), `KO` (京王線 / 京王新線), or `null` (ADR 0008 D-1).
- **WAF Web ACL** — the AWS WAF resource that must stay attached to the CloudFront distribution under its flat-rate pricing plan; ARN held in `WEB_ACL_ARN_PROD`.
- **OAC** — CloudFront Origin Access Control, fronting the S3 origin.
- **`gh-actions-deploy-prod`** — the GitHub OIDC IAM role assumed by the `Deploy to Production` workflow; backed by the least-privilege `gh-actions-deploy-prod-leastpriv` policy.
- **DESIGN.md** — `frontend/DESIGN.md`; its YAML frontmatter is the source of truth for the export-modelable design tokens.
- **`design-tokens.css`** — `frontend/src/design-tokens.css`, generated from the DESIGN.md frontmatter by `npm run export:design`. Never hand-edited.
- **Residue layer** — the hand-authored `:root` block in `frontend/src/index.css`: aliases from the generated token names onto the names call sites use, plus the tokens the exporter cannot model (font stacks, transitions).
- **SSRF** — Server-Side Request Forgery; mitigated by `isAllowedUrl()`.
- **ReDoS** — Regular-expression Denial of Service; mitigated by `escapeRegExp()` and non-backtracking patterns.
