import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { createScene, applyDeviceOrientation } from './createScene'
import { useImageTrigger } from '../imageTrigger/useImageTrigger'
import { useObjectTrigger } from '../objectTrigger/useObjectTrigger'
import { videoToScreen } from '../imageTrigger/videoToScreen'
import { ENEMIES } from '../enemy/enemies'

// 画像認識で出現する敵（.mind があるもの）と、その .mind の一覧。
// 認識結果の targetIndex は SCAN_TARGETS の添字になる
const SCAN_TARGETS = ENEMIES.filter((enemy) => enemy.targetUrl)
const TARGET_URLS = SCAN_TARGETS.map((enemy) => enemy.targetUrl)

// 物体認識（YOLO）で出現する特別な敵
const BANANA = ENEMIES.find((enemy) => enemy.id === 'banana')

// 親の呼び出しで出現するラスボス
const BOSS = ENEMIES.find((enemy) => enemy.id === 'boss')

/**
 * props.orientationRef: useDeviceOrientation() の orientationRef
 * （権限要求は親の「開始」ボタンで済ませてから ArScene をマウントする）
 * props.sceneRef: createScene() の戻り値を親に渡すための ref（任意）
 * props.onEnemySpawn(enemy): 敵が出現したときに呼ばれる（任意。ゲームロジックへの通知用）。
 *   画像認識の敵（にんじん等）も物体認識の敵（バナナ）もラスボスも、同じようにここへ通知される
 * props.bossPhase: ラスボスの段階（任意）。'none' | 'gate' | 'appear'
 *   'gate': 門の演出中。画像認識・物体認識を止め、普通の敵が出ないようにする
 *   'appear': 門が開いた。出ている敵を消し、画面中央にラスボスを出す
 * props.onBossAppear(model): ラスボスが出現したときに呼ばれる（任意。ラスボス戦の開始の合図）
 */
export function ArScene({ orientationRef, sceneRef, onEnemySpawn, bossPhase = 'none', onBossAppear }) {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)
  const localSceneRef = useRef(null) // 親が sceneRef を渡さなくても内部で使う
  // 画像認識と物体認識のどちらかで敵が見つかったら true。同時に見つかっても敵は 1 体だけ出す
  const foundRef = useRef(false)
  const bossSpawnedRef = useRef(false) // ラスボスは 1 回だけ出す
  // effect から最新のコールバックを呼ぶため（effect を張り直さない）
  const callbacksRef = useRef({ onEnemySpawn, onBossAppear })
  useEffect(() => {
    callbacksRef.current = { onEnemySpawn, onBossAppear }
  })

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      onFrame(camera) {
        // PC ブラウザなどセンサー値が無い場合は向きを変えない
        if (!orientationRef.current) return
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

  /**
   * 画像認識・物体認識のどちらで見つかった敵も、ここで同じように処理する。
   * 両方の認識を止め、映っていた方向に敵を出して、親に通知する。
   */
  const handleEnemyFound = async (enemy, videoX, videoY) => {
    if (!enemy || foundRef.current) return
    foundRef.current = true
    stopImageScan()
    stopObjectScan()
    const { x, y } = videoToScreen(videoRef.current, videoX, videoY)
    await localSceneRef.current?.spawnEnemy(enemy, x, y)
    onEnemySpawn?.(enemy)
  }

  const { status: scanStatus, error: scanError, stop: stopImageScan } = useImageTrigger(videoRef, {
    enabled: status === 'ready', // カメラ映像が流れ始めてから認識を開始
    targetUrls: TARGET_URLS,
    onDetect: ({ targetIndex, videoX, videoY }) => handleEnemyFound(SCAN_TARGETS[targetIndex], videoX, videoY),
  })

  // 本物のバナナを COCO-SSD で探す
  const { status: objectStatus, stop: stopObjectScan } = useObjectTrigger(videoRef, {
    enabled: status === 'ready',
    targetClass: BANANA.detectClass,
    minScore: 0.6,
    intervalMs: 500,
    onDetect: ({ videoX, videoY }) => handleEnemyFound(BANANA, videoX, videoY),
  })

  // ラスボス: 門の演出が始まったら認識を止め、門が開いたら画面中央に出す
  useEffect(() => {
    if (bossPhase === 'none') return
    foundRef.current = true // これ以降、認識で普通の敵は出さない
    stopImageScan()
    stopObjectScan()
    if (bossPhase !== 'appear' || bossSpawnedRef.current) return
    bossSpawnedRef.current = true
    const scene = localSceneRef.current
    if (!scene) return
    scene.clearEnemies()
    scene.spawnEnemy(BOSS, window.innerWidth / 2, window.innerHeight * (BOSS.spawnScreenY ?? 0.5)).then((model) => {
      if (!model) return // 読み込み中に画面が閉じられた
      callbacksRef.current.onEnemySpawn?.(BOSS)
      callbacksRef.current.onBossAppear?.(model)
    })
  }, [bossPhase, stopImageScan, stopObjectScan])

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
      {status === 'ready' && scanStatus === 'scanning' && bossPhase === 'none' && (
        <p className="ar-message">食材の画像にカメラを向けてください</p>
      )}
      {scanStatus === 'error' && <p className="ar-message">画像認識を開始できませんでした: {scanError}</p>}
      {objectStatus === 'error' && <p className="ar-message">物体認識を開始できませんでした</p>}
    </>
  )
}
