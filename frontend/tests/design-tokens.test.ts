import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
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

function collectCssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collectCssFiles(full)
    return full.endsWith('.css') ? [full] : []
  })
}

const cssFiles = collectCssFiles(srcDir)
const allCss = cssFiles.map((file) => readFileSync(file, 'utf-8')).join('\n')
const indexCss = readFileSync(indexCssPath, 'utf-8')
const generatedCss = readFileSync(generatedPath, 'utf-8')

/** Tokens the hand-authored residue owns outright: they hold literals, not var() aliases. */
const RESIDUE_TOKENS = new Set([
  '--font-sans',
  '--font-mono',
  '--transition-fast',
  '--transition-normal',
])

/** Drops /* ... *\/ comments so a commented-out example is never read as a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Custom properties declared in a CSS string, e.g. `--bg-primary: ...` -> `--bg-primary`. */
function declaredTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
}

/** The bodies of every `:root { ... }` block in a stylesheet. */
function rootBlocks(css: string): string[] {
  return [...stripComments(css).matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((match) => match[1])
}

/** Custom properties declared at :root, i.e. the only ones that resolve document-wide. */
function globallyDeclaredTokens(css: string): string[] {
  return rootBlocks(css).flatMap(declaredTokens)
}

/** `--name: value;` pairs declared at :root. */
function rootDeclarations(css: string): Array<[string, string]> {
  return rootBlocks(css).flatMap((body) =>
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      (match) => [match[1], match[2].trim()] as [string, string]
    )
  )
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
    const referenced = new Set(
      [...allCss.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1])
    )

    const unresolved = [...referenced].filter((token) => !defined.has(token)).sort()
    expect(unresolved).toEqual([])
    expect(referenced.size).toBeGreaterThan(0)
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
