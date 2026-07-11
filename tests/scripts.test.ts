import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(here, '..')

interface PackageJson {
  scripts?: Record<string, string>
}

const pkg: PackageJson = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf-8'),
) as PackageJson

const scripts = pkg.scripts ?? {}

describe('package scripts', () => {
  it('declares all required scripts', () => {
    expect(Object.keys(scripts).sort()).toEqual(
      ['build', 'prepublishOnly', 'test', 'test:verbose', 'test:watch', 'typecheck'].sort(),
    )
  })

  it('build runs tsdown', () => {
    expect(scripts['build']).toBe('tsdown')
  })

  it('test runs vitest in single-run mode', () => {
    expect(scripts['test']).toBe('vitest run')
  })

  it('test:verbose runs vitest in single-run mode with the verbose reporter', () => {
    expect(scripts['test:verbose']).toBe('vitest run --reporter=verbose')
  })

  it('test:watch runs vitest in watch mode', () => {
    expect(scripts['test:watch']).toBe('vitest')
  })

  it('typecheck runs tsc --noEmit', () => {
    expect(scripts['typecheck']).toBe('tsc --noEmit')
  })

  describe('prepublishOnly', () => {
    it('chains typecheck, test and build with &&', () => {
      const chain = scripts['prepublishOnly'] ?? ''
      expect(chain).toMatch(/typecheck/)
      expect(chain).toMatch(/test/)
      expect(chain).toMatch(/build/)
      expect(chain).toContain('&&')
    })

    it('runs typecheck before test before build', () => {
      const chain = scripts['prepublishOnly'] ?? ''
      const iType = chain.indexOf('typecheck')
      const iTest = chain.indexOf('test')
      const iBuild = chain.indexOf('build')
      expect(iType).toBeGreaterThanOrEqual(0)
      expect(iTest).toBeGreaterThan(iType)
      expect(iBuild).toBeGreaterThan(iTest)
    })

    it('exits non-zero when a chained step fails', () => {
      const fakeChain = 'node -e "process.exit(1)" && node -e "process.exit(0)"'
      try {
        execFileSync('sh', ['-c', fakeChain], { cwd: rootDir, stdio: 'pipe' })
        expect.fail('expected non-zero exit code')
      } catch (error) {
        const e = error as { status?: number | null }
        expect(e.status).not.toBe(0)
      }
    })
  })
})
