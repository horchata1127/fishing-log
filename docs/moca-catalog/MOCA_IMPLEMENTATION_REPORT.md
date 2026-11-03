# MOCA補完 実装レポート（RC37）

## 実装

既存の「ルアーマスター管理 → 最新版との差分を確認 → バックアップ保存 → 確認して更新」を通じてRC37を適用する。起動時の自動追加はない。既存のRC19〜33を累積したマニフェストへ16商品・203カラー候補を同梱し、提供バックアップでは新規10モデル・180カラー、既存9色再利用、14色保留になる。

既存行へのupdate/deleteは追加していない。メーカー・シリーズ・モデル・カラーのID、名称、所有、釣果、釣行MVP、代表配色、配色スナップショット、履歴を保持する。RC33所有オプションをONにしてもRC37の所有追加は0件。カラー推定による代表配色生成もRC37には行わない。

曖昧な `MOCA DR Rattle 2HOOK` をF/SSどちらにも割り当てず、両商品候補を保留する。F/SSのラトル商品は未登録端末なら区別して新規作成できる。通常版との混同、モデル間の色ID共有、コードと名称・標準/限定区分の衝突を防ぐ。既存名を変更する処理はないため、過去データ・配色naturalKeyの更新も不要。

新規variantの `catalogEvidence` にRC37、販売店URL、確認日、`retailer-confirmed`、浮力、ラトル、サイズ等を保存する。複数出典を使うモデルではカラーごとのURLを維持する。メーカー公式URL・JANは確認できないものを空欄のままにする。未確定MVPはpendingとして同梱し、釣果を自動変更しない。

マスター版: `RC37-moca-2026-11-03`、matchingVersion=2。過去履歴の版・ハッシュ・結果は変更せず、新実行だけ新しい版で記録する。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `src/data/rc37Catalog.ts` | モデル別の確認済み色、明示別名、出典、未確認項目 |
| `src/data/lureMasterManifest.ts` | RC37累積、専用照合規則、曖昧モデルによる保留指定、版更新 |
| `src/db/database.ts` | RC37証拠メタデータの型を拡張。DBストア変更なし |
| `src/utils/lureMasterPlanner.ts` | モデル内カラー照合、名称/コード/区分衝突とDR型式未確認の保留、証拠保存 |
| `scripts/load-local-typescript.mjs` | 監査・Nodeテスト用の隔離TS読込み |
| `scripts/audit-moca-catalog.mjs` | 提供バックアップの読み取り専用抽出・再現可能な差分出力 |
| `tests/rc34-apply.test.mjs` / `tests/rc34-planner.test.mjs` | 累積カタログ件数を更新。旧パックの保持・原子性・再適用検証を継続 |
| `tests/rc37Fixture.ts` / `tests/rc37-moca.test.mjs` | 監査抽出＋合成釣行、保護・競合・旧形式・往復復元・ローカル実バックアップ検証 |
| `tests/e2e/rc37-moca.spec.ts` | UI差分CSV、確認適用、保留、再適用、v11復元、暫定MVP表示 |
| `tests/offline/rc37-moca.spec.ts` | 圏外適用・永続ブラウザの圏外再起動・再適用 |
| `docs/moca-catalog/` | 監査、ID付き全差分JSON、本レポート |

## 検証結果

最終結果: 単体 **651/651成功**（ローカル実バックアップ検証を含みskipなし）、E2E **22/22成功**（desktop/mobile各11件）、オフライン **6/6成功**（desktop/mobile各3件）。ビルド、E2E型チェック、`git diff --check` も成功。実行コマンド:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:typecheck
npx.cmd playwright test tests/e2e/rc37-moca.spec.ts tests/e2e/rc34-management.spec.ts tests/e2e/rc36-summary-export.spec.ts
npx.cmd playwright test -c playwright.offline.config.ts tests/offline/rc37-moca.spec.ts tests/offline/rc34-management.spec.ts tests/offline/rc36-summary-export.spec.ts
git diff --check
```

既存RC34の原子性・同時実行・復元履歴、RC36のPNG・共有・MVPを含めて回帰検証する。ブラウザは隔離originと合成データを使用し、実Chromeや稼働端末DBへアクセスしない。ローカル実バックアップテストはfake-indexeddbへ復元し、全既存行の値比較、RC37適用・書出し・再復元、再適用0件を確認する。元バックアップは読み取り専用。個人バックアップがない環境ではこの1件をskipし、同梱したカタログ抽出と合成釣行で通常テストは再現できる。

## バックアップ互換性

DBバージョン・バックアップ形式の版追加は不要。証拠メタデータは既存variantの任意フィールドとしてJSON往復する。v4の検証と既存全バックアップテストを維持し、v11の暫定MVP・RC37証拠情報もUI/単体で往復確認する。

提供ファイルの実形式はv8。MVP・気象手入力を含まない実データは、新たに取り込み履歴を持つため従来仕様どおりv9で書き出される。暫定MVPを保存した合成データはv11になる。ファイル名だけでRC36のv11と仮定しない。過去履歴の存在だけで適用済みと判定せず、復元後も現在のモデル・カラーを再照合する。

## 残課題とレビュー

DRラトルid=128のF/SS同一性、ユーザーMVPの実物カラー、既存うぐいすもち・さくらもち・寿の限定区分、Petit DR-F重量、旧型・廃番色・店舗限定色の全件性は未確認。詳細・モデル別件数・出典は [監査](MOCA_CATALOG_AUDIT.md) と [全差分](MOCA_CATALOG_DIFF.json) を参照。

Chromiumのモバイル条件で検証するがiPhone Safari実機検証ではない。既存の大きなJSチャンクに関するビルド警告は今回の検証でも表示される。初回のPWA取得・準備完了後に圏外テストを行う。

Draft PRのレビュー担当: ユーザー・ようこちゃん（GitHub: `horchata1127`）。承認前にマージしない。PR作成者と指定ユーザーが同じ場合、GitHubの自己レビュー依頼は利用できないため本文にレビュー待ちを明記する。

## Git情報

- 最新main / origin/main: `68d708f`（開始時左右差分0）
- RC36: [PR #36](https://github.com/horchata1127/fishing-log/pull/36)、マージ時刻2026-11-03 20:16:15 JST
- 作業ブランチ: `feature/rc37-moca-catalog`
- 既存未追跡資料、`docs/rc37/` の元依頼・原本バックアップ、`MyLuresScreen.backup.vue` 等はコミット対象外。
- 実装・検証コミット: `8b0cf7b`（`feat(rc37): supplement verified MOCA models and colors with preservation audit`）
- Draft PR: [#37](https://github.com/horchata1127/fishing-log/pull/37)、base=`main`、head=`feature/rc37-moca-catalog`。open / draftとして作成。`horchata1127` を本文のレビュー担当に指定し、承認・マージは未実施。
- 本レポートのPR情報追記は後続のdocsコミット。最終HEADは同PRのコミット一覧で確認できる。
