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
 * props.onItemCollect(item): 倒した敵が落としたアイテムがプレイヤーの手元に届いたときに呼ばれる（任意。手持ちに入れる用）。
 *   拾った後は次の敵を探し始める（ラスボスが呼ばれた後は探さない）
 * props.onReady(): カメラ・画像認識・物体認識の準備（モデルのダウンロードを含む）が終わったときに 1 回呼ばれる（任意）。
 *   カメラが使えなかったときも、エラーを見せるために呼ぶ
 * props.bossPhase: ラスボスの段階（任意）。'none' | 'gate' | 'appear' | 'reveal' | 'fight'
 *   'gate': 扉の演出中。画像認識・物体認識を止め、普通の敵が出ないようにする
 *   'appear': 扉が開き始めた（画面は扉と闇で隠れている）。出ている敵を消し、周りを暗くして闇の中にラスボスを出す
 *   'reveal': 扉が消えた。スポットライトを点け、ラスボスを闇から浮かび上がらせる
 *   'fight': 演出が終わった。ラスボス戦を始める（onEnemySpawn / onBossAppear を呼ぶ）
 * props.onBossAppear(model): ラスボス戦が始まるときに呼ばれる（任意）
 */
export function ArScene({ orientationRef, sceneRef, onEnemySpawn, onItemCollect, onReady, bossPhase = 'none', onBossAppear }) {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)
  const localSceneRef = useRef(null) // 親が sceneRef を渡さなくても内部で使う
  // 画像認識と物体認識のどちらかで敵が見つかったら true。同時に見つかっても敵は 1 体だけ出す
  const foundRef = useRef(false)
  // createScene は最初に 1 回だけ作るので、アイテムを拾ったときの処理は ref 経由で最新のものを呼ぶ
  const itemCollectRef = useRef(null)
  const onReadyRef = useRef(onReady)
  const bossSpawnedRef = useRef(false) // ラスボスは 1 回だけ出す
  // ラスボスの読み込みは非同期なので、読み込み中に段階が進んでも追いつけるよう最新の状態を持っておく
  const bossRef = useRef({ phase: 'none', model: null, announced: false })
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
      onItemCollect: (item) => itemCollectRef.current?.(item),
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

  const {
    status: scanStatus,
    error: scanError,
    stop: stopImageScan,
    rescan: rescanImage,
  } = useImageTrigger(videoRef, {
    enabled: status === 'ready', // カメラ映像が流れ始めてから認識を開始
    targetUrls: TARGET_URLS,
    onDetect: ({ targetIndex, videoX, videoY }) => handleEnemyFound(SCAN_TARGETS[targetIndex], videoX, videoY),
  })

  // 本物のバナナを YOLO で探す
  const { status: objectStatus, stop: stopObjectScan, rescan: rescanObject } = useObjectTrigger(videoRef, {
    enabled: status === 'ready',
    targetClass: BANANA.detectClass,
    minScore: 0.6,
    intervalMs: 500,
    onDetect: ({ videoX, videoY }) => handleEnemyFound(BANANA, videoX, videoY),
  })

  /**
   * 敵が落としたアイテムを拾ったら、親に通知して次の敵を探し始める。
   * （アイテムを拾うまでは探さないので、倒した直後に次の敵が重なって出ることはない）
   */
  const handleItemCollect = (item) => {
    onItemCollect?.(item)
    if (bossRef.current.phase !== 'none') return // ラスボスが呼ばれた後は普通の敵を探さない
    foundRef.current = false
    rescanImage()
    rescanObject()
  }

  useEffect(() => {
    itemCollectRef.current = handleItemCollect
    onReadyRef.current = onReady
  })

  // 画像認識は準備中 'idle'、物体認識は準備中 'idle' / 'loading'。どちらも抜けたら準備完了
  const ready =
    status === 'error' ||
    (status === 'ready' && scanStatus !== 'idle' && objectStatus !== 'idle' && objectStatus !== 'loading')
  useEffect(() => {
    if (ready) onReadyRef.current?.()
  }, [ready])

  // ラスボス: 扉の演出が始まったら認識を止め、扉が開き始めたら闇の中に出し、段階に合わせて照らして戦闘を始める
  useEffect(() => {
    const boss = bossRef.current
    boss.phase = bossPhase
    if (bossPhase === 'none') return
    foundRef.current = true // これ以降、認識で普通の敵は出さない
    stopImageScan()
    stopObjectScan()
    const scene = localSceneRef.current
    if (!scene || bossPhase === 'gate') return

    // 今の段階まで演出を進める（読み込みが終わっていなければ、終わったときにもう一度呼ぶ）
    const advance = () => {
      if (!boss.model) return
      if (boss.phase === 'reveal' || boss.phase === 'fight') scene.revealSpotlight()
      if (boss.phase === 'fight' && !boss.announced) {
        boss.announced = true
        callbacksRef.current.onEnemySpawn?.(BOSS)
        callbacksRef.current.onBossAppear?.(boss.model)
      }
    }

    if (!bossSpawnedRef.current) {
      bossSpawnedRef.current = true
      scene.clearEnemy()
      scene.spawnEnemy(BOSS, window.innerWidth / 2, window.innerHeight * (BOSS.spawnScreenY ?? 0.5)).then((model) => {
        if (!model) return // 読み込み中に画面が閉じられた
        boss.model = model
        scene.startSpotlight(model)
        advance()
      })
    }
    advance()
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
