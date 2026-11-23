# NOA写真・リンク拡充の検証

実施日：2026-11-23。`feat/noa-color-photos`。

| 検証 | 結果 |
| --- | --- |
| `npm.cmd run build` | 成功。Vue/TypeScript検査とPWA生成を含む。チャンクサイズ警告はあり。 |
| `npm.cmd test` | 718件すべて成功。 |
| `npm.cmd run test:e2e:typecheck` | 成功。 |
| `npx.cmd playwright test tests/e2e/rc43-noa-photos.spec.ts tests/e2e/rc43-photo-failures.spec.ts` | desktop/mobile Chromium計10件成功。 |
| `npx.cmd playwright test tests/e2e/noa-model-photo-links.spec.ts` | desktop/mobile Chromium計4件成功。 |
| `npx.cmd playwright test -c playwright.offline.config.ts tests/offline/rc43-noa-photos.spec.ts` | desktop/mobile計2件成功。PWAのオフライン冷起動を含む。 |
| `node scripts/audit-noa-color-photos.mjs` | 最新カタログ713行・101グループ。写真0、リンク追加73、保留380、既存リンク維持260。 |
| `git diff --check` | 成功。 |

単体検証：モデル/重量/メーカー/名前の完全照合、同名・同番号の別色の分離、供給リンクの読み取りでDBへ書き込まないこと、再起動後の参照、ユーザーの共通/専用リンクの優先と明示的な削除の保持、既存写真・全既存テーブルの保存、写真の表裏・モデル別優先順位、写真バックアップの重複排除・競合・不正ファイルのロールバックを確認。

画面検証：カステラのJr.0.9g専用リンクが辞書と釣果入力に表示され、写真を確認していないNOA1.8gへ流用されないことを確認。最新713行を個人データを含まない合成釣行データと合わせて読み込み、エルドラド1.8gの正しいURL、FORODOX全6色の保留表示、既存データの不変を確認。RC43の画像保存・表裏・拡大・差し替え・削除・写真バックアップ復元も再検証。

オフライン検証：保存済み写真がブラウザー終了後のオフライン冷起動でも表示されることを確認。未登録面は既存SVGへ戻り、外部リンクは通信が必要な旨を表示し、ルアー選択や入力中のメモを失わない。

最初の全体テストでは、釣果テスト専用コンパイルハーネスに新しいデータファイルの依存解決がなく失敗した。同ハーネスにファイルとパス変換を追加し、全718件を再実行して成功。新規画面テストでは、配色推定のないFORODOXは汎用アイコンを使う既存仕様に合わせて検証を修正した。

最新原本は読み取りのみ。SHA-256は抽出時と終了時を照合。ユーザー所有・釣果をテスト結果や公開カタログへコピーしていない。写真を含まないRC45釣行バックアップから端末内の写真の有無は判定しない。実機iOS/Safariと実端末の保存済み写真は未検証。テスト内の画像は合成テスト画像であり実物写真追加件数には含めない。
