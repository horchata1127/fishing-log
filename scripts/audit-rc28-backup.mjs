// Read-only backup validation and pure catalog preview. Never imports/restores data into IndexedDB.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const path=process.argv[2]
if(!path) throw new Error('Pass a local backup path; only aggregate catalog results are written.')
const original=await readFile(path)
const backup=JSON.parse(original.toString('utf8').replace(/^\uFEFF/,'')),data=backup.data
const directory=await mkdtemp(join(tmpdir(),'fishing-log-readonly-audit-'))
try{
  const sources={ database:'src/db/database.ts',data:'src/data/rc28Catalog.ts',catalog:'src/utils/rc28Catalog.ts',
    master:'src/utils/facilityMaster.ts',storage:'src/utils/facilityStorage.ts',backup:'src/utils/backup.ts' }
  const urls=Object.fromEntries(Object.keys(sources).map(n=>[n,pathToFileURL(join(directory,n+'.mjs')).href]))
  const replacements={dexie:import.meta.resolve('dexie'),'../db/database':urls.database,'../data/rc28Catalog':urls.data,
    './facilityMaster':urls.master,'./facilityStorage':urls.storage}
  for(const [name,file] of Object.entries(sources)){
    let code=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
    for(const [from,to] of Object.entries(replacements)) code=code.replaceAll("'"+from+"'",JSON.stringify(to))
    await writeFile(join(directory,name+'.mjs'),code)
  }
  const {validateBackup}=await import(urls.backup)
  validateBackup(backup)
  const {previewRc28Snapshot,rc28DiffCsv}=await import(urls.catalog)
  const preview=await previewRc28Snapshot(['lureManufacturers','lureSeries','lureModels','lureVariants'].map(n=>data[n]))
  const normalized=s=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase()
  const duplicates={}
  for(const [table,parent,name] of [['lureManufacturers',null,'name'],['lureSeries','manufacturerId','name'],['lureModels','seriesId','name'],['lureVariants','modelId','colorName']]){
    const groups=new Map()
    for(const row of data[table]){
      const key=`${parent?row[parent]:''}/${normalized(row[name])}`
      groups.set(key,[...(groups.get(key)??[]),row.id])
    }
    duplicates[table]=[...groups.values()].filter(ids=>ids.length>1)
  }
  const references=[]
  for(const [table,field,parent] of [['lureSeries','manufacturerId','lureManufacturers'],['lureModels','seriesId','lureSeries'],['lureVariants','modelId','lureModels'],['myLures','variantId','lureVariants'],['catches','lureId','myLures'],['catches','lureVariantId','lureVariants'],['catches','tripId','trips']]){
    const ids=new Set(data[parent].map(r=>r.id))
    references.push({table,field,present:data[table].filter(r=>r[field]!==undefined).length,broken:data[table].filter(r=>r[field]!==undefined&&!ids.has(r[field])).length})
  }
  const summary={version:backup.version,exportedAt:backup.exportedAt,valid:true,
    counts:Object.fromEntries(['lureManufacturers','lureSeries','lureModels','lureVariants','myLures'].map(n=>[n,data[n].length])),
    ids:Object.fromEntries(['lureManufacturers','lureSeries','lureModels','lureVariants'].map(n=>[n,{min:Math.min(...data[n].map(r=>r.id)),max:Math.max(...data[n].map(r=>r.id)),positiveSafeIntegers:data[n].every(r=>Number.isSafeInteger(r.id)&&r.id>0)}])),
    normalizedDuplicates:duplicates,references,
    preview:{addedColors:preview.addedColors,retainedColors:preview.retainedColors,pendingItems:preview.pendingColors,addedModels:preview.addedModels,addedSeries:preview.addedSeries}}
  await writeFile('docs/rc28/BACKUP_ANALYSIS.json',JSON.stringify(summary,null,2)+'\n')
  await writeFile('docs/rc28/CATALOG_DIFF.csv',rc28DiffCsv(preview))
  if(!original.equals(await readFile(path))) throw new Error('Backup file changed during audit')
  console.log(JSON.stringify(summary,null,2))
}finally{await rm(directory,{recursive:true,force:true})}
