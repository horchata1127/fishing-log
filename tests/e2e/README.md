# Fishing Log E2E

## 初回セットアップ

プロジェクトのルートで実行します。

```powershell
npm.cmd ci
npx.cmd playwright install chromium
```

Playwright専用Chromiumを使用します。通常のChromeプロフィール、CDP接続、永続プロフィールは使用しません。

## 実行

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:typecheck
npm.cmd run test:e2e
git diff --check
```

`npm.cmd test`は従来のNodeテストだけを実行します。E2Eは`tests/e2e/`から5シナリオをPC・モバイルの2プロジェクトで実行します（計10件）。

```powershell
npm.cmd run test:e2e -- --project=desktop-chromium
npm.cmd run test:e2e -- --project=mobile-chromium
npm.cmd run test:e2e:ui
npm.cmd run test:e2e:report
```

UIモード、HTMLレポート閲覧は必要なときに手動で起動します。iPhone 13相当の画面・タッチ設定もChromiumで実行し、実機Safari検証とは区別します。

## データ隔離

- 専用Viteサーバー：`http://127.0.0.1:4177`。既存Viteの`base`設定に従い、画面は`/fishing-log/`へ転送されます。
- ポート占有時は失敗します。既存サーバーの再利用や別ポートへの自動切り替えはありません。
- 各テストに新しい非永続BrowserContextを用意し、開始時に12テーブルが空であることを確認します。
- テストページは専用origin以外のHTTPリクエストを拒否します。
- カタログは合成メーカー1・シリーズ1・モデル1・カラー2。所有状態の未設定・unverified・placeholderも合成レコードです。
- フィクスチャ投入はテスト画面の復元操作を使います。独立Contextの中だけで行います。
- IndexedDBの直接観測は読み取り専用の単一トランザクションです。テストにアプリの内部保存APIやデータ削除APIを公開していません。
- 実カタログJSON、実バックアップ、`docs/`はE2Eでは読み込みません。
- バックアップテストは別の新しいContextへ復元し、最後にそのContextを閉じます。

## シナリオ

| シナリオ | 主な検証 |
| --- | --- |
| A | 釣行開始、モデル・カラー選択、キャンセル、所有1件自動追加、2匹目の重複防止、前回と同じ、手入力への切替、ID消去、釣果・マイルアー一覧 |
| B | 初期候補8件と再投入、ライン設定、クランク用①、持参変更、保存時3lb、巻き替え後3.5lb、過去スナップショット不変、タックル未指定 |
| C | 実ダウンロードしたv4 JSONの12テーブル・参照確認、別Context復元、件数と3lb/3.5lb履歴、所有数・釣果数保持 |
| D | 横スクロールなし、重要ボタンの幅・位置、選択モーダル、モバイルモーダルの縦スクロールと保存 |
| 不正復元 | 存在しないロッドIDを拒否し、既存の合成DBが変わらないこと |

固定待機は使わず、locatorの自動待機、`expect`、`expect.poll`を使います。セレクターはrole・ラベルが中心で、非表示のファイル入力だけ`data-testid`を使用します。

## レポートと失敗証跡

- HTML：`playwright-report/index.html`
- 失敗時：`test-results/`内のスクリーンショット、trace ZIP、動画、エラー時の画面情報
- テスト用バックアップ：Cのテスト結果ディレクトリ内の`synthetic-v4-backup.json`

```powershell
npm.cmd run test:e2e:report
npx.cmd playwright show-trace "test-results/<対象テスト>/trace.zip"
```

成果物ディレクトリはGit対象外です。テスト再実行で上書きされるため、必要な失敗証跡は再実行前に別途保存してください。

CIへの組み込み、Safari・Firefox、実機iPhone、1,886カラーの実データによる性能検証は今回の対象外です。
