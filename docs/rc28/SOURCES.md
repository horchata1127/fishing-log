# RC28 出典

照合日: 2026-10-19。メーカー公式を優先し、重量別JANや販売店の製品別バリエーションで組み合わせを確認した。資料は在庫数ではなく製品の存在確認に使用した。

## メーカー公式

| 製品 | 出典 | 採用根拠 |
| --- | --- | --- |
| 通常WAH | https://www.luckycraft.co.jp/product/area/wah.html | 37F=37mm/2.3g。RC HF/FⅡとの区別に使用。通常色はRCへ流用しない |
| TIMON一覧 | https://www.jackall.co.jp/timon/products/category/spoon/ | 正式製品名と対象シリーズ |
| ティアロ | https://www.jackall.co.jp/timon/products/lure/spoon/tearo/ | 1.3/1.6/1.9g、22mm、色ごとの重量別JAN |
| ちびティアロ | https://www.jackall.co.jp/timon/products/lure/spoon/chibitearo/ | 0.8/1.0/1.2g、19.4mm、色ごとの重量別JAN |
| アピード！ | https://www.jackall.co.jp/timon/products/lure/spoon/apeed/ | 2.3/2.7/3.3g、27.7mm、色ごとの重量別JAN |
| リクーゼ | https://www.jackall.co.jp/timon/products/lure/spoon/rekuze/ | 0.6/1.0/1.7g、19.5/22.3/26mm、色ごとの重量別JAN |
| ちびクワトロ | https://www.jackall.co.jp/timon/products/lure/spoon/cibi-quattro-spoon/ | 仕様表0.4/0.6/0.8g、22mm。重量記載のある4色を2重量で確認 |
| ロミー | https://www.jackall.co.jp/timon/products/lure/spoon/rhomy/ | 2.1/2.4g=31mm、3.1/3.9g=37mm。12色それぞれ4重量のJANを確認 |

[TIMON_CAPTIONS.json](TIMON_CAPTIONS.json) は色名・重量・JANの事実データを保持する。全角ｇ/半角カナのNFKC照合、同じ色の重複表示の除去を行う。掲載された重さだけを採用し、別重量へ色を展開しない。

## RCワウと販売店補完

- [Fish Hook RCワウ37HF](https://www.fish-hook.net/products/lucky-craft-wah-37f): 37mm/2.0g/HF/ガラスラトル2個、初期11色とJAN。
- [t-Route RCワウ37HF](https://t-route.net/products/rc-wah37hf-rcワウ37hf): RC17色。No.と原名を保存。
- [t-Route RCワウ37FⅡ](https://t-route.net/products/予約商品-2025年12月下旬頃お届け予定-rc-wah37fⅱ-ワウ37fii): 37mm/2.5g/スローフローティング/ガラスラトル2個とRC17色。
- [t-Route HF 1091](https://t-route.net/products/rc-wah37hf-2025-1091-color-rcワウ37hf-2025-1091カラー): 三ヶ日みかん、キラキラウォーターメロン、18井野。店舗バリエーションの番号を保存。FⅡへ流用しない。
- [t-Route HF有頂天](https://t-route.net/products/rc-wah37hf-uchoten-color-rcワウ37hf-有頂天カラー): オラオラオレンジ、スケスケピンク、ドンチャックドン。
- [吉や 有頂天HF/F2](https://www.kitiya.jp/?pid=188884454): 3色×HF/F2の販売表を確認。売り切れ行も存在確認に含む。
- [HAMA F2有頂天](https://hama.shop-pro.jp/?pid=193898526): F2有頂天の製品確認に参照。
- [プロショップオオツカ RCワウ](https://www.fishing-otsuka.co.jp/troutshopjp/ja/index.php?m=keyword&keyword=RCワウ): 製品カードの37HF/FII・重量・色・JAN。ヒーローズ各2色、FⅡの2026シグネイチャー4色を補完。33HFのカードは今回の登録に使用しない。
- [プロショップオオツカ ちびクワトロ](https://www.fishing-otsuka.co.jp/troutshopjp/ja/index.php?m=keyword&keyword=ちびクワトロ): 重量別の商品カードで補完。公式と同じJANの代悟/ダイゴやⅡ/II等は同じ重量の原名エイリアスとして保持する。

[SHOPIFY_EVIDENCE.json](SHOPIFY_EVIDENCE.json) は上記Shopify店舗の商品バリエーションと仕様の事実データ。[RETAILER_EVIDENCE.json](RETAILER_EVIDENCE.json) はカードごとの型式・重量・色番号・色名・JAN・限定区分と直接URL。各登録色から原資料に追跡できる。

カラー番号が公式に示されない場合は空欄とし、画像の並び順から採番しない。JANは13桁とチェック桁を検証する。公式ティアロ1.6gのゴールドはJANが12桁のため、その値を修正推測せず、重量・色の存在確認だけを採用しJANは空欄とした。

未確認事項は [PENDING.json](PENDING.json)。ちびクワトロの公式色を全重量へ一律展開しない。公式見出しのSIZE 5と仕様表3重量の差も保留。実在が確認された色でも別重量の販売根拠がなければ、その重量には追加しない。
