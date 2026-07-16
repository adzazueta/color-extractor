import { readFile } from 'node:fs/promises'
import { ColorExtractorError } from '../core/errors.js'

export async function loadLocalPath(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (err) {
    throw new ColorExtractorError(
      'COLOR_EXTRACTOR_DECODE_FAILED',
      `Failed to read local file: ${path}`,
      { cause: err },
    )
  }
}
