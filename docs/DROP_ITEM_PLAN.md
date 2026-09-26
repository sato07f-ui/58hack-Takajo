# ドロップアイテム表示機能 実装手順書（Three.js + GLTFLoader）

## 背景
敵を倒したとき、その敵に対応するドロップアイテムを AR 空間に 3D モデルで表示する。
最初の対象はバナナで、バナナの敵を倒したら `src/assets/banana_boomerang.glb` を敵がいた位置に描画する。
他の敵（にんじん → `carrot_sword.glb` など）も同じ仕組みで後から追加できるよう、敵定義にドロップを持たせる設計にする。

アイテム専用の描画パイプラインを別に作る案は不採用。既存の `loadEnemyModel` と `spawnEnemy` の「glb を読む → 高さを揃える → 足元を原点にして置く」ロジックがそのまま使えるため、これを汎用化して流用する。

前提と方針:
- 既存構成は React 19 + Vite + three ^0.186。`src/App.jsx` がバトル状態（`enemyHp`, `mp`）を持ち、`sceneRef` 経由で `src/utils/ar/createScene.js` に命令を送る。
- 現状 `App.jsx` は HP が 0 になっても何もしない（`playDefeatEffect` を呼んでおらず、出現した敵の種類も `onEnemySpawn` で受け取っていない）。撃破判定とドロップ発生はこの手順書で新設する。
- 敵定義は `src/utils/enemy/enemies.js` の `ENEMIES` 配列。ここに `drop` フィールドを足し、`id` でドロップアイテム定義を引く。
- glb の読み込みは `src/utils/enemy/loadEnemyModel.js` の GLTFLoader + `cache`（url → Promise）パターンに合わせる。
- 撃破演出は `createScene.js` の `loop()` 内「1. 撃破演出」（回転しながら縮小 → `visible = false`）に続けてドロップを出す。演出の途中で出すと敵と重なるため、敵が消えた直後に出す。
- 新規コードは `src/utils/item/` に置く。変更するのは `enemies.js`, `loadEnemyModel.js`, `createScene.js`, `App.jsx` の 4 ファイルのみ。`ArScene.jsx` は `onEnemySpawn` を既に持つので変更しない。

### ドロップの流れ
```
魔法弾が着弾 ──▶ onHit() で enemyHp を減算
enemyHp === 0 ──▶ App.jsx が sceneRef.playDefeatEffect() を呼ぶ
撃破演出完了（敵が visible=false）──▶ createScene が敵の位置に spawnDrop(item) を実行
                                    ──▶ onDefeat(enemy, item) を App.jsx に通知
```
- ドロップの位置は「敵の足元（`model.position`）」とし、高さ 0.15 m で浮かせて表示する。
- ドロップは回転させて「拾えるもの」に見せる（毎フレーム `rotation.y += 0.02`）。
- 拾う・インベントリに入れる処理は本手順書の範囲外。表示までを担当する。

---

## Phase A: ドロップアイテム定義とモデル読み込みの汎用化（PR #1）

- **[A-1]** `src/utils/item/items.js` を作成する。`ITEMS` 配列を export し、要素は `{ id, name, modelUrl, height }`。
  - `{ id: 'banana-boomerang', name: 'バナナブーメラン', modelUrl: bananaBoomerangUrl, height: 0.2 }` を登録する。`bananaBoomerangUrl` は `import bananaBoomerangUrl from '../../assets/banana_boomerang.glb?url'` で得る。
  - `findItem(id)` を export する。`ITEMS.find` の薄いラッパーで、見つからなければ `null` を返す。
- **[A-2]** `src/utils/enemy/enemies.js` の `ENEMIES` に `drop` フィールドを足す。値はアイテム `id`（文字列）か `null`。
  - `banana` の敵に `drop: 'banana-boomerang'` を設定する。他の敵は `drop: null` とする。
  - JSDoc に「drop: 倒したときに出るアイテムの id（`src/utils/item/items.js`）。null なら何も落とさない」を追記する。
- **[A-3]** `src/utils/enemy/loadEnemyModel.js` から glb 読み込み部分を切り出し、`src/utils/item/loadModel.js` に `loadModel(url)` として置く。
  - `GLTFLoader` インスタンスと `cache` Map をここに移す。`url` が falsy なら `null` を返す。戻り値は `gltf.scene.clone(true)`。
  - `loadEnemyModel(url)` は `loadModel(url)` を呼び、`null` なら `createPlaceholderModel()` を返すように書き換える。外部 API は変えない。
- **[A-4]** `createScene.js` 内の「表示サイズを height に揃える → baseScale を記録 → マテリアルを個体ごとに clone」の 3 処理を `prepareModel(model, height)` として同ファイル内の関数に切り出し、`spawnEnemy` から呼ぶ。挙動は変えない。

## Phase B: 撃破判定とドロップ生成（PR #2）

- **[B-1]** `createScene.js` に `spawnDrop(item, position)` を追加する。
  - `loadModel(item.modelUrl)` でモデルを取得し、`prepareModel(model, item.height)` を適用する。
  - `model.position.copy(position)` した後 `model.position.y += 0.15` で浮かせる。`model.lookAt` はしない（ブーメランは向きを固定しなくてよい）。
  - `model.userData.item = item` を付けて `scene.add`、`drops` 配列（新設）に push して返す。`running` が false なら `null` を返す。
