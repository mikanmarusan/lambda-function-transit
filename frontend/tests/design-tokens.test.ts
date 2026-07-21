import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTokensCss } from '../scripts/export-design.mjs'

/**
 * Guards the DESIGN.md -> design-tokens.css -> index.css token pipeline (ADR 0003).
 *
 * - integrity: every var(--x) the app CSS references resolves to a globally defined custom property
 * - generated file: plain :root (no Tailwind @theme), DO NOT EDIT header, no third-party egress
 * - drift: the committed file is byte-identical to a fresh export, and the export is idempotent
 *
 * buildTokensCss() is the same function `npm run export:design` writes with, so this
 * test exercises the real pipeline rather than a re-implementation of it.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const indexCssPath = join(srcDir, 'index.css')
const generatedPath = join(srcDir, 'design-tokens.css')
const indexHtmlPath = join(root, 'index.html')

function collectCssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collectCssFiles(full)
    return full.endsWith('.css') ? [full] : []
  })
}

const cssFiles = collectCssFiles(srcDir)

/**
 * Everything a webfont could enter through. The stylesheets are not enough: the most natural way
 * to add one is a <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in the HTML
 * entry point, which no CSS-only scan ever sees.
 */
const webfontSources = [...cssFiles, indexHtmlPath]
const allCss = cssFiles.map((file) => readFileSync(file, 'utf-8')).join('\n')
const indexCss = readFileSync(indexCssPath, 'utf-8')
const generatedCss = readFileSync(generatedPath, 'utf-8')

/** The DESIGN.md YAML frontmatter - the half of the doc the exporter actually reads. */
const designMd = readFileSync(join(root, 'DESIGN.md'), 'utf-8')
const frontmatter = /^---\n([\s\S]*?)\n---/.exec(designMd)?.[1] ?? ''

/** Tokens the hand-authored residue owns outright: they hold literals, not var() aliases. */
const RESIDUE_TOKENS = new Set(['--font-sans', '--font-mono', '--transition-fast'])

/**
 * Scale rungs are a deliberately complete vocabulary (DESIGN.md Layout documents the whole
 * 4px grid, gaps included), so an unused rung is a vacancy, not an orphan. Role tokens -
 * which encode a design commitment - get no such licence, hence Tech Debt #4.
 */
const SCALE_PREFIXES = ['--space-']

/** Tokens deleted by Tech Debt #4: no role, so no reason to exist anywhere in the pipeline. */
const DELETED_TOKENS = ['--border-accent', '--accent-yellow', '--transition-normal']

/**
 * Generated tokens with no var() call site, allowed by name so that the orphan gate can cover
 * the generated layer too (an unreviewed exception is how the reserved-slot trick crept in).
 * - --color-primary: the `primary` colour role @google/design.md requires; the UI references
 *   the same value as --accent-blue.
 * - --font-weight-* / --tracking-*: emitted per typography level. Call sites still write
 *   `font-weight: 600` / `letter-spacing: -0.02em` literally; wiring them up is a separate change.
 */
const UNREFERENCED_GENERATED = new Set([
  '--color-primary',
  '--font-weight-xs',
  '--font-weight-sm',
  '--font-weight-base',
  '--font-weight-md',
  '--font-weight-lg',
  '--font-weight-xl',
  '--font-weight-2xl',
  '--tracking-lg',
  '--tracking-xl',
  '--tracking-2xl',
])

/** The font-size scale, as the call sites must name it (never the generated --text-* names). */
const FONT_SIZE_ALIASES = new Set([
  '--font-size-xs',
  '--font-size-sm',
  '--font-size-base',
  '--font-size-md',
  '--font-size-lg',
  '--font-size-xl',
  '--font-size-2xl',
])

