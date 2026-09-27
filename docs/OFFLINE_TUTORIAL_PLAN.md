# 読み込み中のチュートリアルバトル 実装手順書（ArScene + useImageTrigger / useObjectTrigger の一時停止 + useTutorial + DungeonEntrance の切り替え演出）

## 背景
今は「ダンジョンへ入る」を押すと扉の演出（`DungeonEntrance`）を重ね、カメラ・画像認識（MindAR）・物体認識（YOLO）の準備がすべて終わるまで扉を閉じたまま待たせている。カメラの許可を OK してから準備完了まで 600〜800 ms（初回は YOLO のモデル約 12MB のダウンロードでさらに数秒）かかり、その間プレイヤーは何もできない。

Chrome がオフラインのときに遊べる恐竜ゲームと同じ考え方で、待ち時間をゲームにする。カメラが映った時点で、認識なしで「チュートリアルのにんじん」を必ず出して、そのまま魔法で戦えるようにする。プレイヤーがチュートリアルを遊んでいる間に、画像認識・物体認識の準備を裏で（非同期で）進める。チュートリアルのにんじんを倒してアイテムを拾ったら、ダンジョンの扉の演出を切り替え演出として挟み、扉が開いたら本番（食材の画像・バナナを探して戦う）を始める。扉は認識の準備が終わるまで閉じたままなので、チュートリアルで読み込みが終わらなかった場合の待ち時間もここで吸収する。

採用しなかった案:
- 扉の演出を派手にして待ち時間を紛らわせる案は不採用。待ち時間そのものは減らず、初回（モデルのダウンロード）の数秒は結局「待つだけ」になる。
- 扉の演出をチュートリアルの前（今の位置）とチュートリアルの後の 2 回出す案は不採用。「ダンジョンの入口」が 2 回出て話が合わないのと、前の扉の最低表示時間（`MIN_CLOSED_MS = 1200`）の分だけチュートリアルが始まるのが遅れる。チュートリアルは「ダンジョンの前での練習」、扉は「本番のダンジョンに入る」という流れにする。
- 認識の準備を後回しにして（チュートリアルを倒してから読み込み始めて）画面のカクつきを避ける案も不採用。扉の前で結局待たせることになる。読み込みはカメラが映った時点で今と同じように始め、カクつきが出たら Phase F で調整する。
- ダンジョンに入るたびにチュートリアルを出す案は不採用。入り直すたびにアイテム（ポーション）が手に入ってしまうのと、2 回目以降は YOLO のモデルがメモリに残っていて（`loadObjectModel` の `modelPromise`）待ち時間が短いため。チュートリアルは子供の画面（`ChildView`）を開いてから最初に入ったとき、最後まで遊び切るまで出す。2 回目以降の入場は今と同じく、最初に扉を出して準備完了で開く。
- オフライン（回線なし）で遊べるようにすることはこの手順書の範囲外とする。チュートリアルの glb・YOLO のモデル・ORT の WASM（jsdelivr）・`.mind` はネットから取るので、回線が無いとチュートリアルの敵も出ない。必要になったら Service Worker での事前キャッシュを別の手順書にする。

