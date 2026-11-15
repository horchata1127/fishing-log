# RC41 検証結果

実施日: 2026-11-15。全テストは合成データと専用origin／一時プロファイルを使用。ユーザーのバックアップファイルに対する破壊的テストは実施していない。

## 方位磁針の追加検証

| 検証 | 結果 |
| --- | --- |
| `npm.cmd test` | 全695件成功、失敗・スキップなし（RC41は32件） |
| `npm.cmd run build` / `npm.cmd run test:e2e:typecheck` | 成功 |
| 下記の関連E2E 7ファイル | デスクトップ／iPhone相当Chromiumで38件成功 |
| `npx.cmd playwright test -c playwright.offline.config.ts -g RC41` | 6件成功 |
| `git diff --check` | 成功 |

```powershell
npx.cmd playwright test tests/e2e/rc41-compass.spec.ts tests/e2e/rc41-home-maps.spec.ts tests/e2e/rc41-navigation.spec.ts tests/e2e/rc41-area-maps.spec.ts tests/e2e/fishing-log.spec.ts tests/e2e/rc35-weather-notes.spec.ts tests/e2e/rc40-color-change.spec.ts
```

- 任意項目 `northAngle` の未設定、明示的な0度、359度、設定解除を確認。不正な型、null、NaN、無限大、範囲外、小数をマップ保存・イベントスナップショット・v12復元で拒否し、失敗時の全テーブル不変を確認。
- 旧v12の方位なしマップ・イベントを補完しない。現在のマップを0→359度に変更しても、既存イベントの未設定状態と過去に保存した方位を維持。DB v11・バックアップv12を据え置いて往復復元を確認。
- 編集時の設定、キャンセル、0度と未設定の表示差、釣り座画面に変更入力欄がないことを確認。ズーム・パン前後で方位磁針の右上への相対位置と針の角度が一致し、重なった位置へのクリックで特徴物を配置できることを確認。
- マップ90度のイベントを作成した後で現在の方位を270度に変更。復元後も、過去の未設定・90度のイベントはそのまま表示し、別釣行の新規イベントは270度で保存することを確認。
- 圏外で135度を設定して釣り座を保存後、現在のマップを315度へ変更。圏外再起動後も過去イベントは135度、編集画面は315度を保持。v12出力にも両方の値が含まれることを確認。
- モバイルの編集画面も目視確認。Nの文字は方位に応じた位置へ移動するが、文字自体は読みやすい向きを保つ。

制限: 北は利用者の手動設定であり実測値ではない。輪郭の回転・反転時も設定角度は維持するため、必要に応じて編集画面で調整する。実機iPhone Safari／WebKitとE2E全スイートは引き続き未検証。

## メインメニュー導線の追加検証

`App.vue` に既存の管理モーダルを開くボタンを追加し、`AreaMapManager.vue` に施設検索・選択中の施設表示・施設切替時の読み込み保護を追加した。DBスキーマ・バックアップv12・保存処理は変更していない。

- `npm.cmd run build` / `npm.cmd run test:e2e:typecheck`: 成功。
- 下記2コマンドによる関連E2E: 計34件成功（14件＋20件、デスクトップ／iPhone相当Chromium）。
- `npx.cmd playwright test -c playwright.offline.config.ts -g RC41`: 4件成功。
- `git diff --check`: 成功。

```powershell
npx.cmd playwright test tests/e2e/rc41-home-maps.spec.ts tests/e2e/rc41-navigation.spec.ts tests/e2e/rc41-area-maps.spec.ts
npx.cmd playwright test tests/e2e/fishing-log.spec.ts tests/e2e/rc35-weather-notes.spec.ts tests/e2e/rc40-color-change.spec.ts
```

釣行が0件の状態でメインメニューから施設検索・選択、マップ新規登録・編集、ホームへの復帰、後の釣行での位置記録を確認した。現地編集後もホームに同じIDのマップが表示され、エリアIDも保持する。検索結果がなくても選択中施設を維持し、施設切替で別施設の一覧が混ざらないことを確認。管理操作で既存の釣行・釣果・イベント・ルアー・所有データが変わらないことも確認した。

本番の圏外テストでは、釣行未開始のままネットワーク無効で起動し、ホームから施設検索・マップ作成、再起動後の再編集、v12出力を確認した。管理モーダル表示中のPWA更新ボタンが無効になることも確認。既存の釣行中の作成・編集・釣り座記録の圏外テストも成功した。

実機iPhone Safari／WebKitとE2E全スイートは未検証。今回の画面変更では単体テストの再実行は行わず、型チェック・関連E2E・本番圏外テストで検証した。

## UI導線改善の追加検証

「現在のエリア」直下へのボタン移設と、未登録時の作成導線を追加した後、次を実行した。今回の変更は画面3コンポーネントとE2E・文書のみで、DB・バックアップ・マップ保存・イベント保存処理は変更していない。

- `npm.cmd run build` / `npm.cmd run test:e2e:typecheck`: 成功。
- 下記の関連E2E: 24件成功（デスクトップ／iPhone相当Chromium）。
- `npx.cmd playwright test -c playwright.offline.config.ts -g RC41`: 2件成功。
- `git diff --check`: 成功。

```powershell
npx.cmd playwright test tests/e2e/rc41-navigation.spec.ts tests/e2e/rc41-area-maps.spec.ts tests/e2e/fishing-log.spec.ts tests/e2e/rc35-weather-notes.spec.ts
```

