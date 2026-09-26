# 見守りモード専用化 実装手順書（React state 切替 + Vite 環境変数による開発用コード）

## 背景
今はプレイ画面に入る道が 2 つある。タイトル画面をタップするソロモード（`src/App.jsx` の `started`）と、「見守りモード」ボタン → 役割選択 → 子供がコード入力 → 「ダンジョンへ入る」の見守りモード（`src/components/tracker/ChildView.jsx`）である。
これを見守りモードだけにし、親子でつながっていないとプレイできないようにする。ただし戦闘（攻撃ボタン・手持ち・アイテム取得）は今ソロモードの画面にしかないので、子供のダンジョン画面へ移す。
また開発中は親の端末を毎回用意するのが手間なので、`.env.local` に `VITE_DEV_ROOM_CODE=TAKAJO1` を書くと、子供の画面でそのコードを入力するだけで親なしでプレイできるようにする。
ソロモードを隠しフラグで残す案は、入口が 2 つ残ったままで今回の目的に合わないので採用しない。環境変数名を `TAKAJO1` そのものにする案は、Vite が `VITE_` で始まる変数しかクライアントに出さないので採用しない。

前提と方針:
- 既存構成は React 19 + Vite 8 の SPA。ルーターはなく、`src/App.jsx` が state（`mode` / `started`）で画面を切り替えている。
- 戦闘ロジックは `src/App.jsx` から hook とコンポーネントに切り出して、`ChildView` で使い回す。書き方は既存の `src/utils/tracker/useEscapeState.js`（hook）と `src/components/tracker/EscapedScreen.jsx`（表示）の分け方に合わせる。
- 開発用コードの判定は純関数にし、`import.meta.env.DEV` が true（`npm run dev`）のときだけ効かせる。`npm run build` した本番では、変数が残っていても効かない。
- 開発用コードで入ったときは `useLocationChannel` に空の `roomCode` を渡して接続しない。こうすると `status: 'idle'` / `peerLocation: null` / `isStale: false` になる。`useEscapeState` は距離が出ないので脱出判定が起きず、既存 hook の変更はいらない。
- 新規コードは `src/utils/battle/`、`src/components/battle/`、`src/utils/tracker/devRoomCode.js` に置く。既存コードで変えるのは `src/App.jsx`、`src/components/StartScreen/StartScreen.jsx`、`src/components/tracker/ChildView.jsx`、`.env.example` だけにする。

### 画面遷移（変更後）
```
StartScreen ──(画面タップ)──▶ RoleSelect ─┬─▶ ParentView（コードを決めて見守る）
                                          └─▶ ChildView（コード入力）
ChildView コード入力 ─┬─(通常コード)──▶ 親との距離画面 ──(親と接続済みで「ダンジョンへ入る」)──▶ ダンジョン（戦闘 + 距離 HUD）
                     └─(開発用コード かつ dev)──▶ 親との距離画面（接続待ちなし）──(「ダンジョンへ入る」)──▶ ダンジョン（戦闘のみ・脱出なし）
```

---

## Phase A: 戦闘ロジックの切り出し（PR #1）

- **[A-1]** `src/utils/battle/useBattle.js` を作り、`useBattle()` を export する。`src/App.jsx` の戦闘まわりをそのまま移す。
  - 定数 `ATTACK_DAMAGE = 20`、`COOLDOWN_MS = 1000`、`ENEMY_MAX_HP = 100`、`ITEM_TOAST_MS = 1500` もこのファイルに移す。
  - 引数: `{ disabled = false }`。true のときは `handleAttack` が何もしない（脱出中に攻撃させないため）。
  - 返り値: `{ sceneRef, enemy, isCooldown, inventory, itemToast, handleEnemySpawn, handleItemCollect, handleAttack }`。
- **[A-2]** `src/components/battle/BattleHud.jsx` を作り、`BattleHud` を export する。`src/App.jsx` の `.ui-layer` の中身（手持ち一覧・「〇〇を手に入れた！」・攻撃ボタン）をそのまま移す。
  - props: `{ battle, disabled }`（`battle` は `useBattle` の返り値）。攻撃ボタンは `!battle.enemy || battle.isCooldown || disabled` のとき disabled にする。
  - `findItem` は `src/utils/item/items` から import する。CSS クラス名（`inventory` / `item-toast` / `attack-button`）は変えず、`src/App.css` のスタイルをそのまま使う。
- **[A-3]** `src/App.jsx` のソロ画面を `useBattle()` と `<BattleHud battle={battle} />` を使う形に書き換える。見た目と動きは変えない（この PR は切り出しだけにする）。

## Phase B: 見守りモード専用化（PR #2）

- **[B-1]** `src/components/StartScreen/StartScreen.jsx` から「見守りモード」ボタンと `onOpenTracker` / `notice` props を消し、画面タップで `onStart` だけを呼ぶようにする。JSDoc も「タップで見守りモード（役割選択）へ進む」に直す。`StartScreen.module.css` の `.trackerButton` と `.notice` は使われなくなるので消す。
- **[B-2]** `src/App.jsx` からソロモードを消す。
  - `started` / `mode` state を `const [screen, setScreen] = useState('title') // 'title' | 'tracker'` の 1 つにまとめる。
  - `StartScreen` の `onStart` は `setScreen('tracker')` だけにする。センサー権限の要求は子供が「ダンジョンへ入る」を押したとき（`ChildView` の `handleEnterDungeon`）に既にやっているので、ここではやらない。
  - `TrackerMode` の `onExit` は `setScreen('title')` にする。
  - Phase A で App に残した `useBattle` / `BattleHud` / `ArScene` の import と、コメントアウトした `DebugRemote` を消す。`useDeviceOrientation` は `TrackerMode` に渡すので残す。