前提と方針:
- 既存構成は React 19 + Vite + three ^0.186。子供の画面は `src/components/tracker/ChildView.jsx` で、`inDungeon` のときに `ArScene`・`BattleHud`・`DungeonEntrance` を描画する。扉は `ArScene` の `onReady`（カメラ・画像認識・物体認識の準備完了）で開く。
- 認識 hook（`src/utils/imageTrigger/useImageTrigger.js`, `src/utils/objectTrigger/useObjectTrigger.js`）は既に「準備中に `stop()` されたら、準備後に探し始めず `status: 'stopped'` になり、`rescan()` で探し始める」作りになっている。これを最初から止めた状態で始められるよう、`startPaused` オプション（`stoppedRef` の初期値）を 1 行ずつ足すだけにする。`ArScene` の準備完了判定（`status !== 'idle'` など）は `'stopped'` も準備完了として扱うので変えなくてよい。
- チュートリアルの敵は `src/utils/enemy/enemies.js` の `ENEMIES` に `tutorial: true` の 1 件として足す。出し方はラスボス（`BOSS` を `spawnEnemy(BOSS, x, y)` で出して `onEnemySpawn` を呼ぶ）と同じく、認識を通さずに `ArScene` から直接出す。戦闘・敵の攻撃・撃破・ドロップ・回収は `useBattle` と `createScene` の既存の流れをそのまま使う。
- チュートリアルの敵はアイテムを落とす（`drop: 'potion'`）。アイテムを拾った（`onItemCollect`）ことがチュートリアルの終わりの合図になる。
- 今の `ArScene.handleItemCollect` はアイテムを拾うとすぐ `rescan` するが、扉が閉じている間に敵が見つかって扉の裏に出るのを防ぐため、`holdScan` prop で「拾った後の敵探しを扉が開くまで待たせる」ようにする。
- 扉の演出は `src/components/dungeon/DungeonEntrance.jsx` をそのまま使い、AR 画面の上に急に現れないよう `fadeIn` prop（重ねるときにふわっと出す）だけを足す。開く条件（`ready` と `MIN_CLOSED_MS` の両方）・開くアニメーション・「はじめて入るときは、少し時間がかかります」の案内は今のまま使う。
- チュートリアルの進み具合は純関数 `src/utils/tutorial/tutorialRule.js` で決め（`src/utils/item/dropRule.js`, `src/utils/battle/enemyAttackRule.js` と同じ置き方）、状態は hook `src/utils/tutorial/useTutorial.js` が持つ。画面は `src/components/tutorial/TutorialHud.jsx`（CSS Modules。`src/components/dungeon/DungeonEntrance.module.css` と同じ形）に分ける。
- 変更するのは `src/utils/enemy/enemies.js`, `src/utils/imageTrigger/useImageTrigger.js`, `src/utils/objectTrigger/useObjectTrigger.js`, `src/utils/ar/ArScene.jsx`, `src/components/dungeon/DungeonEntrance.jsx`, `src/components/dungeon/DungeonEntrance.module.css`, `src/components/tracker/ChildView.jsx` の 7 ファイル。`createScene.js`, `useBattle.js`, `BattleHud.jsx`, `dropRule.js` は触らない（HP・攻撃間隔などはチュートリアルでも普通の敵と同じ値を使う）。

### チュートリアルの流れ
```
「ダンジョンへ入る」をタップ
   │ useTutorial.begin() … 今回チュートリアルを出すか決める（まだ遊び切っていなければ出す）
   │ preloadTutorial() … にんじん・ポーションの glb を先に読み込み始める
   │ （チュートリアルを出す入場では、最初の扉は出さない）
   ▼
phase: 'preparing' 「カメラを じゅんびちゅう…」（カメラの許可を待つ間）
   │ カメラが映る（useCamera の status === 'ready'）
   │   ├─ 画像認識・物体認識の準備を裏で始める（startPaused: 準備ができても探し始めない）
   │   └─ チュートリアルのにんじんを画面中央に出す → onEnemySpawn → onSceneReady
   ▼
phase: 'fight'     「にんじんが あらわれた！『まほう』で たおそう！」
   │ 敵の攻撃（3 秒後から 3〜5 秒おき）は普通の敵と同じ。被弾したら
   │ 「あかく ひかったら まほうで とめられるよ！」に変わる
   │ HP が 0 になる（useBattle が enemy を null にする）
   ▼
phase: 'collect'   （文は出さない。ポーションが手元へ吸い寄せられる）
   │ onItemCollect … 「ポーションを手に入れた！」（BattleHud の item-toast）
   │                ArScene は holdScan 中なので、まだ敵を探さない
   ▼
phase: 'cleared'   「やったね！ ダンジョンに はいるよ！」を TUTORIAL_CLEAR_MS（1500）見せる
   ▼
phase: 'door'      扉がフェードイン（DungeonEntrance fadeIn、ready = 認識の準備完了）
   │ 準備完了と MIN_CLOSED_MS（1200）の両方がそろったら扉が開く
   │ （準備が終わっていなければ「扉をひらいています…」のまま待つ。5 秒で案内が出る）
   │ 開き終わる（onDone）
   ▼
phase: 'done'      holdScan が外れて ArScene が rescan() → 「食材の画像にカメラを向けてください」

途中でラスボスが呼ばれた（bossPhase !== 'none'）→ 'done'（扉は消え、ラスボスの演出が clearEnemy() でにんじんを消す）
チュートリアルを出さない入場（2 回目以降・ラスボスが呼ばれた後）→ 'none'。扉は今と同じく最初に出て onReady で開く
```
- `phase` は保存せず、毎レンダーで `tutorialPhase(...)` から求める。保存するのは「今回チュートリアルを出すか（`running`）」「チュートリアルの敵が出たか（`started`）」「アイテムを拾ったか（`collected`）」「扉を出したか（`doorShown`）」「扉が開き終わったか（`doorDone`）」「チュートリアル開始時の被弾回数（`hitsAtStart`）」だけ。
- しきい値の根拠:
  - `TUTORIAL_SPAWN_SCREEN_Y = 0.45`: 画面の縦中央より少し上に出す。下端の攻撃ボタン（`.attack-button`）と被らず、上端の距離表示（`.distance-hud`）とも離れる。
  - `TUTORIAL_CLEAR_MS = 1500`: `useBattle` の `ITEM_TOAST_MS`（1500）と揃え、「ポーションを手に入れた！」が消えきってから扉を重ねる。
  - `DOOR_FADE_IN_MS = 400`: 扉が AR 画面の上に急に現れないようにする長さ。`MIN_CLOSED_MS`（1200）の中に収まるので、扉が閉じて見えている時間は 0.8 秒以上残る。
  - HP・攻撃間隔は普通の敵と同じ（HP 100 ÷ 魔法 20 = 5 発、クールダウン 1 秒で約 5 秒）。これに扉までの 1.5 秒と扉の 1.2 秒を足すと約 8 秒あり、準備の 600〜800 ms は十分隠れ、初回のモデルのダウンロード（数秒）もほぼ隠れる。

