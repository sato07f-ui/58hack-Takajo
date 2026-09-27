# 敵の攻撃 実装手順書（Three.js + createScene ループ + useBattle）

## 背景
今のバトルはプレイヤーが魔法を撃つだけの一方通行で、敵は反撃してこない。今後プレイヤーに残機形式のライフを付けるので、その前段として「敵が一定間隔で攻撃を溜め、弾を撃ってプレイヤー（カメラ）に当てる」ロジックと、被弾したことを画面で伝える演出を作る。ライフの増減・ゲームオーバーはこの手順書の範囲外とし、被弾の通知口（`onPlayerHit` 相当の処理と `playerHits`）だけを用意して次の手順書で使う。

ターン制は不採用。プレイヤーの攻撃はクールダウン付きのリアルタイム（`useBattle` の `COOLDOWN_MS`）なので、敵だけターン制にするとテンポが噛み合わない。
端末を動かして敵弾を避ける判定（カメラの移動量で回避）も不採用。普通の敵は `followCamera` で常に画面の同じ位置についてくるため、端末を振っても弾との相対位置がほぼ変わらず、避けられない。ラスボス（`enemies.js` の `fixed: true`）はその場に留まるが、敵弾の行き先をカメラ基準で毎フレーム求めるので、どの敵でも同じく避けられない作りにそろえる。代わりに「溜め中に魔法を当てると攻撃をキャンセルできる（ひるむ）」ことで、プレイヤーが対処できる余地を作る。

前提と方針:
- 既存構成は React 19 + Vite + three ^0.186。描画と演出は `src/utils/ar/createScene.js` の `loop()` に集約されており、ゲームの数値（HP・ドロップ）は `src/utils/battle/useBattle.js` が持つ。画面は `src/components/tracker/ChildView.jsx` が `useBattle({ disabled: escaped })` を呼び、`BattleHud` と `ArScene` に渡している。
- 役割分担は既存の魔法攻撃に合わせる。`useBattle` がいつ攻撃するかを決めて `sceneRef.current.enemyAttack(...)` を呼び、`createScene` が溜め・弾・着弾の演出をしてコールバックで結果を返す（`shootMagic(onHit)` と同じ形）。
- 攻撃間隔などの判断は純関数 `src/utils/battle/enemyAttackRule.js` に分ける（`src/utils/item/dropRule.js` と同じ置き方）。
- 敵弾の移動は魔法弾と同じ `position.lerp(target, LERP)` 方式、溜めの時間判定はドロップの `DROP_IDLE_MS` と同じ `performance.now()` 方式にする。敵弾の行き先はドロップの吸い寄せ先と同じく `camera.localToWorld` で毎フレーム求める。
- ラスボスも同じ攻撃をする。`ArScene.jsx` は `bossPhase === 'fight'`（門の演出が終わった後）で初めて `onEnemySpawn(BOSS)` を呼ぶので、`useBattle` の `enemy` がセットされるのもそこからになり、門・スポットライトの演出中に攻撃が始まることはない。ラスボス専用の攻撃（技の種類・間隔の違い）はこの手順書では作らない。
- 変更するのは `src/utils/ar/createScene.js`, `src/utils/battle/useBattle.js`, `src/components/battle/BattleHud.jsx`, `src/App.css` の 4 ファイル。新規は `src/utils/battle/enemyAttackRule.js` の 1 ファイル。`ArScene.jsx`, `ChildView.jsx`, `enemies.js` は触らない（`ChildView` は既に `disabled: escaped` を渡しているので、脱出中の停止はそのまま効く。ラスボスの段階管理 `bossPhase` もそのまま使う）。

