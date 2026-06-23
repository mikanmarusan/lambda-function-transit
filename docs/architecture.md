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
| Upstream | Jorudan | Public Japanese transit search. Requires a 6-hop, cross-subdomain cookie handshake to bypass bot detection (see below). |

The full AWS architecture diagram lives at [`diagrams/lambda-function-transit-aws-architecture.drawio`](./diagrams/lambda-function-transit-aws-architecture.drawio) (rendered at [`diagrams/lambda-function-transit-aws-architecture.png`](./diagrams/lambda-function-transit-aws-architecture.png)).

## Jorudan Bot Detection — 6-Hop `jrd_uuid` Cookie Handshake

Jorudan fronts its site with CloudFront and a JavaScript-based bot check. A naive `fetch()` against the search URL receives an HTML stub instead of the transit results page, because the real URL is computed client-side and gated behind a UUID-cookie handshake performed on a **separate subdomain** (`jid.jorudan.co.jp`).

`performBotHandshake()` in `src/index.mjs` emulates the browser flow for each origin (one `CookieJar` and one overall budget per call):

1. **Initial request** — GET the `nori.cgi` search URL on `www.jorudan.co.jp`. The body is a JS redirect page; `extractJsRedirect()` reads the (single- or double-quoted) `window.location.href`, which is now an **absolute cross-host URL** to `https://jid.jorudan.co.jp/jrd_uuid/?returl=...`. (Fast-path: if this first response already contains the results marker `<hr size="1"`, it is returned directly.)
2. **jid page** — GET the `jrd_uuid` page on `jid.jorudan.co.jp`. In a real browser its inline JS drives the next two AJAX calls; the handler derives those URLs directly from this page URL's querystring.
3. **set_uuid** — **POST** `jid.../jrd_uuid/set_uuid.cgi?<returl...>&ts=<epoch>` with browser-`fetch()`-equivalent AJAX headers (`Accept: */*`, `Referer` = the jid **origin root** `https://jid.jorudan.co.jp/`, `Sec-Fetch-Site: same-origin`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`) and a urlencoded browser-fingerprint body (`tz, lang, sw, sh, cd, mem, hc, ua, ts`). A bare **GET** (or a POST missing the fingerprint body/headers) returns **403** (`./error.html`). Responds with `Set-Cookie jrd_cuid` (`Domain=jid.jorudan.co.jp`, short `max-age`).
4. **verify_uuid** — **POST** `jid.../jrd_uuid/verify_uuid.cgi?<returl...>&ts=<epoch>` with the same AJAX headers, fingerprint body, and the `jrd_cuid` cookie. The **response body is the plaintext final URL** (`https://www.jorudan.co.jp/webuser/redirect2.cgi?url=...`) and it sets `Set-Cookie jrd_uuid` with `Domain=.jorudan.co.jp` (shared across subdomains). `jrd_uuid` is the sole gating cookie — once set, the final `nori.cgi` renders directly, so a single `set_uuid → verify_uuid` pair is sufficient (no second `set_uuid` is required).
5. **redirect2** — GET `www.../webuser/redirect2.cgi?url=...` → `302` whose `Location` is the authoritative `nori.cgi` URL.
6. **Authoritative fetch** — GET the final `nori.cgi` with the cookie jar. Because `jrd_uuid` is a parent-domain (`.jorudan.co.jp`) cookie it is sent to `www`; the jid-host-only `jrd_cuid` is not. The response is the rendered transit results HTML (verified by the `<hr size="1"` marker).

### Guards

- **SSRF — `isAllowedUrl()`**: every hop's URL (and the plaintext `verify_uuid` body) is parsed with the WHATWG `URL` API and accepted only if it is `https:` and its exact `.hostname` is in the allowlist `{www.jorudan.co.jp, jid.jorudan.co.jp}` (with no embedded credentials). This rejects off-allowlist hosts, look-alike suffixes (`jorudan.co.jp.evil.com`), the bare apex, TLS downgrades (`http://169.254.169.254/...`), protocol-relative `//host`, and `data:`/`javascript:`/`file:`/`ftp:` schemes.
- **Cookies — Domain-attribute scoping**: a `CookieJar` (built on `Headers.getSetCookie()`) honours each `Set-Cookie` `Domain` — host-only when absent, shared only when `Domain=.jorudan.co.jp` — so no jid-scoped cookie leaks to `www` and vice versa.
- **Timeout budget**: each hop is capped at `PER_HOP_TIMEOUT_MS` (2.5s) and the whole per-origin chain at `OVERALL_BUDGET_MS` (7s), via `AbortSignal.timeout(min(perHop, remaining))`, keeping the 6-hop chain inside the Lambda `Timeout` (15s). The 3 origins run concurrently via `Promise.allSettled`, so one origin failing still returns the others (HTTP 200); all failing returns 500.
- **ReDoS**: `extractJsRedirect()` uses a non-backtracking negated character class (`[^'"]+`), and dynamic substrings used in route-parsing regexes are escaped via `escapeRegExp()`.

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

## CI/CD Deploy Role IAM Policy

The `Deploy to Production` workflow assumes the OIDC role `gh-actions-deploy-prod` (`arn:aws:iam::470021024556:role/gh-actions-deploy-prod`). The role's permissions are a least-privilege custom policy — `gh-actions-deploy-prod-leastpriv` — scoped to exactly what `sam deploy` of [`template.yml`](../template.yml) plus the post-deploy steps in [`deploy-production.yml`](../.github/workflows/deploy-production.yml) require. No `*FullAccess` AWS managed policy (and in particular no `IAMFullAccess` / `iam:*`) is attached.

### What the workflow touches

| Service | Why | Scope |
|---------|-----|-------|
| CloudFormation | Drift detect, change set create/execute, stack + output reads | `stack/transitmikanmarusan/*`; read-only on `stack/aws-sam-cli-managed-default/*` (so `--resolve-s3` can discover the artifact bucket) |
| S3 | `--resolve-s3` artifact upload + `aws s3 sync` of the frontend bundle | SAM managed bucket `aws-sam-cli-managed-default-samclisourcebucket-esq8nlny65pu` and frontend bucket `transitmikanmarusan-frontend-470021024556` |
| Lambda | Function create/update/permission/tag during the change set | `function:transitmikanmarusan-*` |
| API Gateway | REST API + stage + deployment managed by the change set | `/restapis`, `/restapis/*`, and `/tags/*` |
| CloudFront | `GetDistributionConfig`, `UpdateDistribution`, OAC reads, `CreateInvalidation` | distribution `E58KEXJEHRAN5` and OAC `EE7PDHZSW7GW8` |
| IAM | Lambda execution role lifecycle (`CAPABILITY_IAM`) + `PassRole` to Lambda | `role/transitmikanmarusan-*`; `PassRole` further gated by `iam:PassedToService = lambda.amazonaws.com` |

### Policy JSON

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationDeployStack",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:SetStackPolicy",
        "cloudformation:DetectStackDrift",
        "cloudformation:DetectStackResourceDrift",
        "cloudformation:TagResource",
        "cloudformation:UntagResource",
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:470021024556:stack/transitmikanmarusan/*"
    },
    {
      "Sid": "CloudFormationSamManagedStackRead",
      "Effect": "Allow",
      "Action": [
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:470021024556:stack/aws-sam-cli-managed-default/*"
    },
    {
      "Sid": "CloudFormationGlobalReads",
      "Effect": "Allow",
      "Action": [
        "cloudformation:ValidateTemplate",
        "cloudformation:ListStacks",
        "cloudformation:DescribeStackDriftDetectionStatus",
        "cloudformation:GetTemplateSummary"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudFormationServerlessTransform",
      "Effect": "Allow",
      "Action": "cloudformation:CreateChangeSet",
      "Resource": "arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31"
    },
    {
      "Sid": "S3BucketLevel",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucket*",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetReplicationConfiguration",
        "s3:GetAccelerateConfiguration",
        "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketTagging",
        "s3:PutBucketVersioning",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketPublicAccessBlock"
      ],
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-esq8nlny65pu",
        "arn:aws:s3:::transitmikanmarusan-frontend-470021024556"
      ]
    },
    {
      "Sid": "S3ObjectLevel",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectTagging",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:PutObjectTagging",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-esq8nlny65pu/*",
        "arn:aws:s3:::transitmikanmarusan-frontend-470021024556/*"
      ]
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:PublishVersion",
        "lambda:AddPermission",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:PutFunctionEventInvokeConfig",
        "lambda:UpdateFunctionEventInvokeConfig",
        "lambda:DeleteFunctionEventInvokeConfig",
        "lambda:Get*",
        "lambda:List*"
      ],
      "Resource": "arn:aws:lambda:ap-northeast-1:470021024556:function:transitmikanmarusan-*"
    },
    {
      "Sid": "ApiGateway",
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": [
        "arn:aws:apigateway:ap-northeast-1::/restapis",
        "arn:aws:apigateway:ap-northeast-1::/restapis/*",
        "arn:aws:apigateway:ap-northeast-1::/tags/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:ListTagsForResource",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:GetOriginAccessControlConfig",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": [
        "arn:aws:cloudfront::470021024556:distribution/E58KEXJEHRAN5",
        "arn:aws:cloudfront::470021024556:origin-access-control/EE7PDHZSW7GW8"
      ]
    },
    {
      "Sid": "IamRoleLifecycle",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:ListRoleTags",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateRole",
        "iam:UpdateAssumeRolePolicy"
      ],
      "Resource": "arn:aws:iam::470021024556:role/transitmikanmarusan-*"
    },
    {
      "Sid": "IamPassRoleToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::470021024556:role/transitmikanmarusan-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

### Notes on scoping decisions

- **Account-wide reads are unavoidable for four CloudFormation actions.** `ValidateTemplate`, `ListStacks`, `DescribeStackDriftDetectionStatus`, and `GetTemplateSummary` do not support resource-level permissions, so they sit in their own `Resource: "*"` statement. They are read/validate-only and carry no write blast radius.
- **No `logs:*` is granted.** The template puts `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents` inside the Lambda execution role's inline policy (created via `iam:PutRolePolicy`), so the deploy role itself needs no CloudWatch Logs permissions. This omission is deliberate but load-bearing: if an explicit `AWS::Logs::LogGroup` resource is ever added to the template (e.g. to set log retention), grant the deploy role `logs:CreateLogGroup` / `DeleteLogGroup` / `PutRetentionPolicy` / `TagResource` scoped to `log-group:/aws/lambda/transitmikanmarusan-*`.
- **`cloudformation:DeleteStack` is intentionally excluded.** The workflow only ever updates the existing stack via change sets, so a deploy-only role has no reason to delete the production stack; re-grant it temporarily only for an intentional teardown.
- **`--resolve-s3` reads the SAM managed stack.** SAM discovers the artifact bucket by describing the `aws-sam-cli-managed-default` CloudFormation stack, hence the read-only second statement. Bucket *creation* is not granted because the bucket already exists; if it is ever deleted, temporarily widen S3/CloudFormation create permissions to re-bootstrap it.
- **The SAM transform needs its own `CreateChangeSet` grant.** Because `template.yml` uses `Transform: AWS::Serverless-2016-10-31`, CloudFormation evaluates the macro during change-set creation and authorizes `cloudformation:CreateChangeSet` against the transform ARN `arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31` (an AWS-owned resource), separately from the stack ARN. The `CloudFormationServerlessTransform` statement covers exactly that ARN.
- **`DetectStackDrift` also requires `DetectStackResourceDrift`.** The async drift API fans out to a per-resource `cloudformation:DetectStackResourceDrift` call, so both actions are granted on the stack ARN.
- **API Gateway is scoped by path, not by REST API id.** `apigateway:*` resource ARNs are path-based; pinning `/restapis/63zlpdau7f` would break the deploy if CloudFormation ever replaces the REST API. `/restapis/*` keeps the deploy resilient while still excluding every other AWS service.
- **CloudFront resource-level scoping.** The distribution and OAC are pinned by id. Distribution/OAC *replacement* (which needs account-level `cloudfront:CreateDistribution` / `CreateOriginAccessControl`) is intentionally excluded as least-privilege; grant it temporarily only if a future change forces a replace.
- **`iam:PassRole` is gated by `iam:PassedToService`.** Even within `role/transitmikanmarusan-*`, the role can only be passed to Lambda, closing the pass-role-to-arbitrary-service escalation path.

### Applying and verifying

This policy is the documented target. Apply and verify it against the live role with the following sequence (the `dry-run` path must pass before detaching the managed policies, per the rollback risk noted in #52):

```bash
ACCOUNT=470021024556
ROLE=gh-actions-deploy-prod

# 1. Create the customer-managed policy from the JSON above (saved locally as policy.json).
#    If the policy already exists (re-runs), instead publish a new default version:
#    aws iam create-policy-version --set-as-default \
#      --policy-arn "arn:aws:iam::${ACCOUNT}:policy/gh-actions-deploy-prod-leastpriv" \
#      --policy-document file://policy.json
aws iam create-policy \
  --policy-name gh-actions-deploy-prod-leastpriv \
  --policy-document file://policy.json

# 2. Attach it alongside the existing managed policies (do NOT detach yet).
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn "arn:aws:iam::${ACCOUNT}:policy/gh-actions-deploy-prod-leastpriv"

# 3. Verify end-to-end via the GitHub Actions "Deploy to Production" workflow:
#    dry-run=true first, then dry-run=false. Both must succeed (sam deploy,
#    S3 sync, CloudFront invalidation, and both health checks including the
#    strict-transport-security / x-content-type-options / x-frame-options headers).

# 4. Only once both runs are green, detach the six *FullAccess managed policies:
for p in AmazonAPIGatewayAdministrator CloudFrontFullAccess IAMFullAccess \
         AmazonS3FullAccess AWSCloudFormationFullAccess AWSLambda_FullAccess; do
  aws iam detach-role-policy --role-name "$ROLE" \
    --policy-arn "arn:aws:iam::aws:policy/${p}"
done

# 5. Re-run dry-run=false once more to confirm the scoped policy alone is sufficient.
```

If any step fails with an `AccessDenied`, read the denied action/resource from the error, widen the matching statement minimally, and re-run — rather than re-attaching the broad managed policies. Keep the six managed policies attached until step 5 is green so a mid-deploy denial cannot leave the stack in `UPDATE_ROLLBACK_FAILED`.
