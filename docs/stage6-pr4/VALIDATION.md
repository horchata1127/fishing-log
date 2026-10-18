# 検証結果（2026-10-18）

最終レビュー結果とマージ判断は [FINAL_REVIEW.md](FINAL_REVIEW.md)。通常pendingビルドを維持したまま、隔離したapprovedビルドの追加試験も成功した。

## コマンド

| 実行 | 結果 |
| --- | --- |
| `npm.cmd run build` | 成功、vue-tsc/Vite/PWA generateSW |
| `npm.cmd test` | 382成功、失敗0、skip0（初回新規9件＋最終レビュー追加4件） |
| `npm.cmd run test:e2e:typecheck` | 成功 |
| `npm.cmd run test:e2e` | 60成功、失敗0（PC30/モバイル30、新規各1）、最終終了コード0 |
| `npm.cmd run test:offline` | ビルド成功、18成功、失敗0（PC9/モバイル9、新規各1）、最終終了コード0 |
| `git diff --check` | 成功 |
| `python scripts/review-stage6-approved.py` | 一時コピーのみapprovedビルド成功、PC/モバイル2件成功、元レジストリ不変 |
| `git diff --cached --check` | 初回18ファイルと、最終レビューの明示ステージング差分を確認 |

## 保護・配布確認

fake-indexeddbの独立DB、E2E専用origin `127.0.0.1:4177` の新規Context、offline専用origin `127.0.0.1:4188` の一時persistent profileを使用。実機IndexedDB・ユーザーバックアップへの書戻しなし。実ユーザーバックアップを使った追加検証は未実施で、合成fixtureを使用した。

新規単体テスト13件で50/73、全stable ID、名称/表示順重複、正式スキーマ検証、ドラフト直接適用拒否、pending時のDBアクセスゼロ、起動失敗時保持、初回/再適用/同時適用、旧版/同版異内容/所属移動拒否、途中書込み失敗rollback、全16ストアv6往復を確認。同名user施設、自由入力釣行、既存バラシ、所有ルアー、魚種、カタログ、タックルを非空fixtureで保全比較した。追加4件では全候補フィールド・所属・表示順の監査一致、ネットワーク禁止下の起動と再起動時書込ゼロ、実機側が新しい版/同番号異内容の場合の全ストア不変を確認。

既存単体テストには改変なし。既存のrename/retirement/rollback・旧バックアップ互換性の回帰も実行。全体E2E初回は59成功/1失敗。既存モバイル競合テストで、alertを閉じる前にclick完了を待つ相互待ちが発生したため、alert応答とclickを並行化した。メッセージ・入力保持・DB不変の既存検証は維持。新規E2Eは静的承認後の起動適用をテスト内だけで模擬し、全9エリアを選択、9号池のキャッチ→ZERO2へ切替→バラシ、同名user共存と再読込保持を確認する。手動ファイル取込みUIは今回の方式では追加していない。

オフラインの候補投入はテスト準備として既存v6復元UIを使用。その後プロファイル完全終了→ネットワーク無効でcold start→施設検索/9号池選択→キャッチ/ZERO1バラシ→完全終了→圏外再起動し、全16テーブルを比較する。本番でのバックアップ復元によるマスター導入を案内するものではない。

本番ビルド全13ファイルの内容を検査し、イワセン公式ID・研究版名・候補JSON名・研究JSON名が含まれないことを確認。候補はdistに含まれず、通常起動で自動投入されない。

原本2ファイルのSHA-256と、開始時からの未追跡11ファイルのSHA-256一致を確認。後者の証跡は `untracked-preservation.json`。既存未追跡ファイルはステージング対象外。初回オフラインは18成功だったがPowerShellのstderr警告により呼出しの終了状態が曖昧だったため、最終実行はPython subprocessで実際のnpm終了コード0を捕捉した。E2Eも同じ方法で終了コード0を確認。

途中の候補v6往復テストは、合成バラシfixtureが旧フィールド `lostStage` を使っていたため失敗した。現行RC23契約の `lostDistance: offshore` に修正し、製品バリデータを変更せず378件成功。生成スクリプト初回は想定したキングフィッシャーIDが実IDと異なるため出力前に停止し、原本のstable IDに修正した。

## 実機・承認の制約

ChromiumのPC/モバイル検証をiPhone Safari実機合格とは扱わない。実機手順はIMPLEMENTATION_REPORT.md。全50施設の最新一次情報、実機appMetadata、採番・内容承認は未確認/未承認。マージ・自動マージ設定・workflow_dispatch・本番デプロイを行わない。既存GitHub Actionsはmain pushと手動dispatchだけがPages配布対象で、今回のfeature pushは対象外。
