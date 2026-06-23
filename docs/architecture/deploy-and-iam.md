# Deploy and IAM

> Part of [Architecture overview](../architecture.md).

## Production Deploy Constraint

CloudFront's flat-rate pricing plan requires the distribution to keep an attached AWS WAF Web ACL at all times. The Web ACL ARN lives in the `WEB_ACL_ARN_PROD` GitHub Actions secret on the `production` environment, and the `Deploy to Production` workflow injects it via `--parameter-overrides`. The Web ACL itself is **not** managed by this stack — it was created by the pricing-plan opt-in. See [`CLAUDE.md`](../../CLAUDE.md#how--development-workflow) for the operational procedure.

## CI/CD Deploy Role IAM Policy

The `Deploy to Production` workflow assumes the OIDC role `gh-actions-deploy-prod` (`arn:aws:iam::<ACCT>:role/gh-actions-deploy-prod`). The role's permissions are a least-privilege custom policy — `gh-actions-deploy-prod-leastpriv` — scoped to exactly what `sam deploy` of [`template.yml`](../../template.yml) plus the post-deploy steps in [`deploy-production.yml`](../../.github/workflows/deploy-production.yml) require. No `*FullAccess` AWS managed policy (and in particular no `IAMFullAccess` / `iam:*`) is attached.

### What the workflow touches

| Service | Why | Scope |
|---------|-----|-------|
| CloudFormation | Drift detect, change set create/execute, stack + output reads | `stack/transitmikanmarusan/*`; read-only on `stack/aws-sam-cli-managed-default/*` (so `--resolve-s3` can discover the artifact bucket) |
| S3 | `--resolve-s3` artifact upload + `aws s3 sync` of the frontend bundle | SAM managed bucket `<SAM_ARTIFACT_BUCKET>` and frontend bucket `<FRONTEND_BUCKET>` |
| Lambda | Function create/update/permission/tag during the change set | `function:transitmikanmarusan-*` |
| API Gateway | REST API + stage + deployment managed by the change set | `/restapis`, `/restapis/*`, and `/tags/*` |
| CloudFront | `GetDistributionConfig`, `UpdateDistribution`, OAC reads, `CreateInvalidation` | distribution `<CF_DISTRIBUTION_ID>` and OAC `<OAC_ID>` |
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

### Notes on scoping decisions

- **Account-wide reads are unavoidable for four CloudFormation actions.** `ValidateTemplate`, `ListStacks`, `DescribeStackDriftDetectionStatus`, and `GetTemplateSummary` do not support resource-level permissions, so they sit in their own `Resource: "*"` statement. They are read/validate-only and carry no write blast radius.
- **No `logs:*` is granted.** The template puts `logs:CreateLogGroup` / `CreateLogStream` / `PutLogEvents` inside the Lambda execution role's inline policy (created via `iam:PutRolePolicy`), so the deploy role itself needs no CloudWatch Logs permissions. This omission is deliberate but load-bearing: if an explicit `AWS::Logs::LogGroup` resource is ever added to the template (e.g. to set log retention), grant the deploy role `logs:CreateLogGroup` / `DeleteLogGroup` / `PutRetentionPolicy` / `TagResource` scoped to `log-group:/aws/lambda/transitmikanmarusan-*`.
- **`cloudformation:DeleteStack` is intentionally excluded.** The workflow only ever updates the existing stack via change sets, so a deploy-only role has no reason to delete the production stack; re-grant it temporarily only for an intentional teardown.
- **`--resolve-s3` reads the SAM managed stack.** SAM discovers the artifact bucket by describing the `aws-sam-cli-managed-default` CloudFormation stack, hence the read-only second statement. Bucket *creation* is not granted because the bucket already exists; if it is ever deleted, temporarily widen S3/CloudFormation create permissions to re-bootstrap it.
- **The SAM transform needs its own `CreateChangeSet` grant.** Because `template.yml` uses `Transform: AWS::Serverless-2016-10-31`, CloudFormation evaluates the macro during change-set creation and authorizes `cloudformation:CreateChangeSet` against the transform ARN `arn:aws:cloudformation:ap-northeast-1:aws:transform/Serverless-2016-10-31` (an AWS-owned resource), separately from the stack ARN. The `CloudFormationServerlessTransform` statement covers exactly that ARN.
- **`DetectStackDrift` also requires `DetectStackResourceDrift`.** The async drift API fans out to a per-resource `cloudformation:DetectStackResourceDrift` call, so both actions are granted on the stack ARN.
- **API Gateway is scoped by path, not by REST API id.** `apigateway:*` resource ARNs are path-based; pinning `/restapis/<REST_API_ID>` would break the deploy if CloudFormation ever replaces the REST API. `/restapis/*` keeps the deploy resilient while still excluding every other AWS service.
- **CloudFront resource-level scoping.** The distribution and OAC are pinned by id. Distribution/OAC *replacement* (which needs account-level `cloudfront:CreateDistribution` / `CreateOriginAccessControl`) is intentionally excluded as least-privilege; grant it temporarily only if a future change forces a replace.
- **`iam:PassRole` is gated by `iam:PassedToService`.** Even within `role/transitmikanmarusan-*`, the role can only be passed to Lambda, closing the pass-role-to-arbitrary-service escalation path.

### Applying and verifying

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
