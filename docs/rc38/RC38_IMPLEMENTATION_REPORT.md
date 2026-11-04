# RC38 実装報告

2026-11-04。ユーザー本人・ようこちゃん共同レビュー用。

## 実装結果

DR-FラトルとDR-SSラトルを別モデルとして追加できるようにした。提供バックアップで **新規2モデル・26カラー（DR-F 19色、DR-SS 7色）、再利用0色、カラー保留0色**。RC37で保留した14色を含み、新たに調査した増分は12色。城峰16商品の色名・JAN・仕様を商品ごとに確認し、RC37候補との4重複を除外した。

既存ID128とその3色は型式不明のまま保持する。RC37のパックと取り込み履歴は変更しない。過去のRC37保留規則は旧マニフェストで再現し、RC38の確定済み2商品だけを別モデルとして追加する。カタログ版 `RC38-moca-rattle-2026-11-04`、matchingVersion=3。

「ルアーマスター管理」の既存確認フローで適用できる。自動所有登録・釣果修正・MVP修正なし。通常のマイルアー画面で所有登録し、同じvariantの有効な実所有があれば再利用する。同色の別個体はチェックで明示追加できる。既存の所有行は統合しない。

さちおの茶はJAN 4573151245423、販売店確認、30mm / 2.1g / F / ラトルとして保存する。色ごとの販売店URL・確認日を保持し、メーカー公式確認とは表示・記録しない。バックアップ形式とDBスキーマの版追加は不要。

## 変更ファイル

| ファイル | 変更 |
| --- | --- |
| `src/data/rc38Catalog.ts` | 確認済み2商品・26色、城峰の商品別JAN・URL |
| `src/data/lureMasterManifest.ts` | RC37/38の明示合成、版更新、曖昧モデル共存の指定、MVP保留の案内更新 |
| `src/utils/lureMasterPlanner.ts` | 共存指定のある商品の追加許可、RC38証拠保存 |
| `src/db/database.ts` | 任意証拠フィールドのrevision型にRC38追加 |
| `src/components/MyLuresScreen.vue` | 所有再利用と、別個体を明示追加する選択肢 |
| `scripts/audit-rc38.mjs` | 原本の読み取り専用監査、候補ID・差分出力 |
| `tests/rc38-moca.test.mjs` | 型式分離、ID128保持、全行保護、再適用、復元往復、競合保留、失敗ロールバック |
| `tests/rc37-moca.test.mjs` | 旧マニフェストを使ってRC37の保留動作を維持検証 |
| `tests/rc34-planner.test.mjs` / `tests/rc34-apply.test.mjs` | 累積件数を更新、旧根拠の全件保持と原子性を継続検証 |
| `tests/catch-registration.test.mjs` | 所有再利用と明示した別個体追加の検証 |
| `tests/e2e/rc38-moca.spec.ts` | 通常画面での所有登録・重複防止・釣果編集・MVP・PNG |
| `tests/e2e/rc37-moca.spec.ts` | RC38累積後のカタログ状態を反映、既存行・MVP・復元を検証 |
| `tests/offline/rc37-moca.spec.ts` | 圏外適用・再起動保持でRC38の26色とさちおの茶を検証 |
| `docs/rc38/RC38_DESIGN.md` | 設計とデータ保護方針 |
| `docs/rc38/RC38_CATALOG_AUDIT.md` | 商品別監査、RC37比較、ID付き釣果修正手順 |
| `docs/rc38/RC38_RETAILER_EVIDENCE.json` / `RC38_CATALOG_DIFF.json` | 掲載色・JAN対応、実バックアップ監査と変更予定 |
| `docs/rc38/previews/rc38-tea-summary.png` | 合成釣行で出力したPNGサンプル |

## テスト結果

