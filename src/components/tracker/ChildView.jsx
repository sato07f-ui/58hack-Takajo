import { useEffect, useState } from 'react'
import { useGeolocation } from '../../utils/tracker/useGeolocation'
import { useLocationChannel } from '../../utils/tracker/useLocationChannel'
import { isValidRoomCode, normalizeRoomCode } from '../../utils/tracker/roomCode'
import { DistanceDisplay } from './DistanceDisplay'
import { ConnectionStatus } from './ConnectionStatus'
import { LocationPermissionHint } from './LocationPermissionHint'

/**
 * 子供の画面。親の横でコードを入力して接続し、以後はコードを表示しない。
 * props.onBack()
 */
export function ChildView({ onBack }) {
  const [input, setInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const geo = useGeolocation()
  const channel = useLocationChannel({ roomCode, role: 'child' })
  const { status, sendLocation } = channel

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

  function handleStop() {
    geo.stop()
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

  return (
    <div className="tracker-screen">
      <h1>親との距離</h1>
      <DistanceDisplay me={geo.position} peer={channel.peerLocation} />
      <ConnectionStatus {...channel} peerLabel="親" />
      <LocationPermissionHint permission={geo.permission} error={geo.error} />
      <p className="tracker-note">画面を開いたままにしてね（閉じると親に位置が届かなくなります）</p>
      <button type="button" className="tracker-link" onClick={handleStop}>
        終了する
      </button>
    </div>
  )
}