/** Drops /* ... *\/ comments so a commented-out example is never read as a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Drops <!-- ... --> comments, so prose about a CDN font does not read as a CDN font reference. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Every way a remote asset - a CDN font above all - can be pulled into the app, in CSS or in HTML:
 * an @font-face rule, a Google Fonts host, or an @import / href / src / url() pointing at
 * http(s):// or at a protocol-relative //. The bare-string `@import "https://…"` form needs its own
 * arm: it carries neither `url(` nor `=`, so the other arms all miss it.
 *
 * Deliberately deny-by-default on *any* remote URL, not just subresource fetches: matching only
 * `<link …>`/`<script …>` context would have to survive arbitrary attribute order, and a false
 * negative in a security guard costs more than a false positive here. The entry HTML ships a root
 * div and nothing else, so it has no business carrying a remote URL of any kind - a navigational
 * <a href="https://…"> or a rel="canonical" would fail this too, and belongs in the app, not here.
 *
 * Local paths are root-relative and carry a single slash (/favicon.svg, /src/main.tsx), so they
 * never match: banning `href=` outright would take the favicon with it.
 *
 * This is a lint against a CDN font being added by accident, not a defence against one being
 * smuggled in: entity-encoded or CSS-escaped URLs, and URLs assembled at run time, all slip past it
 * - and anyone willing to do that could delete this test instead. Do not chase those forms.
 */
const REMOTE_REFERENCE =
  /@font-face|fonts\.(?:googleapis|gstatic)|(?:href|src)\s*=\s*['"]?\s*(?:https?:)?\/\/|url\(\s*['"]?\s*(?:https?:)?\/\/|@import\s*['"]\s*(?:https?:)?\/\//i

/**
 * A source file with its comments stripped, so a mention in prose is never read as a call site.
 * HTML gets both strippers: an inline <style> block carries CSS comments inside HTML.
 */
function scannableSource(file: string): string {
  const text = readFileSync(file, 'utf-8')
  return file.endsWith('.html') ? stripComments(stripHtmlComments(text)) : stripComments(text)
}

/** Custom properties declared in a CSS string, e.g. `--bg-primary: ...` -> `--bg-primary`. */
function declaredTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
}

/**
 * Tokens actually referenced by a live `var()`. Comments are stripped first: a commented-out
 * `var(--x)` is not a call site, and counting it as one would let a role-less token survive the
 * orphan gates on the strength of a mention in prose - the same silent survival the reserved
 * slots used to buy.
 */
const referencedTokens = new Set(
  [...stripComments(allCss).matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1])
)

/** The bodies of every `:root { ... }` block in a stylesheet. */
function rootBlocks(css: string): string[] {
  return [...stripComments(css).matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((match) => match[1])
}

/** Custom properties declared at :root, i.e. the only ones that resolve document-wide. */
function globallyDeclaredTokens(css: string): string[] {
  return rootBlocks(css).flatMap(declaredTokens)
}

/**
 * `--name: value` pairs declared at :root. Terminates on `}` as well as `;`, because the last
 * declaration in a block may legally omit its semicolon - and a `;`-only regex would make that
 * one declaration invisible to the orphan and hard-coded-value gates.
 */
function rootDeclarations(css: string): Array<[string, string]> {
  return rootBlocks(css).flatMap((body) =>
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]?/g)].map(
      (match) => [match[1], match[2].trim()] as [string, string]
    )
  )
}

