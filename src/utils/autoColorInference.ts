import type { VisualAppearance, VisualColorId, VisualAttributeId, VisualPattern } from '../db/database'

export const colorEstimatorVersion = 'rc32-name-v1'
export interface NameInference {
  origin: 'name'
  appearance: VisualAppearance
  estimatorVersion: string
  inputName: string
  basis: string[]
  confidence: number
}
type Rule = { id: string; aliases: string[]; colors?: VisualColorId[]; attributes?: VisualAttributeId[]; pattern?: VisualPattern; conventional?: boolean }
// These conventional names are explicit search aids, not claims about a manufacturer's actual paint.
const rules: Rule[] = [
  { id: 'conventional:black-manju', aliases: ['クロまんじゅう', '黒まんじゅう'], colors: ['black', 'brown'], conventional: true },
  { id: 'conventional:wakasagi', aliases: ['ワカサギ', 'わかさぎ', 'wakasagi'], colors: ['silver', 'blue'], conventional: true },
  { id: 'conventional:pellet', aliases: ['ペレット', 'pellet'], colors: ['brown'], conventional: true },
  { id: 'conventional:green-pumpkin', aliases: ['グリーンパンプキン', 'グリパン', 'green pumpkin'], colors: ['green', 'brown'], conventional: true },
  { id: 'white', aliases: ['ホワイト', 'シロ', '白', 'white'], colors: ['white'] },
  { id: 'ivory', aliases: ['アイボリー', 'ivory'], colors: ['ivory'] },
  { id: 'cream', aliases: ['クリーム', 'cream'], colors: ['cream'] },
  { id: 'beige', aliases: ['ベージュ', 'beige'], colors: ['beige'] },
  { id: 'light-gray', aliases: ['ライトグレー', 'ライトグレイ', 'light gray', 'light grey'], colors: ['light-gray'] },
  { id: 'gray', aliases: ['グレー', 'グレイ', '灰色', 'gray', 'grey'], colors: ['gray'] },
  { id: 'dark-gray', aliases: ['ダークグレー', 'dark gray', 'dark grey'], colors: ['dark-gray'] },
  { id: 'black', aliases: ['ブラック', 'クロ', '黒', 'black'], colors: ['black'] },
  { id: 'silver', aliases: ['シルバー', '銀', 'silver'], colors: ['silver'] },
  { id: 'gold', aliases: ['ゴールド', '金', 'gold'], colors: ['gold'] },
  { id: 'copper', aliases: ['カッパー', 'コッパー', '銅', 'copper'], colors: ['copper'] },
  { id: 'bronze', aliases: ['ブロンズ', 'bronze'], colors: ['bronze'] },
  { id: 'lemon', aliases: ['レモン', 'lemon'], colors: ['lemon'] },
  { id: 'yellow', aliases: ['イエロー', 'キイロ', '黄色', '黄', 'yellow'], colors: ['yellow'] },
  { id: 'mustard', aliases: ['マスタード', 'カラシ', 'からし', 'mustard'], colors: ['mustard'] },
  { id: 'chartreuse', aliases: ['チャートリュース', 'チャート', 'chartreuse', 'chart'], colors: ['chartreuse'] },
  { id: 'lime', aliases: ['ライム', 'lime'], colors: ['lime'] },
  { id: 'light-green', aliases: ['ライトグリーン', 'light green'], colors: ['light-green'] },
  { id: 'green', aliases: ['グリーン', 'ミドリ', '緑', 'green'], colors: ['green'] },
  { id: 'dark-green', aliases: ['ダークグリーン', 'dark green'], colors: ['dark-green'] },
  { id: 'olive', aliases: ['オリーブ', 'olive'], colors: ['olive'] },
  { id: 'khaki', aliases: ['カーキ', 'khaki'], colors: ['khaki'] },
  { id: 'mint', aliases: ['ミント', 'mint'], colors: ['mint'] },
  { id: 'teal', aliases: ['ティール', 'teal'], colors: ['teal'] },
  { id: 'cyan', aliases: ['シアン', 'cyan'], colors: ['cyan'] },
  { id: 'sky-blue', aliases: ['スカイブルー', '空色', 'sky blue'], colors: ['sky-blue'] },
  { id: 'blue', aliases: ['ブルー', 'アオ', '青', 'blue'], colors: ['blue'] },
  { id: 'dark-blue', aliases: ['ダークブルー', 'dark blue'], colors: ['dark-blue'] },
  { id: 'navy', aliases: ['ネイビー', '紺', 'navy'], colors: ['navy'] },
  { id: 'lavender', aliases: ['ラベンダー', 'lavender'], colors: ['lavender'] },
  { id: 'purple', aliases: ['パープル', 'ムラサキ', '紫', 'purple'], colors: ['purple'] },
  { id: 'violet', aliases: ['バイオレット', 'violet'], colors: ['violet'] },
  { id: 'magenta', aliases: ['マゼンタ', 'magenta'], colors: ['magenta'] },
  { id: 'light-pink', aliases: ['ライトピンク', 'light pink'], colors: ['light-pink'] },
  { id: 'pink', aliases: ['ピンク', '桃色', 'pink'], colors: ['pink'] },
  { id: 'hot-pink', aliases: ['ホットピンク', 'hot pink'], colors: ['hot-pink'] },
  { id: 'salmon', aliases: ['サーモンピンク', 'salmon pink'], colors: ['salmon'] },
  { id: 'coral', aliases: ['コーラル', 'coral'], colors: ['coral'] },
  { id: 'orange', aliases: ['オレンジ', '橙', 'orange'], colors: ['orange'] },
  { id: 'dark-orange', aliases: ['ダークオレンジ', 'dark orange'], colors: ['dark-orange'] },
  { id: 'red', aliases: ['レッド', 'アカ', '赤', 'red'], colors: ['red'] },
  { id: 'dark-red', aliases: ['ダークレッド', 'dark red'], colors: ['dark-red'] },
  { id: 'wine', aliases: ['ワイン', 'wine'], colors: ['wine'] },
  { id: 'peach', aliases: ['ピーチ', 'peach'], colors: ['peach'] },
  { id: 'tan', aliases: ['タンカラー', 'tan'], colors: ['tan'] },
  { id: 'brown', aliases: ['ブラウン', 'チャイロ', '茶色', '茶', 'チョコ', 'brown', 'chocolate'], colors: ['brown'] },
  { id: 'dark-brown', aliases: ['ダークブラウン', 'dark brown'], colors: ['dark-brown'] },
  { id: 'ochre', aliases: ['オーカー', '黄土色', 'ochre'], colors: ['ochre'] },
  { id: 'metallic', aliases: ['メタリック', 'metallic'], attributes: ['metallic'] },
  { id: 'pearl', aliases: ['パール', 'pearl'], attributes: ['pearl'] },
  { id: 'glitter', aliases: ['ラメ', 'glitter'], attributes: ['glitter'] },
  { id: 'hologram', aliases: ['ホログラム', 'hologram'], attributes: ['hologram'] },
  { id: 'glow', aliases: ['グロー', 'glow'], attributes: ['glow'] },
  { id: 'uv', aliases: ['uv反応', 'uv reactive', 'ケイムラ'], attributes: ['uv'] },
  { id: 'fluorescent', aliases: ['蛍光', 'ケイコウ', 'fluorescent'], attributes: ['fluorescent'] },
  { id: 'transparent', aliases: ['クリア', 'スケスケ', '透明', 'clear', 'transparent'], attributes: ['transparent'] },
  { id: 'translucent', aliases: ['半透明', 'translucent'], attributes: ['translucent'] },
  { id: 'matte', aliases: ['マット', 'matte'], attributes: ['matte'] },
  { id: 'gloss', aliases: ['光沢', 'gloss'], attributes: ['gloss'] },
  { id: 'iridescent', aliases: ['偏光', 'iridescent'], attributes: ['iridescent'] },
  { id: 'single', aliases: ['単色', 'solid color'], pattern: 'single' },
  { id: 'two-tone', aliases: ['ツートン', 'two tone'], pattern: 'two-tone' },
  { id: 'gradient', aliases: ['グラデーション', 'gradient'], pattern: 'gradient' },
  { id: 'spots', aliases: ['斑点', 'spotted'], pattern: 'spots' },
  { id: 'marble', aliases: ['マーブル', 'marble'], pattern: 'marble' },
]

