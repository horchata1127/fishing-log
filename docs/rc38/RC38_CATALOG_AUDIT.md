# RC38 カタログ・釣果監査

確認日: 2026-11-04。RC37の [監査](../moca-catalog/MOCA_CATALOG_AUDIT.md)、[実装報告](../moca-catalog/MOCA_IMPLEMENTATION_REPORT.md)、[差分](../moca-catalog/MOCA_CATALOG_DIFF.json) を確認した。

## 出典とモデル差分

- [城峰DR-Fラトル一覧](https://fishing-shop-jh.com/?mode=grp&gid=2002790&sort=n): 調査時点で16商品、1ページ。商品一覧の末尾まで確認し、追加ページへのリンクなし。件数を将来の固定値にしない。
- [さちおの茶](https://fishing-shop-jh.com/?pid=156192039): DR F 2HOOK / 30mm / 2.1g / F / ガラスラトル×2、JAN 4573151245423。
- [BackLash DR-F](https://www.backlash.co.jp/item/4573151272276/): フローティング2.1g、RC37の7色を再確認。
- [BackLash DR-SS](https://www.backlash.co.jp/item/4573151272320/): スローシンキング30mm・2.4g、RC37の7色を再確認。

すべて販売店確認。メーカー公式確認ではない。`standard` は通常商品として掲載された色の区分で、公式が限定流通の不存在を保証した意味ではない。限定表示のある商品は今回の城峰16件では確認されなかった。売切れも存在確認に含めた。商品画像・説明全文は転載しない。

| モデル | RC37候補 | RC38対象 | 提供バックアップで追加 | 再利用 | カラー保留 |
| --- | ---: | ---: | ---: | ---: | ---: |
| DR-F Rattle 2HOOK | 7 | 19 | 19 | 0 | 0 |
| DR-SS Rattle 2HOOK | 7 | 7 | 7 | 0 | 0 |

提供バックアップに確定型式2モデルは存在しないため、新規2モデル・26カラー。RC37の全候補203色に対する増分は12色。RC37で保留だった14色も別モデル追加で解消する。通常DR-Fや型式不明ID128への再利用・色移動はない。

既存ID128は名前・属性・関連IDを保持。既存カラーIDは [差分JSON](RC38_CATALOG_DIFF.json) の `ambiguousColors` を参照。既存3色（うぐいすもち・さくらもち・寿）のF/SSと限定区分は引き続き未確定。既存所有・配色・履歴も維持する。

RC37の7色は #34 19早乙女、#35 20井野、#36 24ノブ、#37 ラーテル、#38 FOCUSオリーブ、#43 21ノブ、#44 フォーカスおまめ。城峰との重複は34・35・36・38。残る3色はBackLashのモデル別選択肢で確認し、JANと個別色の対応を確実に確認できていないためJANを空欄とする。DR-SSの7色も同店のSS商品だけから採用し、F専用の12追加色はSSへ展開しない。

## 多摩湖釣果の修正候補

原本 `fishing-log-backup-2026-11-04.json` は内部形式v9。釣行ID15、2026-11-03、多摩湖駅前フィッシングエリア。保存済みsummaryMvpはない。RC36の指定MVPが別端末に存在する可能性を排除せず、端末上の値を確認してから再指定する。

| 釣果ID | 結果 | 時刻（JST、11/3） | 変更前 | 所有ID / variant ID | 判定 |
| --- | --- | --- | --- | --- | --- |
| 41 | キャッチ | 12:50:51 | MOCA SR-SS / #31 19ノブ | 8624 / 324 | 4キャッチ候補 |
| 43 | キャッチ | 12:56:05 | 同上 | 8624 / 324 | 4キャッチ候補 |
| 44 | キャッチ | 13:28:25 | 同上 | 8624 / 324 | 4キャッチ候補 |
| 45 | キャッチ | 13:36:26 | 同上 | 8624 / 324 | 4キャッチ候補 |
| 42 | バラシ | 12:53:30 | 同上 | 8624 / 324 | 同じ所有IDの関連候補 |
| 40 | バラシ | 11:15:10 | MOCA SR-SS / #23 2015ノブカラー | 8623 / 318 | 別カラー・別所有ID。個別確認 |

候補ごとのUTC原日時と変更前後のルアー項目は [差分JSON](RC38_CATALOG_DIFF.json) に記録した。本人確認後の変更先は `MOCA DR-F Rattle 2HOOK / さちおの茶`。新variant IDと所有IDは端末ごとに作成されるため固定値を指定しない。件数・結果種別・日時・魚種・レンジ・アクション・メモ・タックルを変更しない。ID40は4キャッチと同じ個体と断定しない。対象外のMOCA SR-SS釣果は変更しない。

1. 端末でバックアップを保存し、統一マスター差分を確認して適用する。
2. マイルアーでDR-Fラトル／さちおの茶を選択して所有登録する。既存所有があれば再利用する。
3. 対象釣行の釣果履歴で、上記IDに対応する時刻・結果・変更前ルアーを照合する。
4. 確認したレコードだけ「編集 → ルアーの変更 → カタログ → MOCA DR-F Rattle 2HOOK → さちおの茶」で保存する。他項目を変更しない。
5. 4キャッチと関連バラシを個別確認する。ID40は本人が対象と確認した場合だけ編集する。
6. サマリーの「MVPを指定・編集 → 記録したルアーから選ぶ」で該当ルアーを選び、カラー・暫定チェックを確認して保存する。PNGプレビューで名称・カラーを確認する。

本人の「MOCA・F・音符表示、DR-Fラトル、さちおの茶」という申告は実物同定の根拠。今回写真ファイルそのものは提供されていないため、写真を直接鑑定したとは記録しない。商品存在と掲載仕様の販売店確認とは区別する。

## 再現と残る保留

```powershell
node scripts/audit-rc38.mjs docs/rc38/fishing-log-backup-2026-11-04.json docs/rc38/RC38_CATALOG_DIFF.json
```

原本は変更せずコミットしない。入力SHA-256・内部版・既存128の3色・モデル別計画を差分JSONに記録。旧未確定モデルMOCA、Petit DR-F重量、ID128の型式・既存限定色区分、世界中の旧色／店舗限定色の全件性は引き続き保留。RC37のMVP色保留は本人申告で解消し、端末のMVP再指定待ちとして表示する。

## 城峰掲載色・JAN対応

全行とも確認日は2026-11-04、出典種別は販売店、通常掲載色区分。コードはBackLashと同名を確認できた4件だけ記録し、ほかは推測しない。既存登録一致0件、RC37候補との一致4件。

| Color | Code | JAN | Source | RC37 |
| --- | --- | --- | --- | --- |
| FOCUSオリーブ | 38 | 4573151272313 | [shop](https://fishing-shop-jh.com/?pid=184665432) | existing candidate |
| 24ノブ | 36 | 4573151272290 | [shop](https://fishing-shop-jh.com/?pid=184665342) | existing candidate |
| 20井野 | 35 | 4573151272283 | [shop](https://fishing-shop-jh.com/?pid=184665281) | existing candidate |
| 19早乙女 | 34 | 4573151272276 | [shop](https://fishing-shop-jh.com/?pid=184665235) | existing candidate |
| RCポテトヘッド |  | 4573151265711 | [shop](https://fishing-shop-jh.com/?pid=179903731) | additional |
| 19ノブ |  | 4573151265698 | [shop](https://fishing-shop-jh.com/?pid=179903727) | additional |
| クリアー(マット) |  | 4573151255927 | [shop](https://fishing-shop-jh.com/?pid=171853453) | additional |
| さちおの茶 |  | 4573151245423 | [shop](https://fishing-shop-jh.com/?pid=156192039) | additional |
| 黒まんじゅう |  | 4573151236445 | [shop](https://fishing-shop-jh.com/?pid=146121715) | additional |
| 2015 ノブ |  | 4573151232638 | [shop](https://fishing-shop-jh.com/?pid=139676373) | additional |
| 蛍光ピンク |  | 4573151232621 | [shop](https://fishing-shop-jh.com/?pid=139676366) | additional |
| 2014 ノブ |  | 4573151232614 | [shop](https://fishing-shop-jh.com/?pid=139676354) | additional |
| 黄/緑 |  | 4573151232607 | [shop](https://fishing-shop-jh.com/?pid=139676333) | additional |
| キラキラ |  | 4573151232591 | [shop](https://fishing-shop-jh.com/?pid=139676319) | additional |
| S.M VI |  | 4573151232553 | [shop](https://fishing-shop-jh.com/?pid=139676302) | additional |
| K.FⅢ（レッドグロー） |  | 4573151232546 | [shop](https://fishing-shop-jh.com/?pid=139676267) | additional |
