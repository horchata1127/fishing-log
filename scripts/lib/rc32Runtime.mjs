import 'fake-indexeddb/auto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Development/test runtime only. fake-indexeddb is process-local, never a browser's database.
export async function createRc32Runtime() {
  const directory = await mkdtemp(join(tmpdir(), 'fishing-log-rc32-batch-'))
  const sources = { database: 'src/db/database.ts', inference: 'src/utils/autoColorInference.ts', importer: 'src/utils/autoColorImport.ts',
    storage: 'src/utils/visualColorStorage.ts', backup: 'src/utils/backup.ts', facilityStorage: 'src/utils/facilityStorage.ts', facilityMaster: 'src/utils/facilityMaster.ts',
    rc30: 'src/utils/rc30Catalog.ts', rc31: 'src/utils/rc31Catalog.ts', data30: 'src/data/rc30Catalog.ts', data31: 'src/data/rc31Catalog.ts', data22: 'src/data/rc22Catalog.ts' }
  const paths = Object.fromEntries(Object.keys(sources).map(n => [n, join(directory, n + '.mjs')]))
  const imports = { '../db/database': 'database', './autoColorInference': 'inference', './visualColorStorage': 'storage', './facilityStorage': 'facilityStorage', './facilityMaster': 'facilityMaster', '../data/rc30Catalog': 'data30', '../data/rc31Catalog': 'data31' }
  for (const [name, path] of Object.entries(sources)) {
    let code = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    for (const [from, to] of Object.entries({ dexie: import.meta.resolve('dexie'), ...Object.fromEntries(Object.entries(imports).map(([key, value]) => [key, pathToFileURL(paths[value]).href])) })) code = code.replaceAll(`'${from}'`, JSON.stringify(to)).replaceAll(JSON.stringify(from), JSON.stringify(to))
    await writeFile(paths[name], code)
  }
  const modules = Object.fromEntries(await Promise.all(Object.keys(sources).map(async name => [name, await import(pathToFileURL(paths[name]).href)])))
  return { ...modules, async dispose() {
    modules.database.db.close()
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected temporary directory')
    await rm(directory, { recursive: true, force: true })
  } }
}
