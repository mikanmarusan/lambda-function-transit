# Architecture

This document describes the system architecture, request flow, and the non-obvious behaviors that the implementation has to work around.

## High-Level Architecture

```
CloudFront + S3 (Frontend) → API Gateway → Lambda → Jorudan
```

| Layer | Component | Notes |
|-------|-----------|-------|
| Edge | CloudFront | Serves the React SPA from S3 and proxies `/api/*` to API Gateway. Protected by an AWS WAF Web ACL required by the CloudFront flat-rate pricing plan. |
| Static hosting | S3 | Hosts the built Vite bundle. Sync target after `cd frontend && npm run build`. |
| API | API Gateway (HTTP) | Routes `GET /api/transit` and `GET /api/status` to the Lambda function. |
| Compute | AWS Lambda (Node.js 22, ESM) | Entry point: `src/index.mjs` → `handler(event, context)`. Region: `ap-northeast-1`. |
| Upstream | Jorudan | Public Japanese transit search. Requires a 3-step cookie flow to bypass bot detection (see below). |

The full AWS architecture diagram lives at [`diagrams/lambda-function-transit-aws-architecture.drawio`](./diagrams/lambda-function-transit-aws-architecture.drawio) (rendered at [`diagrams/lambda-function-transit-aws-architecture.png`](./diagrams/lambda-function-transit-aws-architecture.png)).

## Jorudan Bot Detection — 3-Step Cookie Flow

Jorudan fronts its site with CloudFront and a JavaScript-based bot check. A naive `fetch()` against the search URL receives an HTML stub instead of the transit results page, because the real URL is computed client-side after the bot check sets a cookie.

The Lambda handler emulates the browser flow:

1. **Initial request** — fetch the transit search URL, parse the response, and read the redirect URL from `window.location.href` in the returned HTML.
2. **Cookie collection** — follow `/webuser/set-uuid.cgi?url=...`, which responds with `Set-Cookie` headers carrying the bot-check token.
3. **Authoritative fetch** — request the final URL with the collected cookies attached. The response is the rendered transit results HTML.

If any step's redirect URL contains `//` or `://` in the path component, `safeJoinUrl()` rejects it (SSRF guard against attacker-controlled redirects).

## HTML Parsing

The transit results page is server-rendered HTML. The handler:

- Splits by `<hr size="1" color="black">` (handles both self-closing and non-self-closing forms).
- Normalizes line endings via `/\r?\n\r?\n/` so CRLF and LF responses parse identically.
- Picks `blocks[TARGET_BLOCK_INDEX]` (index `2`) — the block that contains all candidate transit routes.
- Calls `splitRoutes()`, which splits on the lookahead `(?=発着時間：)` to separate individual route candidates.
- Returns up to `MAX_CANDIDATES` (`2`) routes.

Dynamic substrings used inside regular expressions are escaped via `escapeRegExp()` to prevent ReDoS.

## API Path Normalization

The Lambda handler accepts paths from both direct API Gateway invocations and CloudFront-proxied calls:

- `/transit` and `/api/transit` → transit endpoint
- `/status` and `/api/status` → status endpoint

This lets the dev server (which exposes the unprefixed paths) and CloudFront (which prefixes with `/api`) hit the same handler without per-environment branching.

## Response Format

`GET /transit` or `GET /api/transit`:

```json
{
  "transfers": [
    ["18:49発 → 19:38着(49分)(1回)", "■六本木一丁目\n｜東京メトロ南北線..."],
    ["18:55発 → 19:45着(50分)(2回)", "■六本木一丁目\n｜東京メトロ丸ノ内線..."]
  ]
}
```

`GET /status` or `GET /api/status`:

```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## Observability

The handler emits structured JSON logs to CloudWatch so each step of the cookie flow (initial fetch, cookie set, final fetch, parse outcome) is queryable.

## Production Deploy Constraint

CloudFront's flat-rate pricing plan requires the distribution to keep an attached AWS WAF Web ACL at all times. The Web ACL ARN lives in the `WEB_ACL_ARN_PROD` GitHub Actions secret on the `production` environment, and the `Deploy to Production` workflow injects it via `--parameter-overrides`. The Web ACL itself is **not** managed by this stack — it was created by the pricing-plan opt-in. See [`CLAUDE.md`](../CLAUDE.md#how--development-workflow) for the operational procedure.
