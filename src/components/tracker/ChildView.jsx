import { useEffect, useState } from 'react'
import { ArScene } from '../../utils/ar/ArScene'
import { useBattle } from '../../utils/battle/useBattle'
import { useGeolocation } from '../../utils/tracker/useGeolocation'
import { useLocationChannel } from '../../utils/tracker/useLocationChannel'
import { useEscapeState } from '../../utils/tracker/useEscapeState'
import { useWakeLock } from '../../utils/tracker/useWakeLock'
import { useBossSummonReceiver } from '../../utils/tracker/useBossSummon'
import { isValidRoomCode, normalizeRoomCode } from '../../utils/tracker/roomCode'
import { isDevRoomCode } from '../../utils/tracker/devRoomCode'
import { distanceLevel, formatDistance } from '../../utils/tracker/distanceLevel'
import { DistanceDisplay } from './DistanceDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { LocationPermissionHint } from './LocationPermissionHint'
import { EscapedScreen, GameOverScreen, RevivedBanner } from './EscapedScreen'
import { BattleHud } from '../battle/BattleHud'
import { DungeonEntrance } from '../dungeon/DungeonEntrance'
import { BossGate } from '../boss/BossGate'

// 扉の演出の段階 → ラスボスの段階（ArScene の bossPhase）
const BOSS_PHASE_BY_GATE_STEP = {
  appear: 'gate',
  rumble: 'gate',
  open: 'appear', // 扉が開き始めたら、隠れているうちに闇の中へラスボスを出す
  fade: 'appear',
  light: 'reveal', // 扉が消えたらスポットライトを点ける
  caption: 'reveal',
  done: 'fight',
}

/**
 * 子供の画面。親の横でコードを入力して接続し、以後はコードを表示しない。
 * 接続後に「ダンジョンへ入る」で AR バトルを開き、離れすぎると脱出状態のオーバーレイを重ねる（脱出中は攻撃できない）。
 * ゲームはこの画面からしか始められない。入るときは、カメラと認識モデルの準備が終わるまで扉の演出（DungeonEntrance）を重ねる。
 * 開発用コード（VITE_DEV_ROOM_CODE、dev のみ）を入力したときは親とつながずにプレイでき、脱出も起きない。
 * props.onBack()
 * props.ar: { orientationRef, requestPermission }（App の useDeviceOrientation）
 */
