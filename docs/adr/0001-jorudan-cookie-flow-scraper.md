---
status: Accepted
applyTo: src/index.mjs
---

# 0001. Jorudan 3-step cookie-flow scraper on AWS Lambda

## Status
Accepted

<!--
Note: `status: Accepted` here is a deliberate hand-seed of an already-live
decision. It deviates from the x-recording-adr skill's Proposed-only
automated-write rule because this ADR documents a foundational choice that
shipped long before the ADR home existed; there is no PR-merge gate to promote
it through.
-->

## Context
[Jorudan](https://www.jorudan.co.jp/) publishes no public transit API, and its
site is fronted by a JavaScript-based bot check. A naive server-side `fetch()`
of a route-search URL therefore returns an HTML stub (the bot-check page),
not the rendered route data we need. We want to keep a personal commute board
running as cheaply as possible for a single fixed route, which rules out
standing infrastructure and recurring API fees.

## Decision
Implement a hand-rolled 3-step cookie flow against Jorudan's own endpoints,
running on AWS Lambda (Node.js 22, ESM) in `src/index.mjs`. The handler walks
the cookie-issuing endpoints to satisfy the bot check, then fetches and parses
the server-rendered route HTML. The implementation hardens the two
attacker-influenced surfaces it depends on: a `safeJoinUrl()` SSRF guard that
constrains every derived request to the expected Jorudan host, and an
`escapeRegExp()` ReDoS guard on values interpolated into parsing regexes.
This is the cheapest way to keep the board working without a public API.

## Rejected alternatives
- **Headless browser (e.g. Puppeteer/Playwright on Lambda)** — would clear the
  bot check by executing the page JavaScript, but the Chromium layer inflates
  cold-start latency and per-invocation cost well beyond a plain HTTP scraper,
  defeating the cheapest-board goal.
- **A paid / third-party transit API** — no provider offers Jorudan-equivalent
  route data for this commute, and a subscription reintroduces the recurring
  cost this project exists to avoid.

## Consequences
- **Positive**: near-zero idle cost (Lambda scales to zero), no browser layer to
  maintain, and a small dependency surface that is fast to cold-start.
- **Negative (tight coupling to Jorudan's HTML/cookie contract)**: the scraper
  is bound to Jorudan's server-rendered markup and cookie endpoints. Any change
  to the bot check, the `set-uuid.cgi` cookie step, the
  `<hr size="1" color="black">` section delimiter, or the `発着時間：` route
  lookahead silently breaks parsing, with no upstream contract or version to
  warn us. Recovery means re-reverse-engineering the live site.