- **[B-2]** `loop()` の「1. 撃破演出」で敵を `visible = false` にした直後に、その敵の `userData.enemy.drop` を `findItem` で引き、アイテムがあれば `spawnDrop(item, model.position)` を 1 回だけ呼ぶ。
  - 二重生成を防ぐため `model.userData.dropped = true` を立て、立っていればスキップする。
  - 生成後に `onDefeat?.(model.userData.enemy, item)` を呼ぶ。`onDefeat` は `createScene(canvas, { onFrame, onDefeat })` のオプションとして受け取る。アイテムが無い敵でも `onDefeat(enemy, null)` は呼ぶ。
- **[B-3]** `loop()` に「4. ドロップの回転」を足す。`drops` の各モデルに `rotation.y += 0.02` を適用する。
- **[B-4]** `clearEnemies()` でドロップも消す。`drops` の各モデルを `scene.remove` し、geometry / material を dispose して `drops.length = 0` にする。`dispose()` は既に `clearEnemies()` を呼んでいるので追加変更は不要。
- **[B-5]** `createScene` の戻り値に `spawnDrop` を追加する（デバッグ用に外から直接出せるようにする）。

## Phase C: App.jsx との接続（PR #3）

- **[C-1]** `App.jsx` に `currentEnemy` state（`null | ENEMIES の要素`）を追加し、`<ArScene onEnemySpawn={setCurrentEnemy} />` で受け取る。
- **[C-2]** `handleAttack` の HP 減算を「`sceneRef.current?.shootMagic(onHit)`」経由に変え、着弾時の `onHit` 内で `setEnemyHp` を行う。現状の即時減算 + `playDamageEffect()` 直呼びは削除する（`shootMagic` が着弾時に `playDamageEffect` を呼ぶため二重になる）。
- **[C-3]** `useEffect` で `enemyHp === 0` になったら `sceneRef.current?.playDefeatEffect()` を 1 回だけ呼ぶ。`defeatedRef`（`useRef(false)`）で多重呼び出しを防ぐ。
- **[C-4]** `ArScene` に `onDefeat` prop を追加し、内部の `createScene(canvasRef.current, { onFrame, onDefeat })` に渡す。`App.jsx` 側では `onDefeat={(enemy, item) => setDroppedItem(item)}` で受け取り、`droppedItem` state に保存する。
- **[C-5]** `.ui-layer` の `battle-status` に、`droppedItem` があれば `「{item.name} を手に入れた！」` を表示する。CSS は `App.css` の `.battle-status p` をそのまま使う。

## Phase D: 仕上げとドキュメント（PR #4）

- **[D-1]** `banana_boomerang.glb` の実サイズ・原点位置を確認し、`height: 0.2` と `y += 0.15` で敵の足元に自然に浮くか実機で調整する。原点が中心にあるモデルなら `prepareModel` 後に `_box.min.y` 分だけ持ち上げる補正を `spawnDrop` に入れる。
- **[D-2]** `carrot_sword.glb` と `potion.glb` を `ITEMS` に登録し、`carrot` の敵に `drop: 'carrot-sword'` を設定して、仕組みが敵ごとに使えることを確認する（バナナ以外の割り当ては仮でよい）。
- **[D-3]** `docs/APP_DESIGN.md` の「食材 → 敵の対応表」にドロップアイテム列を追加し、「3Dモデル」の格納場所を `src/assets/*.glb` として記入する。
- **[D-4]** `docs/IMAGE_TRIGGER_SETUP.md` の「戦闘との接続」に「倒すと `onDefeat(enemy, item)` が呼ばれ、ドロップは `clearEnemies()` で消える」を追記する。

---

## 主な変更・新規ファイル
- 変更: `src/App.jsx`, `src/utils/ar/ArScene.jsx`（`onDefeat` prop の追加のみ）, `src/utils/ar/createScene.js`, `src/utils/enemy/enemies.js`, `src/utils/enemy/loadEnemyModel.js`
- 新規: `src/utils/item/{items,loadModel}.js`
- 変更（ドキュメント）: `docs/APP_DESIGN.md`, `docs/IMAGE_TRIGGER_SETUP.md`

## 検証方法
1. `npm run lint` と `npm run build` が通ること。
2. PC で `npm run dev` し、カメラにバナナ（または COCO-SSD が banana と判定する画像）を映して敵を出す。魔法を 5 回撃って HP が 0 になったら、敵が縮んで消えた後に同じ位置でバナナブーメランが回転表示されること。
3. 画面に「バナナブーメラン を手に入れた！」が出ること。`drop: null` の敵（ピーマン）では何も出ず、`onDefeat(enemy, null)` だけ呼ばれること（console.log で確認）。
4. 撃破後に魔法ボタンを連打してもドロップが 2 個以上出ないこと。`clearEnemies()` を DevTools から呼んでドロップが消えること。
5. `npm run tunnel` で HTTPS 公開し、iPhone Safari と Android Chrome で本物のバナナを映して倒し、ブーメランが敵の足元付近に自然な大きさで出ることを確認する。
