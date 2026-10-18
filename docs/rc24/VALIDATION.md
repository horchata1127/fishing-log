# RC24 検証結果

| 実行コマンド | 最終結果 |
| --- | --- |
| `npm.cmd run build` | 成功。vue-tsc、Vite、PWA generateSW。 |
| `npm.cmd test` | 405件成功、失敗0、skip0、終了コード0（main383＋新規22）。 |
| `npm.cmd run test:e2e:typecheck` | 成功、終了コード0。 |
| `npm.cmd run test:e2e` | 64件成功、失敗0、終了コード0（PC/モバイル各32、新規各2）。 |
| `npm.cmd run test:offline` | build成功、20件成功、失敗0、終了コード0（PC/モバイル各10、新規各1）。 |
| `git diff --check` | 成功。 |
| `git diff --cached --check` | 成功（関連13ファイルだけを明示ステージング）。 |

## 追加検証

単体22件: 旧10＋新8種類の重複なし、表示fallback、catch/lost×3値の登録/編集、無関係編集時の欠落/明示値保持、旧未知action、UIキャンセル、前回コピー4パターン、独立した次のnormal、不正8値/型の登録・編集・v6復元拒否、全16テーブル往復、更新途中の所有自動追加と長さのrollbackを確認。

v6往復ではStage6の実50/73、同名user施設/エリア、所有ルアー、魚種、ロッド/リール/ライン/セットとsnapshot、釣行/イベント、旧action/旧場所snapshot、新catch/lostを用意し、全16テーブルを不変比較した。DBバージョン7を確認。旧形式の受入れと既存のRC23/Stage6保護検証も全実行した。

追加E2E4件: 新8アクションと3長さを選択・保存・編集し、結果切替でも保持、再読込後の値、イワセン9号池/ZERO2と保存時snapshot、前回と同じ、独立した次の普通を確認。旧値fixtureでは未指定の表示/非補完、未知action、キャンセル、明示normalを区別。390×500/ダークで内部スクロール・保存/キャンセル到達・横overflowなしを検証し、既存ライト/ダークのコントラスト回帰も通過した。

追加オフライン2件: 編集中に新action/長さを変更してSW更新を要求し、更新禁止・入力保持・キャンセル時DB不変を確認。その後一時persistent profileを完全終了して圏外cold startし、9号池キャッチshort→ZERO2バラシlong→圏外編集normal→完全終了/圏外再起動→前回コピー→全16テーブルのv6出力を比較する。旧記録の欠落と全既存行を保持する。

## 試験の隔離と制約

fake-indexeddb、専用localhost `127.0.0.1:4177` の独立Context、`127.0.0.1:4188` の独立persistent profile、合成fixtureのみを使用。本番IndexedDBや実バックアップへのアクセス・復元・初期化・削除は行っていない。ユーザーの未追跡11ファイルは開始時のSHA-256と比較し、変更・削除・ステージングがないことを確認する。

DBの全version/stores宣言、Stage6配布JSON/レジストリ/validator/apply、PWAコード、デプロイworkflowはmainと同一。新フィールドはindexに使わないためmigration不要。バックアップの形式番号も変更していない。

途中の追加E2Eは、ネストしたlabelの名前と表示待ちにより選択欄を取得できなかった。明示aria-labelと描画待ちを追加し、型付き合成fixtureへ整理後、全64件成功。追加オフラインの初回2件では完全終了前のPageに紐付いたlocatorを再使用していたため、再起動後のPageで取得し直すよう修正した。製品の保護規則やテスト期待値を弱めていない。

ビルドの500 kB超助言、NodeのNO_COLOR/FORCE_COLOR警告、既存SSR fixtureの子コンポーネントtemplate警告はあるが、単体/buildは終了コード0。iPhone Safari実機、実キーボード、VisualViewportは未確認。実機手順はIMPLEMENTATION_REPORT.md。
