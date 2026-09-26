# 画像トリガーで敵を出現させる 実装手順書（MindAR 認識のみ使用）

## 0. この手順書のゴールと前提

### ゴール
カメラに **`.mind` に登録した画像**（食材のパッケージ・ポスターなど）が映ったら、**その画像が見えている方向の 2m 先に、対応する敵の 3D モデル（glb）を出現させる**。

出現後は、既存の「端末の向きに追従する AR」（[AR_SETUP.md](AR_SETUP.md)）で敵がその場に固定されて見える。

### 方式: 画像認識は「トリガー」だけに使う
| 役割 | 担当 |
|---|---|
| カメラ映像の取得・表示 | 既存の `useCamera`（`<video>`）|
| 画像の検出 | **MindAR の `Controller`（認識エンジン部分だけ）** に同じ `<video>` を渡す |
| 3D 描画・向き追従 | 既存の `createScene`（Three.js）|
| 敵の出現位置 | 検出した画像の中心が **画面上のどこに映っているか** だけを使い、その方向の 2m 先に置く |

MindAR には「カメラ起動・Three.js 描画まで全部やる」`MindARThree` もあるが、**使わない**。それを使うとカメラと描画が二重になり、既存の向き追従と競合するため。

### なぜ「画像の方向に 2m 先」なのか（方式 A）
MindAR は画像の位置・向き・距離（姿勢）まで返すが、次の理由でそのまま 3D 座標には使わない。

- MindAR の座標は **MindAR 内部のカメラ（画角 45° 固定・映像サイズ基準）** が前提。こちらの Three.js カメラは画角 60° 固定で、映像も `object-fit: cover` で端が切れているため、そのまま使うとずれる
- そもそも既存 AR は位置追跡が無い（歩いても近づかない）ので、画像にぴったり置いても維持できない

そこで **「画像の中心が映っている画面上の点」→「Three.js カメラからその点へのレイ」→「レイ上 2m の位置」** に敵を置く。画面上の点を経由するので、画角の違いに影響されない。

### 前提条件
- [AR_SETUP.md](AR_SETUP.md) の手順が完了していること（カメラ表示・向き追従が動く）
- HTTPS で開くこと（既存と同じ）
- 実機で検証すること（PC でも認識自体は試せる）

---

## 1. 環境構築

### 1-1. 依存追加
```bash
npm i mind-ar
```

`mind-ar` は依存に **`canvas`（Node 用ネイティブモジュール）** を含み、環境によってはインストール時のビルドで失敗する。ブラウザで使う `dist/` は `canvas` を使わないので、失敗したらビルドスクリプトを飛ばして入れてよい。

```bash
npm i mind-ar --ignore-scripts
```

`--ignore-scripts` は **他のパッケージのインストールスクリプトも全部飛ばす**。このプロジェクトでは `cloudflared` が本体をダウンロードするスクリプトを持っているので、その分だけ後から実行しておく。

```bash
npm rebuild cloudflared
```

チームメンバーが `package.json` を pull して入れる場合も同じ（`npm i --ignore-scripts` → `npm rebuild cloudflared`）。

GLTFLoader は `three` に同梱されているので追加インストールは不要（`three/addons/loaders/GLTFLoader.js`）。

### 1-2. 使う MindAR の API（v1.2.5 で確認）
`import { Compiler, Controller } from 'mind-ar/dist/mindar-image.prod.js'`

| API | 役割 |
|---|---|
| `new Controller({ inputWidth, inputHeight, onUpdate, maxTrack })` | 認識エンジンを作る。入力サイズは映像の実サイズ |
| `controller.addImageTargetsFromBuffer(buffer)` | `.mind` の中身を読み込む。戻り値の `dimensions[i]` が画像 i の `[幅, 高さ]`（px）。**読めるのは 1 つだけ**（2 回呼ぶと上書き）|
| `new Compiler()` / `compiler.importData(buffer)` | `.mind` の中身（画像データのリスト）を取り出す |
| `compiler.data = [...]` → `compiler.exportData()` | 画像データのリストを `.mind` の形式に戻す。複数の `.mind` をつなげるのに使う |
| `controller.dummyRun(video)` | GPU カーネルの事前ビルド（初回の引っかかり防止）|
| `controller.processVideo(video)` | 認識ループ開始。毎フレーム `onUpdate` が呼ばれる |
| `controller.stopProcessVideo()` | 認識ループ停止 |
| `controller.getProjectionMatrix()` | MindAR 内部カメラの射影行列（列優先 16 要素）|
| `controller.dispose()` | Worker ごと破棄 |

