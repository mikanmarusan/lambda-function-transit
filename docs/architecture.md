# lambda-function-transit - Architecture Spec
<!-- spec-synced-through: c45b026 -->

## 1. Overview

Fetches train transit information from [Jorudan](https://www.jorudan.co.jp/) (a Japanese transit search service) for a fixed commute route and exposes it through a small JSON API consumed by a React dashboard. Jorudan does not publish a public API and fronts its site with a JavaScript-based bot check, so a hand-rolled cookie-flow scraper running on AWS Lambda is the cheapest way to keep a personal commute board working.

```
CloudFront + S3 (Frontend) → API Gateway → Lambda → Jorudan
```

The full AWS architecture diagram lives at [`diagrams/lambda-function-transit-aws-architecture.drawio`](./diagrams/lambda-function-transit-aws-architecture.drawio) (rendered at [`diagrams/lambda-function-transit-aws-architecture.png`](./diagrams/lambda-function-transit-aws-architecture.png)).

## 2. System Context

| Layer | Component | Notes |
|-------|-----------|-------|
| Edge | CloudFront | Serves the React SPA from S3 and proxies `/api/*` to API Gateway. Protected by an AWS WAF Web ACL required by the CloudFront flat-rate pricing plan. |
| Static hosting | S3 | Hosts the built Vite bundle. Sync target after `cd frontend && npm run build`. |
| API | API Gateway (HTTP) | Routes `GET /api/transit` and `GET /api/status` to the Lambda function. |
| Compute | AWS Lambda (Node.js 22, ESM) | Entry point: `src/index.mjs` → `handler(event, context)`. Region: `ap-northeast-1`. |
| Upstream | Jorudan | Public Japanese transit search. Requires a 6-hop, cross-subdomain cookie handshake to bypass bot detection (see §5 Data Flow). |

## 3. Layers & Modules

| Module | Responsibility | Source path |
| --- | --- | --- |
| `handler(event, context)` | Entry point; normalizes the request path, orchestrates the cookie flow across origins, parses the results HTML, and returns the JSON response | `src/index.mjs` |
| `performBotHandshake()` | Emulates the browser bot-check flow for each origin, with one `CookieJar` and one overall timeout budget per call | `src/index.mjs` |
| `extractJsRedirect()` | Reads the (single- or double-quoted) `window.location.href` from the JS redirect stub, using a non-backtracking negated character class | `src/index.mjs` |
| `splitRoutes()` | Splits the target HTML block on the `(?=発着時間：)` lookahead to separate individual route candidates | `src/index.mjs` |
| `isAllowedUrl()` | SSRF allowlist guard applied to every hop URL and the plaintext `verify_uuid` body | `src/index.mjs` |
| `escapeRegExp()` | Escapes dynamic substrings used inside route-parsing regular expressions to prevent ReDoS | `src/index.mjs` |
| `CookieJar` | Domain-attribute–honouring cookie store built on `Headers.getSetCookie()` | `src/index.mjs` |
| Local dev server | Serves the unprefixed `/transit` and `/status` paths for local development | `src/dev-server.mjs` |
| Design token source | YAML frontmatter holding every export-modelable token (colors, typography scale, radii, spacing) | `frontend/DESIGN.md` |
| `buildTokensCss()` | Runs the pinned local `design.md` bin, rewrites the exporter's Tailwind `@theme {` block into `:root {`, and fails closed rather than writing empty or untransformed output | `frontend/scripts/export-design.mjs` |
| Generated token stylesheet | The `:root` custom properties exported from the DESIGN.md frontmatter. **Generated — never hand-edited** | `frontend/src/design-tokens.css` |
| Global stylesheet | Imports the generated tokens, then declares the hand-authored residue (aliases + non-modelable tokens) and the reset/base/focus/scrollbar rules | `frontend/src/index.css` |
| Token pipeline test | Vitest suite guarding token integrity and generated-file drift (see §7) | `frontend/tests/design-tokens.test.ts` |

## 4. Data Model

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

## 5. Data Flow

### API Path Normalization

The Lambda handler accepts paths from both direct API Gateway invocations and CloudFront-proxied calls:

- `/transit` and `/api/transit` → transit endpoint
- `/status` and `/api/status` → status endpoint

This lets the dev server (which exposes the unprefixed paths) and CloudFront (which prefixes with `/api`) hit the same handler without per-environment branching.

### Jorudan Bot Detection — 6-Hop `jrd_uuid` Cookie Handshake

Jorudan fronts its site with CloudFront and a JavaScript-based bot check. A naive `fetch()` against the search URL receives an HTML stub instead of the transit results page, because the real URL is computed client-side and gated behind a UUID-cookie handshake performed on a **separate subdomain** (`jid.jorudan.co.jp`).

`performBotHandshake()` in `src/index.mjs` emulates the browser flow for each origin (one `CookieJar` and one overall budget per call):

1. **Initial request** — GET the `nori.cgi` search URL on `www.jorudan.co.jp`. The body is a JS redirect page; `extractJsRedirect()` reads the (single- or double-quoted) `window.location.href`, which is now an **absolute cross-host URL** to `https://jid.jorudan.co.jp/jrd_uuid/?returl=...`. (Fast-path: if this first response already contains the results marker `<hr size="1"`, it is returned directly.)
2. **jid page** — GET the `jrd_uuid` page on `jid.jorudan.co.jp`. In a real browser its inline JS drives the next two AJAX calls; the handler derives those URLs directly from this page URL's querystring.
3. **set_uuid** — **POST** `jid.../jrd_uuid/set_uuid.cgi?<returl...>&ts=<epoch>` with browser-`fetch()`-equivalent AJAX headers (`Accept: */*`, `Referer` = the jid **origin root** `https://jid.jorudan.co.jp/`, `Sec-Fetch-Site: same-origin`, `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`) and a urlencoded browser-fingerprint body (`tz, lang, sw, sh, cd, mem, hc, ua, ts`). A bare **GET** (or a POST missing the fingerprint body/headers) returns **403** (`./error.html`). Responds with `Set-Cookie jrd_cuid` (`Domain=jid.jorudan.co.jp`, short `max-age`).
4. **verify_uuid** — **POST** `jid.../jrd_uuid/verify_uuid.cgi?<returl...>&ts=<epoch>` with the same AJAX headers, fingerprint body, and the `jrd_cuid` cookie. The **response body is the plaintext final URL** (`https://www.jorudan.co.jp/webuser/redirect2.cgi?url=...`) and it sets `Set-Cookie jrd_uuid` with `Domain=.jorudan.co.jp` (shared across subdomains). `jrd_uuid` is the sole gating cookie — once set, the final `nori.cgi` renders directly, so a single `set_uuid → verify_uuid` pair is sufficient (no second `set_uuid` is required).
5. **redirect2** — GET `www.../webuser/redirect2.cgi?url=...` → `302` whose `Location` is the authoritative `nori.cgi` URL.
6. **Authoritative fetch** — GET the final `nori.cgi` with the cookie jar. Because `jrd_uuid` is a parent-domain (`.jorudan.co.jp`) cookie it is sent to `www`; the jid-host-only `jrd_cuid` is not. The response is the rendered transit results HTML (verified by the `<hr size="1"` marker).

### HTML Parsing

The transit results page is server-rendered HTML. The handler:

- Splits by `<hr size="1" color="black">` (handles both self-closing and non-self-closing forms).
- Normalizes line endings via `/\r?\n\r?\n/` so CRLF and LF responses parse identically.
- Picks `blocks[TARGET_BLOCK_INDEX]` (index `2`) — the block that contains all candidate transit routes.
- Calls `splitRoutes()`, which splits on the lookahead `(?=発着時間：)` to separate individual route candidates.
- Returns up to `MAX_CANDIDATES` (`2`) routes.

Dynamic substrings used inside regular expressions are escaped via `escapeRegExp()` to prevent ReDoS.

### Design Token Generation (build time)

The frontmatter of [`frontend/DESIGN.md`](../frontend/DESIGN.md) is the source of truth for every export-modelable design token. `npm run export:design` (in `frontend/`) runs `node scripts/export-design.mjs`, which:

1. Executes the pinned local bin `frontend/node_modules/.bin/design.md` as `design.md export --format css-tailwind DESIGN.md`.
2. Rewrites every `@theme {` block the exporter emits into `:root {` — this project does not use Tailwind, and a browser ignores `@theme`, so the custom properties inside it would never register.
3. Fails closed: it throws instead of writing if no `:root {` block resulted, if an unconverted `@theme` remains, or if the output declares zero `--token:` properties.
4. Writes the result — prefixed with a `GENERATED FILE - DO NOT EDIT` header naming DESIGN.md as the source — to `frontend/src/design-tokens.css`, which carries `--color-*`, `--text-<level>`, `--font-weight-*`, `--tracking-*`, `--radius-*`, and `--spacing-*`.

`frontend/src/index.css` `@import`s the generated file and then declares the hand-authored residue in a single `:root` block:

- **Alias layer** — maps generated names onto the names the existing `*.module.css` call sites use: `--bg-*`, `--border-*`, `--text-primary/secondary/tertiary`, `--accent-*` (from `--color-*`), `--font-size-*` (from `--text-<level>`, which would otherwise collide with the `--text-*` color family), and `--space-*` (from `--spacing-*`). `--radius-sm/md/lg` need no alias — the export already emits those exact names.
- **Residue proper** — the tokens `@google/design.md` cannot model, which are their own source of truth: the multi-family font stacks `--font-sans` / `--font-mono` and the transitions `--transition-fast` / `--transition-normal`.

`npm run lint:design` (`design.md lint DESIGN.md`) lints the source document.

## 6. External Integrations

### Jorudan

The upstream Japanese transit search at `www.jorudan.co.jp` (with the UUID handshake on `jid.jorudan.co.jp`). It publishes no API and gates results behind the bot-check handshake detailed in §5.

### `@google/design.md` (build-time tool)

`@google/design.md` is an exact-pinned devDependency of `frontend/` (`"0.3.0"`, no range). It is invoked only through its local bin — the export script resolves `frontend/node_modules/.bin/design.md` by absolute path rather than an unpinned `npx` lookup — and only for two commands: `export --format css-tailwind DESIGN.md` (token generation, §5) and `lint DESIGN.md` (`npm run lint:design`). It is a build/author-time dependency: nothing from it ships in the browser bundle, and the generated stylesheet contains no `@import` or remote `url(...)` reference.

### Production Deploy Constraint

CloudFront's flat-rate pricing plan requires the distribution to keep an attached AWS WAF Web ACL at all times. The Web ACL ARN lives in the `WEB_ACL_ARN_PROD` GitHub Actions secret on the `production` environment, and the `Deploy to Production` workflow injects it via `--parameter-overrides`. The Web ACL itself is **not** managed by this stack — it was created by the pricing-plan opt-in. See [`CLAUDE.md`](../CLAUDE.md#how--development-workflow) for the operational procedure.

### CI/CD Deploy Role IAM Policy

The `Deploy to Production` workflow assumes the OIDC role `gh-actions-deploy-prod` (`arn:aws:iam::<ACCT>:role/gh-actions-deploy-prod`). The role's permissions are a least-privilege custom policy — `gh-actions-deploy-prod-leastpriv` — scoped to exactly what `sam deploy` of [`template.yml`](../template.yml) plus the post-deploy steps in [`deploy-production.yml`](../.github/workflows/deploy-production.yml) require. No `*FullAccess` AWS managed policy (and in particular no `IAMFullAccess` / `iam:*`) is attached.

#### What the workflow touches

| Service | Why | Scope |
|---------|-----|-------|
| CloudFormation | Drift detect, change set create/execute, stack + output reads | `stack/transitmikanmarusan/*`; read-only on `stack/aws-sam-cli-managed-default/*` (so `--resolve-s3` can discover the artifact bucket) |
| S3 | `--resolve-s3` artifact upload + `aws s3 sync` of the frontend bundle | SAM managed bucket `<SAM_ARTIFACT_BUCKET>` and frontend bucket `<FRONTEND_BUCKET>` |
| Lambda | Function create/update/permission/tag during the change set | `function:transitmikanmarusan-*` |
| API Gateway | REST API + stage + deployment managed by the change set | `/restapis`, `/restapis/*`, and `/tags/*` |
| CloudFront | `GetDistributionConfig`, `UpdateDistribution`, OAC reads, `CreateInvalidation` | distribution `<CF_DISTRIBUTION_ID>` and OAC `<OAC_ID>` |
| IAM | Lambda execution role lifecycle (`CAPABILITY_IAM`) + `PassRole` to Lambda | `role/transitmikanmarusan-*`; `PassRole` further gated by `iam:PassedToService = lambda.amazonaws.com` |

#### Policy JSON

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
      "Resource": "arn:aws:cloudformation:ap-northeast-1:<ACCT>:stack/transitmikanmarusan/*"
    },
    {
      "Sid": "CloudFormationSamManagedStackRead",
      "Effect": "Allow",
      "Action": [
        "cloudformation:Describe*",
        "cloudformation:Get*",
        "cloudformation:List*"
      ],
      "Resource": "arn:aws:cloudformation:ap-northeast-1:<ACCT>:stack/aws-sam-cli-managed-default/*"
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
        "arn:aws:s3:::<SAM_ARTIFACT_BUCKET>",
        "arn:aws:s3:::<FRONTEND_BUCKET>"
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
        "arn:aws:s3:::<SAM_ARTIFACT_BUCKET>/*",
        "arn:aws:s3:::<FRONTEND_BUCKET>/*"
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
      "Resource": "arn:aws:lambda:ap-northeast-1:<ACCT>:function:transitmikanmarusan-*"
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
        "arn:aws:cloudfront::<ACCT>:distribution/<CF_DISTRIBUTION_ID>",
        "arn:aws:cloudfront::<ACCT>:origin-access-control/<OAC_ID>"
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
      "Resource": "arn:aws:iam::<ACCT>:role/transitmikanmarusan-*"
    },
    {
      "Sid": "IamPassRoleToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCT>:role/transitmikanmarusan-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "lambda.amazonaws.com"
        }
      }
    }
  ]
}
```

#### Notes on scoping decisions

- **Account-wide reads are unavoidable for four CloudFormation actions.** `ValidateTemplate`, `ListStacks`, `DescribeStackDriftDetectionStatus`, and `GetTemplateSummary` do not support resource-level permissions, so they sit in their own `Resource: "*"` statement. They are read/validate-only and carry no write blast radius.
- **No `logs:*` is granted.** The template puts `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents` inside the Lambda execution role's inline policy (created via `iam:PutRolePolicy`), so the deploy role itself needs no CloudWatch Logs permissions. This omission is deliberate but load-bearing: if an explicit `AWS::Logs::LogGroup` resource is ever added to the template (e.g. to set log retention), grant the deploy role `logs:CreateLogGroup` / `DeleteLogGroup` / `PutRetentionPolicy` / `TagResource` scoped to `log-group:/aws/lambda/transitmikanmarusan-*`.
- **`cloudformation:DeleteStack` is intentionally excluded.** The workflow only ever updates the existing stack via change sets, so a deploy-only role has no reason to delete the production stack; re-grant it temporarily only for an intentional teardown.
- **`--resolve-s3` reads the SAM managed stack.** SAM discovers the artifact bucket by describing the `aws-sam-cli-managed-default` CloudFormation stack, hence the read-only second statement. Bucket *creation* is not granted because the bucket already exists; if it is ever deleted, temporarily widen S3/CloudFormation create permissions to re-bootstrap it.
- **The SAM transform needs its own `CreateChangeSet` grant.** Because `template.yml` uses `Transform: AWS::Serverless-2016-10-31`, CloudFormation evaluates the macro during change-set creation and authorizes `cloudformation:CreateChangeSet` against the transform ARN `arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31` (an AWS-owned resource), separately from the stack ARN. The `CloudFormationServerlessTransform` statement covers exactly that ARN.
- **`DetectStackDrift` also requires `DetectStackResourceDrift`.** The async drift API fans out to a per-resource `cloudformation:DetectStackResourceDrift` call, so both actions are granted on the stack ARN.
- **API Gateway is scoped by path, not by REST API id.** `apigateway:*` resource ARNs are path-based; pinning `/restapis/<REST_API_ID>` would break the deploy if CloudFormation ever replaces the REST API. `/restapis/*` keeps the deploy resilient while still excluding every other AWS service.
- **CloudFront resource-level scoping.** The distribution and OAC are pinned by id. Distribution/OAC *replacement* (which needs account-level `cloudfront:CreateDistribution` / `CreateOriginAccessControl`) is intentionally excluded as least-privilege; grant it temporarily only if a future change forces a replace.
- **`iam:PassRole` is gated by `iam:PassedToService`.** Even within `role/transitmikanmarusan-*`, the role can only be passed to Lambda, closing the pass-role-to-arbitrary-service escalation path.

#### Applying and verifying

This policy is the documented target. Apply and verify it against the live role with the following sequence (the `dry-run` path must pass before detaching the managed policies, per the rollback risk noted in #52):

```bash
ACCOUNT=<ACCT>
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

## 7. Cross-cutting

### Guards

- **SSRF — `isAllowedUrl()`**: every hop's URL (and the plaintext `verify_uuid` body) is parsed with the WHATWG `URL` API and accepted only if it is `https:` and its exact `.hostname` is in the allowlist `{www.jorudan.co.jp, jid.jorudan.co.jp}` (with no embedded credentials). This rejects off-allowlist hosts, look-alike suffixes (`jorudan.co.jp.evil.com`), the bare apex, TLS downgrades (`http://169.254.169.254/...`), protocol-relative `//host`, and `data:`/`javascript:`/`file:`/`ftp:` schemes.
- **Cookies — Domain-attribute scoping**: a `CookieJar` (built on `Headers.getSetCookie()`) honours each `Set-Cookie` `Domain` — host-only when absent, shared only when `Domain=.jorudan.co.jp` — so no jid-scoped cookie leaks to `www` and vice versa.
- **Timeout budget**: each hop is capped at `PER_HOP_TIMEOUT_MS` (2.5s) and the whole per-origin chain at `OVERALL_BUDGET_MS` (7s), via `AbortSignal.timeout(min(perHop, remaining))`, keeping the 6-hop chain inside the Lambda `Timeout` (15s). The 3 origins run concurrently via `Promise.allSettled`, so one origin failing still returns the others (HTTP 200); all failing returns 500.
- **ReDoS**: `extractJsRedirect()` uses a non-backtracking negated character class (`[^'"]+`), and dynamic substrings used in route-parsing regexes are escaped via `escapeRegExp()`.

### Design Token Integrity

`frontend/tests/design-tokens.test.ts` (Vitest, run by `npm test` in `frontend/`) imports the same `buildTokensCss()` that `npm run export:design` writes with, so it exercises the real export path rather than a re-implementation. It asserts that:

- every `var(--token)` referenced anywhere under `frontend/src/**/*.css` resolves to a custom property declared at `:root` in either the generated file or `index.css`;
- no CSS file declares a custom property outside a `:root` block;
- the alias layer never redeclares a generated token name (a redeclaration would shadow the import and make `--x: var(--x)` a self-referential cycle);
- every `:root` declaration in `index.css` delegates through `var(--…)` except the four residue tokens (`--font-sans`, `--font-mono`, `--transition-fast`, `--transition-normal`), and `index.css` still imports `./design-tokens.css`;
- the generated file keeps its `DO NOT EDIT` header, holds a plain `:root {` block with no `@theme`, and pulls in no external `@import` / remote font URL;
- the committed `design-tokens.css` is **byte-identical** to a fresh export (exact equality, catching hand-edits) and the export is idempotent.

### Observability

The handler emits structured JSON logs to CloudWatch so each step of the cookie flow (initial fetch, cookie set, final fetch, parse outcome) is queryable.

## 8. Glossary

- **`jrd_uuid`** — the sole gating cookie, set by `verify_uuid` with `Domain=.jorudan.co.jp` (shared across subdomains). Once present, the final `nori.cgi` renders the results HTML directly.
- **`jrd_cuid`** — the jid-host-only cookie set by `set_uuid` with `Domain=jid.jorudan.co.jp` and a short `max-age`; not sent to `www`.
- **`nori.cgi`** — Jorudan's transit search/results endpoint on `www.jorudan.co.jp`.
- **`jid.jorudan.co.jp`** — the separate subdomain that hosts the `jrd_uuid` UUID-cookie handshake (`set_uuid.cgi`, `verify_uuid.cgi`).
- **`TARGET_BLOCK_INDEX`** — index `2`, the HTML block (between `<hr>` separators) that contains all candidate transit routes.
- **`MAX_CANDIDATES`** — the maximum number of route candidates returned (`2`).
- **WAF Web ACL** — the AWS WAF resource that must stay attached to the CloudFront distribution under its flat-rate pricing plan; ARN held in `WEB_ACL_ARN_PROD`.
- **OAC** — CloudFront Origin Access Control, fronting the S3 origin.
- **`gh-actions-deploy-prod`** — the GitHub OIDC IAM role assumed by the `Deploy to Production` workflow; backed by the least-privilege `gh-actions-deploy-prod-leastpriv` policy.
- **DESIGN.md** — `frontend/DESIGN.md`; its YAML frontmatter is the source of truth for the export-modelable design tokens.
- **`design-tokens.css`** — `frontend/src/design-tokens.css`, generated from the DESIGN.md frontmatter by `npm run export:design`. Never hand-edited.
- **Residue layer** — the hand-authored `:root` block in `frontend/src/index.css`: aliases from the generated token names onto the names call sites use, plus the tokens the exporter cannot model (font stacks, transitions).
- **SSRF** — Server-Side Request Forgery; mitigated by `isAllowedUrl()`.
- **ReDoS** — Regular-expression Denial of Service; mitigated by `escapeRegExp()` and non-backtracking patterns.
