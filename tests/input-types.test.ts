import { describe, it, expect, expectTypeOf } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { BrowserExtractColorsInput } from '../src/browser/types.js'
import type { NodeExtractColorsInput } from '../src/node/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(here, '..')

describe('BrowserExtractColorsInput', () => {
  it('accepts every documented browser-native input (runtime-checkable in Node)', () => {
    const file: BrowserExtractColorsInput = new File([new Uint8Array(4)], 'a.png', { type: 'image/png' })
    const blob: BrowserExtractColorsInput = new Blob([new Uint8Array(4)])
    const url: BrowserExtractColorsInput = 'https://example.com/a.png'
    expect(file).toBeInstanceOf(File)
    expect(blob).toBeInstanceOf(Blob)
    expect(typeof url).toBe('string')
  })

  it('union includes HTMLCanvasElement, HTMLImageElement, ImageBitmap, ImageData at the type level', () => {
    expectTypeOf<HTMLCanvasElement>().toMatchTypeOf<BrowserExtractColorsInput>()
    expectTypeOf<HTMLImageElement>().toMatchTypeOf<BrowserExtractColorsInput>()
    expectTypeOf<ImageBitmap>().toMatchTypeOf<BrowserExtractColorsInput>()
    expectTypeOf<ImageData>().toMatchTypeOf<BrowserExtractColorsInput>()
  })

  it('rejects Node-specific Buffer at the type level', () => {
    expectTypeOf<Buffer>().not.toMatchTypeOf<BrowserExtractColorsInput>()
  })
})

describe('NodeExtractColorsInput', () => {
  it('accepts every documented Node input', () => {
    const buf: NodeExtractColorsInput = Buffer.from([0, 0, 0, 0])
    const u8: NodeExtractColorsInput = new Uint8Array(4)
    const ab: NodeExtractColorsInput = new ArrayBuffer(4)
    const str: NodeExtractColorsInput = '/path/to/image.png'
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(u8).toBeInstanceOf(Uint8Array)
    expect(ab).toBeInstanceOf(ArrayBuffer)
    expect(typeof str).toBe('string')
  })

  it('rejects browser-specific File at the type level', () => {
    expectTypeOf<File>().not.toMatchTypeOf<NodeExtractColorsInput>()
  })

  it('rejects HTMLCanvasElement at the type level', () => {
    expectTypeOf<HTMLCanvasElement>().not.toMatchTypeOf<NodeExtractColorsInput>()
  })
})

describe('runtime-specific isolation', () => {
  it('BrowserExtractColorsInput does not overlap NodeExtractColorsInput on object types', () => {
    expectTypeOf<Buffer>().not.toMatchTypeOf<BrowserExtractColorsInput>()
    expectTypeOf<File>().not.toMatchTypeOf<NodeExtractColorsInput>()
    expectTypeOf<HTMLCanvasElement>().not.toMatchTypeOf<NodeExtractColorsInput>()
  })

  it('both accept a string URL', () => {
    const browserUrl: BrowserExtractColorsInput = 'https://x'
    const nodeUrl: NodeExtractColorsInput = 'https://x'
    expect(typeof browserUrl).toBe('string')
    expect(typeof nodeUrl).toBe('string')
  })
})

describe('dist output type isolation', () => {
  function readDts(relPath: string): string {
    return readFileSync(resolve(rootDir, relPath), 'utf-8')
  }

  it('core dist does not reference browser-specific or node-specific globals', () => {
    const core = readDts('dist/core/index.d.ts')
    expect(core).not.toMatch(/\bFile\b/)
    expect(core).not.toMatch(/\bBlob\b/)
    expect(core).not.toMatch(/\bHTMLCanvasElement\b/)
    expect(core).not.toMatch(/\bImageBitmap\b/)
    expect(core).not.toMatch(/\bBuffer\b/)
  })

  it('browser dist does not reference Buffer', () => {
    const browser = readDts('dist/browser/index.d.ts')
    expect(browser).not.toMatch(/\bBuffer\b/)
  })

  it('node dist does not reference browser globals', () => {
    const node = readDts('dist/node/index.d.ts')
    expect(node).not.toMatch(/\bFile\b/)
    expect(node).not.toMatch(/\bHTMLCanvasElement\b/)
    expect(node).not.toMatch(/\bImageBitmap\b/)
  })
})
