# Stage6 施設マスター初回有効化（Draft PR）

起点は最新 `origin/main` `f6d6c40ba3ad367bf8e3933e8598817e469da391`。PR #19のマージと実装/レビューコミット `efb0c8c6da14b2cbc6207f10c8331db0778a77a6` の包含を確認して `feature/stage6-pr4-facility-activation` を作成した。開始時の追跡ファイル差分なし。既存未追跡11ファイルは変更・削除・ステージングしない。

## 承認と配布内容

この会話でユーザーが、50施設・73エリアの初回収録、日本イワナセンター9エリアの名称/順序、キングフィッシャー5号池sortOrder修正を承認した。未確認の営業情報とエリア未登録27施設は、今後の更新で改善する方針として受容された。mainマージとPages自動デプロイを同時に行う既存運用も維持する。

PR #19の `docs/stage6-pr4/facility-master.candidate.json` を `src/data/facility-master.v1.json` にバイト一致で複製した。SHA-256は `30514d6674b413a70e9d830b4e5a4230bc83b13feb4e2f876daeadd67d33fb9c`。施設/エリアID123件、名称、所属、表示順、既存の確認日/営業状態を変更していない。研究原本・監査候補は変更していない。配布JSONの改行変換を `.gitattributes` で防止する。

`src/data/stage6FacilityRelease.ts` が正式JSONを静的importし、レジストリをapprovedへ変更する。JSONのenum型をTypeScriptへ橋渡しする型assertionはあるが、実行時には既存 `validateFacilityMaster` を通る。型assertionだけで検証を省略していない。

## 採番調査

提案する正式初回採番は `releaseOrder: 1` / `masterVersion: 1.0.0-stage6-50f73z`。最新mainのsrc/data、DB定義、追跡資料、施設関連Git履歴を確認した。PR #19はpendingかつ候補非同梱で、既存の正式施設配布/起動seedはない。テストの番号、内部snapshot-check用の1、研究用8/9は正式配布履歴ではない。リポジトリ内で競合する正式配布は確認されなかった。

本番端末のappMetadataは読み取っていないため、手動投入などリポジトリ外の履歴まで非競合とは断言しない。既存端末に新しい版/同番号異内容があれば、従来の保護付きapplyが全変更を拒否し、起動エラー表示後も既存釣行を読み込む。端末履歴を消したり、同番号の内容を上書きしたりして解決しない。正式配布後の内容変更は新しいreleaseOrder/masterVersionで行う。

## 再利用と非破壊性

PR #19のApp起動処理が同梱版を既存 `initializeFacilityRelease` → `applyFacilityMaster` に渡す。初期化中の操作/PWA更新guard、失敗時の表示・既存記録読込みをそのまま使用する。PR1の検証/計画/canonical、PR2の3ストア原子的apply・巻戻し拒否・同番号異内容拒否・退役処理、PR3の施設選択/検索/現在エリア/snapshotを変更しない。

初回は公式facilities/zones/appMetadataのみ追加する。user行は同名でも別IDで保持し、既存の「公式」「ユーザー登録」で区別する。自由入力の過去釣行にIDを付与せず、catch/lostや保存時名称snapshot、myLures、ルアー/魚種/タックルを更新しない。同版再起動は書込みゼロのno-op。DB v7、バックアップv6、PWA更新方式、デプロイworkflowは差分なし。

施設マスターが通常起動で登録されるため、今後のバックアップ出力は原則v6・全16テーブルになる。旧v1〜v5の読込みと新3テーブルの保持、v6の保護付きmergeは既存仕様のまま。復元による旧13テーブルの置換仕様も変更しない。検証での復元は合成fixtureと独立DB/Contextのみを使用する。

JSONはアプリJSへ静的同梱され、追加のAPI/JSON通信を必要としない。SW準備後の圏外cold startでも適用/検索/保存できる。初回アプリ取得とSW準備には通信が必要。旧画面の入力を消す強制更新は追加していない。

## 変更ファイル

