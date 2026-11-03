# RC35 設計

- ベースは main `1cb06a9`。RC34はPR #34で統合済み。専用ブランチ `feature/rc35-weather-log-trip-notes` を使用。既存未追跡ファイルは変更・コミットしない。
- 釣行メモは既存 `FishingTrip.memo` を再利用し、明示保存と競合検出を行う。
- 自分で観測した空模様・風・複数の変化・補足メモを `WeatherObservation` として保存。未入力はフィールド欠落。前回値は表示候補に限り、明示選択するまで保存しない。
- 独立ログは既存 `tripEvents` の `type: weather`、釣果・バラシと同時のログは `CatchRecord.weatherObservation` に保存。同時ログの日時・釣行は釣果を参照し、編集・削除時も同期する。グラフ用複製は永続化しない。
- Dexie v10の既存ストア・インデックスで扱えるためDBスキーマ変更・データ移行は不要。既存個人データを初期化しない。
- バックアップは観測記録がある場合だけv10を出力。v1〜9復元・従来の自動バージョン選択を維持。v10も全テーブル検証後に既存の原子的復元を利用する。
- タイムラインは釣果の観測を表示時に展開し、気象専用レーン・衝突回避・詳細・表示切替を追加。時間帯別釣果にも同一の記録を時間位置に表示する。
- 日時は既存JST入力・検証を再利用。終了済み釣行は有効期間内の手動日時で登録できる。
- 変更対象: database.ts、tripEvents.ts、catchRegistration.ts、backup.ts、tripTimeline.ts、App.vue、FishingScreen.vue、TripEventEditor.vue、TripTimeline.vue、HourlyCatchChart.vue、新規気象入力・メモコンポーネント、単体/E2Eテスト。
- 指定バックアップは原本を変更せずfake-indexeddbの隔離DBで検証。実iPhone Safari/PWA操作は別途実機レビューが必要。