最終チェック: 単体・DB **655/655成功、skipなし**。画面E2E **24/24成功**、オフライン **6/6成功**。ビルド（アプリ型チェック含む）、E2E型チェック、`git diff --check` 成功。

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:typecheck
npx.cmd playwright test tests/e2e/rc38-moca.spec.ts tests/e2e/rc37-moca.spec.ts tests/e2e/rc34-management.spec.ts tests/e2e/rc36-summary-export.spec.ts
npx.cmd playwright test -c playwright.offline.config.ts tests/offline/rc37-moca.spec.ts tests/offline/rc34-management.spec.ts tests/offline/rc36-summary-export.spec.ts
git diff --check
```

初回の画面試験では編集画面のボタン名を新規登録画面と取り違え、テストが待機失敗した。実際の「変更」ボタンに修正後、上記24件の全セットが成功した。単体の累積件数と従来の所有別個体テストも、新しい仕様に合わせて更新している。

実バックアップはfake-indexeddbの隔離DBへ復元し、累積カタログ適用前後で全テーブルの全既存行を値比較した。既存ID・所有・釣行・釣果・バラシ・代表配色・配色スナップショット・気象・メモ・取り込み履歴を保持する。新規行が許可される表も既存行単位で比較する。書き出し・再復元後も同様に保持し、再適用0件。

原本はv9で指定MVPを含まないため、RC36のMVPを持つ合成v11データでも往復復元を確認する。RC37証拠を持つ旧データとRC38証拠を持つ新データを両方検証する。v4互換試験も継続成功。RC38の2色目の挿入時に失敗を注入し、モデル・カラーの部分追加が残らず、失敗履歴を残して再試行できることを確認した。

ブラウザは専用originと合成データを使用した。稼働端末DBや実Chromeプロフィールにはアクセスしない。圏外試験は事前にPWA準備完了を確認し、圏外の永続ブラウザ再起動後に適用・参照・保持・再適用を検証。RC36画像生成・RC34管理機能との共存も成功。

PNGサンプルでは「MOCA DR-F Rattle 2HOOK」「さちおの茶」をMVPとルアー別表に表示し、1080×1350で出力した。[サンプルPNG](previews/rc38-tea-summary.png) は合成釣行の結果で、実際の多摩湖釣果ではない。

## 釣果修正と残課題

釣行ID15の候補はキャッチ41・43・44・45と関連バラシ42。バラシ40は別カラー・別所有IDなので個別確認が必要。[監査のID付き一覧・手順](RC38_CATALOG_AUDIT.md) に従い、本人確認後に通常の釣果編集で対象だけを修正する。原本・実端末の釣果やMVPは今回変更していない。

実iPhone Safari/PWAは未検証。実機では更新後の差分・バックアップ保存・DR-F／さちおの茶選択・所有再利用・対象ID照合・釣果編集・MVP再指定・PNG文字表示・画像保存／共有・圏外再起動を確認する。Chromiumのモバイル条件はSafari実機の代用ではない。

ID128のF/SS、既存3色の限定区分、Petit DR-F重量、全世界の旧色／店舗限定色の網羅性は引き続き未確認。商品の存在は販売店確認、実物同定は本人申告として区別する。ビルド時の既存大容量チャンク警告が残る。

## Git・共同レビュー

- 開始main / origin/main: `23e0774`、RC37 [PR #37](https://github.com/horchata1127/fishing-log/pull/37) マージ済み。
- 作業ブランチ: `feature/rc38-moca-dr-f-rattle`。
- 元依頼・原本バックアップ・既存の未追跡資料・`MyLuresScreen.backup.vue` はコミット対象外。
- 実装・検証コミット: `a375ffa18712dbde26366969a2d224d8beafbce8`（`feat(rc38): separate MOCA DR rattle types and supplement verified colors`）。
- Draft PR: [#38](https://github.com/horchata1127/fishing-log/pull/38)、base=`main`、head=`feature/rc38-moca-dr-f-rattle`。open / draftで作成、未マージ。
- 本Git情報の追記は後続docsコミット。最終HEADは同PRのコミット一覧で確認できる。
- レビュー担当: ユーザー本人（GitHub: `horchata1127`）・ようこちゃん。承認前にマージしない。自己レビュー依頼の代わりにPR本文へ共同レビュー待ちを明記する。
