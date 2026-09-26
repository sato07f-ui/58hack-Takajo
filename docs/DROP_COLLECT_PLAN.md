# ドロップアイテム回収アニメーション 実装手順書（Three.js + createScene ループ）

## 背景
敵を倒すと足元にドロップアイテム（バナナブーメラン等）が出るところまでは `docs/DROP_ITEM_PLAN.md` で実装済み。
今はドロップがその場で回転し続けるだけで「手に入れた」感が無いので、少し待ってから自動でプレイヤー（カメラ）に吸い寄せられ、手前で縮んで消えるアニメーションを付ける。消えた瞬間に「手に入れた」通知を出し、UI の表示もそのタイミングに合わせる。

タップして拾う案は不採用。AR でのタップ判定（Raycaster）は未実装で、スマホで小さいモデルを正確にタップするのも難しい。自動回収なら既存の魔法弾追尾（`lerp`）と撃破演出（`multiplyScalar`）のパターンだけで作れる。
Tween ライブラリ（GSAP 等）の導入も不採用。毎フレームの `lerp` で十分滑らかで、依存を増やさずに済む。

前提と方針:
- 既存構成は React 19 + Vite + three ^0.186。描画ループは `src/utils/ar/createScene.js` の `loop()` に集約されており、演出は全てここで毎フレーム更新する。
- ドロップは単一変数 `dropModel` で持ち、`spawnDrop(item, position)` で出て `clearDrop()` で消える。撃破演出後に `hasDropped` フラグで 1 回だけ生成され、同時に `onDefeat(enemy, item)` が呼ばれる。
- 追尾は「2. 魔法弾の追尾と着弾判定」の `position.lerp(target, PROJECTILE_LERP)` と同じ方式にする。縮小は「1. 撃破演出」の `scale.multiplyScalar(0.9)` と同じ方式にする。
- カメラ位置は `onFrame` でセンサーから毎フレーム更新されるので、吸い寄せ先は `loop()` 内で毎フレーム `camera` から計算する（固定座標にしない）。
- 通知は `onDefeat`（撃破・ドロップ発生）と `onItemCollect`（回収完了）に分け、`App.jsx` の「手に入れた！」表示は `onItemCollect` で行う。`onDefeat` の既存のシグネチャは変えない。
- 変更するのは `src/utils/ar/createScene.js`, `src/utils/ar/ArScene.jsx`, `src/App.jsx` の 3 ファイルのみ。新規ファイルは作らない。`items.js`, `enemies.js` は触らない。

### ドロップの状態遷移
```
spawnDrop ──▶ idle（足元で回転、DROP_IDLE_MS 待つ）
               │ 経過時間 >= DROP_IDLE_MS
               ▼
            attract（毎フレーム、カメラ手前の点へ lerp しつつ縮小）
               │ 距離 < DROP_COLLECT_DISTANCE または scale < baseScale * 0.05
               ▼
            collected（clearDrop() → onItemCollect(item)）
```
- 状態は `dropModel.userData.state`（`'idle' | 'attract'`）と `dropModel.userData.spawnedAt`（`performance.now()`）で持つ。
- 吸い寄せ先はカメラのローカル座標で `(0, -0.15, -0.3)`（画面中央やや下、30 cm 手前）。`camera.localToWorld` でワールド座標にする。魔法弾の発射位置（`translateY(-0.1)`, `translateZ(-0.1)`）と同じ「手元」の感覚に揃える。
- しきい値の根拠:
  - `DROP_IDLE_MS = 800`: 撃破演出（約 30 フレーム ≒ 0.5 秒）の直後に消えると何が落ちたか見えないため、1 秒弱は見せる。
  - `DROP_ATTRACT_LERP = 0.12`: 魔法弾の `0.15` より少し遅くして「拾われる」重さを出す。敵までの距離 0.5 m なら約 20 フレームで到達する。
  - `DROP_ATTRACT_SHRINK = 0.93`: 20 フレームで `0.93^20 ≒ 0.23` 倍。到着時にまだ見えているが十分小さい。
  - `DROP_COLLECT_DISTANCE = 0.05`: 魔法弾の着弾距離 `0.15` より小さくし、手前まで来てから消す。

---

## Phase A: createScene に回収アニメーションを追加（PR #1）

- **[A-1]** `src/utils/ar/createScene.js` の定数群に次を追加する。
  - `DROP_IDLE_MS = 800`, `DROP_ATTRACT_LERP = 0.12`, `DROP_ATTRACT_SHRINK = 0.93`, `DROP_COLLECT_DISTANCE = 0.05`
  - `const _collectPoint = new THREE.Vector3(0, -0.15, -0.3)`（カメラローカルの吸い寄せ先。毎フレーム `_target` にコピーして使う）
  - `const _target = new THREE.Vector3()`（ワールド座標の一時変数。`_center` とは別に用意する）