---

## Phase A: チュートリアルの敵と進み具合のルール（PR #1）

- **[A-1]** `src/utils/enemy/enemies.js` の `ENEMIES` の先頭に、チュートリアルの敵を 1 件追加する。
  - `{ id: 'tutorial-carrot', name: 'にんじん', modelUrl: carrotUrl, targetUrl: null, height: 0.3, drop: 'potion', tutorial: true }`
  - `id` を普通のにんじん（`'carrot'`）と分けることで、`decideDrop` の「同じ敵を 2 回続けて倒すとポーション」の連続数がチュートリアルと混ざらない。
  - ファイル先頭の JSDoc に `tutorial: true なら認識では出さず、ダンジョンに最初に入ったときに ArScene が必ず出す（読み込み中に遊ぶチュートリアル。docs/OFFLINE_TUTORIAL_PLAN.md）` を追記する。
  - `targetUrl: null` かつ `detectClass` なしなので、`ArScene` の `SCAN_TARGETS`（`targetUrl` があるもの）・`BANANA`・`BOSS` の抽出には影響しないこと。
- **[A-2]** `src/utils/tutorial/tutorialRule.js` を作り、ファイル先頭に「読み込み中に遊ぶチュートリアルの進み具合と表示する文（純関数）」の JSDoc を書く。定数 `TUTORIAL_SPAWN_SCREEN_Y = 0.45`, `TUTORIAL_CLEAR_MS = 1500` を export する。
- **[A-3]** `tutorialPhase({ running, sceneReady, started, collected, doorShown, doorDone, enemy, bossActive })` を export する。返り値は `'none' | 'preparing' | 'fight' | 'collect' | 'cleared' | 'door' | 'done'`。上から順に判定する。
  - `!running` → `'none'`
  - `bossActive || doorDone` → `'done'`
  - `!started` → `sceneReady ? 'none' : 'preparing'`（カメラが使えなかった・チュートリアルの敵を出せなかったときは `'none'` にして、普通の流れに任せる）
  - `collected` → `doorShown ? 'door' : 'cleared'`
  - `enemy?.tutorial` → `'fight'`
  - それ以外（撃破してドロップが飛んでいる途中）→ `'collect'`
- **[A-4]** `isScanHeld(phase)` を export する。`'preparing' | 'fight' | 'collect' | 'cleared' | 'door'` のとき true（敵探しを待たせる）、`'none' | 'done'` のとき false を返す。
- **[A-5]** `tutorialCaption(phase, { hitDuringTutorial })` を export する。表示する文字列を返し、出さないときは `null`。子どもが読めるよう全部ひらがな（`BattleHud` の `ATTACK_LABELS` と揃える）。
  - `'preparing'`: `'カメラを じゅんびちゅう…'`
  - `'fight'`: `hitDuringTutorial` が false なら `'にんじんが あらわれた！「まほう」で たおそう！'`、true なら `'あかく ひかったら まほうで とめられるよ！'`
  - `'cleared'`: `'やったね！ ダンジョンに はいるよ！'`
  - `'collect'`（`item-toast` と重ねない）, `'door'`（扉の文が出る）, `'none'`, `'done'`: `null`

