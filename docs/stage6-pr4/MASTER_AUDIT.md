# 施設マスター監査（承認待ち）

## 入力と変換

`RC25_STAGE6_PR4_CODEX_INSTRUCTIONS.md` を全文読込み、PR1契約検証、PR2復元方針、PR3実装報告・PR本文、および `施設マスター精度監査・正式化候補.md` を参照した。原本は変更していない。ファイル名・SHA-256、50施設それぞれのstable ID・名称・ゾーン数は [audit.json](audit.json) に記録した。

| 入力/候補 | 施設 | エリア | 配布状態 |
| --- | ---: | ---: | --- |
| v0.9原本 | 50 | 64 | full_snapshot_draft・研究用 |
| 提供73エリア入力 | 50 | 73 | opt_in_import_draft・研究用releaseOrder 9 |
| 本PR派生候補 | 50 | 73 | 正式スキーマ検証用・配布未承認 |

原本→73版の機械比較はイワセン9エリア、同施設verificationBasis追記、masterVersion/notes/distributionModeの変更だけ。releaseOrderは両方9。キングフィッシャー5号池は入力で未修正だったため、派生候補だけsortOrder 1→5に修正。配列順・全123件のID・名称は不変。研究用 `status`/`notes`/`researchStatus`/`verificationBasis` は配布候補から分離し、[research-source.json](research-source.json) と機械監査に残した。正式バリデータの未知フィールド・ドラフト拒否は緩和していない。

生成: `node scripts/prepare-stage6-pr4.mjs C:/Users/plain/source/fishing-log-notes`。想定差分以外は停止し、既存出力は上書きしない。再生成比較は別の一時checkout/出力先で実施すること。

## 集計・整合

| 都県 | 施設数 |
| --- | ---: |
| 東京都 | 2 |
| 埼玉県 | 6 |
| 神奈川県 | 7 |
| 山梨県 | 8 |
| 群馬県 | 4 |
| 福島県 | 2 |
| 宮城県 | 1 |
| 静岡県 | 3 |
| 長野県 | 6 |
| 栃木県 | 9 |
| 千葉県 | 1 |
| 茨城県 | 1 |

営業区分はopen 33、seasonal 14、unknown 3。研究状態はverified 14、partially_verified 35、needs_current_verification 1。住所null 7、公式エリア未登録27。空配列はエリア不存在を意味しない。営業区分・verifiedAt・lureAllowedは過去調査の値を保持し、現在の営業やルールの保証として扱わない。

正式バリデータでURL/date/null/フィールド型・許可値が成功。123 IDの全域一意性、原本ID保持、施設内ゾーン名NFC重複ゼロ、施設名NFC重複ゼロ、施設内sortOrder重複ゼロを確認。所属はネストからflattenで明示し、別施設への既存zone ID移動はapplyで拒否する。

## 日本イワナセンター（9エリア）

親ID `official:nihon-iwana-center`。子IDはこのprefixに下記suffixを付加する。

| 順序 | 名称 | ID suffix |
| --- | --- | --- |
| 1 | ZERO号池第2 | zero-2 |
| 2 | ZERO号池第1 | zero-1 |
| 3 | 1号池 | pond-1 |
| 4 | 2号池 | pond-2 |
| 5 | 3・4号池 | pond-3-4 |
| 6 | 5・6号池 | pond-5-6 |
| 7 | 7号池 | pond-7 |
| 8 | 8号池 | pond-8 |
| 9 | 9号池 | pond-9 |

根拠は提供JSONに記録されたユーザー提供公式ページ画像。今回オンライン再調査で確認済みに昇格していない。魚種・放流サイズ・イベント・営業情報は新規に埋め込んでいない。3/4号池、5/6号池は根拠なく分離していない。

## 正式採番の提案と限界

候補: `releaseOrder: 1`、`masterVersion: 1.0.0-stage6-50f73z`。既存mainのPR1/PR2は契約と保存機能、PR3はUIであり、公式施設の静的配布と起動seedは存在しない。Git履歴・src/data・DB定義でも初回公式施設配布を確認できない。研究用8/9は正式履歴ではないので流用しない。

実機appMetadataは読んでいないため、全端末に公式履歴が存在しないとは断定しない。別の正式fullが手動適用されている端末では1が競合する可能性があり、既存applyは巻戻し/同番号異内容を拒否する。全端末の履歴確認・採番承認までは配布を有効化しない。端末履歴を消して候補に合わせることは禁止する。

## 承認待ち

- [ ] 50施設・73エリアと収録範囲・出典を承認。
- [ ] ニレ池の初心者エリア季節記載不一致、奈良子の現行名称対応、各施設の現況未確認を受容または追加調査。
- [ ] キングフィッシャー5号池sortOrder修正とイワセン9エリアのグループ表記を承認。
- [ ] 既存正式配布履歴/端末appMetadataを確認し、releaseOrderとmasterVersionを確定。
- [ ] 承認済み候補だけを別変更で静的同梱し、レジストリを有効化。
- [ ] iPhone Safari/PWAの実機受入れ。

全50施設の現時点の一次情報再照合は未実施。構造検証の成功をデータの事実確認完了や配布承認と混同しない。
