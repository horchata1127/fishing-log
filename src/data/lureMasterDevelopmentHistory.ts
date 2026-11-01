export interface MasterDevelopmentEntry { rc: number; title: string; catalog: string; features: string; pending: string; documents: string[] }
// Bundled text is the offline source of truth for this screen. Dates are deliberately not import dates.
export const lureMasterDevelopmentHistory: MasterDevelopmentEntry[] = [
  { rc: 19, title: '釣果編集・魚種・HUNT GRANDE', catalog: 'HUNT GRANDE 1.3gの確認済み2色。RC20と統合。', features: '終了済み釣行の釣果編集、魚種9件追加、既存IDとスナップショット保護。', pending: '過去の色名の訂正は自動反映しない。', documents: ['rc19/RC19_IMPLEMENTATION.md'] },
  { rc: 20, title: '4メーカー公式カラー補完', catalog: '21対象・332色候補。ニュードロワー、ベルベットアーツ、1089工房、ロブルアー。', features: '事前照合、出典付き差分CSV、追加のみの登録。', pending: '未登録モデルの作成許可は商品ごとに制限。', documents: ['rc20/RC20_IMPLEMENTATION.md'] },
  { rc: 21, title: '確認済みモデルの登録許可', catalog: 'ベルベットアーツ11モデル213色、ロブルアー7モデル69色。RC20と同じ282色を共有。', features: '18モデルの明示的な商品許可、重量・所属検証。', pending: '未確認商品を無条件に作成しない。', documents: ['rc21/RC21_IMPLEMENTATION.md'] },
  { rc: 22, title: 'バービー系カタログ', catalog: '9モデル100色候補。確認済み8モデル89色。', features: '通常・限定区分、販売店根拠とJAN、F/SS/SSSの分離。', pending: '未確認SSS11色は保留。', documents: ['rc22/RC22_IMPLEMENTATION.md'] },
  { rc: 23, title: 'バラシと結果別集計', catalog: '独立したカタログ追加なし。', features: 'キャッチ／バラシ、距離3区分、所有連携・履歴保護。', pending: '過去のバラシを推測で作成しない。', documents: ['rc23/RC23_IMPLEMENTATION.md'] },
  { rc: 24, title: 'アクション拡張', catalog: '独立したカタログ追加なし。', features: 'アクション候補と長さ3段階。旧文字列・未指定を保持。', pending: '過去レコードの一括補完なし。', documents: ['rc24/IMPLEMENTATION_REPORT.md'] },
  { rc: 25, title: '気象・統合タイムライン', catalog: '独立したルアーカタログ追加なし。', features: '施設座標候補調査、気象3表、手動地点再利用、時間帯別集計。', pending: '未承認施設座標は正式マスターに反映しない。', documents: ['rc25-pr2/IMPLEMENTATION_REPORT.md', 'rc25-pr3/IMPLEMENTATION.md', 'rc25-pr4/IMPLEMENTATION.md'] },
  { rc: 26, title: '釣果のエリア編集', catalog: '独立したカタログ追加なし。', features: '釣果ごとのエリア変更、未解決の旧名称・参照を保持。', pending: '施設・エリアを名称から自動推測しない。', documents: ['rc26/IMPLEMENTATION.md'] },
  { rc: 27, title: '既存釣行の施設紐付け', catalog: '独立したカタログ追加なし。', features: '施設選択と影響確認、釣果の旧場所・気象地点を保持。', pending: '旧釣果を新施設へ自動移動しない。', documents: ['rc27/IMPLEMENTATION.md'] },
  { rc: 28, title: 'RCワウ・TIMON拡充', catalog: '21対象369色候補。', features: 'モデル別カラー、重量・JAN・限定区分・根拠を照合。', pending: '別配列の要確認注記23件を保持。', documents: ['rc28/IMPLEMENTATION.md', 'rc28/SOURCES.md'] },
  { rc: 29, title: '釣行日と終了済み釣行編集', catalog: '独立したカタログ追加なし。', features: '端末暦日の初期値修正、釣行情報の確認付き編集。', pending: '過去の日時を自動補正しない。', documents: ['rc29/RC29_IMPLEMENTATION_REPORT.md'] },
  { rc: 30, title: 'USSA・イベント編集', catalog: 'USSA 4対象140色候補。', features: 'S/XS/ノンラトル等の区別、通常・限定色、終了済み釣行のイベント編集。', pending: '別配列の未確認注記4件、汎用USSAの割当保留。', documents: ['rc30/RC30_IMPLEMENTATION.md'] },
  { rc: 31, title: 'PALMS Little Diner', catalog: '3シリーズ7モデル83色。', features: 'モデル内コード優先、表記揺れを比較時だけ吸収。', pending: 'かべるね／かるべね等の公式表記を統一しない。', documents: ['rc31/RC31_VALIDATION.md'] },
  { rc: 32, title: 'ビジュアルカラー辞書', catalog: '独立したルアーカタログ追加なし。配色辞書2表を追加。', features: '48色パレット、配色入力・逆引き、名称推定、バックアップv8。', pending: '未確認配色を捏造せず、旧復元後の参照解除を保護。', documents: ['rc32/RC32_PHASE4_IMPLEMENTATION.md', 'rc32/RC32_PHASE5_RELEASE_CHECKLIST.md'] },
  { rc: 33, title: '購入品・カラー・代表配色', catalog: '6対象61色候補（60色＋既存1色の監査例）、購入指定11個。', features: '公式画像29件・名称推定12件・未確認20件。既存所有・配色保護。', pending: '未確認20件、不可視面や限定仕様は未設定。', documents: ['rc33/RC33_IMPLEMENTATION.md', 'rc33/RC33_SOURCES.md'] },
].sort((a, b) => b.rc - a.rc)
export const developmentDocumentUrl = (path: string) => `https://github.com/horchata1127/fishing-log/blob/main/docs/${path}`
