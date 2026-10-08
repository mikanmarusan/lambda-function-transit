# Lambda Function Transit

AWS Lambda function that fetches train transit information from [Jorudan](https://www.jorudan.co.jp/) (Japanese transit service).

**Route**: Roppongi-itchome → Tsutsujigaoka (Tokyo)

## Tech Stack

- Node.js 24 (ESM)
- AWS Lambda + API Gateway
- AWS SAM (Serverless Application Model)
- Docker (local development)

## Setup

```bash
# Install dependencies
npm install

# Start development server
docker-compose up api-dev
```

## Usage

### Local Development

```bash
# Development server (recommended)
docker-compose up api-dev
# Access: http://localhost:8000/transit
# Access: http://localhost:8000/status

# Direct Node.js
node -e "import { handler } from './src/index.mjs'; handler({}, {}).then(r => console.log(r.body));"
```

> **Note**: `api-prod` service is for CI pipeline testing only. In production, the function runs on AWS Lambda.

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

### Deployment

```bash
# Build and deploy with SAM
sam build
sam deploy
```

## API Specification

**Endpoint**: `GET /api/transit` (CloudFront) or `GET /transit` (dev server)

**Response** (abridged; the full contract is in [`docs/architecture.md`](./docs/architecture.md) §4 Data Model):
```json
{
  "generatedAt": "2026-10-06T20:40:12+09:00",
  "destination": "つつじヶ丘（東京）",
  "fastestOrigin": "六本木一丁目",
  "origins": [
    { "origin": "六本木一丁目", "walkMinutes": 4, "status": "ok", "searchedFrom": "2026-10-06T20:44:00+09:00", "candidates": ["..."] }
  ]
}
```

`origins` lists every configured origin with up to 3 candidates each, sorted by arrival. The legacy `routes` field (`[summary, route]` string tuples) has been removed.

## Project Structure

```
src/
├── index.mjs          # Lambda handler
├── parse.mjs          # Structured route parsing (origins field)
├── lines.mjs          # Line name -> lineCode table
├── dev-server.mjs     # Development server
├── package.json       # Dependencies
└── lambda_function.py # Original Python (reference)
tests/
├── handler.test.mjs   # Unit tests
├── parse.test.mjs     # Route parser unit tests
└── e2e.test.mjs       # E2E tests
frontend/              # React frontend
├── src/               # Source code
├── tests/             # Tests
└── package.json       # Dependencies
.github/workflows/     # CI/CD
Dockerfile             # Lambda container image
docker-compose.yml     # Local development
template.yml           # SAM template (Lambda + CloudFront + S3)
```

## Notes

Jorudan uses CloudFront with JavaScript-based bot detection. This function implements a 3-step cookie flow to bypass the detection:

1. Initial request to get redirect URL
2. Follow UUID redirect to collect cookies
3. Request transit data with cookies