## Phase B: 認識 hook を止めた状態で準備できるようにする（PR #2）

- **[B-1]** `src/utils/imageTrigger/useImageTrigger.js` の引数に `startPaused = false` を追加し、`const stoppedRef = useRef(startPaused)` にする。
  - true のとき、準備が終わっても探し始めず `status` が `'stopped'` になり、`rescan()` で探し始める（既存の「準備中に `stop()` された」ときと同じ動き）。
  - 準備中に `rescan()` が呼ばれた場合は `stoppedRef` が false になるので、準備が終わった時点で探し始める（既存の動きのまま）。
  - `startPaused` は最初のレンダーの値だけが効く（`useRef` の初期値）ことを JSDoc の引数説明に書く。
- **[B-2]** `src/utils/objectTrigger/useObjectTrigger.js` にも同じく `startPaused = false` を追加し、`const stoppedRef = useRef(startPaused)` にする。JSDoc も同様に更新する。
  - `stop()` と違い `status` を `'loading'` の途中で `'stopped'` に書き換えないので、`ArScene` の準備完了判定（`objectStatus !== 'loading'`）がモデルの読み込み完了前に true になることはない。
- **[B-3]** 既存の呼び出し（`ArScene.jsx`）は `startPaused` を渡さないので、この PR 単体では動きが変わらないことを確認する。

## Phase C: ArScene でチュートリアルの敵を出し、敵探しを待たせる（PR #3）

- **[C-1]** `src/utils/ar/ArScene.jsx` に定数 `const TUTORIAL = ENEMIES.find((enemy) => enemy.tutorial)` を追加し、`TUTORIAL_SPAWN_SCREEN_Y`（`tutorialRule.js`）と `loadModel`（`src/utils/item/loadModel.js`）、`findItem`（`src/utils/item/items.js`）を import する。
- **[C-2]** `export const preloadTutorial = () => { ... }` を `ArScene.jsx` に追加する。
  - `loadModel(TUTORIAL.modelUrl)` と `loadModel(findItem(TUTORIAL.drop)?.modelUrl)` を呼び、返り値の Promise は `.catch(() => {})` で捨てる。`loadModel` は url ごとに Promise をキャッシュするので、後の `spawnEnemy` / `spawnDrop` はダウンロード済みのものを使う。
  - JSDoc に「ダンジョンに入るタップの時点で呼ぶ。カメラの許可を待つ間に、チュートリアルの敵とドロップの glb を読み込んでおく（`preloadNextScreen` と同じ考え方）」と書く。
- **[C-3]** props に `tutorial = false`, `holdScan = false`, `onSceneReady` を追加し、JSDoc に追記する。
  - `props.tutorial`: true なら、カメラが映った時点でチュートリアルの敵を出し、画像認識・物体認識は準備だけして探し始めない。マウント時の値だけが効く。
  - `props.holdScan`: true の間は、アイテムを拾っても次の敵を探し始めない。false に戻ったときに探し始める（扉の切り替え演出が終わるまで待たせる用）。
  - `props.onSceneReady()`: カメラが映り、チュートリアルの敵を出し終わったときに 1 回呼ばれる（`tutorial` が false ならカメラが映った時点）。カメラが使えなかったとき・チュートリアルの敵を出せなかったときも呼ぶ。
  - 既存の `props.onReady()` の説明は変えない（認識の準備完了）。
