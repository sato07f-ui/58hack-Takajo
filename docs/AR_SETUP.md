# AR 空間描画 実装手順書（Web 標準 API 版）

## 0. この手順書のゴールと前提

### ゴール
スマホブラウザで **背面カメラの映像を背景に、Three.js の 3D オブジェクトを重ねて表示し、端末を回してもオブジェクトが「空間のその場所」に固定されて見える** 状態まで作る。

ここまでできれば、あとは立方体を敵モデル（glTF）に差し替えるだけで設計書の「敵が AR 空間に出現する」画面になる。glTF 読み込み・タップ判定は本書の範囲外（9 章で触れるのみ）。

### 方式: getUserMedia + DeviceOrientation + Three.js
| 方式 | iPhone Safari | Android Chrome | 平面検出 |
|---|---|---|---|
| WebXR Device API（immersive-ar） | ✗ 非対応 | ○ | ○ |
| **getUserMedia + DeviceOrientation（本書）** | ○ | ○ | ✗ |

設計書は iPhone Safari / Android Chrome 両対応が必須なので、WebXR は使えない。本書の方式は「床にぴったり置く AR」ではなく **「端末の向きに追従する AR」** になる。歩いても物体には近づかない（位置追跡は無い）が、デモで「カメラをかざすと敵がそこにいる」体験は十分に成立する。

### 使う Web 標準 API
| API | 役割 |
|---|---|
| `navigator.mediaDevices.getUserMedia` | 背面カメラの映像ストリームを取得 |
| `DeviceOrientationEvent` | 端末の向き（alpha / beta / gamma）を取得。iOS は `requestPermission()` が必要 |
| `requestAnimationFrame` | 描画ループ |
| WebGL（Three.js 経由） | 3D 描画 |
| `screen.orientation` / `resize` | 画面回転・リサイズ対応 |

### 前提条件（重要）
- **HTTPS 必須**。カメラもセンサーも secure context でしか動かない。`http://192.168.x.x:5173` では `getUserMedia` が `undefined` になる。
- **実機で検証する**。PC ブラウザは DeviceOrientation を送ってこない。カメラ表示までは PC でも確認できる。
- iOS は **ユーザー操作（タップ）内で** センサー権限を要求しないと拒否される。

---

## 1. 環境構築

### 1-1. 依存追加
```bash
npm i three
npm i -D @vitejs/plugin-basic-ssl
```
`three` は本番で使うので `dependencies` に入れる。

### 1-2. Vite を HTTPS + LAN 公開にする
`vite.config.js`:
```js
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true, // LAN 内のスマホからアクセス可能にする
  },
})
```
`basicSsl()` を入れると自己署名証明書で `https://` 配信になる。

### 1-3. スマホから開く
1. PC とスマホを同じ Wi-Fi に接続
2. `npm run dev` を実行。ターミナルに `Network: https://192.168.x.x:5173/` と出る
3. スマホでその URL を開く
4. 「この接続はプライベートではありません」の警告が出るので「詳細を表示 → この Web サイトを閲覧」で通す

### 1-4. 代替: トンネルを使う（Safari で証明書警告を避けたいとき）
```bash
# Cloudflare Tunnel（アカウント不要のクイックトンネル）
npx cloudflared tunnel --url http://localhost:5173
```
表示される `https://xxxx.trycloudflare.com` をスマホで開く。この場合 `basicSsl()` は外して `http` で dev サーバーを動かす。チーム内で URL を共有できるのでデモ前の確認にも便利。

Vite は `localhost` と IP アドレス以外のホスト名からのアクセスを既定で拒否する（「This host is not allowed」と表示される）ので、`vite.config.js` に許可ドメインを追加する。先頭の `.` でサブドメイン全体を許可できるため、起動ごとに変わる URL を書き換える必要は無い。

```js
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
})
```

設定変更後は `npm run dev` を再起動する。初回の `npx cloudflared` は本体のダウンロードで 1〜2 分かかる。毎回すぐ使いたい場合は `winget install Cloudflare.cloudflared` で入れておく。

---

## 2. ファイル構成

