import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { localTypeScript } from '../scripts/load-local-typescript.mjs'

const backupPath = process.env.RODIO_DEVICE_BACKUP
test('BF and DRIFT SPIN apply atomically, preserve the original records and resolve only exact products', async () => {
  const loader = await localTypeScript()
  const { db } = await loader.load('src/db/database.ts')
  try {
    const { rc45Fixture, rc45Manifest, rc45Total } = await loader.load('tests/rc45Fixture.ts')
    const { importBackup, createBackup } = await loader.load('src/utils/backup.ts')
    const { createLureMasterUpdater } = await loader.load('src/utils/lureMasterApply.ts')
    const { currentPhotoCatalog, resolveColorPhoto } = await loader.load('src/utils/lurePhotos.ts')
    const input = backupPath ? await readFile(backupPath, 'utf8') : JSON.stringify(rc45Fixture())
    await importBackup({ text: async () => input })
    const original = await createBackup()
    const updater = createLureMasterUpdater(db, rc45Manifest)
    const preview = await updater.preview()
    assert.deepEqual([rc45Manifest.targets.length,rc45Total,preview.addedModels,preview.addedColors,preview.retainedColors,preview.heldColors],
      [13,432,9,428,4,0])
    let inserted = 0
    const fail = () => { if (++inserted === 3) throw new Error('Test-only insertion failure') }
    db.lureVariants.hook('creating', fail)
    try { await assert.rejects(updater.apply(preview.comparisonToken)) }
    finally { db.lureVariants.hook('creating').unsubscribe(fail) }
    assert.equal((await updater.preview()).addedColors,428)
    await updater.apply((await updater.preview()).comparisonToken)
    const applied = await createBackup()
    for (const [table, rows] of Object.entries(original.data)) {
      if (table === 'lureMasterImportHistory') continue
      for (const row of rows) assert.ok(applied.data[table].some(candidate => isDeepStrictEqual(candidate,row)), table)
    }
    assert.deepEqual(applied.data.catches,original.data.catches)
    assert.deepEqual(applied.data.myLures,original.data.myLures)
    await importBackup({text:async()=>JSON.stringify(applied)})
    assert.equal((await updater.preview()).addedColors,0)
    if (backupPath) assert.equal(await readFile(backupPath,'utf8'),input)

    const options = (await currentPhotoCatalog()).filter(o => ['BF','DRIFT SPIN'].includes(o.seriesName))
    assert.equal(options.length,432)
    const links = await Promise.all(options.map(o=>resolveColorPhoto(o)))
    assert.ok(links.every(l=>l?.externalProductUrl && !l.imageReference && !('shared' in l)))
    const sameWeight = options.filter(o => /^DRIFT SPIN (37|42) 2.0g$/.test(o.modelName) && o.colorName === '#13 ブラック')
    assert.equal(sameWeight.length,2)
    const [one,two] = await Promise.all(sameWeight.map(o=>resolveColorPhoto(o)))
    assert.notEqual(one.externalProductUrl,two.externalProductUrl)
    const option = sameWeight[0]
    assert.equal(await resolveColorPhoto({...option,modelDetails:{...option.modelDetails,lengthMm:99}}),undefined)
    assert.equal(await resolveColorPhoto({...option,colorName:'#13 別の色'}),undefined)
  } finally {
    db.close()
    await db.delete()
    await loader.close()
  }
})

test('NOA gap links follow user suppression and leave the shared ID and legacy product choices intact', async () => {
  const loader = await localTypeScript()
  const { db } = await loader.load('src/db/database.ts')
  try {
    const { rodioExternalReferences } = await loader.load('src/data/rodioExternalReferences.ts')
    const { sharedColorForOption,modelProductLinkForOption,retailerProductLinkForOption } = await loader.load('src/utils/noaPhotoCatalog.ts')
    const { resolveColorPhoto } = await loader.load('src/utils/lurePhotos.ts')
    const target=rodioExternalReferences.find(r=>r.seriesName==='NOA')
    assert.ok(target)
    const option={...target,variantId:1,modelId:1}
    const shared=sharedColorForOption(option)
    assert.ok(shared)
    assert.equal(shared.externalProductUrl,undefined)
    assert.equal(modelProductLinkForOption(option),undefined)
    assert.equal(retailerProductLinkForOption(option),undefined)
    assert.equal((await resolveColorPhoto(option)).externalProductUrl,target.product.url)
    assert.equal(await db.sharedLureColors.count(),0)
    await db.sharedLureColors.put({...shared,externalVerified:false})
    assert.equal((await resolveColorPhoto(option)).externalProductUrl,undefined)
    await db.sharedLureColors.put({...shared,externalVerified:true,externalProductUrl:'https://example.test/products/user-choice'})
    assert.equal((await resolveColorPhoto(option)).externalProductUrl,'https://example.test/products/user-choice')
    assert.equal((await resolveColorPhoto(option)).shared.id,shared.id)
  } finally {
    db.close()
    await db.delete()
    await loader.close()
  }
})
