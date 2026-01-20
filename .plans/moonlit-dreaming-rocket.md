# Plan: Docker開発環境でGETリクエストを可能にする

## 問題の概要

現在のDocker開発環境は AWS Lambda Runtime API を使用しており、以下のようなPOSTリクエストでしか関数を呼び出せない：

```bash
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'
```

**目標**: ブラウザから `GET http://localhost:8000/transit` でアクセスできるようにする

## 参考: kanji-grade/apis の構成

- マルチステージDockerfile（development/production）
- 開発環境では `serverless-offline` でHTTPサーバーとして動作
- docker-composeで `api-dev`（開発）と `api-prod`（本番）を分離

## 推奨プラン: 開発用HTTPサーバーの追加

kanji-gradeプロジェクトのアプローチを参考に、Docker完結の開発環境を構築する。

### 変更内容

#### 1. `src/dev-server.mjs` を新規作成
- Node.js標準の`http`モジュールでシンプルなHTTPサーバーを作成
- `GET /transit` を受け付け、Lambda handlerを呼び出す
- 外部依存なし（expressなどのパッケージ追加不要）

```javascript
// src/dev-server.mjs
import http from 'http';
import { handler } from './index.mjs';

const PORT = 8000;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/transit') {
    const result = await handler({}, {});
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dev server running at http://localhost:${PORT}/transit`);
});
```

#### 2. `Dockerfile` をマルチステージに変更

```dockerfile
# === Production Stage ===
FROM public.ecr.aws/lambda/nodejs:22 AS production

COPY src/package.json ${LAMBDA_TASK_ROOT}/
COPY src/index.mjs ${LAMBDA_TASK_ROOT}/

WORKDIR ${LAMBDA_TASK_ROOT}
RUN npm install --omit=dev

CMD ["index.handler"]

# === Development Stage ===
FROM node:22-slim AS development

WORKDIR /app
COPY src/ .

EXPOSE 8000

CMD ["node", "dev-server.mjs"]
```

#### 3. `docker-compose.yml` を更新

```yaml
services:
  # 開発用（GETでアクセス可能）
  api-dev:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    ports:
      - "8000:8000"
    volumes:
      - ./src:/app

  # 本番用（Lambda Runtime API）
  api-prod:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "9000:8080"
    environment:
      - AWS_LAMBDA_FUNCTION_TIMEOUT=10
```

#### 4. `CLAUDE.md` の更新

開発手順を更新：
```bash
# 開発環境（ブラウザでGETアクセス可能）
docker-compose up api-dev
# http://localhost:8000/transit でアクセス

# 本番相当環境（Lambda Runtime API）
docker-compose up api-prod
curl -XPOST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{}'
```

### 修正対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/dev-server.mjs` | **新規作成** - 開発用HTTPサーバー |
| `Dockerfile` | マルチステージビルドに変更 |
| `docker-compose.yml` | api-dev / api-prod の2サービス構成に変更 |
| `CLAUDE.md` | 開発手順の更新 |

---

## Part 2: CI/CD パイプラインの整備

### 参考: kanji-grade の CI/CD 構成

| Workflow | 目的 |
|----------|------|
| ci.yml | テスト、Lint、セキュリティチェック、Docker ビルド検証 |
| deploy-production.yml | 手動本番デプロイ（確認入力必須、ロールバック対応） |
| claude.yml | AI アシスタント連携（既存） |
| claude-code-review.yml | AI コードレビュー（既存） |

### 開発にあたり確認すべき事項

| 項目 | 現状 | 対応 |
|------|------|------|
| ESLint | **未設定** | 設定ファイル追加 |
| テストカバレッジ | **未設定** | c8 追加（Node.js test runner用） |
| npm audit | **未実行** | CI で自動実行 |
| ヘルスチェックエンドポイント | **なし** | `/status` エンドポイント追加 ✅ |
| AWS シークレット | **未設定** | GitHub Secrets に追加 |

### `/status` ヘルスチェックエンドポイントの追加

#### `src/index.mjs` の変更

```javascript
// ルーティング追加
export async function handler(event, context) {
  const path = event.path || event.rawPath || '/transit';

  // ヘルスチェック
  if (path === '/status') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })
    };
  }

  // 既存の /transit 処理
  // ...
}
```

#### `template.yml` の変更

```yaml
# Events セクションに /status を追加
Events:
  Api1:
    Type: Api
    Properties:
      Path: /transit
      Method: GET
  Status:
    Type: Api
    Properties:
      Path: /status
      Method: GET

# Outputs セクションを追加（kanji-grade と同様）
Outputs:
  ApiEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod'
    Export:
      Name: !Sub '${AWS::StackName}-api-endpoint'

  TransitFunctionArn:
    Description: Lambda function ARN
    Value: !GetAtt transitmikanmarusan.Arn
    Export:
      Name: !Sub '${AWS::StackName}-lambda-arn'
```

**スタック名**: `transitmikanmarusan`（関数名と同じ）を使用

#### `src/dev-server.mjs` の変更

```javascript
if (req.method === 'GET' && req.url === '/status') {
  const result = await handler({ path: '/status' }, {});
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
} else if (req.method === 'GET' && req.url === '/transit') {
  // ...
}
```

### 追加する Workflow ファイル

