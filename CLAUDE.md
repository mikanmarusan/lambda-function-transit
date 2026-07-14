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

For the system overview and AWS topology diagram, start at the [`docs/architecture.md`](./docs/architecture.md) index. The detail specs — the Jorudan 6-hop `jrd_uuid` cookie handshake, HTML parsing rules, ReDoS/SSRF guards, API path normalization, and the full response schema — now live in the per-subsystem docs under `docs/architecture/`. The diagram source lives at [`docs/diagrams/lambda-function-transit-aws-architecture.drawio`](./docs/diagrams/lambda-function-transit-aws-architecture.drawio).

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
| Docs | `docs/architecture.md` | Architecture overview/index |
| Docs | `docs/architecture/` | Per-subsystem detail specs (cookie flow, parsing, API contract, observability, deploy/IAM) |
| Docs | `docs/adr/` | Architecture Decision Records + `INDEX.md` |
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

## Decision & Spec Docs

This repo runs ADR-driven and spec-driven documentation. The adoption markers below opt the `record ADR` and `sync specs` skills in by naming their targets — keep them as bare, unfenced top-level lines, because a code fence or HTML comment defeats the skills' line matching:

adr-dir: docs/adr

spec-doc: docs/architecture.md

What goes where: [`docs/adr/`](./docs/adr/INDEX.md) records *why* a decision was made (immutable; a PR merge promotes Proposed -> Accepted, via `record ADR`); [`docs/architecture.md`](./docs/architecture.md) plus `docs/architecture/*.md` describe *what the system does now* (tracks code, synced via `sync specs`). ADRs never edit specs and specs never edit ADRs.

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

The workflow authenticates to AWS via GitHub OIDC. The IAM Role ARN (`gh-actions-deploy-prod`) is held in the `AWS_DEPLOY_ROLE_ARN_PROD` secret on the `production` environment; its trust policy pins assumption to `repo:mikanmarusan/lambda-function-transit:environment:production`, so no other repo or environment can use it and no long-lived AK/SK exist for prod deploy.

Emergency local deploys (only when GitHub Actions is unavailable):

```bash
WEB_ACL_ARN_PROD="arn:aws:wafv2:us-east-1:<ACCT>:global/webacl/<NAME>/<UUID>"  # retrieve from a secure store
sam build
sam deploy --parameter-overrides "WebACLArn=$WEB_ACL_ARN_PROD"
```

The Web ACL itself is **not** managed by this stack (it was created by the CloudFront pricing-plan opt-in). Do not edit the Web ACL attachment in the AWS console — the next CFN deploy will reconcile to whatever ARN is in the secret. If the Web ACL is ever recreated and the ARN changes, update the secret first.

## Lessons

- When authoring an ADR from a planning doc, verify every factual claim against the current code/spec and state present facts as present, proposed changes as proposed. Do not inherit the plan's forward-looking descriptors (e.g. a token value or font stack the plan intends to add) as if they already exist, and do not cite debt/sections that are not actually recorded in the referenced file.
- When changing an ADR's `status` in `docs/adr/*.md`, also reconcile the matching `Status` cell in `docs/adr/INDEX.md` in the same PR. A manual edit does not trigger the index regeneration, so leaving it stale ships an index that contradicts the source files.
- When a change closes recorded debt, sweep every doc that describes the old state in the same PR — the spec doc (`docs/architecture.md`), and the changed doc's own intro/overview/summary tables, not just the section you edited. A doc that still licenses the thing you removed (e.g. an Overview saying a component is "unimplemented" after you implemented it) contradicts itself and reads as authoritative.
- A new guard test is not done until it has been mutation-tested: break the thing it guards and watch it fail. Check its input scope too — a regex over un-stripped CSS counts a commented-out `var()` as a call site, a glob over `*.module.css` misses `index.css`, and a test file outside `tsconfig.json`'s `include` is never typechecked. A guard that cannot fail is worse than no guard, because it reads as coverage.
- A CSS property that fixes one requirement often removes a default the layout was relying on. `min-width: Npx` on a flex item *replaces* the automatic content-width minimum that makes `overflow-x: auto` scroll instead of squeeze (restate it with `flex: 0 0 auto`), and `display: none` on an always-mounted `aria-live` region *prunes it from the accessibility tree*, so it stops outliving the branches it exists to announce. Before declaring such a property, ask what implicit default it overrides, then pin that default with its own test.
- Assert the property that actually carries the behavior, not a synonym: `word-break: normal` and `letter-spacing: normal` are CSS initial values (an assertion on them passes on unmodified code), a CSS-Modules class is scoped `_local_hash` so `[class*="ComponentName"]` matches nothing, and `@keyframes` names are hashed too. Verify each locator and assertion against the rendered DOM before trusting it.
- Code that generates a committed artifact must fail closed: never `cmd > file` (the redirect truncates before the command runs, and a shell pipeline reports the last stage's exit status), and refuse to write output that is empty or untransformed. Write it as a Node script whose builder function the test imports, so the test exercises the real code path instead of a re-implementation.
- Assert generated/derived-file invariants over the whole file, not on sampled examples: exact equality for drift (`toBe`, never `toContain`), and a rule applied to every declaration (e.g. "every alias resolves to `var(--…)`", "no token is declared outside `:root`"). Prove each new guard by mutating the code until it actually fails.
- A pattern-based ban (a regex over sources) asserted only negatively against clean files stays green when the pattern itself is broken. Give it must-match fixtures, then delete each alternative in turn: every arm needs a fixture only it can catch, or that arm is untested. Enumerate every legal spelling of the construct being banned before trusting the alternation — CSS alone writes a remote import as `@import url("…")`, `@import "…"`, and `@import"…"` (whitespace after an at-keyword is optional), and a ban that catches only the first ships the other two.