- **[C-4]** `const tutorialRef = useRef(tutorial)` でマウント時の値を持ち、`useImageTrigger` と `useObjectTrigger` の両方に `startPaused: tutorialRef.current` を渡す。
- **[C-5]** `onSceneReady` も `onReadyRef` と同じく ref（`onSceneReadyRef`）経由で呼ぶ。`holdScan` も `holdScanRef` に入れる。どちらも毎レンダー更新する既存の `useEffect`（`itemCollectRef.current = handleItemCollect` の所）で代入する。
- **[C-6]** カメラの状態を見る `useEffect` を追加する。依存は `[status]`。
  - `status === 'error'` → `onSceneReadyRef.current?.()` を呼んで終わる。
  - `status !== 'ready'` → 何もしない。
  - `!tutorialRef.current || bossRef.current.phase !== 'none'`（チュートリアルなし、または入る前にラスボスが呼ばれていた）→ `onSceneReadyRef.current?.()` を呼んで終わる。
  - それ以外は `foundRef.current = true`（認識の敵と重ならないようにする）にしてから、`localSceneRef.current?.spawnEnemy(TUTORIAL, window.innerWidth / 2, window.innerHeight * TUTORIAL_SPAWN_SCREEN_Y)` を呼ぶ。`.then((model) => ...)` で、`model` が null（読み込み中に画面が閉じられた）なら何もしない。`bossRef.current.phase !== 'none'`（読み込み中にラスボスが呼ばれた）なら `onSceneReadyRef.current?.()` だけ呼ぶ。それ以外は `callbacksRef.current.onEnemySpawn?.(TUTORIAL)` → `onSceneReadyRef.current?.()` の順に呼ぶ。
  - `spawnEnemy` の失敗（glb の読み込み失敗）は `.catch` で拾い、`foundRef.current = false` に戻して `rescanImage()` / `rescanObject()`（普通の敵探しに切り替える）→ `onSceneReadyRef.current?.()` を呼ぶ。この場合 `tutorialPhase` は `'none'` になり（[A-3]）、`holdScan` も false なので敵探しは止まらない。
  - StrictMode の二重実行で 2 回出さないよう、`const tutorialSpawnedRef = useRef(false)` を用意し、true なら何もしないようにする（`bossSpawnedRef` と同じ）。
- **[C-7]** 既存の `handleItemCollect` を変更する。`onItemCollect?.(item)` とラスボスの判定の後で、`holdScanRef.current` が true なら `pendingRescanRef.current = true` にして return する（`const pendingRescanRef = useRef(false)` を追加）。false なら今までどおり `foundRef.current = false` → `rescanImage()` / `rescanObject()`。
- **[C-8]** `holdScan` を見る `useEffect` を追加する。依存は `[holdScan, rescanImage, rescanObject]`。
  - `holdScan` が false、かつ `pendingRescanRef.current` が true、かつ `bossRef.current.phase === 'none'` のときだけ、`pendingRescanRef.current = false` → `foundRef.current = false` → `rescanImage()` / `rescanObject()` を呼ぶ。
  - 扉の切り替え中にラスボスが呼ばれた場合は、`bossPhase` の effect が既に認識を止めているので、ここでは探し始めない。
  - 認識の準備がまだなら、準備が終わった時点で探し始める（[B-1]）。ただし扉は準備完了まで開かないので、通常は開いた時点で準備済み。
- **[C-9]** `ArScene` の「食材の画像にカメラを向けてください」の表示条件（`scanStatus === 'scanning'`）は変えない。チュートリアル中と扉の間は `'stopped'` なので出ず、扉が開いて敵探しが始まった時点で出る。
- **[C-10]** 呼び出し側（`ChildView.jsx`）はまだ `tutorial` / `holdScan` を渡さないので、この PR 単体では動きが変わらないことを確認する。

## Phase D: 扉のフェードインとチュートリアルの画面（PR #4）

- **[D-1]** `src/components/dungeon/DungeonEntrance.jsx` の props に `fadeIn = false` を追加し、true のとき `.overlay` に `styles.fadeIn` を足す。JSDoc に「`props.fadeIn`: true なら、AR 画面の上にふわっと出す（チュートリアルの後の切り替え演出用）。開く条件・最低表示時間は変わらない」と書く。
- **[D-2]** `src/components/dungeon/DungeonEntrance.module.css` に次を追加する。
  - `.fadeIn { animation: overlay-in 0.4s ease-out both; }` と `@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }`（0.4 s は `DOOR_FADE_IN_MS`。CSS 側だけで持つ）
  - `.opening`（`opacity: 0` への transition）と重なったときに開く演出が消えないよう、`.fadeIn.opening { animation: none; }` を足す（フェードインは `MIN_CLOSED_MS` の中で終わっているので、外しても見た目は変わらない）。
  - `prefers-reduced-motion: reduce` の中は変えない（フェードは動きの少ない演出なので残す）。
