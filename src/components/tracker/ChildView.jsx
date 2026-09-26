import { useEffect, useState } from 'react'
import { ArScene } from '../../utils/ar/ArScene'
import { useGeolocation } from '../../utils/tracker/useGeolocation'
import { useLocationChannel } from '../../utils/tracker/useLocationChannel'
import { useEscapeState } from '../../utils/tracker/useEscapeState'
import { isValidRoomCode, normalizeRoomCode } from '../../utils/tracker/roomCode'
import { distanceLevel, formatDistance } from '../../utils/tracker/distanceLevel'
import { DistanceDisplay } from './DistanceDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { LocationPermissionHint } from './LocationPermissionHint'
import { EscapedScreen, RevivedBanner } from './EscapedScreen'

/**
 * 子供の画面。親の横でコードを入力して接続し、以後はコードを表示しない。
 * 接続後に「ダンジョンへ入る」で AR ゲームを開き、離れすぎると脱出状態のオーバーレイを重ねる。
 * props.onBack()
 * props.ar: { orientationRef, requestPermission }（App の useDeviceOrientation）
 */
export function ChildView({ onBack, ar }) {
  const [input, setInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [inDungeon, setInDungeon] = useState(false)
  const [sensorDenied, setSensorDenied] = useState(false)
  const geo = useGeolocation()
  const channel = useLocationChannel({ roomCode, role: 'child' })
  const { status, sendLocation } = channel
  const escape = useEscapeState({ me: geo.position, peer: channel.peerLocation, channel, roomCode })

  // 自分の位置が更新されたら親に送る
  useEffect(() => {
    if (status === 'connected') sendLocation(geo.position)
  }, [geo.position, status, sendLocation])

  function handleStart(e) {
    e.preventDefault()
    if (!isValidRoomCode(input)) return
    geo.start() // タップ内で呼ぶ（iOS）
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
    setInDungeon(true) // 'unsupported'（PC ブラウザ等）はカメラ確認のため進める
  }

  function handleStop() {
    geo.stop()
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
        <ArScene orientationRef={ar.orientationRef} />
        <div className="ui-layer">
          <div className={`distance-hud distance-${level}`}>親まで {formatDistance(escape.distance)}</div>
          {escape.state === 'escaped' && <EscapedScreen distance={escape.distance} />}
          {escape.justRevived && <RevivedBanner />}
        </div>
      </>
    )
  }

  return (
    <div className="tracker-screen">
      <h1>親との距離</h1>
      <DistanceDisplay me={geo.position} peer={channel.peerLocation} />
      <ConnectionStatus {...channel} peerLabel="親" />
      <LocationPermissionHint permission={geo.permission} error={geo.error} />
      <button type="button" onClick={handleEnterDungeon} disabled={status !== 'connected'}>
        ダンジョンへ入る
      </button>
      {sensorDenied && (
        <p className="tracker-error">
          センサーの使用が拒否されました。設定 › Safari › モーションと画面の向きのアクセス を確認してください。
        </p>
      )}
      <p className="tracker-note">画面を開いたままにしてね（閉じると親に位置が届かなくなります）</p>
      <button type="button" className="tracker-link" onClick={handleStop}>
        終了する
      </button>
    </div>
  )
}
