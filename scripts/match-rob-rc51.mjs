import { catalogFingerprint, sha256 } from './catalog-audit-fingerprint.mjs'
import { readFile, readdir, writeFile } from 'node:fs/promises'

const [backupPath] = process.argv.slice(2)
if (!backupPath) throw new Error('Pass the read-only device backup path')
const audit = 'docs/lure-external-links/'
const cache = '.rc51-rob.local/'
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))
const raw = await readFile(backupPath)
const { data } = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''))
const policies = (await readJson(audit + 'SOURCE_POLICIES.json')).sources
const pages = await Promise.all((await readdir(cache)).filter(name => name.endsWith('.json')).sort().map(name => readJson(cache+name)))
const byUrl = new Map(pages.map(page=>[page.url,page]))
const maker = data.lureManufacturers.find(row => /^(rob\s*lure|ロブ・?ルアー)$/i.test(row.name))
const series = new Map(data.lureSeries.filter(row => row.manufacturerId === maker.id).map(row => [row.id,row.name]))
const official = slug => new URL('/work/' + slug + '/', 'https://rob-lure.com').href
const shop = (pid,policy) => 'https://' + (policy==='wonder-field' ? 'wonder-field.shop-pro.jp' : 'www.kitiya.jp') + '/?pid=' + pid
const normalize = value => value.normalize('NFKC').replace(/\s+/g,'').toLowerCase()
const colorName = value => normalize(value).replace(/^が[ー〜~]こちゃん$/,'が~こちゃん').replace(/^c\.g\.g\.$/,'c.g.g')
function colorLabel(value) {
  const text = value.normalize('NFKC').trim()
  const match = text.match(/^#?(R?\d+)\s+(.+)$/i)
  return { code: match?.[1].replace(/^0+(?=\d)/,'') ?? '', name: match?.[2] ?? text.replace(/^#/,'') }
}
function equalColor(master, candidate) {
  if (master.code && candidate.code && master.code !== candidate.code) return false
  if (master.code === candidate.code && master.code === '21' &&
    [master.name,candidate.name].every(name=>['ただ巻バグ','ただ巻きバグ'].includes(name))) return true
  return colorName(master.name) === colorName(candidate.name)
}

// Gallery ordinals were checked against the adjacent subtype heading and specification.
const bindings = new Map([
  ['S-Plug 1.8g', ['s-plug','gallery-1',1.8,'',true]],
  ['S-Plug 2.2g', ['s-plug','gallery-1',2.2,'',true]],
  ['チェルシー SS', ['チェルシー','gallery-1',1.8,'スローシンキング']],
  ['チェルシー F', ['チェルシー','gallery-2',1.4,'フローティング']],
  ['パパバービー', ['パパバービー','gallery-1',3.4,'フローティング']],
  ['モーストバービー', ['モーストバービー','gallery',3.4,'']],
  ['もぐたそ', ['もぐたそ','gallery-1',4.2,'シンキング']],
  ['バービー F', ['berbie-バービー','gallery-1',1.4,'フローティング']],
  ['バービー SS', ['berbie-バービー','gallery-2',1.6,'スローシンキング']],
  ['バービー・ロング F', ['バービーロング','gallery-1',1.6,'フローティング']],
  ['バービー・ママ F', ['berbie_mama-バービー・ママ','gallery-1',2.6,'フローティング']],
  ['バービー・ママ SS', ['berbie_mama-バービー・ママ','gallery-2',2.8,'スローシンキング']],
])
const shopBindings = new Map([
  ['バービー F', [[178211311,'ロブルアーバービーf',1.4,true,'wonder-field']]],
  ['バービー・ガール SS', [[189784116,'ロブルアーバービーガールss',0.9,true,'wonder-field']]],
  ['バービー・ロング F', [[172375874,'ロブルアーバービーロングf',1.6]]],
  ['バービー・ロング SS', [[189195750,'ロブルアーバービーロングss',1.8,true]]],
  ['バービー・ママ F', [[81489465,'ロブルアーママバービーf',2.6]]],
  ['バービー・ガール F', [[191810992,'ロブルアーバービーガールf',0.7,true]]],
  ['バービー SS', [[37596448,'ロブルアーバービーss',1.6]]],
  ['ルラン 0.8g', [[193968893,'ロブルアー×カルテラスruran(ルラン)0.8g',0.8],
    [193679105,'カルテラス×ロブルアーruran(ルラン)0.8g',0.8]]],
])
const productPrefixes = new Map([
  ['バービー F','バービーF'], ['バービー SS','バービーSS'], ['バービー・ガール SS','バービーガールSS'],
  ['バービー・ガール F','バービーガールF'], ['バービー・ロング SS','バービーロングSS'],
  ['バービー・ロング F','バービーロングF'],
])
const specificRetail = pages.filter(page=>page.httpStatus===200 && /fishing-shop-jh\.com\/\?pid=/.test(page.url))
const rows = [], models = [], references = []
for (const model of data.lureModels.filter(row=>series.has(row.seriesId))) {
  const modelSeries = series.get(model.seriesId)
  const variants = data.lureVariants.filter(row=>row.modelId===model.id)
  const [slug,gallery,weight,type,shared] = bindings.get(model.name) ?? []
  const officialPage = byUrl.get(official(slug))
  const spec = officialPage?.specs?.map(normalize).find(line => line.includes(weight+'g') && (!type || line.includes(type)))
  const officialColors = model.weightG === weight && spec
    ? officialPage.images.filter(img=>(img.gallery===gallery ||
        model.name==='モーストバービー' && new URL(img.url).pathname.includes('/img/mostbarbie/')) && img.alt!=='ズームアイコン')
      .map(img=>({...colorLabel(img.caption || img.alt.replace(/^“|”$/g,'')), url:img.url}))
      .filter(color=>color.name && new URL(color.url).hostname==='rob-lure.com') : []
  const retailerLists = (shopBindings.get(model.name) ?? []).flatMap(([pid,title,expectedWeight,mustShowWeight,policy='kitiya'])=>{
    const page = byUrl.get(shop(pid,policy))
    return page?.httpStatus===200 && normalize(page.title.split('|')[0])===title && model.weightG===expectedWeight &&
      policies[policy].product==='plain-link' && (!mustShowWeight || page.specs.some(text=>normalize(text).includes(expectedWeight+'g')))
      ? [{page,policy,colors:[...new Set(page.options)].map(colorLabel)}] : []
  })
  models.push({modelId:model.id,series:modelSeries,model:model.name,weightG:model.weightG,colorRows:variants.length,
    candidateUrl:officialPage?.url,modelStatus:officialColors.length?'color-gallery-reviewed':officialPage?'official-color-names-unconfirmed':'official-model-page-unconfirmed'})
  for (const variant of variants) {
    const evidence = variant.catalogEvidence
    const master = colorLabel(variant.colorName)
    const boundColor = officialColors.find(color=>equalColor(master,color) && !master.code)
    const row = {variantId:variant.id,modelId:model.id,series:modelSeries,model:model.name,color:variant.colorName,
      colorCode:master.code,checkedAt:policies['rob-lure'].checkedAt,candidateUrl:officialPage?.url,
      status:'held',reason:'no-exact-published-model-color',candidateUrls:[officialPage?.url,...retailerLists.map(list=>list.page.url),evidence?.retailerUrl].filter(Boolean)}
    let match
    if (boundColor) {
      match = {page:officialPage,color:boundColor,sourceName:'ROB LURE',sourceType:'manufacturer',kind:'model-color-list'}
      const url = boundColor.url.replace(/^http:/,'https:')
      row.image = {url,kind:shared?'weight-common-color-sample':'official-color-sample',
        conditions:'held',reason:'image-display-permission-unconfirmed'}
    } else {
      const label = productPrefixes.get(model.name)
      const individual = label && specificRetail.find(page=>{
        const prefix = normalize('ロブルアー' + label)
        const title = page.title.split(' - ')[0].normalize('NFKC')
        const split = title.indexOf('#')
        if (split<0 || normalize(title.slice(0,split))!==prefix) return false
        const rawColor = title.slice(split)
        const special = /\[HERO'S\]|【HERO'S】/.test(rawColor)
        const candidate = colorLabel(rawColor.replace(/(?:\[HERO'S\]|【HERO'S】)$/,'').trim())
        const retailerJan = page.sections.find(text=>/^\d{13}$/.test(text))
        const janMatches = !!evidence?.jan && evidence.jan===retailerJan
        if (special) {
          if (evidence?.colorClass!=='heroes' || !janMatches) return false
          if (master.name==='みそピーグロー' && candidate.name==='みそぴーグロー') return true
        }
        return equalColor(master,candidate) && (!evidence?.jan || !retailerJan || janMatches)
      })
      if (individual) {
        match = {page:individual,color:master,sourceName:policies.jh.name,sourceType:'retailer',
          conditionsEvidence:policies.jh.termsUrls.at(-1),kind:'individual-color'}
        const label = normalize(individual.title.split(' - ')[0])
        const image = individual.images.find(img=>normalize(img.alt)===label && img.url.includes('/product/'))
        if (image && evidence?.jan && individual.sections.includes(evidence.jan)) {
          row.image = {url:image.url,kind:'product-photo',conditions:'held',reason:'image-display-permission-unconfirmed'}
        }
      } else {
        for (const {page,policy,colors} of retailerLists) {
          const matching = colors.find(color=>equalColor(master,color) && (!master.code || master.code===color.code))
          if (matching) {
            match = {page,color:matching,sourceName:policies[policy].name,sourceType:'retailer',
              conditionsEvidence:policies[policy].termsUrls[0],kind:'model-color-list'}
            break
          }
        }
      }
    }
    if (match) {
      const {page,color,sourceType,sourceName,conditionsEvidence,kind} = match
      const basis = [model.name,model.weightG+'g',type || model.actionType,color.code,color.name,
        kind==='individual-color' && evidence?.jan && page.sections.includes(evidence.jan) ? 'JAN '+evidence.jan : undefined].filter(Boolean).join(' / ')
      Object.assign(row,{status:'matched',reason:undefined,productUrl:page.url,checkedAt:page.checkedAt,kind,basis,sourceName,sourceType,conditionsEvidence})
      references.push({manufacturerName:'ROB LURE',seriesName:modelSeries,modelName:model.name,
        modelDetails:{weightG:model.weightG,lengthMm:model.lengthMm,actionType:model.actionType,buoyancy:evidence?.buoyancy,rattle:evidence?.rattle},
        colorName:variant.colorName,colorCode:evidence?.colorCode,product:{url:page.url,verified:true,kind,conditionsEvidence},
        sourceName,sourceType,checkedAt:page.checkedAt,evidenceUrl:page.url,verificationBasis:basis})
    } else if (model.name==='バービー F' && master.name==='クリアピンク') {
      row.candidateUrls.push('https://store.castingnet.jp/shop/g/g4580374761616/')
      row.reason = 'exact-jan-retailer-http-202-without-product-content'
    } else if (model.name==='バービー SS' && master.name==='ミリタリスト') {
      row.reason = 'heroes-ss-jan-unconfirmed-on-accessible-product-page'
    }
    rows.push(row)
  }
}
const stats = { backupSha256:sha256(raw),catalogSha256:catalogFingerprint(data),series:series.size,models:models.length,colorRows:rows.length,
  matchedProductRows:references.length,heldProductRows:rows.length-references.length }
await writeFile(audit+'ROB_LURE_REVIEW.json',JSON.stringify({
  checkedAt:policies['rob-lure'].checkedAt,policyReviewUrls:policies['rob-lure'].policyReviewUrls,stats,
  pages:[...pages.map(({url,httpStatus,checkedAt,sha256})=>({url,httpStatus,checkedAt,sha256})),
    {url:'https://store.castingnet.jp/shop/g/g4580374761616/',httpStatus:202,checkedAt:policies['rob-lure'].checkedAt,
      reason:'exact-jan-retailer-http-202-without-product-content'}],models,rows,
},null,2)+'\n')
const output = 'src/data/robLureExternalReferences.ts'
const groups = new Map()
for (const {colorName,colorCode,verificationBasis,...fields} of references) {
  const key = JSON.stringify(fields)
  if (!groups.has(key)) groups.set(key,{...fields,colors:[]})
  groups.get(key).colors.push([colorName,colorCode ?? '',verificationBasis])
}
const definitions = [...groups.values()].map(({colors,...fields}) => '  '+JSON.stringify(fields).slice(0,-1)+
  ', "colors": [\n'+colors.map(color=>'    '+JSON.stringify(color)).join(',\n')+'\n  ]}').join(',\n')
const contents = "// Generated by scripts/match-rob-rc51.mjs.\nimport type { LureExternalReference } from './lureExternalReferences'\n\n" +
  "type ReferenceGroup = Omit<LureExternalReference, 'colorName' | 'colorCode' | 'verificationBasis'> & {\n" +
  '  colors: readonly (readonly [name: string, code: string, basis: string])[]\n}\n\n' +
  'const groups: readonly ReferenceGroup[] = [\n'+definitions+'\n]\n\n' +
  'export const robLureExternalReferences: readonly LureExternalReference[] = groups.flatMap(({ colors, ...fields }) =>\n' +
  "  colors.map(([colorName, colorCode, verificationBasis]) => ({ ...fields, colorName, colorCode: colorCode || undefined, verificationBasis })))\n"
const previous = await readFile(output,'utf8').catch(error=>{if (error.code!=='ENOENT') throw error})
if (previous?.replaceAll('\r\n','\n')!==contents) await writeFile(output,contents)
console.log(stats)
