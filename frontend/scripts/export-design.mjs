// Generates src/design-tokens.css from the DESIGN.md frontmatter (ADR 0003, D-B).
//
// Why a script instead of a shell pipeline: a `design.md ... | sed ... > file` pipeline
// truncates the target before the exporter runs and reports the exit status of `sed`,
// so any exporter failure would silently leave a token-less file behind and every
// var(--color-*) alias in index.css would stop resolving. This fails closed instead.
//
// The same buildTokensCss() is imported by tests/design-tokens.test.ts, so the test
// exercises the exact code path this script writes with (no re-implementation).

import { execFileSync } from 'node:child_process'
import { realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HEADER = `/* GENERATED FILE - DO NOT EDIT.
 * Source of truth: frontend/DESIGN.md frontmatter (@google/design.md 0.3.0).
 * Regenerate: npm run export:design
 */
`

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(projectRoot, 'src', 'design-tokens.css')
// Absolute path to the pinned local bin: npm puts node_modules/.bin on PATH, the
// test runner does not, and an unpinned `npx` resolve is prohibited (ADR 0003, D-C).
const designMdBin = join(projectRoot, 'node_modules', '.bin', 'design.md')

/**
 * Runs the pinned local `design.md` bin and rewrites the Tailwind v4 `@theme {` block
 * into a plain `:root {` block (this project does not use Tailwind, and a raw browser
 * ignores `@theme`, so the custom properties inside it would never register).
 *
 * @returns {string} the full contents of src/design-tokens.css
 */
export function buildTokensCss() {
  const raw = execFileSync(designMdBin, ['export', '--format', 'css-tailwind', 'DESIGN.md'], {
    cwd: projectRoot,
    encoding: 'utf-8',
    // Let the exporter's own diagnostics reach the terminal instead of being buried.
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  const css = raw.replace(/^@theme\s*\{/gm, ':root {')

  if (!css.includes(':root {')) {
    throw new Error('design.md export emitted no @theme block - refusing to write')
  }

  if (css.includes('@theme')) {
    throw new Error('unconverted @theme block remains - refusing to write')
  }

  const tokenCount = (css.match(/^\s*--[\w-]+\s*:/gm) ?? []).length
  if (tokenCount === 0) {
    throw new Error('design.md export produced 0 tokens - refusing to write')
  }

  return HEADER + css
}

// realpathSync on both sides: Node resolves symlinks in import.meta.url but not in
// process.argv[1], so a symlinked checkout would otherwise skip the write and exit 0.
// A test runner may synthesize an argv[1] that is not on disk, hence the guard.
function isInvokedDirectly() {
  if (process.argv[1] === undefined) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isInvokedDirectly()) {
  writeFileSync(outputPath, buildTokensCss())
}