```
src/
  ar/
    useCamera.js             // getUserMedia を扱う hook
    useDeviceOrientation.js  // 向き取得 hook（iOS 権限込み）
    createScene.js           // Three.js の初期化（React 非依存の純粋 JS）
    ArScene.jsx              // <video> + <canvas> を重ねる React コンポーネント
  App.jsx                    // 開始ボタン → ArScene
```

**方針**: Three.js のロジック（`createScene.js`）を React から切り離す。React 側は「マウント時に作って、アンマウント時に破棄する」だけにすると、後でゲームロジック（敵の生成・ダメージ演出）を追加するときに React の再レンダーと描画ループが干渉しない。

---

## 3. Step 1: カメラ映像を全画面表示する

### 3-1. `src/ar/useCamera.js`
```js
import { useEffect, useRef, useState } from 'react'

/**
 * 背面カメラのストリームを videoRef に流し込む hook。
 * 戻り値: { videoRef, status, error }
 * status: 'idle' | 'ready' | 'error'
 */
export function useCamera(enabled) {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let cancelled = false

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('getUserMedia が使えません（HTTPS で開いていますか？）')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // 背面カメラ優先
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStatus('ready')
      } catch (e) {
        setStatus('error')
        setError(describeCameraError(e))
      }
    }
    start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return { videoRef, status, error }
}

function describeCameraError(e) {
  switch (e.name) {
    case 'NotAllowedError':
      return 'カメラの使用が許可されませんでした。ブラウザの設定から許可してください。'
    case 'NotFoundError':
      return 'カメラが見つかりません。'
    case 'NotReadableError':
      return 'カメラが他のアプリで使用中です。'
    default:
      return e.message
  }
}
```

### 3-2. `<video>` の 3 属性は必須
```jsx
<video ref={videoRef} autoPlay playsInline muted className="ar-video" />
```
| 属性 | 無いと何が起きるか |
|---|---|
| `playsInline` | iOS Safari が全画面の動画プレイヤーを開いてしまい、上に Canvas を重ねられない |
| `muted` | 自動再生ポリシーで `play()` が拒否される |
| `autoPlay` | `srcObject` を入れても再生が始まらない |

### 3-3. CSS（`src/index.css` に追記）
```css
html, body, #root {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.ar-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* 縦横比を保ったまま全画面に */
  z-index: 0;
}
```

### 3-4. `src/App.jsx` を最小構成に置き換える（ここで初めて画面に出る）
3-1〜3-3 は部品を作っただけで、まだどこからも呼ばれていない。`App.jsx` がテンプレートのままだとカメラ権限は要求されない。テンプレートの中身（ロゴ・カウンター）を**丸ごと**次に置き換える。

```jsx
import { useCamera } from './ar/useCamera'

function App() {
  const { videoRef, status, error } = useCamera(true)

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </>
  )
}

export default App
```

`import './App.css'` は削除する（テンプレート用のスタイルが全画面表示を邪魔する）。`.ar-message` の CSS は 4-3 で追記するので、この時点では無くてもよい。

この `App.jsx` は Step 2 で `ArScene.jsx` に、Step 4 で開始ボタン付きの完成版に順次置き換えていく。

### 3-5. 検証
スマホで開き、カメラの権限ダイアログが出て、許可すると背面カメラの映像が全画面に表示されればOK。PC の場合はインカメラが出る。

権限ダイアログが出ない場合は、HTTPS で開いているか（アドレスバーに鍵マーク）と、保存後にページを再読み込みしたかを確認する。

---

## 4. Step 2: Three.js の Canvas を透明で重ねる