/** `#rrggbb` or `#rrggbbaa` -> [r, g, b, a], channels 0-255 and alpha 0-1. */
function parseHex(hex: string): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!match) throw new Error(`not a 6- or 8-digit hex colour: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16))
  return [r, g, b, match[2] === undefined ? 1 : parseInt(match[2], 16) / 255]
}

/** Source-over compositing: what a translucent colour actually renders as on a substrate. */
function composite(fg: string, bg: string): [number, number, number, number] {
  const [fr, fg_, fb, fa] = parseHex(fg)
  const [br, bg_, bb] = parseHex(bg)
  const mix = (f: number, b: number) => Math.round(fa * f + (1 - fa) * b)
  return [mix(fr, br), mix(fg_, bg_), mix(fb, bb), 1]
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

/** WCAG 2.1 contrast ratio. Both colours must already be opaque (composite() first). */
function contrastRatio(fg: [number, number, number, number], bg: [number, number, number, number]): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

/** Resolves a generated token (e.g. `--color-text-tertiary`) to its literal value. */
const generatedValues = new Map(rootDeclarations(generatedCss))
function token(name: string): string {
  const value = generatedValues.get(name)
  if (value === undefined) throw new Error(`token not defined in design-tokens.css: ${name}`)
  return value
}

/**
 * The App module CSS, read as the source of truth for what a rule *actually paints* - a
 * token-value-only contrast contract passes vacuously (it stays green even if someone repoints
 * .tabActive back at --bg-secondary, the exact regression issue #95 exists to prevent). These
 * helpers read the declaration off the rule and throw when the rule or property is absent, so
 * deleting the rule fails the test rather than skipping it.
 */
const appModuleCss = stripComments(readFileSync(join(srcDir, 'App.module.css'), 'utf-8'))

/** The body of a single-class rule `.name { ... }`. Throws when there is no such rule. */
function ruleBody(css: string, selector: string): string {
  const match = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`no .${selector} rule in App.module.css`)
  return match[1]
}

/** A single property's value inside a rule body. Throws when the property is not declared. */
function declaredValue(body: string, property: string, selector: string): string {
  const match = new RegExp(`(?:^|;|\\{)\\s*${property}\\s*:\\s*([^;}]+)`).exec(body)
  if (!match) throw new Error(`no ${property} in .${selector} rule`)
  return match[1].trim()
}

/** Follows a `var(--x)` chain through the index.css alias layer down to the generated literal. */
const aliasValues = new Map(rootDeclarations(indexCss))
function resolveColor(value: string): string {
  let current = value.trim()
  const seen = new Set<string>()
  while (current.startsWith('var(')) {
    const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(current)
    if (!ref) throw new Error(`cannot resolve non-var() reference: ${current}`)
    const name = ref[1]
    if (seen.has(name)) throw new Error(`cycle while resolving ${name}`)
    seen.add(name)
    const next = aliasValues.get(name) ?? generatedValues.get(name)
    if (next === undefined) throw new Error(`token not defined anywhere: ${name}`)
    current = next.trim()
  }
  return current
}

/** The hex a rule's colour property actually paints, resolved through the token pipeline. */
function paintedColor(selector: string, property: string): string {
  return resolveColor(declaredValue(ruleBody(appModuleCss, selector), property, selector))
}

describe('design token pipeline', () => {
  it('has CSS sources to check', () => {
    expect(cssFiles).toContain(generatedPath)
    expect(cssFiles).toContain(indexCssPath)
    expect(cssFiles.length).toBeGreaterThan(2)
  })

  it('resolves every var(--token) reference to a globally defined custom property', () => {
    // Only :root declarations resolve document-wide. A token declared under a scoped
    // selector (in a module, or in index.css) must not count as defined.
    const defined = new Set([
      ...globallyDeclaredTokens(generatedCss),
      ...globallyDeclaredTokens(indexCss),
    ])

    const unresolved = [...referencedTokens].filter((token) => !defined.has(token)).sort()
    expect(unresolved).toEqual([])
    expect(referencedTokens.size).toBeGreaterThan(0)
  })

  it('declares tokens only at :root, never under a scoped selector', () => {
    const offenders = cssFiles
      .map((file) => {
        const css = readFileSync(file, 'utf-8')
        const scoped = declaredTokens(css).length - globallyDeclaredTokens(css).length
        return { file, scoped }
      })
      .filter(({ scoped }) => scoped > 0)
      .map(({ file }) => file)

    expect(offenders).toEqual([])
  })

  it('never redeclares a generated token in the alias layer', () => {
    // index.css is imported after design-tokens.css, so redeclaring a generated name
    // would shadow it - and `--radius-md: var(--radius-md)` is a self-reference, i.e. a
    // dependency cycle that makes every var(--radius-md) call site resolve to nothing.
    const generated = new Set(globallyDeclaredTokens(generatedCss))
    const shadowed = rootDeclarations(indexCss)
      .map(([name]) => name)
      .filter((name) => generated.has(name))
      .sort()

    expect(shadowed).toEqual([])
  })

  it('never hard-codes a value in the alias layer', () => {
    // Every :root declaration in index.css must delegate to a generated token; only the
    // hand-authored residue (font stacks, transitions) is allowed to hold a literal.
    const offenders = rootDeclarations(indexCss)
      .filter(([name, value]) => !RESIDUE_TOKENS.has(name) && !value.startsWith('var(--'))
      .map(([name]) => name)

    expect(offenders).toEqual([])
    expect(indexCss).toContain("@import './design-tokens.css';")
    expect(rootDeclarations(indexCss).length).toBeGreaterThan(20)
  })

  it('generates a plain :root block with a DO NOT EDIT header and no external egress', () => {
    expect(generatedCss).toContain('DO NOT EDIT')
    expect(generatedCss).toContain(':root {')
    expect(generatedCss).not.toContain('@theme')
    expect(generatedCss).not.toMatch(/@import|url\(\s*['"]?http|fonts\.(googleapis|gstatic)/i)
  })

  it('matches a fresh export byte-for-byte and exports idempotently', () => {
    const first = buildTokensCss()
    const second = buildTokensCss()

    expect(second).toBe(first)
    // Exact equality (not toContain): catches hand-edits appended to the generated file.
    expect(generatedCss).toBe(first)
  }, 30_000)
})

describe('token roles (Tech Debt #4)', () => {
  const referenced = referencedTokens

  it('declares no orphaned role token - every call-site token has a call site', () => {
    const orphans = rootDeclarations(indexCss)
      .map(([name]) => name)
      .filter((name) => !referenced.has(name))
      .filter((name) => !SCALE_PREFIXES.some((prefix) => name.startsWith(prefix)))
      .sort()

    expect(orphans).toEqual([])
  })

  it('declares no orphaned generated token outside the documented allowlist', () => {
    // The generated layer needs its own gate: design.md's own orphaned-tokens warning is
    // satisfied by *any* components: entry, which is exactly the reserved-slot trick this
    // change abolished. Nothing else would stop a role-less token being re-added upstream.
    const orphans = globallyDeclaredTokens(generatedCss)
      .filter((name) => !referenced.has(name))
      .filter((name) => !UNREFERENCED_GENERATED.has(name))
      .sort()

    expect(orphans).toEqual([])
  })

  it('keeps the allowlist honest - every allowlisted token is really declared and unreferenced', () => {
    // Stops the allowlist rotting into a place where deleted names accumulate, or where a
    // token that has since gained a call site is still (misleadingly) excused.
    const generated = new Set(globallyDeclaredTokens(generatedCss))
    for (const name of UNREFERENCED_GENERATED) {
      expect(generated.has(name), `allowlisted ${name} is not a generated token`).toBe(true)
      expect(referenced.has(name), `allowlisted ${name} now has a call site - drop it`).toBe(false)
    }
  })

  it('has purged the deleted tokens from every layer of the pipeline', () => {
    // The frontmatter too, not just the CSS: a colour deleted from index.css but left in the
    // frontmatter would be re-emitted into design-tokens.css by the next export. Prose is
    // excluded on purpose - the doc still discusses these tokens, it just no longer defines them.
    expect(frontmatter, 'frontmatter failed to parse - the check below would be vacuous').toContain(
      'colors:'
    )
    const css = stripComments(allCss)
    for (const name of DELETED_TOKENS) {
      const bare = name.replace(/^--/, '')
      // Both spellings: a re-added colour reaches CSS as the *generated* name (--color-accent-yellow),
      // which does not contain the alias name (--accent-yellow) as a substring. Checking only the
      // alias would miss it. The frontmatter check is what actually catches a re-added colour,
      // since a deleted colour can only come back by being re-declared there.
      expect(css, `${name} still declared/referenced in CSS`).not.toContain(name)
      expect(css, `--color-${bare} still declared/referenced in CSS`).not.toContain(`--color-${bare}`)
      expect(frontmatter, `${bare} still defined in the DESIGN.md frontmatter`).not.toContain(bare)
    }
  })
})

describe('call-site hygiene', () => {
  it('sizes text only from the font-size scale, never a raw px (Tech Debt #2)', () => {
    // Every stylesheet, not just the modules: index.css has real rule bodies too, where a raw
    // font-size would otherwise be caught by nothing. Two exclusions: the generated file (its
    // --text-* rungs *are* the scale) and the `html` rem base (`font-size: 14px`), which is the
    // root the scale is measured from and so cannot itself be expressed as a scale token.
    const scanned = cssFiles.filter((file) => file !== generatedPath)
    const offenders = scanned.flatMap((file) => {
      // Comments stripped first, or documenting a removed `font-size: 12px` in prose would
      // register as an offender. Terminate on `}` as well as `;`: the last declaration in a
      // block may legally omit its semicolon, and a `;`-only regex would skip exactly that case.
      const css = stripComments(readFileSync(file, 'utf-8')).replace(/\bhtml\s*\{[\s\S]*?\}/g, '')
      const sizes = [...css.matchAll(/font-size:\s*([^;}]+)[;}]/g)]
        .map((match) => match[1].trim())
        .filter((value) => {
          const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
          return alias === null || !FONT_SIZE_ALIASES.has(alias[1])
        })
        .map((value) => `${file}: font-size: ${value}`)

      // The `font:` shorthand can smuggle a size past the check above (`font: 600 14px/1.5 …`).
      // `font: inherit` carries none, and is the only form the codebase uses.
      const shorthand = [...css.matchAll(/(?<!-)\bfont:\s*([^;}]+)[;}]/g)]
        .map((match) => match[1].trim())
        .filter((value) => value !== 'inherit')
        .map((value) => `${file}: font: ${value}`)

      return [...sizes, ...shorthand]
    })

    expect(offenders).toEqual([])
    // Guards the exclusion above: if the rem base ever stops being an `html` rule, the strip
    // would silently start hiding real offenders instead of just this one.
    expect(indexCss).toMatch(/\bhtml\s*\{[^}]*font-size:\s*14px/)
  })

  it('writes no raw rgba()/hex colour outside the generated file (Tech Debt #3)', () => {
    // Every stylesheet, not just the modules: index.css has real rule bodies too (body,
    // scrollbar), and the alias-layer test only inspects its :root block - so a raw hex in
    // `body { color: #fff }` would otherwise be caught by nothing. :root blocks are excluded
    // because the residue legitimately holds literals (font stacks, durations), and the
    // generated file is excluded because holding the hex values is its entire job.
    const offenders = cssFiles
      .filter((file) => file !== generatedPath)
      .filter((file) => {
        const body = stripComments(readFileSync(file, 'utf-8')).replace(/:root\s*\{[\s\S]*?\}/g, '')
        return /rgba?\(|hsla?\(|oklch\(|#[0-9a-f]{3,8}\b/i.test(body)
      })

    expect(offenders).toEqual([])
    // The error tint specifically: the literal this issue set out to remove.
    expect(readFileSync(join(srcDir, 'App.module.css'), 'utf-8')).not.toContain('rgba(239')
  })

  it('carries a CJK face in --font-sans and loads no webfont (Tech Debt #1)', () => {
    const fontSans = new Map(rootDeclarations(indexCss)).get('--font-sans') ?? ''

    expect(fontSans).toContain('Hiragino Sans')
    expect(fontSans).toContain('Noto Sans JP')
    // CJK face must come after the Latin faces and before the generic, or Latin text
    // would be rendered by the Japanese face.
    expect(fontSans.indexOf('Inter')).toBeLessThan(fontSans.indexOf('Hiragino Sans'))
    expect(fontSans.indexOf('Hiragino Sans')).toBeLessThan(fontSans.indexOf('sans-serif'))
    // No CDN webfont, anywhere (Agent Prompt Guide security rule) - in the stylesheets *and* in
    // the HTML entry point, where a <link rel="stylesheet" href="https://fonts.googleapis.com/...">
    // would otherwise ship past a CSS-only scan. Each file's existence is asserted before it is
    // read, so renaming index.html away cannot turn this guard into a vacuous pass.
    expect(webfontSources).toContain(indexHtmlPath)
    expect(webfontSources).toContain(indexCssPath)
    expect(cssFiles.length).toBeGreaterThan(2)

    for (const file of webfontSources) {
      // index.html is the file this can actually catch out: cssFiles comes from readdirSync, so
      // those paths exist by construction. Renaming or moving index.html away must fail the guard,
      // never quietly shrink what it scans.
      expect(existsSync(file), `${file} is missing - the webfont guard would pass vacuously`).toBe(
        true
      )
      expect(scannableSource(file), `${file} references a remote URL`).not.toMatch(REMOTE_REFERENCE)
    }
  })
})

