---
status: Accepted
applyTo: infra/deploy-iam.yml, template.yml, .github/workflows/deploy-production.yml
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0009. Deploy IAM identity in a separate bootstrap stack

## Status
Accepted

## Context
The `Deploy to Production` workflow authenticates to AWS through GitHub OIDC.
Its `deploy` job runs in the `production` environment with `id-token: write`
and assumes the role whose ARN is held in the `AWS_DEPLOY_ROLE_ARN_PROD`
secret (`.github/workflows/deploy-production.yml`). That identity has three
parts, and no template in this repository declares any of them:

- the GitHub OIDC provider;
- the role `gh-actions-deploy-prod`, whose trust policy pins assumption to
  `repo:mikanmarusan/lambda-function-transit:environment:production`
  (`CLAUDE.md`, "Production Deploys");
- the customer-managed policy `gh-actions-deploy-prod-leastpriv`.

`template.yml` declares none of them, and `infra/` does not exist. The policy
exists in the repository only as the "Policy JSON" in `docs/architecture.md`
§6, a copy with `<ACCT>`, `<SAM_ARTIFACT_BUCKET>`, `<FRONTEND_BUCKET>`,
`<CF_DISTRIBUTION_ID>` and `<OAC_ID>` placeholders. §6 applies it with a
hand-run `aws iam create-policy` / `attach-role-policy` /
`detach-role-policy` sequence. Nothing ties that copy to the live account. A
read-only check of the live account on 2026-11-18, recorded in #145, found
two things. The live policy's default version (v3) equals the §6 JSON once
its placeholders are substituted. The role's trust policy already uses
`StringEquals` on both `aud` and `sub`.

Today the deploy role holds no IAM action that targets its own role or
policy directly. In the §6 policy, the two IAM statements
(`IamRoleLifecycle`, `IamPassRoleToLambda`) are scoped to
`role/transitmikanmarusan-*`, which is the Lambda execution role that
`samconfig.toml`'s `CAPABILITY_IAM` lets the `transitmikanmarusan` stack
create; `gh-actions-deploy-prod` does not match that pattern, and no
statement grants `iam:CreatePolicyVersion` or any other action on a managed
policy. The only CloudFormation statement that can change a stack,
`CloudFormationDeployStack`, is scoped to `stack/transitmikanmarusan/*`.
Codifying the identity must keep that property. The property also rests on
§6's statement that no `*FullAccess` managed policy is attached to the role;
the read-only check recorded in #145 covered the leastpriv policy, not the
role's full list of attached policies. The boundary is direct only: the
Consequences record the indirect path through the application stack.