### 敵の攻撃の状態遷移
```
敵が出現（enemy がセットされる）
   │ FIRST_ATTACK_DELAY_MS 待つ（useBattle の setTimeout）
   ▼
windup（溜め：敵が赤く点滅して少し膨らむ。ATTACK_WINDUP_MS）
   │                         │ 溜め中に魔法が着弾
   │ 経過時間 >= WINDUP       ▼
   ▼                      interrupted（ひるむ。弾は出ない）──┐
fly（敵の中心から手元へ lerp）                                │
   │ 手元まで ENEMY_SHOT_HIT_DISTANCE 以内                   │
   ▼                                                        │
hit（onHit() → 被弾演出・振動）                               │
   │                                                        │
   └──────── onEnd(result) ──▶ 次の攻撃まで nextAttackDelay() 待つ ◀┘

撃破（playDefeatEffect）・敵の消去（clearEnemy）・脱出（disabled）・アンマウント
   → cancelEnemyAttack() で溜めも飛んでいる弾も消す。onEnd は呼ばない（呼び出し側が止めたので次を予約しない）
```
- 同時に進む攻撃は 1 つだけ（敵は 1 体、攻撃は `onEnd` の後に次を予約する）。
- しきい値の根拠:
  - `FIRST_ATTACK_DELAY_MS = 3000`: 出現直後にいきなり撃たれると理不尽なので、魔法を 2〜3 発撃てる時間（`COOLDOWN_MS = 1000`）を先に与える。
  - `MIN_INTERVAL_MS = 3000`, `MAX_INTERVAL_MS = 5000`: 敵 HP 100 ÷ 魔法 20 = 5 発で約 5 秒かかるので、1 体あたり 1〜2 回攻撃される程度にする。一定間隔だと読めてしまうので幅を持たせる。
  - `ATTACK_WINDUP_MS = 800`: 溜めを見てから魔法ボタンを押し、弾が届く（魔法弾の `PROJECTILE_LERP = 0.15` で約 0.3 秒）まで間に合う長さ。クールダウン中（最大 1 秒）だと間に合わないこともあり、それで「撃つタイミング」に意味が出る。
  - `ENEMY_SHOT_LERP = 0.07`: 魔法弾（0.15）より遅くし、飛んでくるのが見えるようにする。普通の敵（距離 0.7 m）からは約 35 フレーム（約 0.6 秒）、ラスボス（`spawnDistance: 2.5`）からは約 55 フレーム（約 0.9 秒）で届く。遠いぶん迫ってくる時間が長くなり、ボスの弾らしく見える。
  - `ENEMY_SHOT_HIT_DISTANCE = 0.05`: 行き先（カメラ手前 0.2 m）に十分近づいてから当てる。`camera.near`（0.1）より手前には入らない。
  - `PLAYER_INVINCIBLE_MS = 1500`: 被弾直後の無敵時間。現状は攻撃が 1 つずつなので重なって当たることはないが、残機を付けたときに連続被弾で一気に減らないよう先に入れておく。

---

## Phase A: 攻撃ルールの純関数（PR #1）

- **[A-1]** `src/utils/battle/enemyAttackRule.js` を作り、定数を export する。
  - `FIRST_ATTACK_DELAY_MS = 3000`, `MIN_INTERVAL_MS = 3000`, `MAX_INTERVAL_MS = 5000`, `ATTACK_WINDUP_MS = 800`, `PLAYER_INVINCIBLE_MS = 1500`
  - ファイル先頭に `dropRule.js` と同じ形式で「敵の攻撃タイミングと被弾判定のルール（純関数）」の JSDoc を書く。
- **[A-2]** `nextAttackDelay(isFirst, random = Math.random)` を export する。
  - `isFirst` が true なら `FIRST_ATTACK_DELAY_MS` を返す。
  - false なら `MIN_INTERVAL_MS + Math.floor(random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1))` を返す（3000〜5000 の整数 ms）。
  - `random` を引数にしてテスト・デバッグで固定値を渡せるようにする。
- **[A-3]** `canTakeHit(lastHitAt, now)` を export する。
  - `lastHitAt` が `null` なら true、そうでなければ `now - lastHitAt >= PLAYER_INVINCIBLE_MS` を返す。

## Phase B: createScene に敵の攻撃演出を追加（PR #2）

- **[B-1]** `src/utils/ar/createScene.js` の定数群に次を追加する。
  - `ENEMY_SHOT_LERP = 0.07`, `ENEMY_SHOT_HIT_DISTANCE = 0.05`, `ENEMY_SHOT_RADIUS = 0.04`, `ENEMY_SHOT_COLOR = 0xff3366`, `WINDUP_BLINK_MS = 100`（溜め中の点滅の周期の半分）, `WINDUP_SWELL = 1.1`（溜め中に膨らむ倍率）
  - `const _playerPoint = new THREE.Vector3(0, -0.03, -0.2)`（カメラローカルの敵弾の行き先：画面中央やや下、20 cm 手前）
  - `const _red = new THREE.Color(0xaa0000)`（溜め中の emissive）
  - `ATTACK_WINDUP_MS` は `enemyAttackRule.js` から import する（溜めの長さを 1 か所で決める）。
- **[B-1a]** 敵の元の発光色を保存し、戻せるようにする。ラスボスは目・宝石に赤い発光マテリアルを使っているため、`setEnemyEmissive(_black)` で戻すと発光が消えてしまう（既存の `playDamageEffect` でも起きている）。
  - `prepareModel` のマテリアル複製の直後で `obj.material.userData.baseEmissive = obj.material.emissive?.clone()` を保存する。
  - `restoreEnemyEmissive()` を追加する。`enemyModel` の各マテリアルの `emissive` を `userData.baseEmissive`（無ければ `_black`）に戻す。
  - 既存の `playDamageEffect` の `setTimeout` 内の `setEnemyEmissive(_black)` を `restoreEnemyEmissive()` に置き換える。