- `src/data/facility-master.v1.json`: 承認済み初回50/73の完全版。
- `src/data/.gitattributes`: 配布JSONのバイト保持。
- `src/data/stage6FacilityRelease.ts`: 正式データのimportとapprovedレジストリ。
- `src/data/README.md`: 配布・再適用・バックアップ・圏外利用の説明。
- `tests/stage6-pr4.test.mjs`: 配布JSONと候補のhash/内容一致・正式識別子検証を追加。初回/再起動の試験を引数差替えから実レジストリのdefault経路へ変更。pendingケースの検証は明示引数で維持。
- `tests/e2e/fixtures.ts`: 通常起動50/73・metadataの検証を全ケースの前提へ追加。全16テーブルの読取りヘルパーを追加。
- `tests/e2e/stage6-pr4.spec.ts`: 実起動・再読込no-opから検索/9エリア選択/キャッチ/バラシ/保持を検証。
- `tests/e2e/trip-locations.spec.ts`: 初期公式行の存在を前提に、キャンセル時のDB全体不変・自由入力保持を検証。退役用の架空配布は2/3を使用。
- `tests/e2e/facility-storage.spec.ts`: 架空配布を2以降へ移し、実初回1と衝突させず従来の保護検証を継続。
- `tests/e2e/fishing-log.spec.ts`、`tests/e2e/fish-species.spec.ts`: 有効化後のv6出力/全16テーブル別Context往復へ更新。既存のタックル/魚種/釣果/snapshot検証を維持。
- `tests/offline/offline.spec.ts`: fixture投入前の実50/73を確認。公式行とuser追加分を区別し、実v6の全16テーブル保持を比較。
- `scripts/review-stage6-approved.py`: テスト用approved差替えを廃止し、実際の作業ツリーの追跡ソースと明示した配布JSONだけを隔離コピーして検証。利用者の未追跡ファイルは対象外。
- `docs/stage6-activation/`: 本報告、検証結果、Draft PR本文。

## 残存リスクとiPhone実機受入れ

全50施設の現在営業/利用ルールを新たに一次調査したわけではない。住所null 7、営業unknown 3、エリア未登録27、ニレ池の季節記載不一致、奈良子の現行名称対応などは今後の更新対象。構造検証や既存verifiedAtは現在営業の保証ではない。

本番端末の手動適用履歴とiPhone Safari実機は未確認。既存履歴が新しい場合は毎起動で保護エラーが表示される可能性があるが、強制上書きしない。静的同梱でJSが約505.62 kB（gzip約124.11 kB）となり、Viteの500 kB超の助言が出る。ビルド/SWは成功し、サイズ警告を隠す設定変更はしていない。

ユーザーがDraft PRの最終確認・マージを行い、自動デプロイが成功した後に実施する手順:

1. 既存PWAアイコン/サイトデータを維持する。現在のバックアップを取得し、既存の釣行/釣果/バラシ/所有ルアー/各マスターが表示されることを確認する。復元試験やDB削除はしない。
2. ホームの既存更新操作で新しいアプリを読み込む。施設検索で日本イワナセンターを選び、ZERO第2/第1、1、2、3・4、5・6、7、8、9号池の順序を確認する。同名user施設があれば別候補として残ることも確認する。
3. 9号池でキャッチを記録し、現在エリアをZEROへ切り替えてバラシを記録する。前のsnapshotが変わらず、各記録に保存時の名称が残ることを確認する。
4. 完全終了→再起動で施設が重複しないことを確認する。圏外準備完了後、機内モード＋Wi-Fi OFFで完全終了→cold start→選択/記録→再終了/起動し、保持を確認する。
5. ソフトキーボード、スクロール、保存/キャンセル到達、日付、入力中の更新延期を確認する。再度バックアップを取得し、v6・全16テーブルであることを確認する。本番DBへの復元は行わない。

この作業はコミット/push/Draft PR作成まで。main直接push、自動マージ、手動Pagesデプロイ、本番DB変更は行わない。マージはユーザーの最終確認後。
