# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AWS Lambda function that fetches train transit information from Jorudan (Japanese transit service). Deployed using AWS SAM.

## Architecture

- **Runtime**: Node.js 22 (ESM)
- **Entry point**: `src/index.mjs` → `handler(event, context)`
- **API Gateway trigger**: GET `/transit`
- **Region**: ap-northeast-1

## Build and Deploy

```bash
# Local development with Docker
docker-compose up -d --build
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'

# Run tests
npm test                    # Unit tests
npm run test:e2e           # E2E tests

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
- Target block: `blocks[TARGET_BLOCK_INDEX]` (index 2) contains transit info

### Security Measures
- **ReDoS protection**: `escapeRegExp()` escapes regex special chars in dynamic patterns
- **SSRF protection**: `safeJoinUrl()` validates redirect paths (blocks `//` and `://`)
- **Structured logging**: JSON format for CloudWatch analysis

### Response Format
```json
{
  "transfers": [
    ["18:49発 → 19:38着(49分)(1回)", "■六本木一丁目\n｜東京メトロ南北線..."]
  ]
}
```

## Files

| File | Description |
|------|-------------|
| `src/index.mjs` | Lambda handler with cookie flow |
| `src/lambda_function.py` | Original Python (reference only) |
| `tests/handler.test.mjs` | Unit tests (16 tests) |
| `tests/e2e.test.mjs` | E2E tests |
| `template.yml` | SAM template |
| `Dockerfile` | Lambda container image |