#### 1. `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ['*']
  pull_request:
    branches: ['*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build development image
        run: docker build --target development -t transit-dev .
      - name: Build production image
        run: docker build --target production -t transit-prod .
      - name: Smoke test
        run: |
          docker run -d -p 8000:8000 --name dev-test transit-dev
          sleep 5
          curl -f http://localhost:8000/transit || exit 1
          docker stop dev-test

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm audit --audit-level=high
```

#### 2. `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  workflow_dispatch:
    inputs:
      confirmation:
        description: 'Type "deploy" to confirm'
        required: true
      dry-run:
        description: 'Dry run mode'
        type: boolean
        default: false

jobs:
  validate:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event.inputs.confirmation == 'deploy'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test

  deploy:
    needs: validate
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - uses: aws-actions/setup-sam@v2
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
          aws-region: ap-northeast-1
      - name: SAM Build
        run: sam build
      - name: SAM Deploy
        if: ${{ github.event.inputs.dry-run != 'true' }}
        run: sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
      - name: Health Check
        if: ${{ github.event.inputs.dry-run != 'true' }}
        run: |
          ENDPOINT=$(aws cloudformation describe-stacks --stack-name transitmikanmarusan --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)
          curl -f "${ENDPOINT}/status" || exit 1
```

### 追加する設定ファイル

#### 3. `eslint.config.mjs`

```javascript
export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'off',
    },
  },
];
```

#### 4. `package.json` の更新

```json
{
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "test:unit": "node --test tests/handler.test.mjs",
    "test:e2e": "node --test tests/e2e.test.mjs",
    "test:coverage": "c8 node --test tests/*.test.mjs",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
  "devDependencies": {
    "c8": "^9.1.0",
    "eslint": "^9.0.0"
  }
}
```

### 必要な GitHub Secrets

> **注意**: 以下のシークレットは本番デプロイの実行時に必要です。設定が必要になった時点でユーザーに通知します。

| Secret | 説明 | 設定タイミング |
|--------|------|---------------|
| `AWS_ACCESS_KEY_ID_PROD` | AWS IAM アクセスキー | 本番デプロイ実行前 |
| `AWS_SECRET_ACCESS_KEY_PROD` | AWS IAM シークレットキー | 本番デプロイ実行前 |

### 修正対象ファイル（完全リスト）

| ファイル | 変更内容 |
|---------|---------|
| `src/index.mjs` | `/status` エンドポイント追加（ルーティング対応） |
| `src/dev-server.mjs` | **新規作成** - 開発用HTTPサーバー（/status, /transit） |
| `template.yml` | `/status` イベント追加 + Outputs セクション追加 |
| `samconfig.toml` | **新規作成** - SAM デプロイ設定（スタック名、リージョン） |
| `Dockerfile` | マルチステージビルドに変更 |
| `docker-compose.yml` | api-dev / api-prod の2サービス構成に変更 |
| `.github/workflows/ci.yml` | **新規作成** - CI パイプライン |
| `.github/workflows/deploy-production.yml` | **新規作成** - 本番デプロイ |
| `eslint.config.mjs` | **新規作成** - ESLint 設定 |
| `package.json` | scripts, devDependencies 追加 |
| `CLAUDE.md` | 開発手順の更新 |
| `tests/handler.test.mjs` | `/status` エンドポイントのテスト追加 |

### samconfig.toml（新規作成）

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "transitmikanmarusan"
region = "ap-northeast-1"
confirm_changeset = false
capabilities = "CAPABILITY_IAM"
```

---

## 実装ワークフロー

### 1. 開発用ブランチの作成

```bash
git checkout -b feature/docker-dev-environment
```

### 2. 実装順序

1. `src/index.mjs` - `/status` エンドポイント追加
2. `src/dev-server.mjs` - 開発用HTTPサーバー作成
3. `Dockerfile` - マルチステージビルドに変更
4. `docker-compose.yml` - 2サービス構成に変更
5. `template.yml` - `/status` API Gateway イベント追加
6. `eslint.config.mjs` - ESLint 設定追加
7. `package.json` - scripts, devDependencies 追加
8. `.github/workflows/ci.yml` - CI パイプライン追加
9. `.github/workflows/deploy-production.yml` - 本番デプロイ追加
10. `tests/handler.test.mjs` - `/status` テスト追加
11. `CLAUDE.md` - 開発手順の更新

### 3. コード品質チェック

実装完了後、以下のチェックを順番に実施：

1. **コード単純化チェック**: code-simplifier skill で不要な複雑さを排除
2. **コードレビュー**: code-reviewer agent で品質チェック
3. **セキュリティレビュー**: セキュリティ観点での脆弱性チェック

- 各チェックで指摘事項があれば修正
- 修正後は再度チェックを実施
- 全てのチェックで指摘事項がなくなるまで繰り返す

---

## 検証方法

### 開発環境の検証（Playwright使用）

1. `docker-compose up api-dev` を実行
2. **Playwright MCP** または **playwright-skill** を使用してブラウザ越しでアクセス：
   - `http://localhost:8000/transit` - 乗り換え案内HTMLの表示確認
   - `http://localhost:8000/status` - ヘルスチェックJSONの表示確認
3. スクリーンショットを取得して結果を確認

### CI パイプラインの検証

1. 開発ブランチをプッシュ
2. GitHub Actions で ci.yml が実行されることを確認
3. テスト、Lint、Docker ビルドが成功することを確認

### 本番デプロイの検証

1. **AWS シークレット設定が必要になった時点でユーザーに通知**
2. GitHub Secrets に AWS 認証情報を設定
3. Actions タブから "Deploy to Production" を手動実行
4. dry-run モードで動作確認
5. 本番デプロイ後、API エンドポイントにアクセスして確認
