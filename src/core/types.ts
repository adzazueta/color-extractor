export interface RGB {
  readonly r: number
  readonly g: number
  readonly b: number
}

export interface HSL {
  readonly h: number
  readonly s: number
  readonly l: number
}

export interface Lab {
  readonly L: number
  readonly a: number
  readonly b: number
}

export type ColorRole = 'primary' | 'secondary' | 'accent' | 'palette'

export type ColorSource = 'cluster' | 'fallback' | 'adjusted'

export interface ExtractedColor {
  readonly hex: string
  readonly rgb: RGB
  readonly hsl?: HSL
  readonly lab?: Lab
  readonly chroma?: number
  readonly population?: number
  readonly proportion?: number
  readonly score?: number
  readonly role?: ColorRole
  readonly source?: ColorSource
}
