import { useEffect, useRef, useState } from 'react'
import { distanceMeters } from './haversine'
import { ESCAPE_DISTANCE_M, ESCAPE_HOLD_MS, isAccurateEnough } from './escapeRules'
import { useHoldCondition } from './useHoldCondition'

const REVIVED_BANNER_MS = 2500

/**
 * 子供側の脱出状態を管理する hook。
 * - 親から ESCAPE_DISTANCE_M 超が ESCAPE_HOLD_MS 続いたら 'escaped' にし、親へ 'escaped' を送る
 * - 親から届いた 'revive' の鍵が roomCode と一致したら 'playing' に戻し、親へ 'revived' を返す
 * 手入力で復活する手段は用意しない（親に近づくことが唯一の復活条件）。
 *
 * 引数: { me, peer, channel, roomCode }（channel は useLocationChannel の返り値）
 * 返り値: { state: 'playing' | 'escaped', distance, justRevived }
 */
export function useEscapeState({ me, peer, channel, roomCode }) {
  const [state, setState] = useState('playing')
  const [justRevived, setJustRevived] = useState(false)
  const stateRef = useRef(state) // イベントハンドラから最新の状態を見るため
  const { sendEvent, onEvent } = channel

  const distance = distanceMeters(me, peer)
  const tooFar = state === 'playing' && isAccurateEnough(me, peer) && distance > ESCAPE_DISTANCE_M

  useHoldCondition(tooFar, ESCAPE_HOLD_MS, () => {
    stateRef.current = 'escaped'
    setState('escaped')
    sendEvent('escaped', { distance: Math.round(distance) })
  })

  // 親からの鍵を受け取る
  useEffect(() => {
    return onEvent('revive', (payload) => {
      if (payload?.key !== roomCode || stateRef.current !== 'escaped') return
      stateRef.current = 'playing'
      setState('playing')
      setJustRevived(true)
      sendEvent('revived')
    })
  }, [onEvent, sendEvent, roomCode])

  // 復活演出を一定時間で消す
  useEffect(() => {
    if (!justRevived) return
    const id = setTimeout(() => setJustRevived(false), REVIVED_BANNER_MS)
    return () => clearTimeout(id)
  }, [justRevived])

  return { state, distance, justRevived }
}
