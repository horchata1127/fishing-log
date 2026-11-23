# 検証結果

> 画像表示を復元した追加コミットの検証・出典別保留は [IMAGE_RESTORATION.md](IMAGE_RESTORATION.md)。以下は17ee267時点の履歴。「src/distに画像URLなし」等は現在の仕様を表さない。

2026-11-23、Windows、`feat/noa-retailer-product-links`。実ブラウザープロフィール・本番DBを使わず、fake-indexeddbとPlaywright専用origin/一時プロフィールで確認した。

| 実行 | 最終結果 |
| --- | --- |
| `npm.cmd run build`（vue-tscを含む） | 成功。PWA生成成功。既存の500KB超チャンク警告あり。 |
| `npm.cmd run test:e2e:typecheck` | 成功。 |
| `npm.cmd test` + `NOA_DEVICE_BACKUP` に最新RC45原本 | 722件中717成功、5スキップ、失敗0。 |
| NOA関連E2E 4ファイル、desktop/mobile Chromium | 20/20成功。 |
| オフライン全体の初回 | 68成功、RC43写真テストのdesktop/mobile 2件失敗。画像デコード完了前のnaturalWidth=0を即時判定していた。 |
| `expect.poll` で写真のデコード完了を待つよう修正し、最終ビルドでRC43オフラインを再実行 | desktop/mobile 2/2成功。全70件の一括再実行は行っていない。 |
| 全713行の起点比較・再棚卸し | 成功。有効だった旧361行/111URLを保持、新151行/151URL、404代替17行。読み取り前後で全DBテーブル不変。 |
| `git diff --check` | 成功。 |

画面テスト:

```text
node node_modules/@playwright/test/cli.js test tests/e2e/rc43-noa-photos.spec.ts tests/e2e/rc43-photo-failures.spec.ts tests/e2e/noa-model-photo-links.spec.ts tests/e2e/noa-followup-links.spec.ts
node node_modules/@playwright/test/cli.js test -c playwright.offline.config.ts tests/offline/rc43-noa-photos.spec.ts
```

PowerShellのNativeCommandErrorによる判定混同を避け、`cmd.exe /d /c` で標準出力/標準エラーをログへまとめ、プロセス終了コード0を確認した。最終ローカルログは `.noa-retailer-*-final.log`（Git対象外）。

## データ・表示の確認

- 全713行を実際のアプリ解決関数で比較。新規参照の解決でfetchを呼ばず、所有・釣果・写真等を含む全テーブルに書き込まない。新151URLは個別商品URLのみで、画像URLはデータ定義にない。
- 有効な旧URLはprimaryまたは追加商品リンクで全件到達可能。旧404の3URLだけ既定導線で代替。ユーザー保存URLが同じ旧URLでも保持。元73追加行は72維持・1代替。
- N.03はNOA1.8gの指定キャスティングSKUを辞書と釣果登録で解決。別メーカー・別モデル・同番号の別名へ適用しない。ピンクの旧404既定URLは新しい正しい重量のSKUへ代替。
- FORODOXは4重量の出典URLを維持。画像直リンクのボタンや外部imgは表示しない。表示のみの外部画像要求は0。出典ページ404の合成ケースでも別タブで開き、入力メモと色選択を保持。
- 端末写真の表裏・モデル専用/共通の優先、拡大、差し替え・削除、写真バックアップ往復、破損入力時の原子的ロールバック、既存配色の保持を確認。裏面だけの写真と壊れたローカル写真も確認。
- ユーザーの共通/モデル専用リンクを優先し、共通リンクの明示削除も尊重。追加デフォルトを理由にユーザーの設定を書き換えない。
- PWAをオフラインで完全再起動し、保存済み写真の実際のデコード成功、未登録面のSVG、通信が必要なリンクの表示、釣果入力・全テーブルの保持を確認。
- `src` と生成済み `dist/assets` に、旧shop-pro画像ホスト・Yahoo画像ホスト・Casting画像パスの文字列が含まれないことを確認。

## 原本・既存のテスト依存

最新原本 `docs/rc45/fishing-log-backup-2026-11-23.json`（元のfishing-log側）のSHA256は、照合・テスト前後とも

```text
e86b3b71764534ed2b353f1e8ee07cfc5e68c7f4c75639eebacb25c8f83226d8
```

RC43の実バックアップ保全テストはこの原本を読み取り専用で隔離DBへ復元して実行し、写真登録の前後で写真以外の全レコード・ID・値が一致した。原本や私的な釣果・所有等はコミット対象外。今回取り出した公開NOAマスターは前回公開CATALOGと全件一致し、メーカー/系列/モデル/色の定義だけを含む。

全単体テストの既存catalogテストは、Git管理外の `docs/catalog-handoff/fishing_log_catalog_1886_only.json` を必須参照している。元のfishing-logから同じ公開マスターfixtureを検証中だけコピーして実行し、検証後に今回のコピーを削除した。この既存依存は変更していない。クリーンなチェックアウトで全単体テストを再現する場合は同fixtureが必要。

5件のスキップは別の任意バックアップ（Tamako、RC36、全データ更新、旧v10等）がこの作業ツリーにないため。今回の最新RC45原本を使用する写真保全テストはスキップされず成功した。

実機iPhone/Safari・インストール済みのユーザー端末内写真は未確認。mobile Chromiumは画面幅・タッチ条件の検証でありSafari実機検証ではない。通常の釣行JSONバックアップには写真バイナリが含まれないため、ユーザー端末に実在する写真枚数を本調査の写真件数へ算入しない。外部店舗のページ・在庫・画像は確認日時点の状態。
