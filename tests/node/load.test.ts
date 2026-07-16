import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadLocalPath } from '../../src/node/load.js'
import { ColorExtractorError } from '../../src/core/errors.js'

describe('loadLocalPath (ADZ-55)', () => {
  describe('AC: returns buffer from valid file path', () => {
    it('reads a file that exists and returns a Buffer', async () => {
      const buf = await loadLocalPath(import.meta.filename)
      expect(Buffer.isBuffer(buf)).toBe(true)
      expect(buf.length).toBeGreaterThan(0)
    })
  })

  describe('AC: file-not-found maps to COLOR_EXTRACTOR_DECODE_FAILED', () => {
    it('throws ColorExtractorError for a nonexistent path', async () => {
      try {
        await loadLocalPath('/tmp/nonexistent-color-extractor-test-file.png')
        expect.fail('expected throw')
      } catch (err) {
        expect(err).toBeInstanceOf(ColorExtractorError)
        expect((err as ColorExtractorError).code).toBe('COLOR_EXTRACTOR_DECODE_FAILED')
      }
    })
  })

  describe('AC: compatible with existing tmp file on disk', () => {
    it('reads a tmp file written with a known content', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'color-extractor-load-test-'))
      const tmpPath = join(dir, 'test-file.bin')
      try {
        writeFileSync(tmpPath, Buffer.from([1, 2, 3, 4]))
        const buf = await loadLocalPath(tmpPath)
        expect(buf).toEqual(Buffer.from([1, 2, 3, 4]))
      } finally {
        if (existsSync(tmpPath)) unlinkSync(tmpPath)
        try { unlinkSync(dir) } catch { /* ignore */ }
      }
    })
  })
})