- **[B-2]** `createScene` 内に攻撃の状態を持つ変数を追加する。
  - `let enemyAttack = null`（`{ state: 'windup' | 'fly', startedAt, mesh, onHit, onEnd }`。攻撃していなければ `null`）
- **[B-3]** `enemyAttack({ onHit, onEnd })` を追加して戻り値に含める。
  - `enemyModel` が無い・`isDefeated`・既に `enemyAttack` がある場合は何もせず `false` を返す。
  - それ以外は `{ state: 'windup', startedAt: performance.now(), mesh: null, onHit, onEnd }` を入れて `true` を返す。
  - JSDoc に「敵が溜めてから弾を撃つ。当たったら onHit()、攻撃が終わったら（当たった・ひるんだ）onEnd(result) を 1 回呼ぶ。result は 'hit' | 'interrupted'」を書く。
- **[B-4]** `cancelEnemyAttack()` を追加して戻り値に含める。溜め中なら `endWindup()`、弾があれば `scene.remove` と `geometry` / `material` の dispose をし、`enemyAttack = null` にする。`onEnd` は呼ばない。
- **[B-5]** 溜めの終わりと中断の共通処理 `endWindup()` を追加する。`restoreEnemyEmissive()` と `setEnemySquash(1, 1, 1)` で見た目を戻す。
- **[B-6]** `playDamageEffect` の先頭（`enemyModel` チェックの後）で、`enemyAttack?.state === 'windup'` なら `endWindup()` → `const { onEnd } = enemyAttack` → `enemyAttack = null` → `onEnd?.('interrupted')` を行う。その後に既存の白フラッシュ・潰れの演出が続くので、見た目は通常の被弾と同じになる。
- **[B-7]** `playDefeatEffect` と `clearEnemy` の中で `cancelEnemyAttack()` を呼ぶ（`clearProjectiles()` の隣）。`dispose()` は `clearEnemy()` を呼ぶので追加不要。
- **[B-8]** `loop()` の「2. 魔法弾の追尾と着弾判定」の後に「2.5 敵の攻撃」を追加する。
  - `windup`: 経過時間を `elapsed` とし、`Math.floor(elapsed / WINDUP_BLINK_MS) % 2` で `_red` と `_black` を交互に `setEnemyEmissive`、`setEnemySquash(WINDUP_SWELL, WINDUP_SWELL, WINDUP_SWELL)` にする。`elapsed >= ATTACK_WINDUP_MS` になったら `endWindup()` し、半径 `ENEMY_SHOT_RADIUS`・色 `ENEMY_SHOT_COLOR` の `MeshBasicMaterial` の球を `enemyModel.userData.center`（体の中心。普通の敵は追従中の `anchor` と同じ点）の位置に置いて `scene.add` し、`state = 'fly'` にする。
  - `fly`: `camera.localToWorld(_target.copy(_playerPoint))` で行き先を求め、`mesh.position.lerp(_target, ENEMY_SHOT_LERP)` する。`distanceTo(_target) < ENEMY_SHOT_HIT_DISTANCE` になったら弾を消して dispose し、`onHit` / `onEnd` を退避してから `enemyAttack = null` → `onHit?.()` → `onEnd?.('hit')` の順に呼ぶ。
  - `_target` はドロップの吸い寄せ（5 番）と共用する。どちらもその場で計算して使い切るので衝突しない。
  - 発射位置に `centerOf()`（バウンディングボックスの中心）を使わないのは、ラスボスは横幅約 3.8 m の翼を含むため箱の中心が体からずれるから。`MeshBasicMaterial` なのでスポットライト演出で周りが暗くなっても弾は見える。
  - 溜め中は敵の emissive を毎フレーム上書きするが、[B-6] で魔法が当たった時点で溜めは終わるので、白フラッシュとは競合しない。
- **[B-9]** `createScene` の JSDoc の戻り値説明に `enemyAttack` / `cancelEnemyAttack` を追記する。

## Phase C: useBattle で攻撃を予約し、被弾を受け取る（PR #3）

