---
status: Accepted
applyTo: template.yml, Dockerfile, frontend/Dockerfile, .github/workflows/ci.yml, .github/workflows/deploy-production.yml, package.json, src/package.json, frontend/package.json
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0005. Node.js 24 as the runtime and toolchain baseline

## Status
Accepted

## Context
Every place this repository names a Node.js major today names 22:

- `template.yml:42` — `Runtime: nodejs22.x` (the deployed Lambda runtime).
- `Dockerfile:2` — `public.ecr.aws/lambda/nodejs:22`; `Dockerfile:14` and
  `frontend/Dockerfile:2,13` — `node:22-slim` (the local containers).
- `.github/workflows/ci.yml:16,31,68` and
  `.github/workflows/deploy-production.yml:22,39,70` — `node-version: '22'`
  (CI and the production deploy).
- `package.json` and `src/package.json` — `"engines": { "node": ">=22.0.0" }`.
  `frontend/package.json` declares no `engines` field at all, so the frontend
  workspace pins no floor.
- `frontend/package.json:31` — `"@types/node": "^22.20.1"`, the type surface the
  frontend typechecks against.

AWS has published the end of that baseline: the `nodejs22.x` Lambda runtime
reaches deprecation on 2027-04-30, after which function creation is blocked from
2027-06-01 and function updates from 2027-07-01. Staying on 22 therefore is not a
steady state — it is a deferred migration with a deadline attached, and the
deadline lands on a personal commute board that nobody is on call for.

`nodejs24.x` has been generally available on Lambda since 2025-11-25 and is not
scheduled for deprecation until 2028-04-30, which buys roughly a further year of
runway over 22. The next major, `nodejs26.x`, is in public preview with no SLA as
of the 2026-09-13 survey behind this decision, so it is not a production option.

Every date in the two paragraphs above is an external AWS fact, not something
this repository can assert, and AWS does shift these dates. They were read on
2026-09-13 from the Lambda runtime support policy
(<https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html>); a reader
acting on this record later should re-check that page rather than trust the
numbers transcribed here.

Two properties of this repository decide how disruptive the move is. First, the
Lambda handler at `src/index.mjs:381` is `export async function handler(event,
_context)`; the Node 24 Lambda runtime drops support for callback-style handlers,
and an `async` handler is unaffected by that removal. Second, the runtime major
and the frontend's `@types/node` major are two halves of one contract — typing
the frontend against Node 22 declarations while the code runs on 24 lets the
typechecker approve calls the runtime does not have.

This is the prerequisite decision for the upgrade issues in the same batch that
cite it as `prerequisite-adr: 0005`; those issues change the files listed in
`applyTo`, which this ADR does not touch. At the time this record is written the
repository still runs Node 22 everywhere listed above — the Node 24 settings
below are decided, not yet in place.

## Decision
Adopt Node.js 24 as the single runtime and toolchain baseline across the Lambda
function, the local containers, and CI, because it is the newest GA Lambda
runtime, it costs no application-code change here (the handler is already
`async`), and it moves the forced-migration deadline out by about a year.

Concretely, the upgrade issues that cite this ADR will set:

- **Lambda runtime** — `template.yml` `Runtime: nodejs24.x`.
- **Container images** — `public.ecr.aws/lambda/nodejs:24` and `node:24-slim`,
  keeping the floating major tags the Dockerfiles already use rather than
  introducing digest pinning in the same change.
- **CI and deploy** — `actions/setup-node` with `node-version: '24'`.
- **Engine floors** — `"engines": { "node": ">=24.0.0" }` in all three packages:
  the root, `src/`, and `frontend/`. The frontend gains an `engines` field it
  does not have today, so the three workspaces state one floor instead of two
  plus a silence.
- **Type surface** — frontend `@types/node` at `^24`, matching the runtime major.
- **Runtime management** — `template.yml`'s existing
  `RuntimeManagementConfig: UpdateRuntimeOn: Auto` (`template.yml:77-78`) is kept
  unchanged, so 24.x minor runtime updates continue to be applied automatically.

ADR 0001 records the Jorudan cookie-flow scraper and describes it as running on
"Node.js 22". That is a historical statement of fact at the time 0001 was
written, and 0001's decision — the hand-rolled cookie-flow scraper on Lambda
rather than a headless browser or a paid API — is unchanged by this record. This
ADR therefore does not supersede or amend 0001; it only moves the runtime major
that 0001's scraper happens to execute on.

## Consequences
- Positive: the Lambda runtime named in `template.yml` carries a supported-until
  date of 2028-04-30 instead of 2027-04-30, and the repository stops spanning two
  Node majors between its runtime declaration and its `@types/node` type surface.
- Positive: stating `>=24.0.0` in all three `package.json` files, including the
  `frontend/` package that declares no `engines` today, makes the floor uniform
  and machine-checkable instead of implied by the Dockerfiles.
- Negative — callback-style Lambda handlers stop being an option. The current
  handler (`src/index.mjs:381`) is `async` and is unaffected, but any future
  handler or vendored code written in the callback style will fail on this
  runtime with no 22-era fallback available.
- Negative — a developer on a Node 22 host gets an npm `EBADENGINE` warning from
  all three packages. The repository has no `.npmrc` setting `engine-strict`, so
  the install still succeeds; the cost is warning noise on every install rather
  than a hard failure, which is the weaker signal of the two.
- Negative — keeping `UpdateRuntimeOn: Auto` means AWS applies 24.x minor runtime
  updates to the deployed function without a deploy of ours. That is deliberate,
  because it is how security patches arrive, but it means a runtime-side behavior
  change can reach production between our deploys, and the deploy workflow's
  health check covers `/api/status`, which does not exercise the outbound Jorudan
  `fetch` path where such a change would surface.
- Negative — the floating major tags (`nodejs:24`, `node:24-slim`,
  `node-version: '24'`) are kept, so local and CI builds remain non-reproducible
  across 24.x releases. This is unchanged from the `:22` tags in use today, not a
  new exposure, but this decision declines the opportunity to fix it.

### Rejected alternatives
- **Stay on `nodejs22.x`** — zero work today, but `template.yml:42` would be
  running a runtime that AWS deprecates on 2027-04-30 and stops accepting
  updates for on 2027-07-01, converting a voluntary upgrade into a forced one on
  AWS's schedule. Rejected.
- **Jump straight to `nodejs26.x`** — would skip an upgrade cycle, but the
  `nodejs26.x` Lambda runtime is in public preview with no SLA, so
  `template.yml` cannot name it for a function that serves the live board.
  Rejected; a later 24 -> 26 bump once 26 is GA remains open.
- **Single-source the version via `.nvmrc` plus `node-version-file`** — would
  collapse the six `node-version: '22'` lines in `ci.yml` and
  `deploy-production.yml` and the three `engines` declarations to one place, and
  is attractive on its own merits. Rejected here only as scope: it changes how
  the version is expressed, which is a separate decision from which version is
  chosen, and folding it in would make this upgrade's diff impossible to read as
  a version bump.
