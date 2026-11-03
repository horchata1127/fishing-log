import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Isolated compilation for Node audit/tests; never touches the application's browser DB.
export async function localTypeScript() {
  const directory = await mkdtemp(join(tmpdir(), 'fishing-moca-')), modules = new Map()
  async function compile(file) {
    file = resolve(file)
    if (modules.has(file)) return modules.get(file)
    const url = pathToFileURL(join(directory, `${modules.size}.mjs`)).href
    modules.set(file, url)
    let code = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    for (const specifier of [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map(m => m[1])) {
      const target = specifier.startsWith('.') ? await compile(resolve(dirname(file), `${specifier}.ts`)) : import.meta.resolve(specifier)
      code = code.replaceAll(`'${specifier}'`, JSON.stringify(target)).replaceAll(`"${specifier}"`, JSON.stringify(target))
    }
    await writeFile(new URL(url), code)
    return url
  }
  return { load: async file => import(await compile(file)), close: async () => {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
    await rm(directory, { recursive: true, force: true })
  } }
}
