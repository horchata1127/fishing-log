# RC25 PR3 検証結果

2026-10-18実施。PR #23のGitHub API上の`merged: true`、merge commit `3130543840ca1388cfc89449bdf85fe00fd114ed`と作業基点の一致を確認。

| 検証 | コマンド／方法 | 結果 |
| --- | --- | --- |
| 単体全体 | `npm test` | **436件成功**（既存427＋タイムライン6＋地点再利用3） |
| E2E全体 | `npx playwright test` | **76件成功**（既存68＋新規4シナリオ×デスクトップ／iPhoneサイズ） |
| オフライン全体 | build後 `npx playwright test -c playwright.offline.config.ts` | **24件成功**（既存22＋新規の完全終了・圏外再起動×2サイズ） |
| アプリ型検査・build | `npm run build` | `vue-tsc -b`・Vite・PWA出力成功。JS 551.19kB／gzip 138.84kB、precache 12件。既存の500kB超チャンク警告は継続 |
| テスト型検査 | `npm run test:e2e:typecheck` | 成功 |
| 形式・データ保護 | `git diff --check`、保護ファイルのmainとのバイト比較、未追跡SHA256照合 | 整合。元の未追跡11ファイルを保持 |

## 新規検証の範囲

- 日本イワナセンター2026-10-17、06:03:12.160〜15:25 JST、7匹の指定時刻を使用。UTC/JSTの日付境界と`fishingDate`不一致を保持。日時は実記録相当、その他の試験用レコード・取得履歴は合成。
- PR2の実アーカイブ応答フィクスチャと出典情報を再利用。元JSONのSHA256は変更していない。欠損試験では試験内のコピー1点のみnullにし、0℃にしないこと、線が2区間になることを確認。
- 時刻順、釣行境界に対する横位置、44px操作領域、重なりのない同時刻マーカー、タップ詳細、エリアフィルタ、未設定含有、ズーム、画面全体の横はみ出し防止を確認。モバイル画像も目視確認。
- 時刻不明・概算・同時刻の合成イベントを別の使い捨て釣行で検証。実際のペレット散布の日時は作らない。旧イベント登録・バックアップ契約は変更しない。
- 時刻欠損・無効、終了未記録、記録範囲・JST一日分のフォールバック、時間外記録の保持を単体で確認。索引可能な空文字の開始日時でE2Eを実施し、気象パネルの無効日時処理も確認。
- 表示・フィルタ・タップ・候補選択のみの操作前後で全19テーブルを比較し、不変を確認。グラフからAPIへの通信は0回。
- facilityIdが異なる、施設名だけ一致、施設IDなし、保存元が新しい、保存済み地点あり、保存元が変更済み、といった再利用の拒否を確認。複数地点と同一地点の集約を単体で確認。
- 明示保存では対象の地点レコードだけ追加され、元の地点と他18テーブルが不変。保存と同時に通信しない。保存元・施設変更と保存済み地点の競合時は拒否。
- 全19テーブルを含む気象ありv7バックアップを往復。DB v8の移行保護、旧v1〜v6入力、施設の競合拒否と履歴保護は既存テスト全体を維持して確認。
- 本番相当buildを使い、隔離した永続プロフィールを完全終了してオフライン再起動。保存気温・7マーカー・詳細・地点候補・明示保存と再起動後の保持を確認。既存PWA更新・入力保護試験も成功。

## 変更ファイル

| ファイル | 内容 |
| --- | --- |
| `src/components/FishingScreen.vue` | 釣行詳細にタイムラインを接続 |
| `src/components/TripTimeline.vue` | SVG、タップ詳細、フィルタ、ズーム、出典・地点情報 |
| `src/components/TripWeatherPanel.vue` | 読み取り結果の共有、候補選択と明示保存、無効日時の防御 |
| `src/utils/tripTimeline.ts` | UTC軸・JST表示、欠損分割、エリア・精度・衝突配置 |
| `src/utils/weatherLocationReuse.ts` | 同じ施設の過去の手動地点の読み取り・競合検証保存 |
| `tests/trip-timeline.test.mjs` | タイムライン単体6件 |
| `tests/trip-weather.test.mjs` | 隔離DBでの地点再利用・v7往復3件追加 |
| `tests/timelineFixture.ts` | 保存済み気象の合成シナリオと19テーブル観測 |
| `tests/e2e/trip-timeline.spec.ts` | 新規E2E4シナリオ |
| `tests/offline/trip-timeline.spec.ts` | 完全終了後の圏外グラフ・地点再利用 |
| `docs/rc25-pr3/IMPLEMENTATION.md` | 操作・保護方針・制約・実機手順 |
| `docs/rc25-pr3/VALIDATION.md` | 本結果と変更一覧 |
| `docs/rc25-pr3/PR_BODY.md` | Draft PR説明 |

DB定義・バックアップ処理・正式施設JSON・配布ゲート・依存関係・Vite/PWA設定・workflow・共有帰属表示はmainと同一。アプリへの候補座標／実気象フィクスチャの取り込みはない。

自動試験はlocalhost専用originと一時プロフィール／fake-indexeddbのみを利用。本番DB・iPhoneのIndexedDB・実バックアップは変更していない。実機Safari／ホーム画面PWAは未確認。[実機手順と残存事項](IMPLEMENTATION.md#iphone実機での確認手順レビュー環境)を参照。
