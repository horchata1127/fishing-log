# NOAリンク拡充の引き継ぎ・実装報告

確認日：2026-11-23。最終指示に従い、写真を確認できる商品ページへのリンクと、画像を別タブで開く直リンクを追加した。画像ファイルの保存・同梱・アプリ内プレビューは追加していない。既存の端末写真表示を優先する。

## 起点と作業場所

- 元の作業場所：`C:/Users/plain/source/fishing-log`、ブランチ `feat/noa-color-photos`。
- 元HEAD：`5dc83464cf136d650202463831b707456953e61d`。前回のリンク拡充はこのコミットに含まれず、3ファイルの未コミット変更と未追跡ファイルに存在した。ステージは空。
- 前回分を固定した起点コミット：`f86dc637d99a3ae9c2d9739f980ef1e2e06ef8fc`。NOA関連21ファイルだけを取り込んだ。現行のコード・商品リンク75エントリ・713行の監査を照合し、そのうち73行が登録済みカラーに適用されることを確認。
- 新ブランチ：`feat/noa-photo-coverage-followup`。
- 新worktree：`C:/Users/plain/source/fishing-log-noa-followup`。元フォルダーの未コミット作業・ブランチ・無関係なファイルをそのまま保持した。元の21ファイルのGitオブジェクトハッシュを起点コミットと比較し、不一致0件。
- 今回の実装コミットはこの報告を含む後続コミット。`git log --oneline f86dc63..feat/noa-photo-coverage-followup` で取得できる。

## 現行カタログ

最新ローカル原本は `docs/rc45/fishing-log-backup-2026-11-23.json`。SHA-256 `e86b3b71764534ed2b353f1e8ee07cfc5e68c7f4c75639eebacb25c8f83226d8` を読み取り前後で照合した。

メーカー・シリーズ・モデル・カラーだけを [CATALOG.json](CATALOG.json) に抽出。個人の釣果・所有・バックアップ本体はコミットしない。前回の公開カタログと同じ実モデル8件・713色行・101照合グループで、汎用 `NOA(B/Jr./Boss)` の0色を実モデルとして水増ししない。

| 項目 | 行数 |
| --- | ---: |
| 商品ページリンク追加 | 45 |
| 既存商品ページリンク維持 | 333（前回追加73行を含む） |
| 商品ページリンクなし・保留 | 335 |
| 合計 | 713 |
| 画像直リンクあり | 118 |
| 内訳：重量別写真への参照 | 76（既存73＋新規3） |
| 内訳：重量共通色見本への参照 | 42（FORODOX24＋JOINTER18） |
| アプリへの写真ファイル追加・画像プレビュー追加 | 0 |

画像直リンクは商品ページリンクのある行に重なる。写真そのものをアプリへ追加した件数には数えない。既存RC43の共通商品リンク260行には他重量の写真への参照を含むため、それらを重量別写真76行に含めない。端末写真本体はRC45釣行バックアップの対象外なので端末内の写真件数は未確認。

全行のモデル・重量・元の色名・番号・URL・状態・理由は [ALL_COLORS.csv](ALL_COLORS.csv)、追加45行は [ADDED.csv](ADDED.csv)、保留335行は [HELD.csv](HELD.csv)、読みやすい明細は [INVENTORY.md](INVENTORY.md)。

## 採用した出典

### エルドラド1.8g

