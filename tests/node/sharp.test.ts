import { describe, it, expect, afterEach } from 'vitest'
import { ColorExtractorError } from '../../src/core/errors.js'
import {
  _resetSharpCacheForTests,
  _setSharpImporterForTests,
  loadSharp,
} from '../../src/node/sharp.js'

function makeModuleNotFoundError(): Error {
  const err = new Error("Cannot find module 'sharp'") as Error & { code: string }
  err.code = 'MODULE_NOT_FOUND'
  return err
}

function makeErrModuleNotFoundError(): Error {
  const err = new Error("Cannot find module 'sharp'") as Error & { code: string }
  err.code = 'ERR_MODULE_NOT_FOUND'
  return err
}

afterEach(() => {
  _resetSharpCacheForTests()
  _setSharpImporterForTests(null)
})

describe('loadSharp (ADZ-52)', () => {
  describe('AC: throws COLOR_EXTRACTOR_SHARP_MISSING when sharp is not installed', () => {
    it('throws with the SHARP_MISSING code when the dynamic import fails with MODULE_NOT_FOUND', async () => {
      _setSharpImporterForTests(() => Promise.reject(makeModuleNotFoundError()))
      await expect(loadSharp()).rejects.toBeInstanceOf(ColorExtractorError)
      await expect(loadSharp()).rejects.toMatchObject({
        code: 'COLOR_EXTRACTOR_SHARP_MISSING',
      })
    })

    it('throws with the SHARP_MISSING code on ERR_MODULE_NOT_FOUND', async () => {
      _setSharpImporterForTests(() => Promise.reject(makeErrModuleNotFoundError()))
      await expect(loadSharp()).rejects.toMatchObject({
        code: 'COLOR_EXTRACTOR_SHARP_MISSING',
      })
    })

    it('error message instructs the user to install sharp', async () => {
      _setSharpImporterForTests(() => Promise.reject(makeModuleNotFoundError()))
      try {
        await loadSharp()
        expect.fail('should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/sharp/)
        expect((e as Error).message).toMatch(/install/i)
      }
    })
  })

  describe('AC: returns the loaded sharp constructor on success', () => {
    it('returns the default export of the sharp module', async () => {
      const fakeSharp = function FakeSharp() {} as unknown as { new (): unknown }
      _setSharpImporterForTests(() => Promise.resolve({ default: fakeSharp }))
      const ctor = await loadSharp()
      expect(ctor).toBe(fakeSharp)
    })

    it('caches the result so subsequent calls do not re-import', async () => {
      let importCount = 0
      const fakeSharp = function FakeSharp() {} as unknown as { new (): unknown }
      _setSharpImporterForTests(() => {
        importCount++
        return Promise.resolve({ default: fakeSharp })
      })
      const a = await loadSharp()
      const b = await loadSharp()
      expect(a).toBe(b)
      expect(importCount).toBe(1)
    })
  })

  describe('AC: surfaces non-MODULE_NOT_FOUND failures as DECODE_FAILED', () => {
    it('wraps unexpected import errors as DECODE_FAILED', async () => {
      _setSharpImporterForTests(() => Promise.reject(new Error('boom')))
      await expect(loadSharp()).rejects.toMatchObject({
        code: 'COLOR_EXTRACTOR_DECODE_FAILED',
      })
    })
  })

  describe('AC: rejects modules without a callable default', () => {
    it('throws when the module has no callable default export', async () => {
      _setSharpImporterForTests(() => Promise.resolve({ default: 42 }))
      await expect(loadSharp()).rejects.toMatchObject({
        code: 'COLOR_EXTRACTOR_SHARP_MISSING',
      })
    })
  })
})
