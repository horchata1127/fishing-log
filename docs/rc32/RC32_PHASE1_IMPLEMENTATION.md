# RC32 Phase 1 データ保存基盤 実装・検証結果

- 実装日：2026-10-31
- 作業ブランチ：`feature/rc32-phase1-storage`
- 基準：RC31 `4e37af5`
- 範囲：固定辞書、配色型、追加テーブル、保存API、配色スナップショット、バックアップ互換性。
- UI、写真取得、自動カラー推定、逆引き検索画面は未実装。

## データ構造

型・固定辞書・純粋な検証関数は、既存の魚種・タックル・気象と同じく [database.ts](../../src/db/database.ts) に定義した。起動時シードや既存レコードの補完は行わない。

### 固定辞書

`visualPalette` に48色を固定ID・日本語名・表示用HEX値で定義。IDは順序と独立し、今後も意味を変えない。HEXは簡易表示用の代表値であり、製品の実測色ではない。

| 区分 | 色ID |
|---|---|
| 無彩色・淡色 | white, ivory, cream, beige, light-gray, gray, dark-gray, black |
| 金属系の代表色 | silver, gold, copper, bronze |
| 黄・緑系 | lemon, yellow, mustard, chartreuse, lime, light-green, green, dark-green, olive, khaki, mint, teal |
| 青・紫系 | cyan, sky-blue, blue, dark-blue, navy, lavender, purple, violet, magenta |
| 桃・橙・赤系 | light-pink, pink, hot-pink, salmon, coral, orange, dark-orange, red, dark-red, wine, peach |
| 茶系 | tan, brown, dark-brown, ochre |

`visualAttributes` の12属性は metallic / pearl / glitter / hologram / glow / uv / fluorescent / transparent / translucent / matte / gloss / iridescent。各日本語名はソースで定義。透明は基本色ではなく属性として扱い、色が分からない状態と区別する。

### 部位・編集状態

`VisualAppearance` はversion=1、paletteVersion=1と、次の判別可能な型を持つ。

- spoon：front / back（表・裏）
- body：dorsal / side / belly（背・側・腹）
- generic：whole（共通）

部位は任意。未確認部位を無理に補完しない。各部位に複数色IDと特殊属性IDを保存し、重複・未対応ID・異なるlayoutの部位を拒否する。

状態はorigin=user/photo/name、userEdited、confirmed、revision、updatedAtで管理する。任意のevidenceに出典URL・画像ハッシュ・推定器版・確信度を保持できる。推定処理そのものは実装していない。

### Dexie v9

既存19テーブルの定義を変更せず、次の2テーブルのみを追加。upgradeコールバック、backfill、初期データ投入はない。

| テーブル | キー・索引 | 内容 |
|---|---|---|
| lureVisualProfiles | `id, &variantId, &naturalKey` | UUID、任意の公式カラーID、自然キー、配色、編集状態 |
| temporaryLureColors | `id, modelId, linkedVariantId` | UUID、仮名、任意のモデル・公式カラー参照と対応する自然キー、配色、編集状態 |

参照を解除しても配色を残せるよう、プロフィールの主キーはUUID、variantIdは任意とした。variantIdとnaturalKeyにはそれぞれ一意索引がある。

### 自然キー

メーカー・シリーズ・モデルの名前と、モデル内カラーのコードまたは名前を保持する。原表記をidentityに保存し、naturalKeyは比較用にNFKC・空白・英大小文字を正規化する。コードだけはハイフン類も正規化する。

コードはモデル内に限定する。保存・v8復元時には、IDの存在だけでなく、そのIDが自然キーと一致するかを検証する。コードはcatalogEvidenceまたは既存の表示名先頭、名前は証跡の原名または表示名から照合する。曖昧な別名を推測して統合しない。

## 保存API

[visualColorStorage.ts](../../src/utils/visualColorStorage.ts)：

- `saveVisualProfile(value, expectedRevision?)`：新規はrevision=1。更新は期待版との一致とrevisionの+1を必要とする。自然キーのすり替えは拒否。
- `saveTemporaryColor(value, expectedRevision?)`：同様に競合検証し、参照・自然キーを検証して保存。
- `createVisualSnapshot(appearance, state)`：配色を値としてコピーし、使用色の表示HEXも保存。

保存APIはカタログを参照検証のために読み取るが、書き込みは視覚テーブルのみ。myLuresや既存マスターへの追加・変更はしない。

自動候補（origin=photo/name）は、既存がuserEditedまたはconfirmedなら上書きできない。ユーザーoriginにはuserEdited=trueを必須とする。保護判定と期待版比較は保存トランザクション内で行う。

## 釣果スナップショット

`CatchRecord.visualColorSnapshot?` を追加。配色、辞書版、描画用HEX、origin、confirmedを保存する。登録APIで検証する。

- フィールド省略の旧記録には何も追加しない。
- メモ等の編集では既存スナップショットを保持する。
- 「前回と同じ」では前回の値をコピーする。
- ルアーを明示的に選び直し、新しい配色が渡されなかった場合は、旧ルアーの配色を引き継がない。
- 辞書の後日変更で釣果の配色を更新しない。

