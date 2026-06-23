---
status: Accepted
applyTo: src/index.mjs
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->
<!-- status: Accepted here is a deliberate hand-seed of an already-live decision, deviating from the x-recording-adr skill's Proposed-only automated-write rule; a normal ADR is born Proposed and promoted to Accepted on PR merge. -->

# 0001. Jorudan cookie-flow scraper on AWS Lambda

## Status
Accepted

## Context
The dashboard needs train transit information for a fixed commute route from
[Jorudan](https://www.jorudan.co.jp/), a Japanese transit search service.
Jorudan publishes no public API and fronts its site with a JavaScript-based
bot check, so a naive `fetch()` of a route URL returns an HTML stub instead of
the rendered results. Something has to emulate enough of a browser to clear the
bot check and retrieve the server-rendered route HTML, while staying cheap
enough to run for a single personal commute board.

## Decision
Run a hand-rolled cookie-flow scraper as an AWS Lambda function
(Node.js 22, ESM) in `src/index.mjs`. The handler performs the multi-hop bot
handshake (six hops: `nori` -> jid page -> `set_uuid.cgi` -> `verify_uuid.cgi`
-> redirect -> transit HTML) in `performBotHandshake()`, collecting the
`jrd_uuid`/`jrd_cuid` cookies the bot check hands out, then parses the route
HTML directly. Two guards harden the untrusted-input surface: `isAllowedUrl()`
is an SSRF guard that rejects non-https schemes and off-host joins before any
follow-up request, and `escapeRegExp()` is a ReDoS guard applied to labels fed
into the HTML field-extraction regexes.

Rejected alternatives:
- **A headless browser (Puppeteer/Playwright on Lambda)** — clears the bot
  check with far less reverse-engineering, but the Chromium layer inflates cold
  starts and memory cost well beyond what a single commute board justifies.
- **A paid/third-party transit API** — removes the scraping burden entirely,
  but no provider exposes Jorudan-equivalent route data for this commute, and
  the recurring fee defeats the cheapest-possible-board goal.

## Consequences
- Positive: the function stays within Lambda's free/low-cost envelope, has no
  browser runtime to patch, and keeps the entire scraping contract in one
  readable ESM module.
- Negative (tight coupling to Jorudan's server-rendered output): any change on
  Jorudan's side silently breaks parsing. The bot check, the
  `set_uuid.cgi`/`verify_uuid.cgi` handshake, the `<hr size="1" color="black">`
  result delimiter, or the `発着時間：` route lookahead can each shift without
  notice and return wrong or empty data with no upstream signal, so recurrence
  of breakage is expected rather than exceptional.