`onUpdate` に届くデータ:

| `type` | 中身 |
|---|---|
| `'updateMatrix'` | `{ targetIndex, worldMatrix }`。`worldMatrix` は画像の姿勢（列優先 16 要素）。見失うと `null` |
| `'processDone'` | 1 フレーム処理完了（今回は無視）|

MindAR は内部で **5 フレーム連続で追跡できてから** `updateMatrix` を送る（`warmupTolerance`）。一瞬の誤検出で敵が出ることはこれで防がれる。

---

## 2. `.mind` ファイルを作る（1 画像 1 ファイル）

1. 認識させたい画像を用意する（JPG / PNG）。**模様が細かくコントラストが強い画像ほど認識しやすい**。無地・単色・繰り返し模様は苦手
2. MindAR の公式コンパイラ（ブラウザで動く）を開く: https://hiukim.github.io/mind-ar-js-doc/tools/compile
3. **画像を 1 枚だけ** アップロードして Start → `.mind` をダウンロード
4. 敵の名前にして `public/targets/` に置く（例: `public/targets/carrot.mind` → `/targets/carrot.mind` で配信される）
5. `src/utils/enemy/enemies.js` の該当する敵の `targetUrl` にそのパスを書く（5-1）

画像を足すときは「`.mind` を置く → `enemies.js` に 1 行書く」だけでよい。並び順を気にする必要は無い。

### 複数の `.mind` をどう認識させているか
MindAR の認識エンジンは `.mind` を **1 つしか読み込めない**。そこでアプリ起動時に、全ての `.mind` をダウンロードして中身（画像データのリスト）を 1 つにつなげ、つなげたものを認識エンジンに渡している（4-1 の `loadAndMergeTargets`）。

- 認識エンジンが返す番号（つなげた後の何枚目か）は、どのファイルから来たかに変換してから返す。なので `enemies.js` の敵と `.mind` がずれることは無い
- **1 つの `.mind` に画像を 2 枚以上入れないこと**。入れた場合、そのファイルのどの画像を映しても同じ敵が出る

コンパイラ画面に表示される特徴点（赤い点）が少ない画像は認識しにくいので差し替える。

---

## 3. ファイル構成

```
public/
  targets/                    ← 新規: 認識させる画像（2 章で作成。1 画像 1 ファイル）
    carrot.mind
    greenpepper.mind
src/
  assets/
    carrot.glb                  （既存）
    greenpepper.glb             （既存）
    spinach.glb                 （既存）
  utils/
    ar/
      ArScene.jsx             ← 変更: 画像トリガーをつなぎ、検出したら敵を出す
      createScene.js          ← 変更: spawnEnemy / clearEnemies を追加
      useCamera.js              （変更なし）
      useDeviceOrientation.js   （変更なし）
    imageTrigger/             ← 新規: 画像認識（トリガー）
      createImageTracker.js     MindAR Controller を包む。React 非依存
      useImageTrigger.js        React hook。カメラ準備完了で認識を開始
      videoToScreen.js          映像上の座標 → 画面上の座標（object-fit: cover 補正）
    enemy/                    ← 新規: 敵の定義と読み込み
      enemies.js                敵の一覧（名前・モデル・.mind・表示サイズ）
      loadEnemyModel.js         GLTFLoader でモデルを読み込む（キャッシュ付き）
docs/
  IMAGE_TRIGGER_SETUP.md      ← この手順書
```

**方針**（[AR_SETUP.md](AR_SETUP.md) と同じ）: 認識エンジンの操作（`createImageTracker.js`）と 3D の操作（`createScene.js`）は React から切り離した純粋 JS にし、React 側（`useImageTrigger.js` / `ArScene.jsx`）は「作る・つなぐ・破棄する」だけにする。

