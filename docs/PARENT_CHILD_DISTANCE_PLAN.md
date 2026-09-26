# 親子距離表示機能 実装手順書（Geolocation + Supabase Realtime）

## 背景
親のスマホで「子供が自分から何m離れているか」をリアルタイムに見られる機能を追加する。
Web Bluetooth は iOS 非対応・スマホ同士で接続不可・RSSI 取得が実験機能のため不採用。
代わりに両端末で Geolocation API により位置を取得し、Supabase Realtime（中身は WebSocket）で親子の座標を互いに送り合い、Haversine 公式で距離を計算する。

さらにゲーム性として、子供が親から離れすぎると **「脱出状態」** になりゲームが止まる。
子供は親に近づくことで親が設定した **「復活の鍵」** を手に入れ、ゲームに復帰できる。

前提と方針:
- 既存構成は React 19 + Vite の SPA。ルーターなし（`src/App.jsx` が start-screen → ArScene を state で切替）。
- DB テーブルは使わず **Realtime Broadcast / Presence** のみ使う（保存不要・RLS 設計不要で最速）。
- **ルームコードはサーバーではなく親が設定する。** 親が入力したコードを「チャンネル名」かつ「復活の鍵」として使う。認証なし。
- 既存 hook の書き方（`src/utils/ar/useDeviceOrientation.js` の permission state + ref パターン）に合わせる。
- 新規コードは `src/utils/tracker/` と `src/components/tracker/` に置く。AR 側への変更はゲームのロック処理（Phase E）のみ。

### ペアリングと鍵の扱い
- 親子が一緒にいる冒険開始時に、子供の端末へコードを一度だけ入力してチャンネルに接続する。
- 子供の端末はコードを **チャンネル接続のためだけに内部保持** し、画面には表示しない。
- 脱出状態になると子供側は「鍵を失った」扱いになる。復活は **コードの再入力ではなく、親に近づいたときに親端末から鍵が自動で届く** ことで行う。
- 子供がコードを覚えていても手入力では復活できない仕様にし、「親に近づく」ことを唯一の復活条件にする。

### 状態遷移（子供側）
```
playing ──(距離 > 50m が 5秒継続)──▶ escaped
escaped ──(距離 < 10m が 3秒継続 → 親から鍵を受信)──▶ playing
```
- 脱出と復活でしきい値を分ける（ヒステリシス）ことで、GPS の揺れによる状態のバタつきを防ぐ。

---

## Phase A: Supabase 導入と接続基盤（PR #1）

