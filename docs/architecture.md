# Architecture

This document is the overview/index. The non-obvious behaviors, the cookie handshake, the parsing rules, the API contract, and the deploy/IAM details live in the per-subsystem detail documents linked below.

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
| Upstream | Jorudan | Public Japanese transit search. Requires a 6-hop, cross-subdomain cookie handshake to bypass bot detection (see detail docs). |

The full AWS architecture diagram lives at [`diagrams/lambda-function-transit-aws-architecture.drawio`](./diagrams/lambda-function-transit-aws-architecture.drawio) (rendered at [`diagrams/lambda-function-transit-aws-architecture.png`](./diagrams/lambda-function-transit-aws-architecture.png)).

## Detail Documents

| Document | Covers |
|----------|--------|
| [Jorudan cookie flow](./architecture/jorudan-cookie-flow.md) | The 6-hop `jrd_uuid` cookie handshake and the SSRF / cookie-scoping / timeout / ReDoS guards. |
| [HTML parsing](./architecture/html-parsing.md) | How the server-rendered transit HTML is split and parsed into route candidates. |
| [API contract](./architecture/api-contract.md) | API path normalization and the `GET /transit` / `GET /status` response formats. |
| [Observability](./architecture/observability.md) | Structured CloudWatch logging of the cookie flow steps. |
| [Deploy and IAM](./architecture/deploy-and-iam.md) | The production deploy constraint and the least-privilege CI/CD deploy-role IAM policy. |