[城峰釣具店の商品](https://www.fishing-shop-jh.com/?pid=176993639)で、NOA 1.8g、New Drawerコラボ、JAN `4573151264752` を再照合。既存の採用URL `https://fishing-shop-jh.com/?pid=176993639` と同じ商品であり、URLは維持。既存の目視確認済み画像への直リンクだけを補った。JANと現在の主画像参照の証跡は [EXISTING_LINK_RECHECK.json](EXISTING_LINK_RECHECK.json)。

### 2026 FORODOX：24行追加

[NOA1.5g](https://store.shopping.yahoo.co.jp/openwater/noa-15-forodox.html)、[NOA1.8g](https://store.shopping.yahoo.co.jp/openwater/noa-18-forodox.html)、[NOA S1.0g](https://store.shopping.yahoo.co.jp/openwater/noa-s10-forodox.html)、[NOA S1.4g](https://store.shopping.yahoo.co.jp/openwater/noa-s14-forodox.html)の各商品名・重量・2026年・FORODOXを確認。色名付き表裏見本の6色を目視し、RODIO CRAFT×FOCUS×Deep Paradoxのコラボと照合した。

ゲンちゃんブラウニー、キャンタの飛沫、ソルティマジョーラ改、茶ッキン、SHOW、クズブルーを各重量へ割り当てる。出典URLは選んだ重量の商品。見本画像は重量共通として扱い、「重量共通の色見本を開く」と表示する。通常色#1～#6へ番号だけで割り当てない。主画像は重量別の袋写真だが全6色を示すものではないため、主画像を6色へ使い回さない。[FORODOX_SOURCES.json](FORODOX_SOURCES.json) にページ・画像参照と検査時ハッシュを記録。

### その他：21行追加

- [JOINTER公式のノアJr.製品](https://www.jointer.jp/product/detail/rodio_craft_noa_noa_jr/)：0.9g・1.2g・1.4gの仕様と、放流枝豆・腹黒・栃おとめ・レモン牛乳・ヤドク・腹黒IIの色名付き表裏写真を確認。3重量×6色の18行。写真に重量の刻印がなく、公式製品ページが3重量を共通に案内するため重量共通見本とする。腹黒と腹黒IIは別画像へ割り当てる。
- [t-Routeオリジナル](https://t-route.net/products/rodio-craft-spoon-t-route-original-color-%E3%83%AD%E3%83%87%E3%82%AA%E3%82%AF%E3%83%A9%E3%83%95%E3%83%88%E3%82%B9%E3%83%97%E3%83%BC%E3%83%B3t-route%E3%82%AA%E3%83%AA%E3%82%AB%E3%83%A9)：NOA 1.8gのRoute21とLibertyの2行。写真の色名・NOA1.8g刻印・表裏を確認。公開商品データで対応を確認したvariant ID（Route21 `44183026598102`、Liberty `44183026630870`）を出典URLに指定する。他重量へ共有しない。
- [ウインズのNOA1.8g 1091](https://store.shopping.yahoo.co.jp/windsweb2/rodeo-noa18-1091.html)：画像の「復刻T.SIV」表示と袋の1.8gを照合し1行。旧版T.SIVやT.S IIへ統合しない。

採用データと照合根拠は [ADDED_LINKS.json](ADDED_LINKS.json)。既存75エントリのモデル別リンクはファイルごと変更せず保持する。

## 全ノア系で調べた残りと不採用理由

- [吉や5色](https://www.kitiya.jp/?pid=57418742)：モンブラン・落ち葉・苔・ピンチクイーン・木の葉の番号対応はあるが、画像の刻印がジキル1.8g。NOAの製品写真として採用しない。
- [River RoadのNOA1.8g](https://riverroad1091.shop/?pid=149053745)：青雲・イエロー・#37・#75・#80等を含む全色見本と選択肢を確認。画像に対象重量の証明がなく、N.O2/N.02やN.O3/N.03など表記違いもあるため一括統合しない。
- [バックラッシュ1091](https://www.backlash.co.jp/item/4573151243511/)：複数重量・色の選択肢があるが、主画像は単色の代表写真。全色へ割り当てない。
- [アニーNOA1.8g 1091](https://any-netshop.shop-pro.jp/?pid=172644980)：複数色の袋写真はあるが色名欄が空白で、未登録色の対応を推測で補わない。
- [Fish Hook 1091](https://www.fish-hook.net/products/rodio-craft-noa-series-1091-limited-color)：0.9gと1.8gの集合写真、色の選択肢を確認。写真内に各色名がなくvariantと写真の関連付けもないため、既存の確認済み個別写真以外へ拡張しない。
- [俺金のキャスティング商品](https://store.castingnet.jp/shop/g/g4571385596847/)：アクセス確認画面となった。回避せず保留。
- JOINTERの「背面グリーングロー」は複数色の裏面説明であり、独立色の証明としない。
- 2025セレクト再販と旧版の2017/2021/2022/T.S II、オオツカF.S05(UV)/T.H01、2014狩野、バステト、略称・類似名は前回の証跡と今回の原本を再照合し、同モデル・重量・年/限定区分の根拠が不足する行を保留に残した。

## 既存リンクの健全性

既存の108商品ページを再取得し106件はHTTP200。75の目視確認済み商品は主画像参照URLも一致した。RC43由来の2ページ（#6蛍光ピンク `190933920`、#17グロー `190934095`）はHTTP404で、全8重量の16行に影響する。ユーザーの「既存リンク維持」に従い削除・置換しない。リンク未登録335行とは別に [BROKEN_LINKS.csv](BROKEN_LINKS.csv) に記録する。HTTP200は再度の全画素検証を意味しない。

## 実装と保全

`noaExternalReferences.ts` に確認済みの追加商品ページと直画像URLを定義。既存の厳密なメーカー・モデル・カラー照合とモデル別リンク解決を再利用する。新規デフォルトの読み取りはIndexedDBへ書き込まない。

端末の確認済みローカル写真を優先する。ユーザーの共通/モデル専用リンクがデフォルトと異なる場合は、既定画像の直リンクを表示しない。明示削除も尊重する。画像直リンクと商品ページは別タブで開くため、参照先404・オフラインでも元の釣果入力を保持して色を選べる。画像の自動fetch・img要素への埋め込み・PWAキャッシュ・写真バックアップへの取り込みはない。

ユーザーは画像利用許可を未取得と回答後、商品ページリンクへの限定と画像直リンクの許可を指定した。これは第三者画像の転載許可とは扱わず、外部ページ/画像へのナビゲーションに限定する。[LINEヤフー共通規約](https://www.lycorp.co.jp/ja/company/terms/)と[城峰店舗表記](https://fishing-shop-jh.com/?mode=sk)も確認した。実装は外部画像をアプリ内へ転載しない。

## 再生成・検証

1. `python scripts/research-noa-followup.py --backup <ローカル原本の絶対パス> --recheck-links`：読み取り専用で公開カタログ・HTTP証跡を更新。画像バイナリをファイル保存しない。
2. `node scripts/build-noa-followup-links.mjs`：固定した確認済み出典からデフォルト参照を生成。
3. `node scripts/audit-noa-followup.mjs`：アプリと同じ照合で全713行を再生成。既存URLが変わった場合はエラー。

検証結果は [VALIDATION.md](VALIDATION.md)。