- **[A-1]** Supabase プロジェクトを作成し、Realtime が有効であることを確認する。
- **[A-2]** `npm install @supabase/supabase-js` を実行する。
- **[A-3]** `.env.local` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_PUBLISHABLE_KEY` を追加し、`.env.example` にキー名だけ記載する。`.gitignore` に `.env.local` が含まれることを確認する。
- **[A-4]** `src/utils/tracker/supabaseClient.js` を作成し、`createClient` で単一インスタンスを export する。環境変数が未設定なら console.error を出す。
- **[A-5]** 動作確認用に、2タブ間で Broadcast の送受信ができることを一時コードで確認する（PR には含めない）。

## Phase B: 位置取得と距離計算ロジック（PR #2）

- **[B-1]** `src/utils/tracker/haversine.js` を作成する。`distanceMeters(a, b)` で2点 `{lat, lng}` 間の距離（m）を返す純関数。
- **[B-2]** `src/utils/tracker/useGeolocation.js` を作成する。
  - `navigator.geolocation.watchPosition` を `enableHighAccuracy: true, maximumAge: 0, timeout: 10000` で購読。
  - 返り値は `{ position, accuracy, permission, error, start, stop }`。`permission` は `'unknown' | 'granted' | 'denied' | 'unsupported'`。
  - `start()` はユーザー操作（ボタンタップ）内で呼ぶ前提にする（iOS 対策）。
  - アンマウント時に `clearWatch`。
- **[B-3]** `accuracy`（誤差 m）が大きすぎる値（例: 100m 超）は捨てるフィルタを入れる。
- **[B-4]** `src/utils/tracker/roomCode.js` を作成する。親が入力したコードの形式チェック関数（6〜12文字の英数字）と、チャンネル名への変換関数（`'tracker:' + code`）を置く。

## Phase C: Realtime チャンネル hook（PR #3）

- **[C-1]** `src/utils/tracker/useLocationChannel.js` を作成する。引数 `{ roomCode, role }`（role は `'parent' | 'child'`）。
  - `supabase.channel('tracker:' + roomCode)` に subscribe。
  - 親子どちらも `sendLocation({lat, lng, accuracy, ts})` で `event: 'location'` を broadcast する。子供側も距離を表示するため双方向にする。
  - 相手の `event: 'location'` を受信して `peerLocation` state に保存。
  - 接続状態 `status`（`'connecting' | 'connected' | 'error'`）を返す。
  - アンマウント時に `supabase.removeChannel`。
- **[C-2]** 送信の間引きを入れる。前回送信から 2 秒未満かつ移動 3m 未満なら送らない。
- **[C-3]** Presence を使い、互いに「相手が接続中か」を表示できるようにする（`channel.track({ role })`）。
- **[C-4]** コードの重複対策を入れる。親が接続した時点で Presence に別の親がいれば「このコードは使用中です」を返し、別コードの入力を促す。
- **[C-5]** 最終受信時刻 `lastSeenAt` を返し、30 秒以上更新がなければ「通信が途切れています」を判定できるようにする。

## Phase D: 画面実装（PR #4）

- **[D-1]** `src/App.jsx` にモード切替を追加する。start-screen に「見守りモード」ボタンを足し、`mode` state（`'game' | 'tracker'`）で分岐。既存の AR 起動フローは変更しない。
- **[D-2]** `src/components/tracker/RoleSelect.jsx` を作成する。「親として使う」「子供として使う」を選ぶ画面。
- **[D-3]** `src/components/tracker/ParentView.jsx` を作成する。
  - 親が「復活の鍵」となるコードを入力して冒険を開始する。
  - 自分の位置と `peerLocation` から `distanceMeters` を計算して「約 ○○ m」を表示。
  - 両者の accuracy の合計を「誤差 ±○○ m」として併記。
  - 子供の接続状態、最終更新時刻、子供の状態（`playing` / `escaped`）を表示。
- **[D-4]** `src/components/tracker/ChildView.jsx` を作成する。親の横で親が設定したコードを入力 → 開始ボタン → 接続完了で入力欄を消す。「画面を開いたままにしてね」の注意書きを出す。
- **[D-5]** 距離に応じた表示の色分け（例: 〜20m 緑、〜50m 黄、50m〜 赤）を CSS で実装する。

## Phase E: 脱出状態と復活の鍵（PR #5）

- **[E-1]** `src/utils/tracker/useEscapeState.js` を作成する。子供側の状態 `'playing' | 'escaped'` を管理し、冒頭の状態遷移（50m 超が 5 秒継続で脱出）を実装する。距離は accuracy を考慮し、誤差が大きいときは判定を保留する。
- **[E-2]** 脱出したら子供側から `event: 'escaped'` を broadcast し、親側に「子供がダンジョンから脱出しました」と表示・`navigator.vibrate` する。
- **[E-3]** 親側で「脱出中の子供が 10m 以内に 3 秒継続して入った」ことを判定し、`event: 'revive'` で鍵（親が設定したコード）を送る。距離判定は親端末で行い、鍵の送信元を親に限定する。
- **[E-4]** 子供側は `revive` を受信し、鍵がチャンネル接続時のコードと一致すれば `playing` に戻して `event: 'revived'` を返す。手入力による復活手段は用意しない。
- **[E-5]** `src/components/tracker/EscapedScreen.jsx` を作成する。脱出中の子供に「親に近づいて復活の鍵を手に入れよう」と親までの距離を表示し、近づくほど演出を強める（色・揺れ）。鍵入手時は復活演出を出す。
- **[E-6]** ゲームとの接続。`App.jsx` で子供が `escaped` の間は ArScene の上に EscapedScreen を重ね、攻撃操作を無効にする。

## Phase F: 実機対応と仕上げ（PR #6）

- **[F-1]** 子供側で Screen Wake Lock API（`navigator.wakeLock.request('screen')`）を使い、画面スリープで送信が止まるのを防ぐ。非対応端末では注意書きのみ。
- **[F-2]** 位置情報の拒否時に、iOS / Android それぞれの設定手順を表示する（既存の start-screen の拒否メッセージと同じ形式）。
- **[F-3]** 通信が途切れた場合の扱いを決めて実装する。子供側は 30 秒以上親の位置が届かなければ安全側に倒して `escaped` にする。
- **[F-4]** `docs/` に機能の使い方と制約（屋内で精度低下、バックグラウンド不可、しきい値の根拠）を追記する。

---

## 主な変更・新規ファイル
- 変更: `src/App.jsx`, `package.json`, `.gitignore`（必要なら）
- 新規: `src/utils/tracker/{supabaseClient,haversine,useGeolocation,roomCode,useLocationChannel,useEscapeState}.js`
- 新規: `src/components/tracker/{RoleSelect,ParentView,ChildView,EscapedScreen}.jsx`
- 新規: `.env.example`

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. PC で `npm run dev` し、2タブで親・子を開いて DevTools の Sensors で子の位置を変え、双方の距離表示が更新されることを確認。
3. 同じく Sensors で子を 50m 以上離して脱出状態になること、10m 以内に戻して鍵が届き復活することを確認。
4. 同じコードで2人目の親が入ろうとしたとき「このコードは使用中です」が出ることを確認。
5. `npm run tunnel` で HTTPS 公開し、iPhone Safari と Android Chrome の実機2台で親子をそれぞれ担当して屋外で歩き、脱出と復活が一連で動くことを確認。
6. 子の画面を閉じて 30 秒後に親側で「通信が途切れています」が出ることを確認。
