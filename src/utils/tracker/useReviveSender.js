import { useEffect, useState } from 'react'
import { distanceMeters } from './haversine'
import { REVIVE_DISTANCE_M, REVIVE_HOLD_MS, REVIVE_RESEND_MS, isAccurateEnough } from './escapeRules'
import { useHoldCondition } from './useHoldCondition'

/**
 * 親側。子供の脱出状態を受け取り、脱出中の子供が近づいたら復活の鍵を送る hook。
 * - 'escaped' を受信: childState を 'escaped' にして振動
 * - 脱出中の子供が REVIVE_DISTANCE_M 以内に REVIVE_HOLD_MS 留まったら 'revive' で鍵（roomCode）を送る。
 *   'revived' が返るまで REVIVE_RESEND_MS ごとに送り直す
 * 距離判定は親端末で行い、鍵の送信元を親に限定する。
 *
 * 引数: { me, peer, channel, roomCode }
 * 返り値: { childState: 'playing' | 'escaped', sendingKey }
 */
export function useReviveSender({ me, peer, channel, roomCode }) {
  const [childState, setChildState] = useState('playing')
  const [sendingKey, setSendingKey] = useState(false)
  const { sendEvent, onEvent } = channel

  useEffect(() => {
    const offEscaped = onEvent('escaped', () => {
      setChildState('escaped')
      navigator.vibrate?.([200, 100, 200])
    })
    const offRevived = onEvent('revived', () => {
      setChildState('playing')
      setSendingKey(false)
    })
    return () => {
      offEscaped()
      offRevived()
    }
  }, [onEvent])

  const distance = distanceMeters(me, peer)
  const closeEnough = childState === 'escaped' && isAccurateEnough(me, peer) && distance < REVIVE_DISTANCE_M

  useHoldCondition(
    closeEnough,
    REVIVE_HOLD_MS,
    () => {
      setSendingKey(true)
      sendEvent('revive', { key: roomCode })
    },
    { repeatMs: REVIVE_RESEND_MS },
  )

  // 離れて条件が外れている間は「送信中」を出さない
  return { childState, sendingKey: sendingKey && closeEnough }
}