### データの流れ
```
public/targets/*.mind ──(起動時に 1 つにつなげる)──┐
                                                   ▼
useCamera ──<video>──┬─→ 画面に表示（z-index 0）
                     └─→ createImageTracker（MindAR Controller）
                              │ i 番目のファイルの画像を検出（worldMatrix）
                              ▼
                         画像中心の映像座標 (videoX, videoY)
                              │ videoToScreen（cover 補正）
                              ▼
                         画面座標 (screenX, screenY)
                              │ SCAN_TARGETS[i]（.mind がある敵）
                              ▼
                     createScene.spawnEnemy(enemy, screenX, screenY)
                              │ Three.js カメラからのレイ上 2m に glb を配置
                              ▼
                         canvas に描画（z-index 1）→ 以後は向き追従で固定
```

---

## 4. Step 1: MindAR の認識エンジンを包む

### 4-1. `src/utils/imageTrigger/createImageTracker.js`
```js
import * as THREE from 'three'
import { Compiler, Controller } from 'mind-ar/dist/mindar-image.prod.js'

const _m = new THREE.Matrix4()
const _p = new THREE.Matrix4()
const _v = new THREE.Vector3()

/**
 * MindAR の worldMatrix から、画像の中心が映像のどこに映っているか（px）を求める。
 * 画像座標系は「単位は画像の px」なので、中心は (幅/2, 高さ/2, 0)。
 */
const projectMarkerCenter = (controller, worldMatrix, [markerW, markerH], video) => {
  _m.fromArray(worldMatrix)
  _p.fromArray(controller.getProjectionMatrix())
  // 画像座標 → MindAR カメラ座標 → 正規化デバイス座標（-1〜1）
  _v.set(markerW / 2, markerH / 2, 0).applyMatrix4(_m).applyMatrix4(_p)
  return {
    videoX: ((_v.x + 1) / 2) * video.videoWidth,
    videoY: ((1 - _v.y) / 2) * video.videoHeight,
  }
}

/**
 * 複数の .mind を読み込み、1 つの .mind データにつなげる。
 * MindAR の認識エンジンは .mind を 1 つしか読めないため、中身（画像データのリスト）を連結する。
 * 戻り値: { buffer, fileIndexOf }
 * fileIndexOf[i]: 連結後の i 番目の画像が、targetUrls の何番目のファイルから来たか
 */
const loadAndMergeTargets = async (targetUrls) => {
  const compiler = new Compiler()
  const data = []
  const fileIndexOf = []
  for (const [fileIndex, url] of targetUrls.entries()) {
    const res = await fetch(url)
    // 存在しないパスでも開発サーバーは index.html を 200 で返すので、HTML も失敗扱いにする
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`${url} が見つかりません（public/ に置いたか確認してください）`)
    }
    let list
    try {
      list = compiler.importData(await res.arrayBuffer())
    } catch {
      throw new Error(`${url} は .mind ファイルとして読み込めませんでした`)
    }
    if (list.length === 0) throw new Error(`${url} は MindAR の現在の形式ではありません。コンパイルし直してください`)
    for (const item of list) {
      data.push(item)
      fileIndexOf.push(fileIndex)
    }
  }
  compiler.data = data
  return { buffer: compiler.exportData(), fileIndexOf }
}

/**
 * <video> を入力に、targetUrls の .mind に登録された画像を探す。
 * 見つかったら onDetect({ targetIndex, videoX, videoY }) を 1 回だけ呼び、認識を止める。
 * targetIndex は「targetUrls の何番目のファイルの画像か」。
 * 戻り値: { start(), stop(), dispose() }
 * video は再生中（videoWidth が確定済み）であること。
 */
export const createImageTracker = async (video, { targetUrls, onDetect }) => {
  // MindAR は video の width / height「属性」を入力サイズとして読むので、実サイズを入れておく
  video.setAttribute('width', video.videoWidth)
  video.setAttribute('height', video.videoHeight)

  let dimensions = []
  let fileIndexOf = []
  let scanning = false

  const controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: 1, // 同時に追う画像は 1 枚で十分
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (!scanning || type !== 'updateMatrix' || worldMatrix === null) return
      scanning = false
      controller.stopProcessVideo() // トリガーとしてだけ使うので、見つけたら止める
      onDetect({
        targetIndex: fileIndexOf[targetIndex],
        ...projectMarkerCenter(controller, worldMatrix, dimensions[targetIndex], video),
      })
    },
  })

  try {
    const merged = await loadAndMergeTargets(targetUrls)
    fileIndexOf = merged.fileIndexOf
    dimensions = controller.addImageTargetsFromBuffer(merged.buffer).dimensions
    controller.dummyRun(video)
  } catch (e) {
    controller.dispose()
    throw e
  }

  return {
    start() {
      if (scanning) return
      scanning = true
      controller.processVideo(video)
    },
    stop() {
      scanning = false
      controller.stopProcessVideo()
    },
    dispose() {
      scanning = false
      controller.dispose()
    },
  }
}
```