### 4-1. `src/ar/createScene.js`（React 非依存）
```js
import * as THREE from 'three'

/**
 * Three.js の scene / camera / renderer を作り、描画ループを開始する。
 * 戻り値の dispose() を呼ぶと全て停止・破棄する。
 */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,       // 背景を透明にしてカメラ映像を透かす
    antialias: true,
  })
  renderer.setClearColor(0x000000, 0) // 透明クリア
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // GPU 負荷対策

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 0) // カメラは原点に固定。向きだけ後で更新する

  // 照明
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2))

  // テスト用オブジェクト: カメラの正面 2m、少し下に置く
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xff5533 }),
  )
  cube.position.set(0, -0.3, -2)
  scene.add(cube)

  // リサイズ
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  // 描画ループ
  let rafId = 0
  let running = true
  function loop() {
    if (!running) return
    cube.rotation.y += 0.01
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  loop()

  return {
    scene,
    camera,
    renderer,
    dispose() {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      cube.geometry.dispose()
      cube.material.dispose()
      renderer.dispose()
    },
  }
}
```

### 4-2. `src/ar/ArScene.jsx`（暫定版。Step 3 で向き追従を足す）
```jsx
import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { createScene } from './createScene'

export function ArScene() {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    sceneRef.current = createScene(canvasRef.current)
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </>
  )
}
```

`App.jsx` は 3-4 の内容を次に置き換える（`useCamera` の呼び出しは `ArScene` に移ったので不要）。

```jsx
import { ArScene } from './ar/ArScene'

function App() {
  return <ArScene />
}

export default App
```

### 4-3. CSS 追記
```css
.ar-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none; /* 上に置く UI ボタンのタップを邪魔しない */
}

.ar-message {
  position: fixed;
  inset: auto 16px 24px;
  z-index: 2;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  padding: 12px;
  border-radius: 8px;
}
```

### 4-4. React StrictMode に関する注意
開発時は `main.jsx` の `<StrictMode>` により `useEffect` が **マウント → アンマウント → 再マウント** と 2 回走る。`createScene` の `dispose()` が正しく片付けていれば問題ない。逆に「立方体が 2 個見える」「回転が倍速」なら cleanup 漏れのサイン。

### 4-5. 検証
カメラ映像の上に、回転するオレンジの立方体が見えればOK。この時点では端末を回しても立方体は画面中央に居続ける。

---

## 5. Step 3: 端末の向きで 3D カメラを回す（空間固定）

### 5-1. iOS の権限要求
iOS 13 以降は `DeviceOrientationEvent.requestPermission()` を **ボタンタップなどのユーザー操作ハンドラの中で** 呼ぶ必要がある。`useEffect` 内で呼ぶと黙って `denied` になる。Android にはこの関数が無いので存在チェックで分岐する。

### 5-2. `src/ar/useDeviceOrientation.js`
```js
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 端末の向きを ref で返す hook（re-render を起こさないため state にしない）。
 * requestPermission() はユーザー操作の中で呼ぶこと。
 */
export function useDeviceOrientation() {
  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0, absolute: false })
  const [permission, setPermission] = useState('unknown') // 'unknown' | 'granted' | 'denied' | 'unsupported'

  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermission('unsupported')
      return 'unsupported'
    }
    // iOS 13+
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission()
        setPermission(result) // 'granted' | 'denied'
        return result
      } catch {
        setPermission('denied')
        return 'denied'
      }
    }
    // Android / 権限不要な環境
    setPermission('granted')
    return 'granted'
  }, [])

  useEffect(() => {
    if (permission !== 'granted') return
    function onOrientation(e) {
      if (e.alpha == null) return
      orientationRef.current = {
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        absolute: e.absolute,
      }
    }
    window.addEventListener('deviceorientation', onOrientation, true)
    return () => window.removeEventListener('deviceorientation', onOrientation, true)
  }, [permission])

  return { orientationRef, permission, requestPermission }
}
```

### 5-3. alpha / beta / gamma とは
| 値 | 意味 | 範囲 |
|---|---|---|
| `alpha` | Z 軸回り（コンパス方位。端末を水平にして回す） | 0〜360 |
| `beta` | X 軸回り（前後の傾き） | -180〜180 |
| `gamma` | Y 軸回り（左右の傾き） | -90〜90 |

これを Three.js のカメラの回転（quaternion）に変換する必要がある。以前は `three/examples/jsm/controls/DeviceOrientationControls` があったが **現在の three からは削除されている** ため、同じ計算を自前で持つ。