The planned `template.yml` hardening (#148) needs grants that the §6 policy
does not hold:

- `FrontendBucket` declares a public access block and encryption but no
  `OwnershipControls`, and the `S3BucketLevel` statement has no
  `s3:PutBucketOwnershipControls`.
- `TransitFunction` logs through the inline `Policies`, which grant
  `logs:CreateLogGroup` on `arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*`.
  No statement in the §6 policy grants any `logs:` action. §6's own note says
  so, and says an explicit `AWS::Logs::LogGroup` would need deploy-role
  grants.

The workflow's "Detect CloudFormation drift" step runs `detect-stack-drift`
on `transitmikanmarusan` with the deploy role's credentials. It fails the
deploy unless the stack is `IN_SYNC`.

The WAF Web ACL is not part of this identity. The CloudFront pricing-plan
opt-in created it, the `transitmikanmarusan` stack does not manage it, and
`template.yml` takes its ARN only as the `WebACLArn` parameter.

No earlier ADR decides how the deploy identity is managed. ADR 0005 lists
`deploy-production.yml` in its `applyTo` for its Node.js version pin (and
remarks on the workflow's health check), and ADR 0006 mentions the workflow only for the order of its deploy steps. This
record refines, narrows or supersedes neither.

## Decision

- **D-1 — A separate bootstrap stack owns the deploy identity.** A stack
  built from a new template, `infra/deploy-iam.yml`, owns the GitHub OIDC
  provider, the `gh-actions-deploy-prod` role and the
  `gh-actions-deploy-prod-leastpriv` managed policy. The reason is that the
  deploy role must never be able to modify its own permissions. This stack
  keeps the direct path closed (the deploy role gets no rights over its own role
  or policy); the indirect path through the application stack stays open
  and is recorded under Consequences. #145 gives
  `transitmikanmarusan-deploy-iam` only as an example, so the stack name is
  left to the rollout. A name outside the deploy role's
  `stack/transitmikanmarusan/*` scope, as the example is, keeps the stack
  out of that role's reach.

- **D-2 — An administrator applies it; the workflow never does.** An account
  administrator applies the deploy-IAM stack. `Deploy to Production` never
  creates, updates or imports it.

- **D-3 — Import, never recreate.** The three live resources move under the
  new stack through an IMPORT change set. They are not deleted and recreated,
  so the role ARN held in `AWS_DEPLOY_ROLE_ARN_PROD` stays valid.

- **D-4 — One template for both rollout steps.** `infra/deploy-iam.yml` takes
  a parameter `EnableAppStackV2Grants` (`'true'` | `'false'`, default
  `'false'`). First, the IMPORT runs with `'false'`, which renders a policy
  equal to the live one. Then a stack update sets it to `'true'`. One
  committed template serves both steps.

- **D-5 — New grants, only behind `EnableAppStackV2Grants`.** Each grant has
  the reason given here:
  - `s3:PutBucketOwnershipControls` on the frontend bucket. Once
    `OwnershipControls` is declared on `FrontendBucket`, CloudFormation's S3
    update handler calls it.
  - `logs:CreateLogGroup`, `logs:DeleteLogGroup`, `logs:PutRetentionPolicy`,
    `logs:DeleteRetentionPolicy`, `logs:TagResource`, `logs:UntagResource`,
    `logs:ListTagsForResource` and `logs:GetDataProtectionPolicy` on the new
    log group `/aws/lambda/<app-stack>/TransitFunction`, where `<app-stack>`
    is the application stack's name. #148 adds this log group to
    `template.yml`, and these are the handler permissions CloudFormation's
    `AWS::Logs::LogGroup` resource type lists for creating, updating, tagging
    and deleting it (per the `describe-type` reading recorded in #145).
  - `logs:DescribeLogGroups`, `logs:DescribeResourcePolicies` and
    `logs:DescribeIndexPolicies` on `Resource: "*"`. These actions are
    read-only and cannot be narrowed to one log group. Drift detection reads
    them with the caller's credentials.

The WAF Web ACL is out of scope and stays as described in Context.

This ADR records the decision only. `infra/deploy-iam.yml` (#146) and the
`template.yml` change (#148) are written by the issues that implement it.

## Consequences
- Positive: codifying the identity keeps the deploy role's own role and
  policy out of its reach, as they are today. Editing them still takes an
  administrator acting outside the workflow, so a compromised or mistaken
  deploy run cannot directly rewrite its own policy.
- Positive: the policy becomes a committed template instead of a hand-applied
  doc copy. A permission change is a reviewable diff, and the identity can be
  rebuilt from the repository.
- Positive: importing keeps the live ARN, the trust policy and the secret
  unchanged, and `EnableAppStackV2Grants` lets the import and the grant
  update use the same file.
- Negative: applying the deploy-IAM stack and running `Deploy to Production`
  are human steps outside any repository change. Merging a change to
  `infra/deploy-iam.yml` changes nothing in AWS, so the repository can state
  a policy that the account does not yet have.
- Negative: a deploy freeze runs from the merge of the `template.yml` change
  until the deploy-IAM stack update (`EnableAppStackV2Grants='true'`) is
  live. Until then the deploy role lacks the S3 and logs grants that the new
  template needs.
- Negative: the three `logs:Describe*` actions are granted account-wide. They
  are read-only, but they widen what the role can enumerate beyond this
  project's log group.
- Negative: the `'false'` value stays valid after the rollout and is the
  default. A later stack update that passes `'false'`, or that omits the
  parameter without keeping its previous value, renders the pre-rollout
  policy, removes the D-5 grants and brings the freeze back.
- Negative: this decision does not close the indirect path through the
  application stack. `IamRoleLifecycle` still lets the deploy role create
  `role/transitmikanmarusan-*` roles, attach any managed or inline policy to
  them and set any trust policy on them (no permissions boundary or
  policy-ARN condition applies), and `IamPassRoleToLambda` lets it pass them
  to Lambda. A deploy run could therefore reach broader rights, including
  over its own policy, through such a role.
- Negative: the workflow's drift step checks only `transitmikanmarusan`.
  Nothing in the repository detects drift on the deploy-IAM stack.

### Rejected alternatives
- **Manage the role inside `template.yml`** — rejected. The
  `transitmikanmarusan` stack is deployed by the deploy role itself, so the
  role would need IAM rights over its own role and policy. D-1 exists to
  keep exactly that direct grant closed.
- **Terraform or CDK** — rejected. Either one adds a second toolchain next
  to SAM/CloudFormation (and, for Terraform, a state backend), all for three
  resources.
