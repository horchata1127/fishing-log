# RC25 PR1 検証結果

実施日: 2026-10-18。基準main: `ad5036d`（PR #20、#21反映済み）。ブランチ: `feature/rc25-pr1-facility-coordinates`。

| 検証 | 実行 | 結果 |
| --- | --- | --- |
| 調査データ・監査表 | `node scripts/facility-coordinate-audit.mjs --check` | 成功。50 ID・正式名称・順序、元住所43/null 7、全50住所検索、7公式住所追記、出典、座標/null、pendingゲート、生成表の一致を確認 |
| 単体テスト全体 | `npm test` | 411件成功（今回追加6件を含む）。既存Stage6起動適用・不変性・DB v7・バックアップv6全16テーブル往復等を含む |
| 調査用テスト最終確認 | `node --test tests/facility-coordinate-research.test.mjs` | 6件成功。誤承認・配布フラグ・軸逆転・ID不整合・根拠のない点・未確認点への片軸入力を拒否。優先2施設の裏付けと住所代表点の除外を確認 |
| 関連E2E | `npx playwright test tests/e2e/stage6-pr4.spec.ts tests/e2e/facility-storage.spec.ts tests/e2e/trip-locations.spec.ts` | 18件成功。デスクトップ・iPhoneサイズのChromium。50/73起動・再起動・重複防止、検索、キャッチ/バラシ、エリア切替、ユーザー施設・過去snapshot保持 |
| 関連オフライン | `npx playwright test -c playwright.offline.config.ts --grep 'PR4 50/73\|offline user facility'` | 4件成功。50/73の圏外コールド起動、釣果/バラシ、ユーザー施設追加、snapshot、v6バックアップ、プロフィール完全再起動の保持 |
| build・アプリ型検査 | `npm run build` | 成功。`vue-tsc -b` とVite/PWA build。既存の500kB超チャンク警告あり（失敗ではない） |
| E2E型検査 | `npm run test:e2e:typecheck` | 成功 |
| 配布物 | `dist` のファイル名・JS/HTML/JSON/manifestを確認 | 座標候補、監査JSON、rc25-pr1への参照なし。Service Worker precacheにも調査ファイルなし |
| 既存ファイル | `git diff -- src public package.json package-lock.json .github`、正式マスターSHA-256 | 差分なし。DB、配布ゲート、全既存マスター、UI、依存、workflowを変更していない |
| 未追跡ファイル | 作業前後のパス・SHA-256比較 | 作業前の11物理ファイルすべて存在しハッシュ一致。削除・上書き・ステージなし |

正式マスターSHA-256:
`30514d6674b413a70e9d830b4e5a4230bc83b13feb4e2f876daeadd67d33fb9c`

ブラウザ試験は専用origin `127.0.0.1:4177` / `127.0.0.1:4188` と自動テストの隔離プロフィール・テストデータだけを使用した。単体DB試験はfake-indexeddb。通常ブラウザや公開サイトのIndexedDBへ接続・初期化・復元していない。本番バックアップを使っていない。

本PRは調査資料・検証スクリプト・テストの追加だけで、画面やアプリの挙動は変わらない。座標候補は未承認で、マスター更新・配布・DB保存を実装していない。E2E全体やオフライン全体を今回すべて再実行したという意味ではなく、上記の関連ケースを実行した。iPhone Safari実機は未確認。

未解決事項は[README](README.md)の保留7施設、地点種別・入口精度、資料の番地差、公開地図由来データの再配布条件。正式採用・有効化には別途レビューが必要。