### 5-4. 変換関数を `createScene.js` に追加
```js
// createScene.js の先頭付近に追加
const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // X 軸 -90° 補正
const DEG = Math.PI / 180

/**
 * DeviceOrientation の値をカメラの quaternion に反映する。
 * screenAngle: screen.orientation.angle（度）
 */
export function applyDeviceOrientation(camera, { alpha, beta, gamma }, screenAngle = 0) {
  _euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ')
  camera.quaternion.setFromEuler(_euler)
  camera.quaternion.multiply(_q1) // 端末を「立てて持つ」姿勢を正面にする
  camera.quaternion.multiply(_q0.setFromAxisAngle(_zee, -screenAngle * DEG)) // 画面回転の補正
}
```
- `'YXZ'` の順序: 端末の座標系をカメラの座標系に読み替えるための順序。変えると軸が入れ替わる。
- `_q1`: センサーの基準は「端末を机に平置き」なので、「立てて構える」姿勢を正面にするために X 軸で -90° 回す。
- `screenAngle`: 横向きにしたとき画面が回転した分を打ち消す。

### 5-5. 描画ループから毎フレーム適用
`createScene` に「フレームごとに呼ぶコールバック」を足す。

```js
// createScene(canvas, { onFrame }) のシグネチャに変更
export function createScene(canvas, { onFrame } = {}) {
  // ...（省略）...
  function loop() {
    if (!running) return
    onFrame?.(camera)          // ← 追加
    cube.rotation.y += 0.01
    renderer.render(scene, camera)
    rafId = requestAnimationFrame(loop)
  }
  // ...
}
```

### 5-6. `ArScene.jsx` 完成版
```jsx
import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { useDeviceOrientation } from './useDeviceOrientation'
import { createScene, applyDeviceOrientation } from './createScene'

/**
 * props.orientationRef: useDeviceOrientation() の orientationRef
 * （権限要求は親の「開始」ボタンで済ませてから ArScene をマウントする）
 */
export function ArScene({ orientationRef }) {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      onFrame(camera) {
        const angle = screen.orientation?.angle ?? window.orientation ?? 0
        applyDeviceOrientation(camera, orientationRef.current, angle)
      },
    })
    return () => scene.dispose()
  }, [orientationRef])

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </>
  )
}
```

`orientationRef` を `ArScene` の外（`App.jsx`）で作るのは、iOS の権限要求をタップ内で済ませてから AR 画面に入るため（6 章）。

### 5-7. 検証
- 端末を左右に振ると立方体が画面外へ出て、元の向きに戻すと同じ場所に見える
- 端末を上下に傾けても同様
- 横向きにしても立方体が正しい方向に留まる

「カメラが原点固定で回転だけ反映」なので、**歩いて近づいても立方体は大きくならない**。これは仕様。

---

## 6. Step 4: 起動フローと UI 骨組み

### 6-1. `src/App.jsx`
```jsx
import { useState } from 'react'
import { ArScene } from './ar/ArScene'
import { useDeviceOrientation } from './ar/useDeviceOrientation'
import './App.css'

function App() {
  const [started, setStarted] = useState(false)
  const { orientationRef, permission, requestPermission } = useDeviceOrientation()

  // タップハンドラ内でセンサー権限を要求する（iOS の制約）
  async function handleStart() {
    const result = await requestPermission()
    if (result === 'denied') return
    setStarted(true) // ArScene のマウント時にカメラ権限が要求される
  }

  if (!started) {
    return (
      <div className="start-screen">
        <h1>スーパーダンジョン</h1>
        <button type="button" onClick={handleStart}>
          冒険をはじめる
        </button>
        {permission === 'denied' && (
          <p>センサーの使用が拒否されました。設定 › Safari › モーションと画面の向きのアクセス を確認してください。</p>
        )}
        {permission === 'unsupported' && <p>この端末は向きセンサーに対応していません。</p>}
      </div>
    )
  }

  return (
    <>
      <ArScene orientationRef={orientationRef} />
      <div className="ui-layer">{/* 後でここに魔法ボタンを置く */}</div>
    </>
  )
}

export default App
```
テンプレートの `App.jsx` の中身（ロゴ・カウンター）は丸ごと置き換える。`App.css` のサンプル用スタイルも不要になる。