- **[D-3]** `src/utils/tutorial/useTutorial.js` を作り、`export function useTutorial({ sceneReady, enemy, bossActive, playerHits })` を追加する。持つ状態は次の 6 つ。
  - `running`（今回の入場でチュートリアルを出すか）, `started`（チュートリアルの敵が出たか）, `collected`（チュートリアルのアイテムを拾った。一度 true になったら、この画面を開いている間はもう出さない）, `doorShown`（扉を出した）, `doorDone`（扉が開き終わった）, `hitsAtStart`（チュートリアルの敵が出たときの被弾回数）
- **[D-4]** `begin()` を返す。ダンジョンに入るタップの中で呼ぶ。`setRunning(!collected)`, `setStarted(false)`, `setDoorShown(false)`, `setDoorDone(false)` を行い、今回チュートリアルを出すかを boolean で返す（呼び出し側が同じイベントの中で最初の扉の出し分けに使うため）。
- **[D-5]** `handleEnemySpawn(enemy, playerHits)` を返す。`enemy.tutorial` なら `setStarted(true)`, `setHitsAtStart(playerHits)`。それ以外は何もしない。
- **[D-6]** `handleItemCollect()` を返す。`running && started && !collected` のときだけ `setCollected(true)` にする（チュートリアルのアイテムを拾ったときだけ。普通のアイテムでは何もしない）。
- **[D-7]** `handleDoorDone()` を返す。`setDoorDone(true)` にする（`DungeonEntrance` の `onDone` に渡す）。
- **[D-8]** `phase = tutorialPhase({ running, sceneReady, started, collected, doorShown, doorDone, enemy, bossActive })` を求め、`phase === 'cleared'` の間だけ `TUTORIAL_CLEAR_MS` 後に `setDoorShown(true)` する `useEffect` を置く（依存は `[phase]`。cleanup で `clearTimeout`）。`setState` はタイマーのコールバックの中で呼ぶので、`react-hooks/set-state-in-effect` の警告は出ない。その他の状態の更新はすべてイベントハンドラから行う。
- **[D-9]** 返り値は `{ running, phase, caption, holdScan, begin, handleEnemySpawn, handleItemCollect, handleDoorDone }`。
  - `caption = tutorialCaption(phase, { hitDuringTutorial: playerHits > hitsAtStart })`
  - `holdScan = isScanHeld(phase)`
  - JSDoc に「読み込み中に遊ぶチュートリアルの状態を持つ hook。進み具合は tutorialRule.js で決める」と返り値一覧を書く。
- **[D-10]** `src/components/tutorial/TutorialHud.jsx` を作り、`export function TutorialHud({ caption })` を追加する。
  - `caption` が null なら何も描画しない。
  - あるときは `<p key={caption} className={styles.caption} role="status" aria-live="polite">{caption}</p>` を描画する。`key` を文にすることで、文が変わるたびにアニメーションが最初から流れる（`BattleHud` の `item-toast` と同じ手法）。
  - `caption` の末尾が `…` なら（`'preparing'`）、`DungeonEntrance` の `.dots` と同じ点のアニメーションを付ける（`TutorialHud.module.css` に同じ定義を置く）。
- **[D-11]** `src/components/tutorial/TutorialHud.module.css` を作る。
  - `.caption`: `position: absolute; top: 64px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); margin: 0; padding: 8px 16px; border-radius: 20px; color: #fff; font-weight: bold; text-align: center; background: rgba(0, 0, 0, 0.6); pointer-events: none;`（`.distance-hud`（`top: 12px`）の下に出し、右上の `.inventory` と被る幅の端末では 2 行に折り返す）
  - `animation: caption-in 0.3s ease-out`（`opacity: 0; translateY(-8px)` から出てくる）

## Phase E: ChildView でつなぐ（PR #5）

- **[E-1]** `src/components/tracker/ChildView.jsx` で `useTutorial`, `TutorialHud`, `preloadTutorial`（`ArScene.jsx`）を import する。`const [sceneReady, setSceneReady] = useState(false)` を追加する。
- **[E-2]** `const tutorial = useTutorial({ sceneReady, enemy: battle.enemy, bossActive: bossPhase !== 'none', playerHits: battle.playerHits })` を、`bossPhase` を求めた後に呼ぶ。
- **[E-3]** `handleEnterDungeon` のセンサー権限の結果が `'denied'` でなかった後を次のようにする。
  - `const withTutorial = tutorial.begin()`, `if (withTutorial) preloadTutorial()`, `setSceneReady(false)`（既存の `setArReady(false)` の隣）
  - 既存の `setEntering(true)` を `setEntering(!withTutorial)` にする（チュートリアルを出す入場では最初の扉を出さない）。
