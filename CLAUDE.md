# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Lambda function that fetches train transit information from Jorudan (Japanese transit service). Deployed using AWS SAM.

## Architecture

- **Runtime**: Node.js 22 (ESM)
- **Entry point**: `src/index.mjs` → `handler(event, context)`
- **API Gateway trigger**: GET `/transit`, GET `/status`
- **Region**: ap-northeast-1

## Build and Deploy

```bash
# Development environment (GET access via browser)
docker-compose up api-dev
# http://localhost:8000/transit - Transit information
# http://localhost:8000/status  - Health check

# Note: api-prod is for CI pipeline testing only.
# In production, the function runs on AWS Lambda.

# Run tests
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:e2e           # E2E tests only
npm run test:coverage      # Tests with coverage

# Lint
npm run lint               # Check code style
npm run lint:fix           # Auto-fix issues

# SAM deployment
sam build && sam deploy
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

### Response Format
Both endpoints return JSON:

`GET /transit` returns:
```json
{
  "transfers": [
    ["18:49発 → 19:38着(49分)(1回)", "■六本木一丁目\n｜東京メトロ南北線..."],
    ["18:55発 → 19:45着(50分)(2回)", "■六本木一丁目\n｜東京メトロ丸ノ内線..."]
  ]
}
```

`GET /status` returns:
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

## Files

| File | Description |
|------|-------------|
| `src/index.mjs` | Lambda handler with cookie flow |
| `src/dev-server.mjs` | Development HTTP server |
| `src/lambda_function.py` | Original Python (reference only) |
| `tests/handler.test.mjs` | Unit tests |
| `tests/e2e.test.mjs` | E2E tests |
| `template.yml` | SAM template |
| `samconfig.toml` | SAM deployment configuration |
| `Dockerfile` | Multi-stage Docker image (dev/prod) |
| `docker-compose.yml` | Docker services (api-dev/api-prod) |
| `eslint.config.mjs` | ESLint configuration |

## CI/CD

| Workflow | Description |
|----------|-------------|
| `ci.yml` | Test, lint, security check, Docker build |
| `deploy-production.yml` | Manual production deploy (requires confirmation) |
| `claude.yml` | AI assistant integration |
| `claude-code-review.yml` | AI code review |