ポイント:
- `scanning` フラグで **1 回だけ** `onDetect` を呼ぶ。`stopProcessVideo()` は現在のフレームの処理が終わってから止まるため、直後にもう一度 `onUpdate` が来ることがある
- `video.setAttribute('width' / 'height')` を忘れると入力サイズが 0 になり、何も検出されない（エラーも出ない）

### 4-2. `src/utils/imageTrigger/videoToScreen.js`
`<video>` は `object-fit: cover` で画面いっぱいに拡大され、はみ出た端が切れている。映像上の座標を、画面上の座標に変換する。

```js
/**
 * 映像上の座標（px, videoWidth 基準）を、画面上の座標（CSS px）に変換する。
 * .ar-video の object-fit: cover を前提にする。
 * 画面外（切れて見えない部分）に出た場合は画面の端に寄せる。
 */
export const videoToScreen = (video, videoX, videoY) => {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const sw = video.clientWidth
  const sh = video.clientHeight
  const scale = Math.max(sw / vw, sh / vh) // cover: 大きい方の倍率で拡大
  const x = (videoX - vw / 2) * scale + sw / 2
  const y = (videoY - vh / 2) * scale + sh / 2
  return {
    x: Math.min(Math.max(x, 0), sw),
    y: Math.min(Math.max(y, 0), sh),
  }
}
```

### 4-3. `src/utils/imageTrigger/useImageTrigger.js`
```js
import { useCallback, useEffect, useRef, useState } from 'react'
import { createImageTracker } from './createImageTracker'

/**
 * enabled が true になったら targetUrls の .mind に登録された画像を探し始める hook。
 * 見つかったら onDetect({ targetIndex, videoX, videoY }) を呼んで止まる。
 * targetIndex は「targetUrls の何番目のファイルの画像か」。
 * targetUrls は毎レンダーで作り直さないこと（変わると認識をやり直す）。
 * 戻り値: { status, error, rescan }
 * status: 'idle' | 'scanning' | 'detected' | 'error'
 * rescan(): 敵を倒した後などに、もう一度探し始める
 */
export const useImageTrigger = (videoRef, { enabled, targetUrls, onDetect }) => {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const trackerRef = useRef(null)
  const onDetectRef = useRef(onDetect)

  // 毎レンダーで最新のコールバックを参照する（effect を張り直さないため）
  useEffect(() => {
    onDetectRef.current = onDetect
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const start = async () => {
      try {
        const tracker = await createImageTracker(videoRef.current, {
          targetUrls,
          onDetect: (result) => {
            setStatus('detected')
            onDetectRef.current?.(result)
          },
        })
        if (cancelled) {
          tracker.dispose()
          return
        }
        trackerRef.current = tracker
        tracker.start()
        setStatus('scanning')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError(e.message)
      }
    }
    start()

    return () => {
      cancelled = true
      trackerRef.current?.dispose()
      trackerRef.current = null
    }
  }, [enabled, targetUrls, videoRef])

  const rescan = useCallback(() => {
    if (!trackerRef.current) return
    trackerRef.current.start()
    setStatus('scanning')
  }, [])

  return { status, error, rescan }
}
```

`createImageTracker` は `.mind` の読み込みで非同期になるので、StrictMode の二重マウントで「読み込み中にアンマウント」が起きる。`cancelled` を見て、遅れて出来上がった方を破棄する。

---

## 5. Step 2: 敵の定義と読み込み

### 5-1. `src/utils/enemy/enemies.js`
敵の一覧。`targetUrl` にその敵を出現させる `.mind` を書く。**並び順は自由**（`.mind` との対応は `targetUrl` で決まる）。`.mind` がまだ無い敵は `targetUrl: null` にしておけば、画像認識の対象から外れる。