export function ChildView({ onBack, ar }) {
  const [input, setInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [inDungeon, setInDungeon] = useState(false)
  const [entering, setEntering] = useState(false) // 扉の演出中
  const [arReady, setArReady] = useState(false) // ArScene の準備（モデルのダウンロード含む）が終わった
  const [sensorDenied, setSensorDenied] = useState(false)
  const devMode = isDevRoomCode(roomCode)
  const geo = useGeolocation()
  // 開発用コードのときは接続しない（peer が来ないので脱出判定も起きない）
  const channel = useLocationChannel({ roomCode: devMode ? '' : roomCode, role: 'child' })
  const { status, sendLocation } = channel
  // 親の鍵で復活したらライフを満タンに戻す（battle は下で作るが、呼ばれるのは描画の後なので参照できる）
  const escape = useEscapeState({
    me: geo.position,
    peer: channel.peerLocation,
    channel,
    roomCode,
    onRevive: () => battle.revive(),
  })
  const wakeLock = useWakeLock()
  const escaped = escape.state === 'escaped'
  // ライフが 0 になったら脱出と同じ扱いにして、親に近づくまで戦えなくする（開発用コードは GameOverScreen のボタンで復活）
  const battle = useBattle({ disabled: escaped, onGameOver: devMode ? undefined : escape.defeat })
  const boss = useBossSummonReceiver({ channel, roomCode })
  const [gateStep, setGateStep] = useState('appear') // 扉の演出の段階（BossGate の TIMELINE）
  // ラスボスの段階（ArScene の bossPhase）。ダンジョンに入る前に呼ばれた場合は、入った瞬間に扉の演出を始める
  const bossPhase = !boss.summoned || !inDungeon ? 'none' : BOSS_PHASE_BY_GATE_STEP[gateStep]

  /** ラスボスが出現した（HP の初期化などは onEnemySpawn → battle.handleEnemySpawn で済む。ラスボス固有の処理はここにつなぐ） */
  function handleBossAppear() {}

  // 自分の位置が更新されたら親に送る
  useEffect(() => {
    if (status === 'connected') sendLocation(geo.position)
  }, [geo.position, status, sendLocation])

  function handleStart(e) {
    e.preventDefault()
    if (!isValidRoomCode(input)) return
    if (!isDevRoomCode(input)) {
      geo.start() // タップ内で呼ぶ（iOS）
      wakeLock.request() // 画面スリープで送信が止まらないようにする（タップ内で呼ぶ）
    }
    setRoomCode(normalizeRoomCode(input))
    setInput('') // 接続後はコードを画面に残さない
  }

  async function handleEnterDungeon() {
    const result = await ar.requestPermission() // タップ内でセンサー権限を要求する（iOS）
    if (result === 'denied') {
      setSensorDenied(true)
      return
    }
    setSensorDenied(false)
    setArReady(false)
    setEntering(true) // 準備の間は扉の演出を見せる
    setInDungeon(true) // 'unsupported'（PC ブラウザ等）はカメラ確認のため進める
  }

  function handleStop() {
    geo.stop()
    wakeLock.release()
    setInDungeon(false)
    setRoomCode('')
  }

  if (!roomCode) {
    return (
      <form className="tracker-screen" onSubmit={handleStart}>
        <h1>子供の端末</h1>
        <p>親に教えてもらったコードを入力してください。</p>
        <input
          className="tracker-input"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="コード"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
        />
        <button type="submit" disabled={!isValidRoomCode(input)}>
          冒険をはじめる
        </button>
        <button type="button" className="tracker-link" onClick={onBack}>
          もどる
        </button>
      </form>
    )
  }

  if (inDungeon) {
    const level = distanceLevel(escape.distance)
    return (
      <>
        <ArScene
          orientationRef={ar.orientationRef}
          sceneRef={battle.sceneRef}
          onEnemySpawn={battle.handleEnemySpawn}
          onItemCollect={battle.handleItemCollect}
          onReady={() => setArReady(true)}
          bossPhase={bossPhase}
          onBossAppear={handleBossAppear}
        />
        <div className="ui-layer">
          <BattleHud battle={battle} disabled={escaped} />
          <div className={`distance-hud distance-${level}`}>
            {devMode ? '開発用（親なし）' : `親まで ${formatDistance(escape.distance)}`}
          </div>
          {escaped && <EscapedScreen distance={escape.distance} reason={escape.reason} />}
          {devMode && battle.gameOver && <GameOverScreen onRetry={battle.revive} />}
          {escape.justRevived && <RevivedBanner />}
          {bossPhase !== 'none' && gateStep !== 'done' && <BossGate onStep={setGateStep} />}
        </div>
        {entering && <DungeonEntrance ready={arReady} onDone={() => setEntering(false)} />}
      </>
    )
  }

  return (
    <div className="tracker-screen">
      <h1>親との距離</h1>
      {devMode ? (
        <p className="tracker-note">開発用コードでプレイ中（親なし）</p>
      ) : (
        <>
          <DistanceDisplay me={geo.position} peer={channel.peerLocation} />
          <ConnectionStatus {...channel} peerLabel="親" />
          {boss.summoned && <p className="boss-summoned-note">ラスボスがダンジョンで待っている！</p>}
          <LocationPermissionHint permission={geo.permission} error={geo.error} />
        </>
      )}
      <button type="button" onClick={handleEnterDungeon} disabled={status !== 'connected' && !devMode}>
        ダンジョンへ入る
      </button>
      {sensorDenied && (
        <p className="tracker-error">
          センサーの使用が拒否されました。設定 › Safari › モーションと画面の向きのアクセス を確認してください。
        </p>
      )}
      {!devMode && (
        <p className="tracker-note">
          {wakeLock.active
            ? '画面が消えないようにしています。アプリを閉じると親に位置が届かなくなります'
            : '画面を開いたままにしてね（画面が消えると親に位置が届かなくなります）'}
        </p>
      )}
      <button type="button" className="tracker-link" onClick={handleStop}>
        終了する
      </button>
    </div>
  )
}