ボタンの配置順、補足の読み上げ、44px以上の高さ、12px以上の間隔、幅1280／390／320pxでの非重複・横はみ出しなしを確認。Tabでの個別フォーカス、フォーカス枠、Enter／Spaceでの起動、Escapeでの終了を確認した。未登録時の作成導線では、管理画面のキャンセルと保存の両方でメモ・日時が維持され、戻った後の候補更新・選択欄へのフォーカス・通常のイベント保存を確認した。モバイルのセクション画像も目視確認した。

実機iPhone Safari／WebKitは引き続き未検証。釣行メモの競合エラーは今回の対象外であり、処理を変更していない。

## 実行結果

| 検証 | 結果 |
| --- | --- |
| `npm.cmd test` | 683件成功、失敗・スキップなし（RC41は20件） |
| `npm.cmd run build` | アプリ型チェック・本番ビルド・Service Worker生成成功 |
| `npm.cmd run test:e2e:typecheck` | 成功 |
| 関連E2E 8ファイル（下記） | デスクトップ／iPhone 13相当Chromiumで56件成功 |
| `npx.cmd playwright test -c playwright.offline.config.ts -g RC4` | RC41とRC40、デスクトップ／モバイル合計4件成功 |
| `git diff --check` | 成功 |

関連E2Eのコマンド:

```powershell
npx.cmd playwright test tests/e2e/rc41-area-maps.spec.ts tests/e2e/rc40-color-change.spec.ts tests/e2e/fishing-log.spec.ts tests/e2e/trip-timeline.spec.ts tests/e2e/trip-locations.spec.ts tests/e2e/rc35-weather-notes.spec.ts tests/e2e/rc36-summary-export.spec.ts tests/e2e/rc39-timeline-image.spec.ts
```

## 確認内容

- 全13種類のテンプレートが、範囲内・自己交差なしの水域を生成する。回転・反転後も有効。角・曲線近似の輪郭・任意位置で岸への連続吸着と座標の再現を確認。
- 範囲外、NaN、自己交差、極小形状、不正な特徴物の岸参照、不正な釣り座座標・角度を拒否。失敗した保存・復元は既存データを保持。
- マップ追加・名称変更・改訂・論理削除、競合する更新の拒否、別釣行での再利用を確認。
- 既存エリアをIDで明示選択し、二重登録しない。同名新規エリアはエラーとなり、マップもエリアも追加されない。
- インレット／アウトレットの複数配置、名称・メモ、移動・削除・元に戻す、回転後の辺への追従を確認。
- 岸タップ、マウスでのマーカードラッグ、ズーム／パン、Chromiumの実タッチ入力による2本指ピンチを確認。モバイル編集画面のスクリーンショットでも輪郭・制御点・青／オレンジ矢印を確認。
- 方向未指定での保存、方向指定、直前位置の初期表示、別マップを選んだ際の座標解除を確認。
- イベント登録・メモ／日時編集・削除、同時刻順序、タイムラインへの表示、保存時形状での再表示を確認。
- マップ改訂・削除後もイベントの形状を変更しない。過去の形状に対する位置・方向の再編集も確認。
- DB v10→v11移行を、旧22テーブルすべてにレコードを入れた状態で検証。既存行・索引・キー・自動採番を保持し、新テーブルが空で追加されることを確認。
- v12の出力・復元・再取込、ID衝突の拒否、旧形式からの復元時の独立マップ保持、マップ参照欠落時の有効スナップショットを確認。復元監査履歴の追記は既存仕様どおり。
- 釣果・所有テーブルの不変、既存の施設／エリア選択、気象イベント、MVP・レポート、タイムライン画像、RC40カラー変更の回帰を確認。

## オフライン

本番ビルドをService Workerの管理下に置いてからブラウザーを閉じ、ネットワーク無効で起動。その状態でマップ新規作成、特徴物配置、形状の再編集、釣り座・方向保存、イベント編集、v12バックアップ出力を実行した。圏外のまま再起動し、マップ・特徴物・イベントが一致し、釣り座を再表示できることをデスクトップ／モバイルで確認した。

## 制限・未検証事項

- 実機iPhone Safari／WebKitは未検証。実機ではピンチ、ドラッグ、ページとマップのスクロールの切替、ソフトキーボード表示中の保存操作を確認する必要がある。
- E2E全スイートは未実行。上記の関連8ファイルとRC40／RC41圏外テストを実行した。
- 水域の曲線は多角形近似。島・穴・分岐河川・GPS方位は扱わない。テンプレートを変更すると既存の特徴物配置を確認後に解除する。
- 釣り座別の釣果集計・自動関連付けは未実装。将来の同時刻・エリア違いの扱いを `DESIGN.md` に定義した。
- マップは1件あたり輪郭128頂点・特徴物100件まで。一般的な簡易マップの範囲を対象とし、長期大量イベントのスナップショット容量試験は未実施。
- 新規マップを作るには施設の内部IDが必要。自由入力だけで始めた釣行は、既存の「施設を設定・変更」から施設を選ぶ。
- 既存の大きなメインチャンクに関するビルド警告が出るがビルド成功。既存SSR単体ハーネスのrender警告、不正バックアップ拒否テストの想定内ログもある。E2Eで未処理のブラウザー例外はない。
