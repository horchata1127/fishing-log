ユーザーが承認した50施設・73エリアを初回施設マスターとして静的同梱し、PR #19で用意した起動経路を有効化します。初回起動で公式施設/エリアを追加し、同じ版での再起動は書込みゼロになります。

`facility-master.candidate.json` とバイト一致の `src/data/facility-master.v1.json` を追加し、`stage6FacilityRelease.ts` をapprovedへ変更します。採番候補は `releaseOrder: 1` / `masterVersion: 1.0.0-stage6-50f73z`。最新main `f6d6c40` のコード/履歴に競合する正式施設配布はありません。研究用8/9は流用していません。

- 既存のvalidator/原子的apply、DB v7、backup v6、App起動とPWA更新方式を再利用し、これらの実装には差分なし。
- 既存の釣行/catch/lost/myLures/各マスター/同名user施設/snapshotを保持。旧版・同番号異内容は強制上書きせず保護付き拒否。
- 実レジストリによる初回/再起動、全123 IDと監査候補の一致、全16ストアv6往復、実approvedビルドの圏外cold startを検証。
- 既存E2Eを「公式行なし」から「初期50/73あり」へ更新。旧履歴検証を維持し、バックアップ検証を実際のv6・全16テーブルへ強化。架空配布は2以降を使用。

検証: build/typecheck成功、単体383成功、E2E60成功、offline18成功。実approvedソースを差替えずに隔離コピーした追加ビルドと専用PC/モバイル2件も成功。全16テーブルv6往復、再起動書込ゼロ、旧版/同番号異内容/途中失敗時の全データ保持を確認。diff check成功。

詳細: [実装・承認・採番・変更一覧・iPhone手順](docs/stage6-activation/IMPLEMENTATION_REPORT.md)、[検証](docs/stage6-activation/VALIDATION.md)、[既存監査](docs/stage6-pr4/MASTER_AUDIT.md)。

承認と残る最終確認:

- [x] ユーザーが50施設/73エリア、イワセン9エリアの名称/順序、キングフィッシャー5号池表示順を承認。
- [x] 未確認営業情報・エリア未登録27施設は今後改善する方針を承認。
- [x] mainマージ時のPages自動デプロイ運用を維持。workflow変更なし。
- [ ] 採番候補1/`1.0.0-stage6-50f73z`と今回の有効化差分をユーザーが最終確認。
- [ ] ユーザー判断でDraft解除/マージ。**この作業ではマージしません。**
- [ ] マージ・自動デプロイ後のiPhone Safari/PWA実機受入れ。

実機appMetadataと現在営業/ルールは今回調査していません。リポジトリ外の手動配布履歴は未確認で、競合時はデータを保持して起動エラーを表示します。初回取得/SW準備には通信が必要。静的同梱によりJS約505.62 kBとなりサイズ助言がありますが、build/SWは成功しています。

**Draft PRのまま。main直接push・自動マージ・手動Pagesデプロイ・本番DB変更・本番バックアップ復元試験は行いません。**
