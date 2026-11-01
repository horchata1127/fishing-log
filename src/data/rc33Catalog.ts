import type { LureCategory, VisualAppearance } from '../db/database'
export interface Rc33Color { name: string; code: string; aliases: string[]; purchase: number; sourceUrl: string; sourceTier: string; appearance?: VisualAppearance; imageUrl?: string }
export interface Rc33Target { manufacturer: string; manufacturerAliases: string[]; series: string; seriesAliases: string[]; model: string; modelAliases: string[]; length: number; weight: number; category: LureCategory; colors: Rc33Color[] }
// Reviewed 2026-11-01. CSV names retained except documented HERO'S aliases.
export const rc33Catalog: Rc33Target[] = [
  {
    "manufacturer": "SMITH",
    "manufacturerAliases": [
      "スミス"
    ],
    "series": "くるん",
    "seriesAliases": [],
    "model": "くるん タイプ1",
    "modelAliases": [
      "くるん Type 1",
      "くるん Type1",
      "くるん Type 1（1.1g）"
    ],
    "length": 45,
    "weight": 1.1,
    "category": "その他",
    "colors": [
      {
        "name": "FLピンク",
        "code": "01",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "pink"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_01.png"
      },
      {
        "name": "クリアーピンクBP",
        "code": "02",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "pink"
              ],
              "attributes": [
                "transparent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_02.png"
      },
      {
        "name": "FLレッドピンク",
        "code": "03",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "red"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_03.png"
      },
      {
        "name": "クリアーレッド",
        "code": "04",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "red"
              ],
              "attributes": [
                "transparent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_04.png"
      },
      {
        "name": "FLチャート",
        "code": "05",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "chartreuse"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_05.png"
      },
      {
        "name": "クリアーチャート",
        "code": "06",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "chartreuse"
              ],
              "attributes": [
                "transparent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_06.png"
      },
      {
        "name": "FLライムチャート",
        "code": "07",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "lime"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_07.png"
      },
      {
        "name": "カラシ",
        "code": "08",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "mustard"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_08.png"
      },
      {
        "name": "クリアーオリーブ",
        "code": "09",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "olive"
              ],
              "attributes": [
                "transparent"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_09.png"
      },
      {
        "name": "マットクリアーブラウン",
        "code": "10",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "brown"
              ],
              "attributes": [
                "transparent",
                "matte"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_10.png"
      },
      {
        "name": "マットブラウン",
        "code": "11",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "brown"
              ],
              "attributes": [
                "matte"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_11.png"
      },
      {
        "name": "オリーブドラブ",
        "code": "12",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "olive"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_12.png"
      },
      {
        "name": "マットブラック",
        "code": "13",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.smith.jp/product/trout/kurun/kurun.html",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "spoon",
          "regions": {
            "front": {
              "colors": [
                "black"
              ],
              "attributes": [
                "matte"
              ]
            }
          }
        },
        "imageUrl": "https://www.smith.jp/product/trout/kurun/c_13.png"
      }
    ]
  },
  {
    "manufacturer": "ロブルアー",
    "manufacturerAliases": [
      "ROB LURE",
      "ロブルアー×カルテラス"
    ],
    "series": "ルラン",
    "seriesAliases": [],
    "model": "ルラン 0.8g",
    "modelAliases": [
      "ルラン",
      "RURAN 0.8g"
    ],
    "length": 20.5,
    "weight": 0.8,
    "category": "その他",
    "colors": [
      {
        "name": "枝豆グロー",
        "code": "R1",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "しもペナ",
        "code": "R2",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "ピンキー",
        "code": "R3",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "頂鱒の素",
        "code": "R4",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "ホタルノヒカリ",
        "code": "R5",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "G6",
        "code": "R6",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "クロカワ",
        "code": "R7",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "イクラ",
        "code": "R8",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "マジョクロ",
        "code": "R9",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      },
      {
        "name": "スケスケオリーブハーフ",
        "code": "R10",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.kitiya.jp/?pid=193968893",
        "sourceTier": "retailer"
      }
    ]
  },
  {
    "manufacturer": "TIMON",
    "manufacturerAliases": [
      "ティモン"
    ],
    "series": "Pepino",
    "seriesAliases": [],
    "model": "Pepino DR-SS",
    "modelAliases": [
      "ペピーノ DR-SS"
    ],
    "length": 56,
    "weight": 2.6,
    "category": "クランク",
    "colors": [
      {
        "name": "蛍光ピンク",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "hot-pink"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_1.png"
      },
      {
        "name": "ヤジーボンズ",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "brown",
                "black"
              ],
              "attributes": [],
              "pattern": "spots"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_5.png"
      },
      {
        "name": "マサのドクリンゴ",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "light-green"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_7.png"
      },
      {
        "name": "ショボクレグロー/パンプキン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "olive",
                "black"
              ],
              "attributes": [
                "glow"
              ],
              "pattern": "spots"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_9.png"
      },
      {
        "name": "タッキーグロー/ブラウン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "salmon",
                "brown"
              ],
              "attributes": [
                "glow"
              ],
              "pattern": "spots"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_8.png"
      },
      {
        "name": "タッキーブラウン/オレンジ",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "dark-brown",
                "orange"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_4.png"
      },
      {
        "name": "シュガースポット",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "yellow",
                "black"
              ],
              "attributes": [],
              "pattern": "spots"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_2.png"
      },
      {
        "name": "シマシマグロー",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "brown",
                "ivory"
              ],
              "attributes": [
                "glow"
              ]
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_10.png"
      },
      {
        "name": "ラムレーズン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "wine"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_6.png"
      },
      {
        "name": "蛍光グリーン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "lime"
              ],
              "attributes": [
                "fluorescent"
              ]
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2020/08/pepino_3.png"
      },
      {
        "name": "タッキートロピカルグロー",
        "code": "",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "green",
                "orange"
              ],
              "attributes": [
                "glow"
              ],
              "pattern": "gradient"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2012/12/Pepino_2021NEW_01_re.png"
      },
      {
        "name": "イトカツハニーレモンZUV",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "pink",
                "lemon",
                "olive"
              ],
              "attributes": [
                "uv"
              ]
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2012/12/23bdeae454f977229ecba4a4f06aee69.png"
      },
      {
        "name": "MSTカルテットチャート",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "chartreuse",
                "orange",
                "pink"
              ],
              "attributes": [],
              "pattern": "gradient"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2021/11/6c278c5791f0c13067b6daa69cee3c69.png"
      },
      {
        "name": "完熟マンゴー",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "orange",
                "red"
              ],
              "attributes": [],
              "pattern": "gradient"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2012/12/fdbe1597a1408b598f4420d2f04c6f75.png"
      },
      {
        "name": "W蛍光パンチ",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.jackall.co.jp/timon/products/lure/crank/pepino/",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "chartreuse",
                "hot-pink"
              ],
              "attributes": [
                "fluorescent"
              ],
              "pattern": "gradient"
            }
          }
        },
        "imageUrl": "https://www.jackall.co.jp/timon/wp-content/uploads/sites/4/2012/12/3026b3d834ed59752c6eb43d15ea51c0.png"
      }
    ]
  },
  {
    "manufacturer": "Lucky Craft",
    "manufacturerAliases": [
      "ラッキークラフト"
    ],
    "series": "Wah",
    "seriesAliases": [],
    "model": "WAH 33F",
    "modelAliases": [],
    "length": 33,
    "weight": 1.7,
    "category": "クランク",
    "colors": [
      {
        "name": "九音",
        "code": "",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.fishing-shop-jh.shop-pro.jp/?cbid=2032714&csid=0&mode=cate&page=3&sort=n",
        "sourceTier": "retailer"
      },
      {
        "name": "満月",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.fishing-shop-jh.shop-pro.jp/?cbid=2032714&csid=0&mode=cate&page=3&sort=n",
        "sourceTier": "retailer"
      },
      {
        "name": "新月",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://www.fishing-shop-jh.shop-pro.jp/?cbid=2032714&csid=0&mode=cate&page=3&sort=n",
        "sourceTier": "retailer"
      }
    ]
  },
  {
    "manufacturer": "Lucky Craft",
    "manufacturerAliases": [
      "ラッキークラフト"
    ],
    "series": "Wah",
    "seriesAliases": [],
    "model": "WAH 37F",
    "modelAliases": [],
    "length": 37,
    "weight": 2.3,
    "category": "クランク",
    "colors": [
      {
        "name": "HAMI CHALLENGE",
        "code": "",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/fishing-shop-jh/wah37f.html",
        "sourceTier": "retailer"
      },
      {
        "name": "HAMI CHANCE!!",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/fishing-shop-jh/wah37f.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ケイムラ",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/fishing-shop-jh/wah37f.html",
        "sourceTier": "retailer"
      },
      {
        "name": "満月",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/fishing-shop-jh/wah37f.html",
        "sourceTier": "retailer"
      },
      {
        "name": "新月",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/fishing-shop-jh/wah37f.html",
        "sourceTier": "retailer"
      },
      {
        "name": "グリーングロー",
        "code": "",
        "aliases": [
          "HERO’Sグリーングロー（茶目）"
        ],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "レッドグロー",
        "code": "",
        "aliases": [
          "HERO’Sレッドグロー（赤目）"
        ],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "イリュージョンペレット",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ツタンカーメン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "GOKABO",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "Neoカメレオン",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ミリタリスト",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "イガムシ(グロー)",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "イガ源五郎虫",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ミリタリスト（マット）",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "Neoイリュージョンペレット",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ソルシエ（レッドグロー）",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "ブリアンオランジュRG",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://store.shopping.yahoo.co.jp/backlash/y-4514447308552.html",
        "sourceTier": "retailer"
      },
      {
        "name": "九音",
        "code": "",
        "aliases": [],
        "purchase": 0,
        "sourceUrl": "https://ameblo.jp/fishing-akasaka/entry-12975516059.html",
        "sourceTier": "retailer"
      }
    ]
  },
  {
    "manufacturer": "PALMS",
    "manufacturerAliases": [
      "パームス",
      "PALMS（パームス）"
    ],
    "series": "GANOFF",
    "seriesAliases": [
      "ガノフ"
    ],
    "model": "GA-24S",
    "modelAliases": [
      "GA24S",
      "ガノフ GA24S"
    ],
    "length": 24,
    "weight": 1.6,
    "category": "その他",
    "colors": [
      {
        "name": "ダークモカ",
        "code": "MT-933",
        "aliases": [],
        "purchase": 1,
        "sourceUrl": "https://www.palmsjapan.com/lures/product/?name=little-diner-ganoff",
        "sourceTier": "manufacturer",
        "appearance": {
          "version": 1,
          "paletteVersion": 1,
          "layout": "body",
          "regions": {
            "side": {
              "colors": [
                "lavender",
                "blue",
                "brown"
              ],
              "attributes": [],
              "pattern": "spots"
            },
            "dorsal": {
              "colors": [
                "dark-brown"
              ],
              "attributes": []
            }
          }
        },
        "imageUrl": "https://www.palmsjapan.com/lures/product/little-diner-ganoff/color/mt-933.jpg"
      }
    ]
  }
]
