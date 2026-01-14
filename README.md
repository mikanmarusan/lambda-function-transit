# Lambda Function Transit

AWS Lambda function that fetches train transit information from [Jorudan](https://www.jorudan.co.jp/) (Japanese transit service).

**Route**: Roppongi-itchome → Tsutsujigaoka (Tokyo)

## Tech Stack

- Node.js 22 (ESM)
- AWS Lambda + API Gateway
- AWS SAM (Serverless Application Model)
- Docker (local development)

## Setup

```bash
# Install dependencies
npm install

# Start local Lambda container
docker-compose up -d --build
```

## Usage

### Local Execution

```bash
# Via Docker
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'

# Direct Node.js
node -e "import { handler } from './src/index.mjs'; handler({}, {}).then(r => console.log(r.body));"
```

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

**Endpoint**: `GET /transit`

**Response** (up to 2 transit candidates):
```json
{
  "transfers": [
    [
      "18:49発 → 19:38着(49分)(1回)",
      "■六本木一丁目\n｜東京メトロ南北線...\n■つつじヶ丘（東京）"
    ],
    [
      "18:55発 → 19:45着(50分)(2回)",
      "■六本木一丁目\n｜東京メトロ丸ノ内線...\n■つつじヶ丘（東京）"
    ]
  ]
}
```

## Project Structure

```
src/
├── index.mjs          # Lambda handler
├── package.json       # Dependencies
└── lambda_function.py # Original Python (reference)
tests/
├── handler.test.mjs   # Unit tests
└── e2e.test.mjs       # E2E tests
Dockerfile             # Lambda container image
docker-compose.yml     # Local development
template.yml           # SAM template
```

## Notes

Jorudan uses CloudFront with JavaScript-based bot detection. This function implements a 3-step cookie flow to bypass the detection:

1. Initial request to get redirect URL
2. Follow UUID redirect to collect cookies
3. Request transit data with cookies
