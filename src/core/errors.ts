export class ColorExtractorError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ColorExtractorError'
    this.code = code
  }
}