```js
import carrotUrl from '../../assets/carrot.glb?url'
import greenpepperUrl from '../../assets/greenpepper.glb?url'
import spinachUrl from '../../assets/spinach.glb?url'

/**
 * 敵の定義。
 * modelUrl: 3D モデル（glb）
 * targetUrl: この敵を出現させる画像の .mind（public/targets/ に 1 画像 1 ファイルで置く）。
 *            null の敵は画像認識では出現しない
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 */
export const ENEMIES = [
  { id: 'carrot', name: 'にんじん', modelUrl: carrotUrl, targetUrl: '/targets/carrot.mind', height: 0.6 },
  { id: 'greenpepper', name: 'ピーマン', modelUrl: greenpepperUrl, targetUrl: '/targets/greenpepper.mind', height: 0.5 },
  { id: 'spinach', name: 'ほうれん草', modelUrl: spinachUrl, targetUrl: null, height: 0.7 }, // .mind 未作成
]
```

`?url` を付けると、Vite がファイルを配信し、その URL を文字列で返す。**`.glb` は Vite の既定のアセット拡張子に含まれないため、`?url` が無いとビルドエラーになる**。

モデルは `src/assets/` のままでよい（`public/models/` に移す必要は無い）。

### 5-2. `src/utils/enemy/loadEnemyModel.js`
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()
const cache = new Map() // url → Promise<gltf>

/**
 * glb を読み込み、シーンに追加できる Object3D（複製）を返す。
 * 同じモデルは 2 回目以降ダウンロードしない。
 */
export const loadEnemyModel = async (url) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url))
  const gltf = await cache.get(url)
  return gltf.scene.clone(true)
}
```

### 5-3. モデル側の前提
`3Dchara/generate_*.py` で作ったモデルは次の向きで出力されている。`spawnEnemy` はこれを前提にする。

| 項目 | 値 |
|---|---|
| 上方向 | +Y（glTF 標準）|
| 顔の向き | +Z（Three.js の既定カメラ側）|
| 原点 | モデルの最下部（足元）|

---

## 6. Step 3: `createScene.js` に敵の出現処理を足す

### 6-1. 追加するコード
```js
import * as THREE from 'three'
import { loadEnemyModel } from '../enemy/loadEnemyModel'

const SPAWN_DISTANCE = 2 // カメラから敵までの距離 [m]
const _raycaster = new THREE.Raycaster()
const _ndc = new THREE.Vector2()
const _box = new THREE.Box3()
const _size = new THREE.Vector3()

// createScene の中（scene / camera を作った後）に追加
const enemies = []

/**
 * 画面上の点 (screenX, screenY) の方向、カメラから SPAWN_DISTANCE 先に敵を出す。
 * enemy: ENEMIES の要素
 */
const spawnEnemy = async (enemy, screenX, screenY) => {
  // 画面座標 → Three.js カメラからのレイ → レイ上の点
  _ndc.set((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1)
  camera.updateMatrixWorld()
  _raycaster.setFromCamera(_ndc, camera)
  const center = _raycaster.ray.at(SPAWN_DISTANCE, new THREE.Vector3())

  const model = await loadEnemyModel(enemy.modelUrl)
  if (!running) return null // 読み込み中に dispose された

  // 表示サイズを enemy.height [m] に揃える
  _box.setFromObject(model).getSize(_size)
  model.scale.setScalar(enemy.height / _size.y)

  // 原点が足元なので、モデルの中心がレイ上の点に来るよう半分下げる
  model.position.set(center.x, center.y - enemy.height / 2, center.z)
  // 顔（+Z）をカメラに向ける。水平方向だけ回して傾かないようにする
  model.lookAt(camera.position.x, model.position.y, camera.position.z)

  model.userData.enemy = enemy
  scene.add(model)
  enemies.push(model)
  return model
}

/** 出ている敵を全て消す */
const clearEnemies = () => {
  for (const model of enemies) {
    scene.remove(model)
    model.traverse((obj) => {
      obj.geometry?.dispose()
    })
  }
  enemies.length = 0
}
```

戻り値に追加し、`dispose()` でも片付ける。

```js
  return {
    scene,
    camera,
    renderer,
    moveCube,
    resetCube,
    spawnEnemy,
    clearEnemies,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      clearEnemies()
      testCube.geometry.dispose()
      testCube.material.dispose()
      renderer.dispose()
    },
  }
