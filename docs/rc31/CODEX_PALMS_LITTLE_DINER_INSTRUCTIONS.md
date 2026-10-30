# Codex実装指示書：PALMS Little Diner ルアーマスター追加

## 目的と範囲
2026-10-30バックアップ（format=fishing-log-backup, version=7）を参考に、PALMS（パームス）のLittle Dinerシリーズ **3シリーズ・7モデル・83カラーバリエーション** を既存ルアーマスターへ追加する。CSV `palms_little_diner_83colors.csv` を一次情報整理済みの入力として利用。**バックアップJSONを直接編集したり、ユーザー端末へ自動復元したりしないこと。** 既存データと所有情報は保持。新規登録ルアーは未所有（myLuresにはレコード追加しない）。

## 対象モデル
| シリーズ | 型番 | mm | g | 浮力 | カラー |
|---|---|---:|---:|---|---:|
| Powale | PO-32F | 32 | 1.3 | Floating | 12 |
| Powale | PO-22F | 22 | 1.0 | Floating | 12 |
| Powale | PO-32FR | 32 | 1.4 | Floating | 7 |
| GANOFF | GA-24S | 24 | 1.6 | Sinking | 16 |
| GANOFF | GA-24HS | 24 | 2.1 | Heavy Sinking | 16 |
| GANOFF | GA-31S | 31 | 2.7 | Sinking | 10 |
| Galette | GL-31F | 31 | 2.0 | Floating | 10 |

## 実装手順
1. Gitリポジトリの既存 `lureManufacturers`, `lureSeries`, `lureModels`, `lureVariants` の初期マスター取り込み・差分適用方式を調査。実際のDBスキーマと既存RC30の実装規約を優先。
2. PALMSメーカーを自然キー（表記揺れを含めた同一性判定）で upsert。メーカー・シリーズ・モデル・カラーを依存順に追加すること。IDはDB側の採番・既存IDマッピングで解決し、CSVから固定IDを振らない。
3. モデル識別はメーカー+シリーズ+型番、カラー識別はモデル+カラーコードを基本とする。ただし既存登録にコードがなく色名のみの場合は名称照合も行い、既存データを重複させない。**カラーコードはメーカー固有・モデルごとの識別子**（異なるモデル間で共有されても別バリエーション）。
4. `catalogEvidence` 等は既存規約に従い、manufacturerUrl、originalName、colorCode、weightG、lengthMm、buoyancy、sourceTier='manufacturer' などを保存。未確認のJAN、塗装色コード、ラトル構成などは捏造せず空欄／未設定。
5. 既存の所有 `myLures`、釣行 `trips`、釣果 `catches`、イベント、全ルアーマスター、ID参照、バックアップ/復元動作を維持。未所有を `myLures` に自動登録しない。
6. RC30以前からのデータも壊さないよう、差分マイグレーション／既存カタログ登録方法を利用し、iPhone IndexedDB の既存個人データに破壊的な初期化を行わない。
7. **2回連続で適用**し、2回目の追加は0件、モデル・色の重複は0件となることを検証。ビルドと既存テストを実行し、差分結果を提示。

## 期待値
- メーカー: PALMS が1つ、シリーズ3つ、モデル7つ、モデルごとのカラー件数は 12/12/7/16/16/10/10（合計83）。
- 公式サイトにコード表記の揺れがある（例：ポワレは `T458`、シンラトルは `T-458`）。**CSV記載の公式表記を保持**し、比較時のみ必要に応じ正規化。
- `かべるね`（ガノフ）と `かるべね`（ガレット）は公式ページの記載が異なる。**意図的に表記を統一しない**。同じ `T-4A` なのでコードによる検証もすること。
- ガノフの `ひのえ2` とグランデの `ひのえ２` も公式表記のまま保存し、重複判定時のみ正規化。
- 復元時も83件を正しく維持し、既存データ件数が減らないこと。

## 現時点のバックアップ件数（照合用）
- lureManufacturers: 80
- lureSeries: 152
- lureModels: 355
- lureVariants: 2816
- myLures: 9
- trips: 3
- catches: 15
- tripEvents: 1

## 情報源
- https://www.palmsjapan.com/lures/product/?name=little-diner-powale
- https://www.palmsjapan.com/lures/product/?name=little-diner-snackpowale
- https://www.palmsjapan.com/lures/product/?name=little-diner-powale-sinrattle
- https://www.palmsjapan.com/lures/product/?name=little-diner-ganoff
- https://www.palmsjapan.com/lures/product/?name=little-diner-grande-ganoff
- https://www.palmsjapan.com/lures/product/?name=little-diner-galette

## 完了報告
PRまたは差分、変更ファイル、初回追加件数、再実行追加件数、ビルド結果、バックアップ互換検証結果、残課題を報告。製品固有のカテゴリや既存フィールド仕様は実装前にコードで再確認すること。