- **[A-2]** `createScene(canvas, { onFrame, onDefeat, onCollect })` に `onItemCollect(item)` オプションを追加する。JSDoc に「ドロップが手元に届いて消えたときに呼ばれる。item は ITEMS の要素」を書く。
- **[A-3]** `spawnDrop` で `model.userData.state = 'idle'` と `model.userData.spawnedAt = performance.now()` を設定する。既存の位置計算・回転は変えない。
- **[A-4]** `loop()` の「4. ドロップを回して」を「4. ドロップの演出」に書き換え、状態ごとに処理する。
  - `idle`: 従来どおり `rotation.y += DROP_SPIN`。`performance.now() - spawnedAt >= DROP_IDLE_MS` なら `state = 'attract'` にする。
  - `attract`: `_target.copy(_collectPoint)` → `camera.localToWorld(_target)` で吸い寄せ先を求め、`dropModel.position.lerp(_target, DROP_ATTRACT_LERP)`、`dropModel.scale.multiplyScalar(DROP_ATTRACT_SHRINK)`、`rotation.y += DROP_SPIN * 3`（回転を速めて勢いを出す）を適用する。
  - `attract` 中に `position.distanceTo(_target) < DROP_COLLECT_DISTANCE` または `scale.x < baseScale * 0.05` になったら `collectDrop()` を呼ぶ。
- **[A-5]** `collectDrop()` を追加する。`const item = dropModel?.userData.item` を退避してから `clearDrop()` し、`item` があれば `onCollect?.(item)` を呼ぶ。`dropModel` が無ければ何もしない。
  - `clearDrop()` は既存のまま使う（`scene.remove` と dispose）。`clearEnemy()` から呼ばれる経路では `onItemCollect` は呼ばない（回収ではなく片付けなので）。
- **[A-6]** `createScene` の戻り値に `collectDrop` を追加する（デバッグ用に DevTools から即回収できるようにする）。
- **[A-7]** `dispose()` 時に `attract` 中でも例外が出ないことを確認する。`running = false` の後は `loop()` が回らないため追加処理は不要だが、`collectDrop` 内で `running` を見て `onItemCollect` を呼ばないようにする。

## Phase B: App.jsx との接続（PR #2）

- **[B-1]** `src/utils/ar/ArScene.jsx` に `onItemCollect` prop を追加し、`onDefeat` と同じく `useRef` + `useEffect` で最新の関数を保持して `createScene(canvasRef.current, { onFrame, onDefeat, onCollect })` に渡す。JSDoc に「props.onItemCollect(item): ドロップが手元に届いたときに呼ばれる（任意）」を書く。
- **[B-2]** `src/App.jsx` の `onDefeat={(enemy, item) => setDroppedItem(item)}` を削除し、`onCollect={setDroppedItem}` に置き換える。「{item.name} を手に入れた！」の表示タイミングが回収完了時になる。
  - `onDefeat` は `App.jsx` からは渡さない（撃破時に必要な処理は現状無い。将来スコア加算などで使う）。
- **[B-3]** 回収時のフィードバックとして、`onItemCollect` 内で `navigator.vibrate?.(50)` を呼ぶ（着弾時の 100 ms より短くする）。

## Phase C: 実機対応と仕上げ（PR #3）

- **[C-1]** iPhone Safari と Android Chrome で、敵を倒した後にブーメランが約 0.8 秒回ってから画面中央下へ吸い寄せられ、縮んで消えることを確認する。カメラを動かしても吸い寄せ先が追従すること。
- **[C-2]** 吸い寄せ先が画面外に出る、または近すぎて `camera.near`（0.1）で切れる場合は `_collectPoint` の z を `-0.3 〜 -0.5` の範囲で調整する。
- **[C-3]** `docs/DROP_ITEM_PLAN.md` の「ドロップの流れ」に、生成後の `idle → attract → collected` と `onItemCollect(item)` を追記する。
- **[C-4]** `docs/IMAGE_TRIGGER_SETUP.md` の「戦闘との接続」に「ドロップは約 0.8 秒後にプレイヤーへ吸い寄せられ、消えたときに `onItemCollect(item)` が呼ばれる」を追記する。

---

## 主な変更・新規ファイル
- 変更: `src/utils/ar/createScene.js`（定数、`onItemCollect` オプション、`spawnDrop` の状態初期化、`loop()` の 4 番、`collectDrop`）
- 変更: `src/utils/ar/ArScene.jsx`（`onItemCollect` prop の中継のみ）
- 変更: `src/App.jsx`（`onDefeat` → `onItemCollect` への差し替え、振動）
- 変更（ドキュメント）: `docs/DROP_ITEM_PLAN.md`, `docs/IMAGE_TRIGGER_SETUP.md`
- 新規: なし

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. PC で `npm run dev` し、バナナを映して敵を出し、魔法を 5 回撃つ。敵が縮んで消えた後、ブーメランが約 0.8 秒その場で回り、その後画面中央下へ向かって縮みながら飛んできて消えること。消えた瞬間に「バナナブーメラン を手に入れた！」が出ること（それより前には出ないこと）。
3. DevTools で `sceneRef.current.collectDrop()` を `idle` 中に呼ぶと即座に消えて「手に入れた！」が出ること。`attract` 中に `clearEnemy()` を呼ぶとドロップだけ消えて「手に入れた！」が出ないこと。
4. `drop: null` の敵（ピーマン）では何も出ず、`onItemCollect` も呼ばれないこと（`console.log` で確認）。
5. `npm run tunnel` で HTTPS 公開し、実機で C-1 を確認する。吸い寄せ中に端末を左右に振っても、ブーメランが画面内の同じ位置（中央下）に向かってくること。
