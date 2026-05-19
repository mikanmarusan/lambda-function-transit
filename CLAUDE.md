# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## WHY — Purpose & Context

Fetches train transit information from [Jorudan](https://www.jorudan.co.jp/) (a Japanese transit search service) for a fixed commute route and exposes it through a small JSON API consumed by a React dashboard. Jorudan does not publish a public API and fronts its site with a JavaScript-based bot check, so a hand-rolled cookie-flow scraper running on AWS Lambda is the cheapest way to keep a personal commute board working.

## WHAT — Architecture & Key Decisions

```
CloudFront + S3 (Frontend) → API Gateway → Lambda → Jorudan
```

- **Backend Runtime**: Node.js 22 (ESM)
- **Frontend**: React 19 + TypeScript + Vite
- **Entry point**: `src/index.mjs` → `handler(event, context)`
- **API Gateway routes**: `GET /api/transit`, `GET /api/status`
- **Region**: `ap-northeast-1`

For the AWS topology diagram, the Jorudan 3-step cookie flow, HTML parsing rules, ReDoS/SSRF guards, API path normalization, and the full response schema, see [`docs/architecture.md`](./docs/architecture.md). The diagram source lives at [`docs/diagrams/lambda-function-transit-aws-architecture.drawio`](./docs/diagrams/lambda-function-transit-aws-architecture.drawio).

### Repository Layout

| Area | Path | Description |
|------|------|-------------|
| Backend | `src/index.mjs` | Lambda handler with cookie flow |
| Backend | `src/dev-server.mjs` | Local development HTTP server |
| Backend | `src/lambda_function.py` | Original Python implementation (reference only) |
| Tests | `tests/handler.test.mjs` | Backend unit tests |
| Tests | `tests/e2e.test.mjs` | Backend E2E tests |
| Infra | `template.yml` | SAM template (Lambda + CloudFront + S3 + WAF wiring) |
| Infra | `samconfig.toml` | SAM deployment configuration |
| Infra | `Dockerfile`, `docker-compose.yml` | Local containers (api-dev / api-prod / frontend-dev) |
| Tooling | `eslint.config.mjs` | ESLint configuration |
| Frontend | `frontend/src/App.tsx` | Main application component |
| Frontend | `frontend/src/components/{TransitCard,RouteDetail,StatusIndicator}.tsx` | UI components |
| Frontend | `frontend/src/hooks/useTransit.ts` | Data fetching hook |
| Frontend | `frontend/src/types/transit.ts` | TypeScript types |
| Frontend | `frontend/vite.config.ts` | Vite configuration |
| Frontend | `frontend/Dockerfile` | Frontend container image |
| Frontend tests | `frontend/tests/` | Vitest unit tests |
| Frontend tests | `frontend/tests/e2e/` | Playwright E2E tests |
| Docs | `docs/architecture.md` | Architecture details, cookie flow, parsing, response schema |
| Docs | `docs/diagrams/` | AWS architecture diagram (`.drawio` + rendered `.png`) |

### Frontend Sub-Package Convention

The `frontend/` directory is a self-contained Vite + React workspace with its own `package.json`, `eslint.config.mjs`, `Dockerfile`, and tests. It deliberately does **not** replicate the boilerplate's `.claude/{agents,rules,skills}/` and `docs/` shape per package — there is a single source of truth at the repo root, and Claude Code is invoked from the repo root for both backend and frontend work. Treat `frontend/` as one of several top-level project areas, not as a nested project.

### Frontend Design

- **Theme**: Dark mode (Linear / Raycast inspired)
- **Design system**: 4px grid, border-based depth
- **Icons**: Phosphor Icons
- **Typography**: Inter (sans), SF Mono (mono)

### CI/CD Workflows

| Workflow | Description |
|----------|-------------|
| `ci.yml` | Test backend/frontend, lint, security check, Docker build |
| `deploy-production.yml` | Manual production deploy with frontend S3 sync |

## HOW — Development Workflow

### Local Development

```bash
# Docker (recommended)
docker-compose up                  # API + Frontend together
docker-compose up api-dev          # API only:      http://localhost:8000
docker-compose up frontend-dev     # Frontend only: http://localhost:3000

# Frontend URLs
# http://localhost:3000               - React frontend (HMR enabled)
# http://localhost:3000/api/transit   - Proxied to API
# http://localhost:3000/api/status    - Proxied to API

# Backend URLs
# http://localhost:8000/transit       - Transit information
# http://localhost:8000/status        - Health check
```

### Testing & Linting

```bash
# Backend
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:e2e            # E2E tests only
npm run test:coverage       # With coverage
npm run lint                # Backend lint

# Frontend
cd frontend
npm test                    # Unit tests (Vitest)
npm run test:watch          # Watch mode
npx playwright test         # E2E tests
npm run lint                # Frontend lint
```

### SAM Deploy (non-prod)

```bash
sam build && sam deploy     # NON-PROD STACKS ONLY — see Production deploys below

# Frontend deploy after a SAM deploy
cd frontend && npm run build
aws s3 sync dist/ s3://<bucket-name>/
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

### Production Deploys

> **Production deploys MUST go through the `Deploy to Production` GitHub Actions workflow** (`workflow_dispatch`). The CloudFront distribution is protected by a Web ACL that AWS's CloudFront pricing-plan subscription requires to remain attached. The Web ACL ARN is held in the `WEB_ACL_ARN_PROD` secret on the `production` GitHub environment, and the workflow injects it via `--parameter-overrides`. Running plain `sam deploy` locally against the production stack would re-render the distribution without `WebACLId` — CloudFront then refuses with "You can't remove or replace the web ACL for your distribution. Distributions with a pricing plan subscription must have a web ACL resource." and rolls back.

Emergency local deploys (only when GitHub Actions is unavailable):

```bash
WEB_ACL_ARN_PROD="arn:aws:wafv2:us-east-1:<ACCT>:global/webacl/<NAME>/<UUID>"  # retrieve from a secure store
sam build
sam deploy --parameter-overrides "WebACLArn=$WEB_ACL_ARN_PROD"
```

The Web ACL itself is **not** managed by this stack (it was created by the CloudFront pricing-plan opt-in). Do not edit the Web ACL attachment in the AWS console — the next CFN deploy will reconcile to whatever ARN is in the secret. If the Web ACL is ever recreated and the ARN changes, update the secret first.
