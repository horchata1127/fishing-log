# RC31 PALMS Little Diner 実装・検証結果

2026-10-30 / `feature/rc31-palms-little-diner` ブランチでドラフトPRを準備。端末への適用は行っていない。

## 取り込み方式

RC30と同じ、ルアーマスター画面の事前照合・差分CSV保存・明示的な追加操作を使用する。
「RC31 PALMSの追加予定を確認」から結果を確認し、「RC31の確認済みカタログを追加」で反映する。
追加操作時には従来と同様に変更前のバックアップをダウンロードする。
起動時・復元時の自動追加やDB初期化はない。DBバージョン8、バックアップ形式v1〜v7は変更していない。

メーカーはPALMS・パームス・全半角・括弧併記などを照合し、シリーズとモデルは親ID内で照合する。
カラーはモデル内の証跡コードまたは表示名先頭のコードを優先する。コードがない既存色は名称で照合する。
NFKC・空白・英大小文字・カラーコードのハイフンは比較時のみ正規化する。
既存行の名称・証跡・IDは変更しない。新規行にはCSVの公式コードと色名を保持する。
同一候補が複数ある場合、コードと名称が競合する場合、モデルの重量・全長・浮力が競合する場合は、そのモデル全体を保留する。
プレビュー後のマスター変更は比較トークンで検出し、追加処理は4マスターテーブルのトランザクションで実施する。

## フィールド対応

- CSV「トップウォーター」→既存カテゴリ「トップ」。
- CSV「オーバーリップ」→既存カテゴリ「その他」。専用カテゴリがないため、クランク等への推測分類は行わない。元の分類は入力CSVに保持。
- CSV「クランク」→既存カテゴリ「クランク」。
- actionTypeはFloating→F、Sinking / Heavy Sinking→S。既存DBにHSはなく、XSへの読み替えは行わない。証跡buoyancyにCSVの完全な表記を保存する。
- catalogEvidenceにはrevision=RC31、sourceTier=manufacturer、manufacturerUrl、productUrl、originalName、colorCode、weightG、lengthMm、buoyancyを保存。
- 必須文字列のjan・retailerUrl・colorClassは空欄。rattleは未設定。塗装色コード等は追加しない。
- myLuresへの追加・変更はない。

入力は `palms_little_diner_83colors.csv`。`python scripts/prepare-rc31-catalog.py` で型付きデータを再生成できる。
公式リンクは入力CSVおよび生成データにモデルごとに保持する。

## 2回連続適用結果

2026-10-30バックアップ本体は実装資料に含まれていないため、提示された件数と同じ合成v7データを隔離IndexedDBへ登録して検証した。ユーザーのバックアップJSONは変更していない。

| テーブル | 適用前 | 初回追加 | 初回後 | 2回目追加 |
|---|---:|---:|---:|---:|
| lureManufacturers | 80 | 1 | 81 | 0 |
| lureSeries | 152 | 3 | 155 | 0 |
| lureModels | 355 | 7 | 362 | 0 |
| lureVariants | 2816 | 83 | 2899 | 0 |
| myLures | 9 | 0 | 9 | 0 |
| trips | 3 | 0 | 3 | 0 |
| catches | 15 | 0 | 15 | 0 |
| tripEvents | 1 | 0 | 1 | 0 |

| シリーズ | モデル | カラー数 |
|---|---|---:|
| Powale | PO-32F | 12 |
| Powale | PO-22F | 12 |
| Powale | PO-32FR | 7 |
| GANOFF | GA-24S | 16 |
| GANOFF | GA-24HS | 16 |
| GANOFF | GA-31S | 10 |
| Galette | GL-31F | 10 |

初回保留0件、再適用は83色保持。モデル・カラーの自然キー重複0件。
適用前の全行が同じID・内容で保持され、個人データ全テーブルは完全一致することを検証。
既存PALMSやコードなしカラーがある場合は、その件数分だけ追加数が減る。

## 検証

- `npm.cmd test`：483件成功（RC31の5件と既存テストを含む）。
- `npm.cmd run build`：成功。500kB超のチャンクサイズ警告あり。
- `npm.cmd run test:e2e:typecheck`：成功。
- `npx.cmd playwright test tests/e2e/rc31-palms.spec.ts tests/e2e/rc30-events-ussa.spec.ts`：PC・モバイルの6件成功。
- `npx.cmd playwright test -c playwright.offline.config.ts tests/offline/rc31-palms.spec.ts tests/offline/rc30-events-ussa.spec.ts`：PC・モバイルの4件成功。
- `git diff --check`：成功。

CSV全83行との値比較、公式表記差（T458 / T-458、かべるね / かるべね、ひのえ2 / ひのえ２）、NFKCによる既存名照合、モデルごとのコード独立性を検証。
旧v2データへの差分適用とバックアップ往復、v7の全テーブル往復、DB再接続、PWAの圏外適用・ブラウザー終了後の再起動を検証。
曖昧候補の保留、古いプレビューの拒否、途中書き込み失敗時の全ロールバックも確認。

## 変更ファイル

- `AGENTS.md`：今後は変更着手前に作業ブランチを作成するルールを明記。
- `src/data/rc31Catalog.ts`：CSVから生成した3シリーズ・7モデル・83色。
- `src/utils/rc31Catalog.ts`：自然キー照合、プレビュー、差分CSV、差分追加。
- `src/LureCatalogImportPanel.vue`：RC31確認・追加画面。
- `src/db/database.ts`：証跡revision型にRC31を追加（スキーマ変更なし）。
- `scripts/prepare-rc31-catalog.py`：CSV変換と件数・整合性検証。
- `tests/rc31Fixture.ts`：指定件数と同じ合成v7データ。
- `tests/rc31.test.mjs`：差分適用・再適用・互換性・衝突・失敗系検証。
- `tests/e2e/rc31-palms.spec.ts`：画面操作、キャンセル、追加、復元、再照合。
- `tests/offline/rc31-palms.spec.ts`：圏外追加とPWA再起動。
- `docs/rc31/RC31_VALIDATION.md`：本報告。

入力CSVと実装指示書は既存の未追跡ファイル。内容は変更していない。

## 残る確認

実バックアップでの端末固有の重複候補・既存名は、端末の事前照合と差分CSVで確認する必要がある。
iPhone Safari実機は未検証。モバイル検証はChromiumのiPhone画面・タッチ条件を使用した。
実装上の未完了項目はない。
