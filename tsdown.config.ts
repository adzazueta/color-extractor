import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'browser/index': 'src/browser/index.ts',
    'node/index': 'src/node/index.ts',
    'core/index': 'src/core/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  platform: 'neutral',
  publint: true,
  deps: {
    neverBundle: ['sharp', /^node:/],
  },
})
