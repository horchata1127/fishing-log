# RC40 検証結果

実施日: 2026-11-15

## 実行結果

| 検証 | 結果 |
| --- | --- |
| `npm.cmd test` | 663件成功、失敗・スキップなし |
| `node --test tests/catch-registration.test.mjs` | 最終リファクタリング後63件成功 |
| `npm.cmd run build` | アプリ型チェック・本番ビルド・Service Worker生成成功 |
| `npm.cmd run test:e2e:typecheck` | 成功 |
| 関連E2E 6ファイル（下記） | デスクトップ／iPhone 13相当Chromiumで32件成功 |
| 最終リファクタリング後のRC40 E2E再実行 | 6件成功 |
| `npx.cmd playwright test -c playwright.offline.config.ts -g RC40` | デスクトップ／モバイルで2件成功 |
| `git diff --check` | 成功 |

関連E2Eの実行コマンド:

```powershell
npx.cmd playwright test tests/e2e/rc40-color-change.spec.ts tests/e2e/fishing-log.spec.ts tests/e2e/fish-species.spec.ts tests/e2e/rc24-actions.spec.ts tests/e2e/rc32-visual-input.spec.ts tests/e2e/rc38-moca.spec.ts
```

## 要件ごとの確認

- 前回と同じ: 従来どおり即保存。モデル・カラー、アクション、魚種・配色等の既存回帰テストが成功。
- 同一モデル: 同名の別モデルを含めた合成データでもモデルIDで除外。実マスターのMOCA DR-Fでもミルクココア→さちおの茶を保存。
- 所有優先: 非所有の赤より所有の青を先頭表示。未確認・仮登録を実所有として扱わない。
- 未所有カラー: 選択・保存が可能。保存前後の所有テーブルが一致する。
- 保存ID: 正しい `lureVariantId` と、その参照先 `modelId` を確認。選択時点では全テーブル不変。
- キャンセル: DB・フォームを保持。選択後もメモ、全長、レンジを保持。
- 例外: 初回、別釣行、直前が手入力のみの場合は無効。カラー名なしの旧記録を所有IDから解決。色のないモデルは単体テストで確認。
- 検索・画面幅: 検索結果なしから戻れる。390pxと320pxでボタンの幅、44px以上の高さ、横方向の文字切れがないことを確認。
- 編集・バックアップ: 編集画面に新ボタンなし。既存編集、バックアップのダウンロード・UI復元後の全テーブル一致を確認。
- オフライン: 本番ビルドとService Workerを利用。ネットワーク無効状態でブラウザーを起動し、検索・未所有カラー選択・保存を実行。圏外のまま再起動してIDとフォーム由来の値の永続化、既存釣果・所有情報の保持を確認。

## 未検証・注意点

- 実機iPhone Safari／WebKitでは未検証。モバイルE2EはChromiumでiPhone相当の画面・タッチ条件を使用。
- E2E全スイートは実行せず、変更に関連する上記6ファイルとRC40圏外テストを実行。
- UIから正常に作成できない「モデル特定済みだがカラー一覧が空」の状態は単体テストで確認。
- ビルドには500kB超の既存メインチャンクに関する警告があるが成功する。
- 単体テストの既存SSRハーネスには子コンポーネントのrender未設定警告がある。ブラウザテストでは未処理例外なし。