現在のUIは配色を入力しない。新規APIを利用するUIは後続Phaseで接続する。

## バックアップと旧形式復元

[backup.ts](../../src/utils/backup.ts) にv8を追加。

- 視覚テーブルが非空、または釣果にスナップショットがある場合はv8で出力する。
- v8は全21テーブルを収録し、UUID重複、カラー参照・自然キーの重複、参照不整合、配色・編集状態等を検証する。
- 視覚データがない場合は従来どおり内容に応じてv2〜v7を出力する。
- v1〜v7の読み込みは維持する。旧版番号に視覚テーブルやスナップショットを混入させた入力は拒否する。
- v8の明示的な復元では、視覚テーブルもバックアップ内容で置換する。自動推定の更新とは別の、既存バックアップ復元操作である。

### 旧v1〜v7の復元時のルール

**既存ビジュアル辞書・仮カラーの配色値、自然キー、UUID、編集済み・確認済み状態を残し、ローカルID参照をすべて解除する。**

- lureVisualProfiles.variantIdを解除。
- temporaryLureColors.modelId / linkedVariantIdを解除。
- identity / modelIdentity / linkedIdentityは保持。
- 同じ数値IDが残っていても自動再接続しない。

復元された別カラーへ誤紐付けすることを防ぐ。後続の明示的な再関連付けでは保存APIが自然キーを検証できる。再照合UIは未実装。

既存のバックアップ復元は釣行・釣果・ルアー等を置換する仕様である。その仕様をデータ保持型のDBアップグレードと混同しない。今回、実機への復元や実データの削除は行っていない。視覚テーブルの置換・参照解除も既存復元と同じトランザクションに含め、途中失敗時は全体が戻る。

## 検証結果

検証はfake-indexeddbによるプロセス内の隔離DBと合成データのみを使用。ユーザーのバックアップJSONは読み書きしていない。

| 項目 | 結果 |
|---|---|
| `npm.cmd test` | 502件成功（既存483件＋新規19件） |
| `node --test tests/rc32-storage.test.mjs` | 保存基盤18件成功 |
| `npm.cmd run build` | 成功。500kB超のチャンク警告あり |
| `npm.cmd run test:e2e:typecheck` | 成功 |
| `git diff --check` | 成功 |

新規19件は保存基盤18件と釣果保存経路1件。内容は以下。

- 全19テーブルに合成レコードがあるDB v8からv9へ更新し、レコード・ID・主キー・索引・採番継続を保持。
- 配色の保存・再接続後読み込みと、既存テーブル不変。
- ユーザー編集済み・確認済みの保護、版競合の拒否、未確認推定の更新。
- モデル内コード、公式表記保持、自然キー検証。
- v8の全21テーブル往復、スナップショットのみでもv8出力。
- v1〜v7各形式の互換性と旧形式復元後の参照解除。
- 不正参照・重複ID・自然キー不整合・描画値欠落等の拒否。
- v8復元および旧形式参照解除の途中書き込み失敗で、全テーブルが元に戻ること。
- 釣果保存・メモ編集・前回再利用・ルアー再選択時のスナップショット動作。

旧テストのDB最新版期待値を9・21テーブルへ更新した。過去のv7→v8移行に限定した気象テストはv8コードまでを切り出して従来の検証を維持した。

## 変更ファイル一覧

### 保存基盤

- `src/db/database.ts`
- `src/utils/visualColorStorage.ts`（新規）
- `src/utils/backup.ts`
- `src/utils/catchRegistration.ts`

### テスト

- `tests/rc32-storage.test.mjs`（新規）
- `tests/catch-registration.test.mjs`
- `tests/facility-storage.test.mjs`
- `tests/fish-species.test.mjs`
- `tests/rc20-catalog.test.mjs`
- `tests/rc21-catalog.test.mjs`
- `tests/rc22-catalog.test.mjs`
- `tests/rc28-catalog.test.mjs`
- `tests/rc30.test.mjs`
- `tests/rc31.test.mjs`
- `tests/tackle-management.test.mjs`
- `tests/trip-weather.test.mjs`

### 資料

- `docs/rc32/RC32_PHASE1_IMPLEMENTATION.md`（本資料）
- 先行する `RC32_VISUAL_COLOR_RESEARCH.md` は変更していない。

## 既存データへの影響と未完了事項

導入時は空の2テーブルを追加するだけ。既存19テーブルのレコード・ID・所有情報に書き込みは行わない。スナップショットは呼び出し側が渡した新規保存・編集時にだけ保存される。

Phase 1の要求範囲は完了。UI、逆引き検索、プレビュー、公式写真収集、自動配色生成、参照解除後の再関連付けUIは後続Phase。ブラウザーE2E実行、オフライン再起動、iPhone Safari実機は今回は未検証。実機での削除・初期化・自動復元は行っていない。