- **[B-3]** `src/components/tracker/ChildView.jsx` のダンジョン画面に戦闘を入れる。
  - `const battle = useBattle({ disabled: escape.state === 'escaped' })` を呼ぶ。
  - `ArScene` に `sceneRef={battle.sceneRef}`、`onEnemySpawn={battle.handleEnemySpawn}`、`onItemCollect={battle.handleItemCollect}` を渡す。
  - `.ui-layer` に `<BattleHud battle={battle} disabled={escape.state === 'escaped'} />` を足す。距離 HUD・`EscapedScreen`・`RevivedBanner` はその上に重ねる（`EscapedScreen` が前面になる順番にする）。
  - hook は条件分岐の外（コンポーネントの先頭）で呼ぶ。
- **[B-4]** `src/components/tracker/ChildView.jsx` の JSDoc と、`TrackerMode.jsx` の `onExit` の説明（「ゲームの開始画面に戻る」→「タイトル画面に戻る」）を直す。

## Phase C: 開発用コード（PR #3）

- **[C-1]** `src/utils/tracker/devRoomCode.js` を作る。
  - `export const DEV_ROOM_CODE = import.meta.env.DEV ? normalizeRoomCode(import.meta.env.VITE_DEV_ROOM_CODE) : ''`
  - `export const isDevRoomCode = (code) => DEV_ROOM_CODE !== '' && normalizeRoomCode(code) === DEV_ROOM_CODE`（純関数。`normalizeRoomCode` は `src/utils/tracker/roomCode.js` のものを使う）
  - `DEV_ROOM_CODE` が `isValidRoomCode` を満たさない（6〜12 文字の英数字でない）ときは `console.warn` を 1 回出し、`''` 扱いにする。
- **[C-2]** `src/components/tracker/ChildView.jsx` で開発用コードに対応する。
  - `const devMode = isDevRoomCode(roomCode)` を足す。
  - `useLocationChannel({ roomCode: devMode ? '' : roomCode, role: 'child' })` にして Realtime に接続しない。
  - `handleStart` で開発用コードのときは `geo.start()` と `wakeLock.request()` を呼ばない。
  - 「ダンジョンへ入る」ボタンの disabled を `status !== 'connected' && !devMode` にする。
  - 親との距離画面とダンジョンの距離 HUD では、`devMode` のとき距離の代わりに「開発用コードでプレイ中（親なし）」を出す。
- **[C-3]** `.env.example` に `VITE_DEV_ROOM_CODE=` を足し、「開発用。`npm run dev` のときだけ効き、このコードを子供の画面で入力すると親なしでプレイできる。例: TAKAJO1」とコメントを書く。自分の `.env.local` に `VITE_DEV_ROOM_CODE=TAKAJO1` を足す（`.env.local` は `.gitignore` の `*.local` で除外済み）。
- **[C-4]** `src/components/tracker/ParentView.jsx` のコード入力の placeholder が `TAKAJO1` で開発用コードと同じなので、別の例（`HANAKO7` など）に変える。親が開発用コードと同じコードを決めてしまうのを防ぐため。

## Phase D: ドキュメント追記（PR #4）

- **[D-1]** `docs/PARENT_CHILD_DISTANCE.md` に「ゲームは見守りモードでしか始められない」ことと、変更後の画面遷移を書き足す。
- **[D-2]** 同じファイルに開発用コードの使い方（`.env.local` に `VITE_DEV_ROOM_CODE=TAKAJO1` を書く → `npm run dev` を再起動 → 子供として使う → `TAKAJO1` を入力）と、本番ビルドでは効かないことを書く。
- **[D-3]** `docs/APP_DESIGN.md` にソロモードの記述があれば、見守りモード専用に合わせて直す。

---

## 主な変更・新規ファイル
- 変更: `src/App.jsx`, `src/components/StartScreen/StartScreen.jsx`, `src/components/StartScreen/StartScreen.module.css`, `src/components/tracker/{ChildView,TrackerMode,ParentView}.jsx`, `.env.example`
- 新規: `src/utils/battle/useBattle.js`
- 新規: `src/components/battle/BattleHud.jsx`
- 新規: `src/utils/tracker/devRoomCode.js`
- 変更（ドキュメント）: `docs/PARENT_CHILD_DISTANCE.md`, `docs/APP_DESIGN.md`

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. `npm run dev` でタイトル画面をタップすると役割選択に進み、ソロでゲームが始まる道がないことを確認する。
3. `.env.local` に `VITE_DEV_ROOM_CODE=TAKAJO1` を書いて `npm run dev` を再起動し、子供として `TAKAJO1`（小文字 `takajo1` でも）を入力すると、親なしで「ダンジョンへ入る」が押せることを確認する。敵を倒して手持ちにアイテムが入ること、DevTools の Network → WS に Supabase の接続が出ないことも確認する。
4. 異常系を確認する。
   - `VITE_DEV_ROOM_CODE` を消すと `TAKAJO1` は通常コード扱いになり、親が接続するまで「ダンジョンへ入る」が押せないこと。
   - 値を `ab`（形式違反）にすると console に警告が出て無効になること。
   - `npm run build && npm run preview` では開発用コードが効かないこと。
5. 2 タブで親・子を通常コードで接続し、DevTools の Sensors で子を 50m 以上離して脱出させる。脱出中は攻撃ボタンが押せず、10m 以内に戻って復活すると再び攻撃できることを確認する。
6. `npm run tunnel` で HTTPS 公開し、iPhone Safari と Android Chrome の実機 2 台で、タイトル → 親子接続 → ダンジョンでの戦闘 → 脱出と復活が一連で動くことを確認する。
