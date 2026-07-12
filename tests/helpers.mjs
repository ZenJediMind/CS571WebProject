// Loads src/game modules in Node by patching extensionless sibling imports.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('../src/game/', import.meta.url))
const cache = new Map()
let outDir = null

export async function loadGameModule(name) {
  if (cache.has(name)) return cache.get(name)
  outDir ??= await mkdtemp(join(tmpdir(), 'wr-tests-'))
  let source = await readFile(join(SRC_DIR, `${name}.js`), 'utf8')
  const deps = [...source.matchAll(/from '\.\/(\w+)'/g)].map((m) => m[1])
  for (const dep of deps) {
    await loadGameModule(dep)
    source = source.replaceAll(`from './${dep}'`, `from '${pathToFileURL(join(outDir, `${dep}.mjs`)).href}'`)
  }
  const outPath = join(outDir, `${name}.mjs`)
  await writeFile(outPath, source)
  const mod = await import(pathToFileURL(outPath).href)
  cache.set(name, mod)
  return mod
}