### 6-2. レイヤー構成
| z-index | 要素 | 役割 |
|---|---|---|
| 0 | `<video>` | カメラ映像 |
| 1 | `<canvas>` | 3D（`pointer-events: none`） |
| 2 | `.ui-layer` | ボタン・HP バー等の UI |

```css
.ui-layer {
  position: fixed;
  inset: 0;
  z-index: 2;
  pointer-events: none; /* レイヤー自体は透過。子要素で auto に戻す */
}
.ui-layer > * {
  pointer-events: auto;
}
.start-screen {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  gap: 16px;
  color: #fff;
  text-align: center;
}
```

### 6-3. 起動フロー
```
[開始ボタン タップ]
   └→ DeviceOrientationEvent.requestPermission()  (iOS のみダイアログ)
        └→ granted → setStarted(true)
              └→ ArScene マウント → getUserMedia()  (カメラ許可ダイアログ)
                    └→ ready → 描画ループ開始
```
2 つの権限ダイアログが連続で出る。デモでは事前に一度許可しておくと 2 回目以降は出ない。

---

## 7. 動作確認チェックリスト

| 項目 | iPhone Safari | Android Chrome |
|---|---|---|
| HTTPS で開ける（警告を通した後） | ☐ | ☐ |
| 開始ボタンでセンサー権限ダイアログが出る | ☐ | （出ない・正常） |
| カメラ権限ダイアログが出る | ☐ | ☐ |
| 背面カメラの映像が全画面に出る | ☐ | ☐ |
| 立方体が映像の上に重なって回転する | ☐ | ☐ |
| 端末を回すと立方体が空間に固定されて見える | ☐ | ☐ |
| 横向きにしても方向が崩れない | ☐ | ☐ |
| ホームに戻って復帰しても映像が止まらない | ☐ | ☐ |
| 5 分放置で発熱・クラッシュが無い | ☐ | ☐ |

---

## 8. つまずきポイント集

| 症状 | 原因と対処 |
|---|---|
| 画面が真っ黒でカメラが出ない | `http://` で開いている → HTTPS にする。`playsInline` / `muted` が無い。権限を拒否した（Safari はアドレスバーの「ぁあ」→ Web サイトの設定から再許可） |
| iOS でカメラは出るが向きに反応しない | `requestPermission()` を `useEffect` 内など**タップ外**で呼んでいる。または 設定 › Safari › モーションと画面の向きのアクセス がオフ |
| 向きが 90° ずれる / 上下逆 | `applyDeviceOrientation` の `_q1` 補正か `screenAngle` 補正が抜けている |
| 立方体が 2 個ある / 回転が倍速 | StrictMode の二重マウントで `dispose()` が効いていない。cleanup を確認 |
| Canvas がぼやける | `setPixelRatio` 未設定、または `setSize` の第 3 引数 `false` を忘れて CSS サイズが上書きされている |
| 古い端末でタブが落ちる | `setPixelRatio(Math.min(dpr, 1.5))` に下げる。`antialias: false` にする |
| Android で alpha がドリフトする | `deviceorientationabsolute` イベントに切り替えると改善することがある（Chrome のみ） |
| 映像が縦に引き伸ばされる | `object-fit: cover` が効いていない。`.ar-video` の width/height を確認 |

---

## 9. 次のステップ（本書の範囲外）

- **glTF モデルの読み込み**: `three/examples/jsm/loaders/GLTFLoader` で `public/models/*.glb` を読み込み、立方体と差し替える。`cube` を `spawnEnemy(label, position)` のような関数に置き換え、食材ラベル → モデルの対応表を引く。
- **タップ判定**: `THREE.Raycaster` で画面タップ位置から敵を判定。`.ar-canvas` の `pointer-events: none` は維持し、`.ui-layer` でタップを受けて座標を渡す。
- **食材認識との接続**: TF.js の推論ループもカメラの `<video>` を入力にする。`useCamera` の `videoRef` をそのまま共有できる。