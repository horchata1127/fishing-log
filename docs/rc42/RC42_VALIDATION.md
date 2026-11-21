# RC42 検証結果

2026-11-21。専用IndexedDB／ブラウザコンテキストで実施。原本バックアップは読取専用、PR対象外。

| 検証 | コマンド | 結果 |
| --- | --- | --- |
| 公式全件比較 | `python -X utf8 scripts/audit-rc42-daiwa.py` | 6モデル91色、画像一覧91件とSKU表91件が対応。既存一致91、新規0、保留0 |
| 新規単体テスト | `node --test tests/rc42-daiwa.test.mjs` | 4件成功（実バックアップ試験を含む） |
| 全単体テスト | `npm.cmd test` | 699件成功、失敗0、skip 0 |
| ビルド | `npm.cmd run build` | 成功。既存のチャンクサイズ警告あり |
| E2E型チェック | `npm.cmd run test:e2e:typecheck` | 成功 |
| 新規E2E | `npx.cmd playwright test tests/e2e/rc42-daiwa.spec.ts` | PC／モバイル 2件成功 |
| 新規圏外E2E | `npx.cmd playwright test -c playwright.offline.config.ts tests/offline/rc42-daiwa.spec.ts` | PC／モバイル 2件成功 |
| 全E2E | `npx.cmd playwright test` | 196件中194件成功、既存2件失敗。mainでも同じ失敗を再現（下記） |
| 全圏外E2E | `npx.cmd playwright test -c playwright.offline.config.ts` | 66件中48件成功、既存18件失敗。全失敗で空のareaMapsの比較差（下記） |

## 新規テストの確認範囲

- 公式表・画像一覧・既存91色の1対1対応、所属モデル、JAN一意性、正式名と略称の対応。
- 比較結果は6モデルとも追加0／保留0。所有追加オプションONでも所有追加0。
- 合成データで45F1のMSブラウンだけを欠落させると既存更新処理は同じモデルへ1色だけ追加。元の全カラー・ID・所有・釣果・履歴を保持し、再適用の追加は0。
- 重量不一致、同名モデル重複、C&Rカスタム／75SSの別モデルは誤流用せず保留。
- 実バックアップを隔離DBへ復元し、既存累積更新後も元の全行を主キーごとに完全比較。複合キーの気象データも含む。所有・釣果・ユーザー編集済み配色を変更しない。
- エクスポート／再インポート2回後のデータを比較。復元履歴のみ既存仕様で各1件追記、元の履歴は保存。原本ファイルSHA-256は試験前後で一致。
- 合成カタログをUIで2回復元した後、91色すべてがビジュアル辞書・マイルアー候補・釣果編集のカタログ選択に表示される。閲覧だけで所有や釣果データは増えない。
- Service Worker準備後にブラウザを終了し、オフライン状態で起動。全91色が同じ3画面で表示され、DB内容は変わらない。

テスト専用manifestは本番に同梱しない。存在しない新規カラーやモデルを本番へ登録するテストではない。Safari実機は未検証（モバイルはChromiumのiPhone 13エミュレーション）。

## mainとの比較

main `8dba2dc` を別の一時worktreeへチェックアウトし、同じnode_modulesで独立してビルド・再実行した。本番の `src/` はmainとの差分0。

通常E2Eで失敗したのは既存 `tests/e2e/rc32-release.spec.ts` のDB v8→現行版更新テスト（PC／モバイルの2件）。期待値100（Dexie v10）に対し、現行DBは110（v11）。mainでも `npx.cmd playwright test tests/e2e/rc32-release.spec.ts -g 'RC31相当DB'` で同じ期待値・実測値の失敗を2件再現した。RC42の回帰ではなく、旧テストの期待値更新は別タスクとする。

圏外E2Eの既存失敗18件はすべて、DB全テーブルの観測には空の `areaMaps: []` がある一方、地図がないバックアップ出力は同テーブルを省略することによる比較差。内訳はRC20／21／22／28／30／31／33の統合カタログ7ケース、RC30 PWA再起動1ケース、RC32 PWA更新1ケース、それぞれPC／モバイル。

mainの独立ビルドでも `npx.cmd playwright test -c playwright.offline.config.ts --project=offline-desktop -g 'catalog through unified|RC30 PWA|RC32辞書編集中'` を実行し、対応するPC側の全9ケースで同じ空のareaMapsの比較差を再現した。RC42は本番・既存テストを変更していない。これらの旧テストの修正は今回の追加0件の監査から切り離して報告する。

最終確認：`git diff --name-only main -- src` は空、`git diff --cached --check` は成功。原本バックアップおよび既存の無関係な未追跡ファイルはコミット対象に含まない。