export function normalizeColorName(value: string): string {
  return value.normalize('NFKC').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[‐‑‒–—−-]/g, ' ').replace(/\s+/g, ' ').trim()
}
const aliases = rules.flatMap(rule => rule.aliases.map(alias => ({ rule, token: normalizeColorName(alias) }))).sort((a, b) => b.token.length - a.token.length)

/** Pure, deterministic parser. Codes alone are never mapped to colors. Unknown body regions stay generic. */
export function inferColorName(inputName: string): { inference?: NameInference; reason: string } {
  let remaining = normalizeColorName(inputName).replace(/^(?:#?\d{1,3}|[a-z]{1,3}\s?\d[a-z0-9]*)(?:[.:_]+\s*|\s+)(?=\S)/, '')
  if (!remaining || /^[a-z\d\s#._/-]+$/i.test(remaining) && !/[a-z]{3}/.test(remaining)) return { reason: '識別コードのみ、または空欄' }
  const found: { rule: Rule; token: string; position: number }[] = []
  for (const { rule, token } of aliases) {
    let offset = 0
    while (offset <= remaining.length - token.length) {
      const index = remaining.indexOf(token, offset)
      if (index < 0) break
      offset = index + token.length
      if (token === 'グレー' && /[プト]/.test(remaining[index + token.length] ?? '')) continue // グレープ・グレート are not gray.
      if (/^[a-z ]+$/.test(token) && (/[a-z]/.test(remaining[index - 1] ?? '') || /[a-z]/.test(remaining[index + token.length] ?? ''))) continue
      found.push({ rule, token, position: index })
      remaining = remaining.slice(0, index) + ' '.repeat(token.length) + remaining.slice(index + token.length)
    }
  }
  found.sort((a, b) => a.position - b.position || b.token.length - a.token.length)
  const residue = remaining.replace(/[\d\s\p{P}\p{S}]/gu, '')
  const accepted = found.filter(f => !residue || f.token.length !== 1 || !f.rule.colors)
  const colors = [...new Set(accepted.flatMap(f => f.rule.colors ?? []))]
  const attributes = [...new Set(found.flatMap(f => f.rule.attributes ?? []))]
  const patterns = [...new Set(found.flatMap(f => f.rule.pattern ? [f.rule.pattern] : []))]
  if (!colors.length && !attributes.length) return { reason: '対応する色名・属性がありません' }
  if (colors.length > 3 || patterns.length > 1) return { reason: '4色以上または模様指定が競合するため要確認' }
  // A lone kanji embedded in an opaque proper noun (赤城, 金太郎...) is not paint evidence.
  if (residue && found.every(f => f.token.length === 1)) return { reason: '固有名詞の一部の可能性があるため未推定' }
  const confidence = accepted.some(f => f.rule.conventional) ? 0.65 : residue ? 0.55 : 0.85
  return { reason: residue ? '名称の一部のみ一致。未解釈部分あり' : '明示的な色名・属性、または登録済み慣用名', inference: {
    origin: 'name', estimatorVersion: colorEstimatorVersion, inputName,
    basis: accepted.map(f => `${f.rule.id}: ${f.token}`), confidence,
    appearance: { version: 1, paletteVersion: 1, layout: 'generic', regions: { whole: { colors, attributes, ...(patterns[0] ? { pattern: patterns[0] } : {}) } } },
  } }
}