```

- `window.innerWidth / innerHeight` は `.ar-canvas`（全画面）と同じ大きさなので、画面座標をそのまま使える
- マテリアルとテクスチャは読み込みキャッシュの元モデルと共有しているので、ここでは `dispose()` しない（ジオメトリも `clone(true)` では共有されるが、アプリ終了時の片付けとしては問題ない）
- テスト用の立方体（`testCube`）は、敵が出るのを確認できたら削除してよい

### 6-2. 大きさ・距離の調整
| 定数 | 意味 | 目安 |
|---|---|---|
| `SPAWN_DISTANCE` | カメラからの距離 | 1.5〜3m。近いほど大きく見え、端末を回したときの動きも大きい |
| `ENEMIES[i].height` | 表示の高さ | 距離 2m なら 0.5〜0.8m で画面の 1/3 程度 |

---

## 7. Step 4: `ArScene.jsx` でつなぐ

```jsx
import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { createScene, applyDeviceOrientation } from './createScene'
import { useImageTrigger } from '../imageTrigger/useImageTrigger'
import { videoToScreen } from '../imageTrigger/videoToScreen'
import { ENEMIES } from '../enemy/enemies'

// 画像認識で出現する敵（.mind があるもの）と、その .mind の一覧。
// 認識結果の targetIndex は SCAN_TARGETS の添字になる
const SCAN_TARGETS = ENEMIES.filter((enemy) => enemy.targetUrl)
const TARGET_URLS = SCAN_TARGETS.map((enemy) => enemy.targetUrl)

/**
 * props.orientationRef: useDeviceOrientation() の orientationRef
 * （権限要求は親の「開始」ボタンで済ませてから ArScene をマウントする）
 * props.sceneRef: createScene() の戻り値を親に渡すための ref（任意）
 * props.onEnemySpawn(enemy): 敵が出現したときに呼ばれる（任意。ゲームロジックへの通知用）
 */
