# RC36 設計

- ベースはRC35統合済み `origin/main` (`18da74b`)。専用ブランチ `feature/rc36-trip-summary-export-share`。既存未追跡資料を変更しない。
- 釣行に属するキャッチ・バラシのみを集計。時間は既存 `buildCatchSummary` の開始〜終了の有効な経過時間を用い、釣行中・不正期間には時速を表示しない。釣果時速はキャッチ／時間、反応時速は（キャッチ＋バラシ）／時間、小数1桁。
- ルアー集計はRC35の識別方式（variantId、所有ID、名前＋カラーと保存済み配色）を再利用。名称スナップショットを尊重し、マスター更新や所有登録は行わない。
- MVPは任意の `trips.summaryMvp`（名前・カラー・暫定フラグ）に保存。指定があれば優先。未指定はキャッチ最多の自動候補。同数はバラシ数、名称、識別キーの順。ゼロ釣果は候補なし。
- スキーマ変更・移行・新テーブル不要。MVPのあるバックアップのみv11。v1〜10読込と従来の自動バージョン選択を維持。
- HTMLカード専用Vueコンポーネントを `html2canvas` でPNG化する。既存画像ライブラリはない。SVG foreignObject依存を避け、シンプルなCSSと端末フォント、外部画像・Webフォントなしで構成する。ライブラリはローカルバンドル・PWA precache対象。
- カードは1080×1350、canvas scale 1。日本語・長文は改行／明示省略を行い、必要なら本文をフッターの内側に収まる倍率に調整する。サマリー表は上位8行と残件数・集計。ルアー表専用画像は14行ずつページ分割し全件を出力できる。プレビューとダウンロード・共有は同じPNG Blobを使う。
- MVP・ルアー表・メモ抜粋・気象要約を出力時に切替可能。設定は一時的な画面状態。変更・データ更新後は古いPNGを無効化し、再生成する。
- 共有は画像生成後、別のユーザークリックから `canShare({files})` を確認し `share` を呼ぶ。非対応・エラーはダウンロードと文面コピーに誘導。キャンセルは投稿成功扱いにも自動ダウンロードにもしない。X投稿画面へのリンクは文面だけで、画像はユーザーが添付する。
- 変更対象: database.ts / backup.ts、集計・MVP保存・画像生成ユーティリティ、サマリー・HTMLカードコンポーネント、FishingScreen / App、単体・E2E・圏外テスト。

## 参照した一次資料

- [html2canvas documentation](https://html2canvas.hertzen.com/documentation)：DOMからの描画、CSSの制約、Safari対応の記載。実機互換性の保証ではない。
- [html2canvas FAQ](https://html2canvas.hertzen.com/faq)：canvas面積の制約。標準出力は約1.46MPに抑える。
- [MDN Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)、[canShare](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)：ユーザー操作・ファイル対応確認・共有キャンセル等。

実iPhone Safari／ホーム画面PWAでの保存・共有は別途実機レビューが必要。ブラウザ・OS・Xの共有先受け取りを保証しない。
