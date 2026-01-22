# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Lambda function that fetches train transit information from Jorudan (Japanese transit service). Includes a React frontend deployed via CloudFront + S3. Deployed using AWS SAM.

## Architecture

```
CloudFront + S3 (Frontend) → API Gateway → Lambda → Jorudan
```

- **Backend Runtime**: Node.js 22 (ESM)
- **Frontend**: React 19 + TypeScript + Vite
- **Entry point**: `src/index.mjs` → `handler(event, context)`
- **API Gateway trigger**: GET `/transit`, GET `/status`, GET `/api/transit`, GET `/api/status`
- **Region**: ap-northeast-1

## Build and Deploy

```bash
# Development environment (Docker)
docker-compose up                  # API + Frontend together
docker-compose up api-dev          # API only: http://localhost:8000
docker-compose up frontend-dev     # Frontend only: http://localhost:3000

# Frontend development URLs
# http://localhost:3000           - React frontend (HMR enabled)
# http://localhost:3000/api/transit - Proxied to API
# http://localhost:3000/api/status  - Proxied to API

# Backend development URLs
# http://localhost:8000/transit   - Transit information
# http://localhost:8000/status    - Health check

# Run backend tests
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:e2e           # E2E tests only
npm run test:coverage      # Tests with coverage

# Run frontend tests
cd frontend
npm test                   # Unit tests
npm run test:watch         # Watch mode
npx playwright test        # E2E tests

# Lint
npm run lint               # Backend lint
cd frontend && npm run lint # Frontend lint

# SAM deployment (includes CloudFront + S3)
sam build && sam deploy

# Frontend deployment (after SAM deploy)
cd frontend && npm run build
aws s3 sync dist/ s3://<bucket-name>/
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

## Key Implementation Notes

### Jorudan Bot Detection
Jorudan uses CloudFront with JavaScript redirect for bot detection. Simple fetch fails.

**Solution**: 3-step cookie flow
1. Initial request → get redirect URL from `window.location.href`
2. Follow `/webuser/set-uuid.cgi?url=...` → collect cookies
3. Request final URL with cookies → get transit data

### HTML Parsing
- Split by `<hr size="1" color="black">` (handle both self-closing and non-self-closing)
- Line endings: Handle both `\r\n` and `\n` with regex `/\r?\n\r?\n/`
- Target block: `blocks[TARGET_BLOCK_INDEX]` (index 2) contains all transit routes
- Route separation: `splitRoutes()` splits by `(?=発着時間：)` lookahead pattern
- Returns up to `MAX_CANDIDATES` (2) transit candidates

### Security Measures
- **ReDoS protection**: `escapeRegExp()` escapes regex special chars in dynamic patterns
- **SSRF protection**: `safeJoinUrl()` validates redirect paths (blocks `//` and `://`)
- **Structured logging**: JSON format for CloudWatch analysis

### API Path Normalization
The Lambda handler normalizes paths to support both direct API Gateway access and CloudFront-proxied access:
- `/transit` and `/api/transit` → handled as transit endpoint
- `/status` and `/api/status` → handled as status endpoint

### Response Format
Both endpoints return JSON:

`GET /transit` or `GET /api/transit` returns:
```json
{
  "transfers": [
    ["18:49発 → 19:38着(49分)(1回)", "■六本木一丁目\n｜東京メトロ南北線..."],
    ["18:55発 → 19:45着(50分)(2回)", "■六本木一丁目\n｜東京メトロ丸ノ内線..."]
  ]
}
```

`GET /status` or `GET /api/status` returns:
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## Files

### Backend
| File | Description |
|------|-------------|
| `src/index.mjs` | Lambda handler with cookie flow |
| `src/dev-server.mjs` | Development HTTP server |
| `src/lambda_function.py` | Original Python (reference only) |
| `tests/handler.test.mjs` | Unit tests |
| `tests/e2e.test.mjs` | E2E tests |
| `template.yml` | SAM template (Lambda + CloudFront + S3) |
| `samconfig.toml` | SAM deployment configuration |
| `Dockerfile` | Multi-stage Docker image (dev/prod) |
| `docker-compose.yml` | Docker services (api-dev/api-prod/frontend-dev) |
| `eslint.config.mjs` | ESLint configuration |

### Frontend
| File | Description |
|------|-------------|
| `frontend/src/App.tsx` | Main application component |
| `frontend/src/components/TransitCard.tsx` | Transit info card |
| `frontend/src/components/RouteDetail.tsx` | Route details |
| `frontend/src/components/StatusIndicator.tsx` | API status display |
| `frontend/src/hooks/useTransit.ts` | Data fetching hook |
| `frontend/src/types/transit.ts` | TypeScript types |
| `frontend/vite.config.ts` | Vite configuration |
| `frontend/Dockerfile` | Frontend Docker image |
| `frontend/tests/` | Unit tests (Vitest) |
| `frontend/tests/e2e/` | E2E tests (Playwright) |

## CI/CD

| Workflow | Description |
|----------|-------------|
| `ci.yml` | Test backend/frontend, lint, security check, Docker build |
| `deploy-production.yml` | Manual production deploy with frontend S3 sync |
| `claude.yml` | AI assistant integration |
| `claude-code-review.yml` | AI code review |

## Frontend Design

- **Theme**: Dark mode (Linear/Raycast inspired)
- **Design System**: 4px grid, border-based depth
- **Icons**: Phosphor Icons
- **Typography**: Inter (sans), SF Mono (mono)