export function ArScene({ orientationRef, sceneRef, onEnemySpawn }) {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)
  const localSceneRef = useRef(null) // 親が sceneRef を渡さなくても内部で使う

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      onFrame(camera) {
        const angle = screen.orientation?.angle ?? window.orientation ?? 0
        applyDeviceOrientation(camera, orientationRef.current, angle)
      },
    })
    localSceneRef.current = scene
    if (sceneRef) sceneRef.current = scene
    return () => {
      scene.dispose()
      localSceneRef.current = null
      if (sceneRef) sceneRef.current = null
    }
  }, [orientationRef, sceneRef])

  const { status: scanStatus, error: scanError } = useImageTrigger(videoRef, {
    enabled: status === 'ready', // カメラ映像が流れ始めてから認識を開始
    targetUrls: TARGET_URLS,
    async onDetect({ targetIndex, videoX, videoY }) {
      const enemy = SCAN_TARGETS[targetIndex]
      if (!enemy) return
      const { x, y } = videoToScreen(videoRef.current, videoX, videoY)
      await localSceneRef.current?.spawnEnemy(enemy, x, y)
      onEnemySpawn?.(enemy)
    },
  })

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
      {status === 'ready' && scanStatus === 'scanning' && (
        <p className="ar-message">食材の画像にカメラを向けてください</p>
      )}
      {scanStatus === 'error' && <p className="ar-message">画像認識を開始できませんでした: {scanError}</p>}
    </>
  )
}
```

- `SCAN_TARGETS` / `TARGET_URLS` をコンポーネントの外で作るのは、毎レンダーで配列が作り直されると `useImageTrigger` が認識をやり直してしまうため
- `enabled: status === 'ready'` にするのは、`useCamera` の `video.play()` が終わるまで `videoWidth` が 0 のため
- 敵を倒した後に次の敵を探すときは、`useImageTrigger` の `rescan()` を呼ぶ（ゲームロジック側に渡す）

---

## 8. 動作確認チェックリスト

| 項目 | iPhone Safari | Android Chrome |
|---|---|---|
| 開始後「食材の画像にカメラを向けてください」が出る | ☐ | ☐ |
| 登録画像にカメラを向けると 1 秒以内に敵が出る | ☐ | ☐ |
| 画像ごとに正しい敵（`enemies.js` の `targetUrl` どおり）が出る | ☐ | ☐ |
| 画面の端に画像を映したとき、敵もその方向に出る | ☐ | ☐ |
| 敵の顔がカメラの方を向いている・傾いていない | ☐ | ☐ |
| 出現後に端末を回すと、敵が空間に固定されて見える | ☐ | ☐ |
| 敵が出たあと、画像を映し続けても 2 体目が出ない | ☐ | ☐ |
| 登録していない物を映しても敵が出ない | ☐ | ☐ |
| 開発時（StrictMode）に敵が 2 体出ない | ☐ | ☐ |
| 5 分放置で発熱・クラッシュが無い | ☐ | ☐ |

---

## 9. つまずきポイント集

| 症状 | 原因と対処 |
|---|---|
| `npm i mind-ar` が `canvas` のビルドで失敗する | `npm i mind-ar --ignore-scripts` で入れる（ブラウザ用 `dist/` は `canvas` を使わない）|
| 何を映しても検出されない（エラーも出ない） | `video.setAttribute('width' / 'height')` が抜けている。または `enabled` が早すぎて `videoWidth` が 0 のまま `createImageTracker` を呼んでいる |
| 「`/targets/xxx.mind` が見つかりません」と出る | `public/targets/` に置いたか、`enemies.js` の `targetUrl` のファイル名と一致しているか確認 |
| 「.mind ファイルとして読み込めませんでした」「現在の形式ではありません」と出る | 壊れている、または古い MindAR で作った `.mind`。公式コンパイラで作り直す |
| `.glb` の import でビルドエラー | `?url` を付け忘れている（`import url from '...glb?url'`）|
| 検出まで時間がかかる・検出しない画像がある | 特徴点が少ない画像。模様が細かくコントラストの強い画像に替える。画面の 1/3 以上に大きく映す。反射・暗すぎる照明も苦手 |
| 違う画像の敵が出る | `enemies.js` の `targetUrl` の書き間違い。または 1 つの `.mind` に画像を 2 枚以上入れている（1 画像 1 ファイルにする）|
| 敵が画像と違う方向に出る | `videoToScreen` を通していない、または `.ar-video` の `object-fit: cover` を変えた |
| 敵が横向き・後ろ向き・倒れている | モデルの向きが 5-3 の前提と違う。`lookAt` の後に `model.rotateY(Math.PI)` などで補正する |
| 敵が大きすぎる・小さすぎる | `ENEMIES[i].height` と `SPAWN_DISTANCE` を調整する |
| 敵が 2 体出る | `onDetect` を 2 回呼んでいる。`createImageTracker` の `scanning` フラグ、StrictMode の cleanup（`cancelled` / `dispose`）を確認 |
| 初回の検出だけ遅い・一瞬固まる | TensorFlow.js の GPU 初期化。`dummyRun` を呼んでいるか確認。それでも遅い場合は、開始画面の時点で `createImageTracker` を作っておく |
| `rescan()` 直後に動作がおかしい | `stopProcessVideo()` 直後（1 フレーム以内）に `start()` すると認識ループが二重に走る。敵を倒してから少し待って呼ぶ |

---

## 10. 補足: 読み込みサイズ
- `mind-ar` の認識エンジン（TensorFlow.js 同梱）で **約 2MB** 増える
- `.mind` は画像 1 枚あたり数百 KB。**全部の `.mind` を起動時にダウンロードする**ので、画像を増やすほど認識開始までが遅くなる
- `.glb` は 1 体 0.5〜0.8MB（顔テクスチャ込み）

初回表示が重い場合は、`ArScene.jsx` の `import` を `React.lazy` で遅延読み込みにし、開始画面を先に出す。

---

## 11. 次のステップ（本書の範囲外）
- **戦闘との接続**: `onEnemySpawn(enemy)` でゲームロジックに敵の出現を知らせ、HP などの状態を持たせる。倒したら `clearEnemies()` → `rescan()` で次の敵を探す
- **タップ判定**: `THREE.Raycaster` で画面タップ位置から敵（`userData.enemy`）を判定する（[AR_SETUP.md](AR_SETUP.md) 9 章）
- **出現演出**: `spawnEnemy` の中でスケールを 0 から 1 へアニメーションさせる