describe('the webfont guard itself', () => {
  // REMOTE_REFERENCE is only ever asserted negatively, against files that are all clean - so a
  // typo in one alternative would make the guard toothless and every file would still pass. These
  // are its positive controls: the bare-string @import below is a real hole this pair caught.
  // Every alternative needs a case only *it* can catch, or the arm is untested - hence the
  // dns-prefetch line (no //, so only the host arm sees it) and both @import spellings (the space
  // after an at-keyword is optional in CSS, and stripComments can itself delete one).
  it.each([
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter" />',
    '<link rel="stylesheet" href="//fonts.googleapis.com/css2?family=Inter" />',
    '<link rel="dns-prefetch" href="fonts.gstatic.com">',
    '<link rel=stylesheet href=https://use.typekit.net/abc.css>',
    '<script src="//cdn.example.com/analytics.js"></script>',
    '@import url("https://fonts.bunny.net/css?family=inter");',
    '@import "https://fonts.bunny.net/css?family=inter";',
    '@import"https://fonts.bunny.net/css?family=inter";',
    "@font-face { font-family: Inter; src: url('/fonts/inter.woff2'); }",
    '.hero { background: url(//cdn.example.com/hero.png); }',
  ])('catches %s', (source) => {
    expect(source).toMatch(REMOTE_REFERENCE)
  })

  it.each([
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<script type="module" src="/src/main.tsx"></script>',
    '.hero { background: url(/images/hero.png); }',
    '.icon { fill: url(#gradient); }',
    "@import './design-tokens.css';",
    '@import"./design-tokens.css";',
  ])('passes %s', (source) => {
    expect(source).not.toMatch(REMOTE_REFERENCE)
  })
})

