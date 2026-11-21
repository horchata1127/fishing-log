# RC44 奥多摩フィッシングセンター追加

確認日：2026-11-21。作業ブランチ：`feature/rc44-okutama-facility-master`。RC43マージ後のmain（`e2af382`）を基準とする。既存PR43までを確認してRC44を採番した。

## 公式情報と登録判断

[奥多摩漁業協同組合公式サイト](https://www.okutama-fc.co.jp/)と[施設案内・料金表・区画説明](https://www.okutama-fc.co.jp/okutama_fc_esa.html)を確認した。施設名は奥多摩フィッシングセンター、所在地は東京都青梅市御岳2丁目333。公式本文の各区画見出しとポンド説明を根拠とし、候補5区画を追加した。案内図の画像を独自に解釈した区画・境界・座標は追加していない。

| 項目 | 登録値 |
| --- | --- |
| ID | `official:okutama-fishing-center` |
| name / prefecture | 奥多摩フィッシングセンター / 東京都 |
| address | 東京都青梅市御岳2丁目333 |
| facilityTypes / lureAllowed | `stream`, `pond` / `true` |
| operationStatus | `open`（通常の営業区分） |
| officialUrl | `https://www.okutama-fc.co.jp/` |
| sourceUrl | `https://www.okutama-fc.co.jp/okutama_fc_esa.html` |
| verifiedAt / aliases | `2026-11-21` / 空配列（推測の別名なし） |
| origin / catalogState | 既存の展開処理により `official` / `listed` |

全zoneのfacilityIdは上記施設ID、sourceUrlは施設案内URL、origin/catalogStateは`official`/`listed`。

| sortOrder | ID末尾 | 登録名称 | 公式根拠・候補表記との差 |
| --- | --- | --- | --- |
| 1 | `lure-stream` | ルアー・フライ・テンカラ釣り場 | 独立した説明見出し。本流の釣り場 |
| 2 | `lure-pond` | ポンドエリア | 上流部の独立したルアー専用池。個別の時間・追加規則あり |
| 3 | `beginner-bait` | 初級者エサ釣り場 | 独立した説明見出し |
| 4 | `general-bait` | 一般エサ釣り場 | 独立した説明見出し |
| 5 | `fishing-pond` | 釣り堀エリア | 独立した説明・料金区分。「池釣り堀」と二重登録しない |

zone IDは施設IDに`:`と末尾を付けるアプリ独自の識別子であり、公式の区画コードではない。施設全体の`lureAllowed`はエサ釣り区画でルアーを許可する意味ではない。zoneごとの釣法制約を設定する既存スキーマはないため構造は拡張せず、名称と本報告に区別を残す。

## 営業情報と保留事項

通常の月別営業時間と年末年始の休業案内から、通常営業区分は`open`と判断した。公式案内は3～11月7～16時、冬期7時半～16時で、ポンドと釣り堀は別の開始時間を定めている。年末年始の休業および冬期木曜の特別営業もある。これは通年無休や当日の営業を保証する登録ではない。[公式施設案内](https://www.okutama-fc.co.jp/okutama_fc_esa.html)

11月の整備に伴う区画別の変則営業が掲載されている。通常料金表のルアー一般1日券は4,000円で、シングルバーブレスなどの規則とポンドの追加制限がある。営業時間・料金・規則・一時休業・放流・水位は変動情報なので永続フィールドに格納せず、来場時に公式案内を確認する扱いとした。[公式施設案内](https://www.okutama-fc.co.jp/okutama_fc_esa.html)

候補5区画の保留は0件。公式に別途掲載される「団体エサ釣り場」は今回の候補外として未追加。個別の釣り座やハンディキャップ向け案内を別zoneとする判断もしていない。将来追加する際は既存区画との重複や予約条件を確認する。

公式ページの直接取得は接続エラーおよびクライアントでの証明書期限エラーとなったため、公式URLに限定した検索取得本文（当日クロール表示）で住所・見出し・区画説明・料金表を照合した。証明書検証の無効化や画像の転載はしていない。案内図画像の直接目視は未実施。

## 追加方式と件数

既存の完全版マスター更新を再利用する。新しい累積JSONを`stage6FacilityRelease`から読み込み、`initializeFacilityRelease` → `applyFacilityMaster`の既存トランザクションで投入する。releaseOrderは1から2、masterVersionは`1.1.0-rc44-okutama-51f78z`。履歴証跡である`facility-master.v1.json`は変更しない。

| 比較対象 | 追加前 施設 / 区画 | 追加 | 追加後 施設 / 区画 |
| --- | --- | --- | --- |
| アプリ同梱公式マスター | 50 / 73 | 1 / 5 | 51 / 78 |
| 2026-11-21 v10バックアップを隔離DBへ復元した状態 | 51 / 75 | 1 / 5 | 52 / 80 |

既存公式50施設・73区画の全フィールドは一致。更新・退役・削除0件。ユーザー由来1施設・2区画を維持する。再実行・同時実行後の追加は0件で、同一内容の再実行時には全27テーブルの作成・更新・削除フックを禁止しても成功する。

既存の施設行が編集されてmetadataと不一致の場合は、既存の保護機構が更新を拒否し、その編集内容を含む全データを保持する。ユーザー行の上書きや同名の自動統合はしない。zone追加途中の故障注入でも施設・区画・metadataを一括でロールバックする。

## 画面・オフライン・バックアップ

画面とDBスキーマの変更は不要。既存の施設検索、施設別zone選択、釣行中の現在zone変更、釣果別の位置記録をそのまま利用する。河川→ポンドの変更後も、それ以前の釣果のfacilityId・zoneId・locationSnapshotを保持する。釣果編集も位置を維持する。

既存PWAビルドに新JSONを含めるため外部APIは追加しない。完全オフラインでのプロファイル再起動後も施設・区画を選択し、釣行・釣果の保存と編集ができる。再起動・再復元で重複しない。

通常JSONのバージョン判定・形式・インポーターは変更しない。v10を復元後も新しいreleaseOrder 2が残り、新施設を選択できる。新施設の釣行・釣果を出力・復元してIDとsnapshotを保持する。既存の復元監査履歴が追記されることは通常動作として検証する。RC43の写真テーブル・通常JSONと写真専用バックアップの区別も変更していない。

## 変更ファイル

- `src/data/facility-master.rc44.json`：旧50/73をそのまま含む完全版51/78。
- `src/data/stage6FacilityRelease.ts`：上記累積版への参照変更。
- `scripts/prepare-rc44-facility.py`：元ファイルを変更しない再生成スクリプト。
- `tests/rc44Fixture.ts`, `tests/rc44UiHelpers.ts`：公開合成v10（51/75）と画面操作・全store観測。
- `tests/rc44-facility.test.mjs`：追加差分、全store保全、冪等性、復元、ロールバック、編集保護、任意の手元原本検証。
- `tests/e2e/rc44-okutama.spec.ts`, `tests/offline/rc44-okutama.spec.ts`：通常・完全オフラインでの釣行操作。
- `tests/stage6-pr4.test.mjs`, `tests/e2e/fixtures.ts`, `tests/e2e/stage6-pr4.spec.ts`, `tests/e2e/trip-locations.spec.ts`, `tests/e2e/facility-storage.spec.ts`, `tests/offline/offline.spec.ts`, `tests/stage6-review/approved.spec.ts`：現在の同梱件数・releaseOrderを反映。旧リリースの監査・復元fixtureは維持する。
- `docs/rc44/`：本報告、検証結果、PR本文。

## 品質確認

実行結果と未検証項目は[RC44_VALIDATION.md](RC44_VALIDATION.md)に記録する。iPhone Safari実機は利用できず未検証。ChromiumのiPhone画面・タッチ条件による検証を実機試験とは扱わない。
