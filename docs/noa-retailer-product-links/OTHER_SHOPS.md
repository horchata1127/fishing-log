# 販売店横断の確認と不採用候補

確認日: 2026-11-23。通常の公開ページとJavaScript有効ブラウザーを使用。認証・アクセス確認の回避はしない。調査時の写真表示はブラウザー内だけで、画像ファイルを保存しない。以下のURLは商品ページまたは調査用一覧であり、アプリに登録するのは確認済み個別商品ページだけ。

## キャスティング

[指定一覧](https://store.castingnet.jp/shop/goods/search.aspx?category=0802&keyword=&filtercode13=&style=&sort=&ps=&search.x=0&jnr=108410)を全25ページ確認。一覧全体は742商品、NOA候補は612URL。在庫切れも含む。エルドラド、FORODOX、シルバーエンド、2018松本、青雲、グロー、狩野、バステトは同店の検索も確認した。取得記録は [CASTING_DISCOVERY.json](CASTING_DISCOVERY.json)。通常ブラウザーでは掲載を確認できたため、前回の「アクセス確認画面で保留」を更新する。

登録済みモデル・重量・色名との厳密な候補150件を個別に開いた。番号だけでは承認しない。商品コード、商品名、重量、色名/番号、掲載画像を照合し、写真も目視確認した145件を採用。大きな写真が必要な候補は拡大し、刻印や袋の重量も確認した。[REVIEWED_CODES.json](REVIEWED_CODES.json)が目視承認リスト、[VERIFIED_PRODUCTS.json](VERIFIED_PRODUCTS.json)が最終照合結果。元の [CASTING_PRODUCTS.json](CASTING_PRODUCTS.json) の pending/error は自動収集時点の状態で、採否は承認リストと下記の追加目視結果を正とする。

商品コードはJANと同一とは限らない。13桁かつチェックデジット一致の場合に限り `jan` を記録し、短い店内コードは `productCode` だけに残す。

次の5件は商品ページ名が一致しても写真の重量が違うため採用しない。

| 対象 | 商品ページ | 掲載写真の根拠 |
| --- | --- | --- |
| NOA 1.5g ゴールドエンド | [4573151231051](https://store.castingnet.jp/shop/g/g4573151231051/) | 写真識別子4573151231068。NOA1.8gの写真。 |
| NOA Jr. 1.2g ゴールドエンド | [4573151231044](https://store.castingnet.jp/shop/g/g4573151231044/) | 同じNOA1.8g写真。 |
| NOA Jr. 1.2g Mr.御殿場 | [4573151231112](https://store.castingnet.jp/shop/g/g4573151231112/) | 写真識別子4571385596854。NOA1.8gの写真。 |
| NOA 1.5g Mr.御殿場 | [4573151231129](https://store.castingnet.jp/shop/g/g4573151231129/) | 同じNOA1.8g写真。 |
| NOA 2.1g Mr.御殿場 | [4571385600599](https://store.castingnet.jp/shop/g/g4571385600599/) | 自身の商品コードの画像だが、拡大・回転で本体の1.8g刻印を確認。代表画像の注記もある。 |

上の最初の4件は自動収集の「自SKU画像が必要」という条件ではタイムアウトした。通常ブラウザーで再確認したところ別SKUの1.8g写真だったので、単なるアクセス不能ではなく重量不一致として保留にした。NOA1.8gのゴールドエンド・Mr.御殿場は対象重量の写真なので、それぞれの正しい個別商品ページを採用した。

[指定N.03例](https://store.castingnet.jp/shop/g/g4573151242095/)はNOA1.8g、#80 N.03、商品コード・写真の一致を確認。NOA1.5g、NOA S1.4gは別商品コードで登録し、同じ色番号の別名カラーには適用しない。

追加照合として、同番号の未登録行も一覧と突き合わせ、#75 N.02（'11奥山カラー）の表記候補5ページを個別確認した。店側はN.O2（2011奥山カラー）表記だが、メーカー・モデル・重量・75番・奥山カラー・2011年が一致し、それぞれの写真の台紙に75番と対象重量（NOA1.5/1.8g、Jr.0.9/1.2/1.4g）がある。対象SKUの実物写真として5件追加承認。表記差を理由に他色へ共有せず、各行の元の色名とIDを保持する。[N02_CANDIDATES.json](N02_CANDIDATES.json)と[OTHER_VERIFIED_PRODUCTS.json](OTHER_VERIFIED_PRODUCTS.json)に根拠を残した。裏面・UV/グローは未確認。合計はキャスティング150件、なつめ釣具1件の151URL。

## 城峰釣具店・なつめ釣具

既存の全114商品ページを再確認し、111URLはHTTP200、3URLは404。[CURRENT_LINK_HEALTH.json](CURRENT_LINK_HEALTH.json)にタイトル・ハッシュ・画像参照の有無を記録。HTTP200だけで全掲載写真の再目視済みとは扱わず、以前の重量別目視記録を引き継ぐ。

- 蛍光ピンク `190933920` とグロー `190934095`: 各8重量、計16行。今回の各重量に一致するキャスティングの個別写真ページへ代替。
- 追加でNOA S1.0g 2024福田カラー `183533564` が404。www付きも404。1行を[なつめ釣具の同一JAN4573151270579](https://store.shopping.yahoo.co.jp/fishing-natsume/4573151270579.html)へ代替。NOA-S台紙のWeight1.0g、本体1.0g刻印、表の緑金/蛍光緑端・裏の黒を目視確認。商品名で年と福田カラーを照合した。[OTHER_VERIFIED_PRODUCTS.json](OTHER_VERIFIED_PRODUCTS.json)参照。
- [NOA1.8g エルドラド](https://fishing-shop-jh.com/?pid=176993639)はHTTP200、NewDrawerコラボ・JAN4573151264752を再照合し既存リンクを保持。
- 2026 FORODOXは4モデル×6色の既存リンクを保持。重量共通の写真を重量別実物写真の確認件数へ繰り上げない。画像直リンクだけを削除する。

404旧新URL・モデル・重量・カラーの17行は [REPLACEMENTS.csv](REPLACEMENTS.csv)。元データの旧URLとユーザー保存URLは書き換えず、アプリの既定参照だけを代替する。

## プロショップオオツカ

[NOA1.8g一覧](https://www.fishing-otsuka.co.jp/troutshopjp/ja/index.php?maker%5B0%5D=0115&cc=0002&kc=0003&model=0004&type=0008)を通常ブラウザーで開いたが、Just a momentのアクセス確認画面が継続。回避せず、新規写真の根拠として採用しない。既存リンクは保持。オオツカ限定F.S05(UV)/T.H01等も番号・類似名だけで代替しない。

## t-Route

次の公開商品ページと公開商品データを確認。登録色のバリエーションはあるが、各色に画像を関連付ける `image_id` が全件null。各ページ5画像の共通見本から全色の個別写真対応を推測しない。

| ページ | バリエーション数 | 個別画像の関連付け |
| --- | ---: | ---: |
| [NOA-S](https://t-route.net/products/%E3%83%8E%E3%82%A2%E3%82%A8%E3%82%B9) | 79 | 0 |
| [NOA Jr.1.2g](https://t-route.net/products/noa-jr-1-2g-%E3%83%8E%E3%82%A2jr-1-2g) | 36 | 0 |
| [NOA Jr.1.4g](https://t-route.net/products/%E3%83%8E%E3%82%A2jr) | 38 | 0 |
| [NOA Jr.0.9g](https://t-route.net/products/noa-jr-0-9g-%E3%83%8E%E3%82%A2jr-0-9g) | 34 | 0 |

PR45で確認済みのRoute21/Liberty（NOA1.8g）はそのまま維持。他重量に拡張しない。

## 残る不足

未登録325行は [HELD.csv](HELD.csv)。既存の有効ページはあるが対象重量の個別写真が未確認の131行も含めた456行は [PHOTO_UNCONFIRMED.csv](PHOTO_UNCONFIRMED.csv)。モデル・重量・元の色名・候補URL・理由を残した。撮影の際もラベル・重量・限定年/コラボを照合し、表裏が違う色は両面を撮る。

吉やの5色見本はジキル刻印、集合・代表画像や他重量しかないページ、旧版と2025セレクトの塗装一致が未確定な色、JOINTERの裏面説明を独立色として登録した疑いがある行は前回の保留を引き継ぐ。全店の全商品を確認できたとは主張しない。未確認行を個別写真のカバー件数へ含めない。