describe('WCAG AA contrast (ADR 0003 D-E)', () => {
  it.each(['--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary'])(
    'renders --text-tertiary at >= 4.5:1 on %s',
    (background) => {
      const ratio = contrastRatio(parseHex(token('--color-text-tertiary')), parseHex(token(background)))
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  )

  it('renders the error banner text at >= 4.5:1 over its composited tint', () => {
    // The tint is translucent, so the real substrate is the tint composited over the page
    // ground. design.md's own contrast lint is not alpha-aware and cannot check this.
    const surface = composite(token('--color-accent-red-tint'), token('--color-bg-primary'))
    const ratio = contrastRatio(parseHex(token('--color-accent-red')), surface)

    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('renders the empty-state text at >= 4.5:1 on its elevated card', () => {
    const ratio = contrastRatio(parseHex(token('--color-text-secondary')), parseHex(token('--color-bg-elevated')))
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('still fails the old --text-tertiary value, proving the check has teeth', () => {
    // Guards the guard: if this assertion ever passes, the ratio maths has gone wrong and
    // the AA tests above would be vacuously green.
    const ratio = contrastRatio(parseHex('#737373'), parseHex(token('--color-bg-primary')))
    expect(ratio).toBeLessThan(4.5)
  })
})

describe('outdoor-legibility inverted chip (issue #95, ADR 0004)', () => {
  // These read the CSS declaration off .tabActive, not just the token value: a token-only
  // contract stays green even if .tabActive is repointed back at --bg-secondary, which is the
  // exact 1.05:1 regression this exists to prevent. paintedColor() throws when the rule or the
  // property it guards is missing, so deleting the rule fails the test rather than skipping it.
  const chipFill = paintedColor('tabActive', 'background-color')
  const chipLabel = paintedColor('tabActive', 'color')
  const tabFill = declaredValue(ruleBody(appModuleCss, 'tab'), 'background-color', 'tab')
  // An unselected tab paints `transparent`, so its effective substrate is the page ground.
  const tabSubstrate = tabFill === 'transparent' ? token('--color-bg-primary') : resolveColor(tabFill)

  it('paints the selected chip vs the unselected tab substrate at >= 3:1 (WCAG 1.4.11)', () => {
    const ratio = contrastRatio(parseHex(chipFill), parseHex(tabSubstrate))
    expect(ratio).toBeGreaterThanOrEqual(3)
  })

  it('paints the chip label on the chip fill at >= 4.5:1 (WCAG 1.4.3)', () => {
    const ratio = contrastRatio(parseHex(chipLabel), parseHex(chipFill))
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['the chip fill', () => chipFill],
    ['--bg-primary', () => token('--color-bg-primary')],
  ])('keeps the focus ring (--accent-blue) at >= 3:1 against %s', (_label, background) => {
    // The white chip is the one surface that could swallow the blue focus ring; pin both grounds.
    const ratio = contrastRatio(parseHex(token('--color-accent-blue')), parseHex(background()))
    expect(ratio).toBeGreaterThanOrEqual(3)
  })

  it('still fails the old .tabActive fill (#111111 = 1.05:1), proving the 3:1 check has teeth', () => {
    // Guards the guard: the old fill sat at 1.05:1 on the page ground. If this ever reaches 3:1
    // the ratio maths has broken and the contract above would be vacuously green.
    const ratio = contrastRatio(parseHex('#111111'), parseHex(token('--color-bg-primary')))
    expect(ratio).toBeLessThan(3)
  })
})

describe('outdoor-legibility card outline (issue #96, ADR 0004)', () => {
  // The 2:1 card-border thresholds below are a HOUSE threshold, NOT a WCAG one: WCAG 1.4.11
  // explicitly does not require a boundary on a container, and no 2:1 value exists anywhere in
  // WCAG. The provenance is parity with Material 3's outlineVariant (1.99:1 on its dark surface).
  // Do not relabel these as WCAG (ADR 0004 D-2).
  //
  // These read the declaration off TransitCard.module.css, not just the token value: a
  // token-only contract stays green even if .card is repointed back at --border-primary (the
  // 1.31:1 regression this exists to prevent). borderColor()/paintedCardColor() throw when the
  // rule or property is missing, so deleting a rule fails the test rather than skipping it.
  const cardModuleCss = stripComments(
    readFileSync(join(srcDir, 'components', 'TransitCard.module.css'), 'utf-8')
  )

  /** The card fill actually painted by a rule, resolved through the token pipeline. */
  function paintedCardColor(selector: string, property: string): string {
    return resolveColor(declaredValue(ruleBody(cardModuleCss, selector), property, selector))
  }

  /** The border colour of a rule, whether written as `border: 1px solid var(--x)` or `border-color: var(--x)`. */
  function borderColor(selector: string): string {
    const body = ruleBody(cardModuleCss, selector)
    const match = /border(?:-color)?\s*:\s*(?:[^;}]*?\s)?(var\(\s*--[\w-]+\s*\))/.exec(body)
    if (!match) throw new Error(`no border colour in .${selector} rule`)
    return resolveColor(match[1])
  }

  const page = parseHex(token('--color-bg-primary'))
  const cardFill = paintedCardColor('card', 'background-color')
  const cardBorder = borderColor('card')
  const cardHoverBorder = borderColor('card:hover')

  it('paints the card border vs the page ground at >= 2:1 (house threshold, outlineVariant parity)', () => {
    expect(contrastRatio(parseHex(cardBorder), page)).toBeGreaterThanOrEqual(2)
  })

  it('paints the card border vs the card fill at >= 2:1 (an edge must separate from both sides)', () => {
    expect(contrastRatio(parseHex(cardBorder), parseHex(cardFill))).toBeGreaterThanOrEqual(2)
  })

  it('paints the hover border strictly brighter than the resting border (no inverted ramp)', () => {
    expect(luminance(parseHex(cardHoverBorder))).toBeGreaterThan(luminance(parseHex(cardBorder)))
  })

  it('paints --accent-blue on the card fill at >= 4.5:1 (pins the card ground at its AA ceiling)', () => {
    expect(contrastRatio(parseHex(token('--color-accent-blue')), parseHex(cardFill))).toBeGreaterThanOrEqual(4.5)
  })

  it('still fails the old card border values (#262626 and #333333 < 2:1 vs the page), proving the check has teeth', () => {
    // Guards the guard: both are what a well-meaning reviewer would propose. If either ever
    // reaches 2:1 the ratio maths has broken and the contracts above would be vacuously green.
    expect(contrastRatio(parseHex('#262626'), page)).toBeLessThan(2)
    expect(contrastRatio(parseHex('#333333'), page)).toBeLessThan(2)
  })
})

describe('next-departure keyline (issue #97, ADR 0004 D-3)', () => {
  // Reads the declarations off .cardNext::before, not just the token values: a token-only
  // contract stays green even if the rule is repointed at a washed-out colour or deleted.
  // The regex throws via the assertion below when the rule is missing, so removing the
  // keyline fails the test rather than skipping it.
  const cardModuleCss = stripComments(
    readFileSync(join(srcDir, 'components', 'TransitCard.module.css'), 'utf-8')
  )
  const markerBody = /\.cardNext::before\s*\{([^}]*)\}/.exec(cardModuleCss)?.[1]

  it('declares the .cardNext::before keyline rule', () => {
    expect(markerBody).toBeDefined()
  })

  it('paints the keyline vs the card fill at >= 3:1 (WCAG 1.4.11 non-text contrast)', () => {
    const markerFill = resolveColor(declaredValue(markerBody!, 'background-color', 'cardNext::before'))
    const cardFill = resolveColor(
      declaredValue(ruleBody(cardModuleCss, 'card'), 'background-color', 'card')
    )

    expect(contrastRatio(parseHex(markerFill), parseHex(cardFill))).toBeGreaterThanOrEqual(3)
  })

  it('keeps the keyline on the 4px grid and out of the hit-test path', () => {
    // width must stay a spacing token (DESIGN.md forbids off-scale px), and pointer-events:
    // none is load-bearing: the pseudo-element hit-tests to .card, so without it the strip
    // swallows clicks aimed at the .header disclosure button underneath.
    expect(resolveColor(declaredValue(markerBody!, 'width', 'cardNext::before'))).toBe('4px')
    expect(declaredValue(markerBody!, 'pointer-events', 'cardNext::before')).toBe('none')
  })

  it('still fails a text-grade demand (4.5:1) under a simulated 20% glare veil, honestly recording the marker limit', () => {
    // ADR 0004's honest limit: under a ~20% ambient veil the blue compresses to ~1.92:1, so
    // the marker is NOT the sole carrier - default expansion and the hidden label are its
    // redundant cues. This pins that recorded limit so nobody later claims the keyline alone
    // satisfies an outdoor contrast requirement.
    const veil = (channel: number) => Math.round(channel + 0.2 * (255 - channel))
    const veiled = (hex: string): [number, number, number, number] => {
      const [r, g, b] = parseHex(hex)
      return [veil(r), veil(g), veil(b), 1]
    }
    const cardFill = resolveColor(
      declaredValue(ruleBody(cardModuleCss, 'card'), 'background-color', 'card')
    )

    const ratio = contrastRatio(veiled(token('--color-accent-blue')), veiled(cardFill))
    expect(ratio).toBeLessThan(4.5)
    expect(ratio).toBeGreaterThan(1)
  })
})

describe('DESIGN.md lint', () => {
  it('reports zero errors and zero warnings', () => {
    // design.md lint exits 0 even with warnings, and CI does not run `lint:design` as its own
    // step - so asserting it here is what actually keeps the frontmatter clean on every push
    // (contrast regressions, orphaned tokens, broken {colors.x} refs, section order).
    const bin = join(root, 'node_modules', '.bin', 'design.md')
    let raw: string
    try {
      raw = execFileSync(bin, ['lint', 'DESIGN.md'], {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'inherit'],
      })
    } catch (error) {
      // A lint *error* exits non-zero, and execFileSync throws with the findings JSON captured
      // on err.stdout. Without this, the test would die as "Command failed" and swallow the
      // very diagnosis it exists to surface.
      raw = (error as { stdout?: string }).stdout ?? ''
      expect(raw, `design.md lint failed with no parsable output: ${String(error)}`).not.toBe('')
    }
    const { findings, summary } = JSON.parse(raw) as {
      findings: Array<{ severity: string; message: string }>
      summary: { errors: number; warnings: number }
    }
    const offenders = findings.filter((finding) => finding.severity !== 'info')

    expect(offenders.map((finding) => finding.message)).toEqual([])
    expect(summary.errors).toBe(0)
    expect(summary.warnings).toBe(0)
  }, 30_000)
})