- **[C-1]** `src/utils/battle/useBattle.js` で `nextAttackDelay`, `canTakeHit` を `enemyAttackRule.js` から import し、状態を追加する。
  - `const [attackSeq, setAttackSeq] = useState(0)`（攻撃が終わるたびに +1。次の攻撃の予約をやり直すきっかけ）
  - `const [playerHits, setPlayerHits] = useState(0)`（被弾した回数。残機を付けるときはここを「残機」に置き換える）
  - `const lastHitAtRef = useRef(null)`（最後に被弾した時刻。無敵時間の判定用）
  - `const attackCountRef = useRef(0)`（今の敵が攻撃した回数。0 なら初回）
- **[C-2]** `handleEnemySpawn` で `attackCountRef.current = 0` にする（敵ごとに初回の猶予を与える）。
- **[C-3]** `handlePlayerHit()` を追加する。
  - `const now = performance.now()`。`canTakeHit(lastHitAtRef.current, now)` が false なら何もしない。
  - true なら `lastHitAtRef.current = now`、`setPlayerHits((n) => n + 1)`、`navigator.vibrate?.([80, 40, 80])`（魔法の着弾 100 ms と区別できるよう 2 回震わせる）。
- **[C-4]** 攻撃を予約する `useEffect` を追加する。依存は `[enemy, disabled, attackSeq, handlePlayerHit]`（`sceneRef` は ref なので入れない）。
  - `!enemy || disabled` なら何もしない（撃破後は `setEnemy(null)` になるので止まる。脱出中も止まる）。
  - `setTimeout` で `nextAttackDelay(attackCountRef.current === 0)` ms 後に `attackCountRef.current += 1` → `sceneRef.current?.enemyAttack({ onHit: handlePlayerHit, onEnd: () => setAttackSeq((n) => n + 1) })` を呼ぶ。戻り値が `false`（撃破演出中など）なら `setAttackSeq((n) => n + 1)` で予約し直す。
  - cleanup で `clearTimeout` と `sceneRef.current?.cancelEnemyAttack()` を呼ぶ。脱出した瞬間に溜めも飛んでいる弾も消え、復活すると改めて予約される。`onEnd` の後の cleanup でも呼ばれるが、そのときは攻撃が無いので何も起きない。
  - `handlePlayerHit` は ref と setter しか使わないので、[C-3] の時点で `useCallback(..., [])` で包み、この `useEffect` の依存配列に入れる（`react-hooks/exhaustive-deps` の警告を出さず、予約もやり直されない）。
- **[C-5]** 返り値に `playerHits` を追加し、JSDoc の返り値一覧と説明（「敵の攻撃の予約と、プレイヤーの被弾回数」）を更新する。

## Phase D: 被弾の画面演出（PR #4）

- **[D-1]** `src/components/battle/BattleHud.jsx` で `battle.playerHits` を受け取り、`playerHits > 0` のとき `<div key={playerHits} className="player-hit-flash" aria-hidden="true" />` を描画する。`key` を被弾回数にすることで、被弾のたびに要素が作り直されアニメーションが最初から再生される（`item-toast` と同じ手法）。
- **[D-2]** 同じく `playerHits > 0` のとき `<p key={`hit-${playerHits}`} className="player-hit-text">いたい！</p>` を出す（子どもが読めるようひらがな。`ATTACK_LABELS` と揃える）。
- **[D-3]** `src/App.css` の「アイテムを拾ったときのお知らせ」の後に次を追加する。
  - `.player-hit-flash`: `position: absolute; inset: 0; pointer-events: none;` に、画面の縁を赤くする `box-shadow: inset 0 0 80px 30px rgba(255, 0, 0, 0.7)` を付け、`animation: player-hit-flash 0.5s ease-out forwards`（`opacity` 1 → 0）で消す。
  - `.player-hit-text`: `.item-toast` と同じ見た目で `top: 40%`、`color: #ff5a5a`、`animation: item-toast 0.8s ease-out forwards` を流用する。
- **[D-4]** `BattleHud` の JSDoc の説明に「被弾演出（画面の縁が赤く光る・いたい！）」を追記する。

## Phase E: 実機対応とドキュメント追記（PR #5）

