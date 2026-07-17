import { access, readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname, extname, relative, sep } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    process.stdout.write(`  ✓ ${label}\n`)
  } else {
    failed++
    process.stdout.write(`  ✗ ${label}\n`)
  }
}

async function findJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await findJsFiles(full))
    } else if (extname(entry.name) === '.js') {
      files.push(full)
    }
  }
  return files
}

async function main() {
  process.stdout.write('\nBuild entrypoint smoke tests (ADZ-92)\n')

  // 1. Verify declarations exist
  const decls = [
    'dist/index.d.ts',
    'dist/browser/index.d.ts',
    'dist/node/index.d.ts',
    'dist/core/index.d.ts',
  ]

  for (const decl of decls) {
    try {
      await access(resolve(ROOT, decl))
      assert(true, `declaration exists: ${decl}`)
    } catch {
      assert(false, `declaration exists: ${decl}`)
    }
  }

  // 2. Node entrypoint resolves with extractColors and VERSION
  const nodeEntry = await import(resolve(ROOT, 'dist/node/index.js'))
  assert(typeof nodeEntry.extractColors === 'function', 'node entry exports extractColors')
  assert(typeof nodeEntry.VERSION === 'string', 'node entry exports VERSION')
  assert(typeof nodeEntry.ColorExtractorError === 'function', 'node entry exports ColorExtractorError')
  assert(Array.isArray(nodeEntry.COLOR_EXTRACTOR_ERROR_CODES), 'node entry exports COLOR_EXTRACTOR_ERROR_CODES')

  // 3. Browser entrypoint resolves with extractColors and VERSION
  const browserEntry = await import(resolve(ROOT, 'dist/browser/index.js'))
  assert(typeof browserEntry.extractColors === 'function', 'browser entry exports extractColors')
  assert(typeof browserEntry.VERSION === 'string', 'browser entry exports VERSION')
  assert(typeof browserEntry.ColorExtractorError === 'function', 'browser entry exports ColorExtractorError')
  assert(Array.isArray(browserEntry.COLOR_EXTRACTOR_ERROR_CODES), 'browser entry exports COLOR_EXTRACTOR_ERROR_CODES')

  // 4. Core entrypoint resolves with extractColorsFromPixels and VERSION
  const coreEntry = await import(resolve(ROOT, 'dist/core/index.js'))
  assert(typeof coreEntry.extractColorsFromPixels === 'function', 'core entry exports extractColorsFromPixels')
  assert(typeof coreEntry.VERSION === 'string', 'core entry exports VERSION')
  assert(Array.isArray(coreEntry.COLOR_EXTRACTOR_ERROR_CODES), 'core entry exports COLOR_EXTRACTOR_ERROR_CODES')

  // 5. Root entrypoint resolves with VERSION, ColorExtractorError
  const rootEntry = await import(resolve(ROOT, 'dist/index.js'))
  assert(typeof rootEntry.VERSION === 'string', 'root entry exports VERSION')
  assert(typeof rootEntry.ColorExtractorError === 'function', 'root entry exports ColorExtractorError')
  assert(typeof rootEntry.DEFAULT_OPTIONS === 'object', 'root entry exports DEFAULT_OPTIONS')
  assert(typeof rootEntry.resolveOptions === 'function', 'root entry exports resolveOptions')

  // 6. No non-Node output references sharp (including shared chunks)
  const allFiles = await findJsFiles(resolve(ROOT, 'dist'))
  const nonNodeFiles = allFiles.filter(f => !f.includes(`${sep}node${sep}`))
  for (const file of nonNodeFiles) {
    const code = await readFile(file, 'utf-8')
    assert(!code.includes('sharp'), `no sharp reference in ${relative(resolve(ROOT), file)}`)
  }

  // 7. Node output includes sharp
  const nodeCode = await readFile(resolve(ROOT, 'dist/node/index.js'), 'utf-8')
  assert(nodeCode.includes('sharp'), 'node bundle references sharp')

  process.stdout.write(`\n  Total: ${passed} passed, ${failed} failed\n\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