- **[E-4]** `ArScene` に次の props を渡す。
  - `tutorial={tutorial.running}`, `holdScan={tutorial.holdScan}`
  - `onSceneReady={() => setSceneReady(true)}`
  - `onEnemySpawn={(enemy) => { battle.handleEnemySpawn(enemy); tutorial.handleEnemySpawn(enemy, battle.playerHits) }}`
  - `onItemCollect={(item) => { battle.handleItemCollect(item); tutorial.handleItemCollect() }}`
- **[E-5]** 扉を 2 通りで出す。どちらも `.ui-layer` の後（`z-index: 20` で `.ui-layer` より手前）に置く。
  - 既存: `{entering && <DungeonEntrance ready={arReady} onDone={() => setEntering(false)} />}`（チュートリアルなしの入場。変更なし）
  - 追加: `{tutorial.phase === 'door' && <DungeonEntrance fadeIn ready={arReady} onDone={tutorial.handleDoorDone} />}`（チュートリアルの後の切り替え演出）
- **[E-6]** `.ui-layer` の中、`BattleHud` の後に `<TutorialHud caption={tutorial.caption} />` を置く。脱出中（`escaped`）は `EscapedScreen` が上に重なるので、出し分けはしない。
- **[E-7]** `ChildView` の JSDoc の「入るときは、カメラと認識モデルの準備が終わるまで扉の演出（DungeonEntrance）を重ねる」を「最初の入場では、認識モデルの準備の間にチュートリアルのにんじんと戦わせ、倒した後に扉の演出（DungeonEntrance）を挟んで本番に入る。2 回目以降は入るときに扉を重ね、準備が終わったら開く（docs/OFFLINE_TUTORIAL_PLAN.md）」に書き換える。

## Phase F: 実機対応とドキュメント追記（PR #6）

- **[F-1]** iPhone Safari と Android Chrome で、カメラの許可を OK した直後に画面中央ににんじんが出て、すぐに「まほう」ボタンで攻撃できることを確認する。倒してポーションを拾うと「やったね！ ダンジョンに はいるよ！」の後に扉がふわっと現れ、約 1.2 秒後に開いて食材探しが始まること。
- **[F-2]** `src/utils/debug/perfLog.js` のログ（`session 作成（モデルと .wasm のダウンロード・初期化）`、`carrot のモデル読み込み`）で、チュートリアル中に認識の準備が終わっていることを確認する。YOLO の session 作成や MindAR の `dummyRun` の間に AR の描画が止まる（にんじんの追従や魔法弾がカクつく）場合は、`useObjectTrigger` の読み込み開始を `ArScene` 側でチュートリアルの敵の表示後に `requestIdleCallback`（無い端末は `setTimeout(…, 0)`）で遅らせる案を検討し、結果をこの手順書に追記する。
- **[F-3]** 回線が遅い初回（DevTools の Network を Slow 4G）で、扉が閉じたまま「扉をひらいています…」で待ち、5 秒を過ぎると「はじめて入るときは、少し時間がかかります」が出て、準備が終わると開くことを確認する。扉で待つ時間が長すぎる場合は、チュートリアルの敵だけ HP を上げる（`enemies.js` に `maxHp` を足して `useBattle.handleEnemySpawn` で読む）ことを別の手順書で検討する。
- **[F-4]** `docs/APP_DESIGN.md` の「ゲームの流れ（画面遷移）」に「最初にダンジョンに入ったときは、認識の準備の間にチュートリアルのにんじん（認識なしで必ず出る）と戦う。倒してポーションを拾うと扉の演出を挟んで食材探しが始まる」を追記する。
- **[F-5]** `docs/IMAGE_TRIGGER_SETUP.md` の「戦闘との接続」に「`useImageTrigger` / `useObjectTrigger` の `startPaused: true` で準備だけ先に進め、`rescan()` で探し始められる。チュートリアル中と扉の切り替え中はこれと `ArScene` の `holdScan` で止めている（`docs/OFFLINE_TUTORIAL_PLAN.md`）」を追記する。
- **[F-6]** `docs/LAST_BOSS.md` の「6. ラスボス戦への受け渡し」に「チュートリアル中・扉の切り替え中にラスボスが呼ばれた場合も、`appear` の段階の `clearEnemy()` でチュートリアルのにんじんが消え、そのままラスボス戦になる」を追記する。