- **[E-1]** iPhone Safari と Android Chrome で、敵が出てから約 3 秒後に赤く点滅して膨らみ、約 0.8 秒後に赤い弾が画面中央やや下へ飛んできて、画面の縁が赤く光り「いたい！」が出て端末が 2 回震えることを確認する。
- **[E-2]** 敵弾が大きすぎて画面を覆う、または `camera.near` で切れて見えない場合は `_playerPoint` の z を `-0.2 〜 -0.3`、`ENEMY_SHOT_RADIUS` を `0.03 〜 0.05` の範囲で調整する。
- **[E-3a]** 親の「ラスボスを呼ぶ」でラスボスを出し、門の演出中は攻撃されず、演出が終わって約 3 秒後に魔王ドラゴンが赤く点滅して弾を撃ってくることを確認する。溜め・被弾の後も目と胸の宝石の赤い発光が残ること（[B-1a]）。
- **[E-3]** 溜めの点滅が敵モデルによって見えにくい場合（emissive が効かないマテリアル）は `_red` を明るくするか、`WINDUP_SWELL` を `1.15` まで上げて形の変化で伝える。
- **[E-4]** `docs/APP_DESIGN.md` の「戦闘ルール」の「敵の攻撃（ターン制 / リアルタイム）」を「リアルタイム。出現 3 秒後から 3〜5 秒おきに 0.8 秒溜めて弾を撃つ。溜め中に魔法を当てるとひるんでキャンセル。被弾後 1.5 秒は無敵」に書き換える。
- **[E-4a]** `docs/LAST_BOSS.md` の「6. ラスボス戦への受け渡し」に「ラスボスも普通の敵と同じく `useBattle` から攻撃される（`docs/ENEMY_ATTACK_PLAN.md`）。ラスボス専用の攻撃にする場合は `enemyAttackRule.js` に敵ごとの間隔を足す」を追記する。
- **[E-5]** `docs/IMAGE_TRIGGER_SETUP.md` の「戦闘との接続」に「敵の攻撃は `useBattle` が予約し、`sceneRef.current.enemyAttack({ onHit, onEnd })` で演出する。撃破・`clearEnemy()`・脱出で `cancelEnemyAttack()` される」を追記する。

---

## 主な変更・新規ファイル
- 新規: `src/utils/battle/enemyAttackRule.js`（`nextAttackDelay`, `canTakeHit`, 攻撃タイミングの定数）
- 変更: `src/utils/ar/createScene.js`（定数、元の発光色の保存と `restoreEnemyEmissive`、`enemyAttack` / `cancelEnemyAttack`、`playDamageEffect` のひるみ、`playDefeatEffect` / `clearEnemy` での中断、`loop()` の 2.5 番）
- 変更: `src/utils/battle/useBattle.js`（攻撃予約の `useEffect`、`handlePlayerHit`、`playerHits`）
- 変更: `src/components/battle/BattleHud.jsx`（被弾演出）
- 変更: `src/App.css`（`.player-hit-flash`, `.player-hit-text`）
- 変更（ドキュメント）: `docs/APP_DESIGN.md`, `docs/IMAGE_TRIGGER_SETUP.md`, `docs/LAST_BOSS.md`

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. PC で `npm run dev` し、開発用コード（`VITE_DEV_ROOM_CODE`）で子供としてダンジョンに入り、にんじんの画像を映して敵を出す。何もしないで待つと約 3 秒後に敵が赤く点滅して膨らみ、約 0.8 秒後に赤い弾が手前へ飛んできて、画面の縁が赤く光り「いたい！」が出ること。以降 3〜5 秒おきに繰り返すこと。
3. 溜め（赤い点滅）の最中に魔法を当てると、弾が出ずに通常の被弾演出（白フラッシュ・潰れ）だけが出て、次の攻撃が 3〜5 秒後に予約されること。弾が飛んでいる最中に魔法を当てても弾は消えずに当たること。
4. 溜め中・弾が飛んでいる最中に敵を倒すと、弾が消えて被弾しないこと。撃破後、アイテムを拾って次の敵が出るまで攻撃が来ないこと。
5. DevTools の React DevTools で `useBattle` の `playerHits` が被弾ごとに 1 ずつ増えること。DevTools コンソールで被弾直後に `sceneRef.current.enemyAttack({ onHit: () => console.log('hit') })` を続けて呼び、1.5 秒以内の 2 発目では `playerHits` が増えない（`canTakeHit` が false）ことを確認する。
6. 親子を通常コードで 2 タブ接続し、DevTools の Sensors で子を 50 m 以上離して脱出させる。溜め中・弾が飛んでいる最中に脱出しても弾が消え、脱出中は攻撃されないこと。10 m 以内に戻って復活すると約 3〜5 秒後から攻撃が再開すること。
7. 親子を 2 タブで接続し、子がダンジョンに入った状態で親の「ラスボスを呼ぶ」を押す。門・スポットライトの演出中は攻撃されず、演出の終了から約 3 秒後に最初の攻撃が来ること。2.5 m 先から弾が約 0.9 秒かけて迫ってくること。被弾・魔法の着弾の後もラスボスの目の赤い発光が消えないこと。
8. `npm run tunnel` で HTTPS 公開し、実機で E-1〜E-3a を確認する。端末を左右に振っても敵弾が画面中央やや下へ向かってくること。
