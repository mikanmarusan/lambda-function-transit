---
status: Proposed
applyTo: frontend/**
---

<!-- applyTo is a local extension to MADR-Minimal (not a standard MADR field): it declares the blast radius this decision governs. -->

# 0002. Adopt Vite 8 (Rolldown/Oxc) for the frontend build

## Status
Proposed

## Context
Issue #61 asked to upgrade the frontend `vite` 6 → 8 to clear an `esbuild`
advisory (GHSA-gv7w-rqvm-qjhr). By the time the work started the premise was
already stale: on `main`, `npm audit --audit-level=high --prefix frontend`
reports 0 vulnerabilities — an earlier `vite 6.4.2 → 6.4.3` bump pulled
`esbuild` to `0.25.12`, which cleared the cited advisory, and that advisory was
itself withdrawn on 2026-06-17 as a mis-identified package. So the upgrade is no
longer a live-vulnerability fix but a defense-in-depth / maintenance move onto a
supported, maintained Vite major.

Vite 8 is not a routine version bump: it **replaces the esbuild + Rollup bundler
with Rolldown + Oxc** (and Lightning CSS for CSS minification). `esbuild` becomes
an *optional peer* that nothing in this project requests, so after the upgrade
`esbuild` is **removed from the dependency graph entirely**. `@vitejs/plugin-react`
6.0 requires Vite 8, coupling the plugin bump (4 → 6) to the Vite bump.
`vitest@4.1.8` already supports Vite 8 and needs no change. The frontend ships
pre-built static assets to S3/CloudFront, so the bundler never runs in
production — exposure of any dev-bundler issue is local-dev / CI only.

## Decision
Upgrade the frontend toolchain to `vite@^8.1.0` + `@vitejs/plugin-react@^6.0.3`,
accept **Rolldown** as the new bundler, and perform the migration **directly
(6 → 8 in one change, not stepwise 6 → 7 → 8)**. The stepwise path exists only to
isolate custom Rollup/esbuild/Babel/Sass configuration from the bundler swap, and
this project has none of that — `vite.config.ts` carries only `server`/`build`
options and a bare `react()` plugin, `tsconfig` already uses
`moduleResolution: "bundler"`, and Node is already 22 (satisfying Vite 8's
`^20.19 || >=22.12` engine). `8.1.0` is the floor: a vulnerability affected
`vite 8.0.0–8.0.15` and Vitest's Vite peer lagged the early 8.0.x line.

Issue #61's **AC #2 ("`esbuild >= 0.28.1`") is reinterpreted** as "no vulnerable
`esbuild` present (removed via Vite 8 / Rolldown)", because esbuild is no longer
installed and cannot be version-checked. Removal is strictly stronger than a
version bump.

Rejected alternatives:
- **Pin `esbuild` via `overrides` on Vite 6** — already tried in the issue's
  history; esbuild 0.28.x is incompatible with Vite 6's build pipeline (12 build
  errors), so it was reverted. No esbuild version is both patched and Vite-6-compatible.
- **Close Issue #61 as already-resolved** without upgrading — defensible (audit
  is clean), but leaves the frontend on an aging major and does not future-proof.

## Consequences
- Positive: AC #2 resolved by **removal** of esbuild from the tree (stronger than
  a bump); audit stays at 0 high; frontend aligns with current Vite/React
  tooling. Build/dev/test/deploy command surfaces and the `dist/` output contract
  are unchanged — no edits to CI, Dockerfile, or the deploy workflow.
- Negative: the esbuild → Rolldown bundler swap is the real change, not a simple
  version bump — output bundles are produced by a younger engine, so behavioral
  verification (the dev-env / E2E pass) is load-bearing. Rolldown ships
  platform-specific `@rolldown/binding-*` native binaries, so the committed
  lockfile must carry every CI/deploy platform entry for `npm ci` to reproduce.
- Negative: future high-severity advisories now land on Rolldown/Oxc instead of
  esbuild; the `npm audit --audit-level=high` CI gate remains the guard.
