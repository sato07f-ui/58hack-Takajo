import { useEffect, useState } from 'react'
import { useGeolocation } from '../../utils/tracker/useGeolocation'
import { useLocationChannel } from '../../utils/tracker/useLocationChannel'
import { useReviveSender } from '../../utils/tracker/useReviveSender'
import { isValidRoomCode, normalizeRoomCode } from '../../utils/tracker/roomCode'
import { REVIVE_DISTANCE_M } from '../../utils/tracker/escapeRules'
import { DistanceDisplay } from './DistanceDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { LocationPermissionHint } from './LocationPermissionHint'

/**
 * 親の画面。復活の鍵になるコードを決めて接続し、子供までの距離を見る。
 * props.onBack()
 */
export function ParentView({ onBack }) {
  const [input, setInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const geo = useGeolocation()
  const channel = useLocationChannel({ roomCode, role: 'parent' })
  const { status, sendLocation } = channel
  const revive = useReviveSender({ me: geo.position, peer: channel.peerLocation, channel, roomCode })

  // 自分の位置が更新されたら子供に送る
  useEffect(() => {
    if (status === 'connected') sendLocation(geo.position)
  }, [geo.position, status, sendLocation])

  function handleStart(e) {
    e.preventDefault()
    if (!isValidRoomCode(input)) return
    geo.start() // タップ内で呼ぶ（iOS）
    setRoomCode(normalizeRoomCode(input))
  }

  function handleStop() {
    geo.stop()
    setRoomCode('')
  }

  if (!roomCode) {
    return (
      <form className="tracker-screen" onSubmit={handleStart}>
        <h1>親の端末</h1>
        <p>復活の鍵になるコードを決めてください（英数字 6〜12 文字）。</p>
        <p className="tracker-note">子供の端末で同じコードを入力してもらいます。</p>
        <input
          className="tracker-input"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="例: TAKAJO1"
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

  return (
    <div className="tracker-screen">
      <h1>子供との距離</h1>
      <p className="tracker-code">
        鍵: <strong>{roomCode}</strong>
      </p>
      {revive.childState === 'escaped' && (
        <div className="child-escaped-banner" role="alert">
          <p className="child-escaped-title">子供がダンジョンから脱出しました！</p>
          <p>
            {revive.sendingKey
              ? '復活の鍵を送信中…'
              : `子供に近づいて（${REVIVE_DISTANCE_M} m 以内）鍵を渡しましょう`}
          </p>
        </div>
      )}
      <DistanceDisplay me={geo.position} peer={channel.peerLocation} />
      <p className="tracker-note">子供の状態: {revive.childState === 'escaped' ? '脱出中' : 'ダンジョン内'}</p>
      <ConnectionStatus {...channel} peerLabel="子供" />
      <LocationPermissionHint permission={geo.permission} error={geo.error} />
      <button type="button" className="tracker-link" onClick={handleStop}>
        終了する
      </button>
    </div>
  )
}