---

## 主な変更・新規ファイル
- 新規: `src/utils/tutorial/{tutorialRule,useTutorial}.js`（`tutorialPhase`, `isScanHeld`, `tutorialCaption`, `TUTORIAL_SPAWN_SCREEN_Y`, `TUTORIAL_CLEAR_MS`, `useTutorial`）
- 新規: `src/components/tutorial/TutorialHud.jsx`, `src/components/tutorial/TutorialHud.module.css`
- 変更: `src/utils/enemy/enemies.js`（`tutorial-carrot` の追加）
- 変更: `src/utils/imageTrigger/useImageTrigger.js`, `src/utils/objectTrigger/useObjectTrigger.js`（`startPaused` オプション）
- 変更: `src/utils/ar/ArScene.jsx`（`tutorial` / `holdScan` / `onSceneReady` props、チュートリアルの敵の出現、拾った後の敵探しの保留、`preloadTutorial`）
- 変更: `src/components/dungeon/DungeonEntrance.jsx`, `src/components/dungeon/DungeonEntrance.module.css`（`fadeIn`）
- 変更: `src/components/tracker/ChildView.jsx`（`useTutorial` の組み込み、扉の出し分け、`TutorialHud`）
- 変更（ドキュメント）: `docs/APP_DESIGN.md`, `docs/IMAGE_TRIGGER_SETUP.md`, `docs/LAST_BOSS.md`

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. PC で `npm run dev` し、開発用コード（`VITE_DEV_ROOM_CODE`）で子供として「ダンジョンへ入る」を押す。最初に扉は出ず、「カメラを じゅんびちゅう…」の後、カメラが映ると画面中央ににんじんがいて「にんじんが あらわれた！『まほう』で たおそう！」が出ること。この時点で食材の画像を映してもピーマンなどが出ないこと。
3. そのまま待つと約 3 秒後ににんじんが攻撃してきて、被弾すると文が「あかく ひかったら まほうで とめられるよ！」に変わること。魔法 5 発で倒すとポーションが手元に届き「ポーションを手に入れた！」が出て、「もちもの」に「ポーション ×1」が入ること。
4. 続けて「やったね！ ダンジョンに はいるよ！」が約 1.5 秒出た後、扉がふわっと現れ、約 1.2 秒後に開いて消えること。扉が閉じている間に食材の画像を映していても敵が出ず、扉が開いた後に「食材の画像にカメラを向けてください」が出て、にんじんの画像を映すと普通のにんじんが出ること。
5. React DevTools で `ArScene` 内の `useImageTrigger` / `useObjectTrigger` の `status` が、チュートリアル中と扉の間は `'stopped'`、扉が開き終わった後は `'scanning'` になることを確認する。
6. DevTools の Network で Slow 4G にし、DevTools の Application › Clear site data でキャッシュを消してから入る。チュートリアルを倒しても YOLO の読み込みが終わっていなければ、扉が閉じたまま「扉をひらいています…」で待ち、読み込みが終わると開いて食材探しに切り替わること。
7. チュートリアルを遊び切ってから「終了する」で戻り、もう一度「ダンジョンへ入る」を押すと、チュートリアルのにんじんは出ず、最初に扉が出て認識の準備が終わってから開くこと（今までの動き）。チュートリアルの途中（扉が開く前）で戻った場合は、次に入ったときにもう一度チュートリアルが出ること。
8. DevTools で `public/models/yolov8n.onnx` へのリクエストを Network request blocking で止めて入る。チュートリアルは遊べて、倒した後の扉も開き（`onReady` はエラーでも呼ばれる）、「物体認識を開始できませんでした」が出て、画像認識の敵探しは始まること。
9. カメラの許可を拒否して入ると、「カメラを じゅんびちゅう…」が消えてカメラのエラーが表示され、にんじんは出ないこと。
10. 親子を 2 タブで接続し、(a) 入る前に親が「ラスボスを呼ぶ」を押していた場合はチュートリアルが出ずにそのままラスボスの演出になること、(b) チュートリアル中に呼ばれた場合、(c) 切り替えの扉が出ている間に呼ばれた場合、のどちらもにんじん・扉・チュートリアルの文が消えてラスボスの演出に移り、ラスボス戦の後も食材探しが始まらないこと。
11. `npm run tunnel` で HTTPS 公開し、実機で F-1〜F-3 を確認する。
