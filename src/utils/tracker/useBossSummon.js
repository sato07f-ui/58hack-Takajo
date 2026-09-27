import { useCallback, useEffect, useRef, useState } from 'react'
import { useHoldCondition } from './useHoldCondition'

/** 子供から応答（boss-arrived）が無い間、呼び出しを送り直す間隔 */
export const BOSS_RESEND_MS = 3000

/**
 * 親側。ラスボスの呼び出しを子供へ送る hook。
 * summon() を呼ぶと 'boss-summon' を送り、子供から 'boss-arrived' が返るまで BOSS_RESEND_MS ごとに送り直す
 * （Broadcast は保存されないので、子供が一瞬オフラインでも届くようにする）。
 * 一度呼んだら、もう呼べない（子供の画面で門の演出が 2 回起きないようにする）。
 *
 * 引数: { channel, roomCode }（channel は useLocationChannel の返り値）
 * 返り値: { bossState: 'idle' | 'summoning' | 'arrived', summon }
 */
export function useBossSummonSender({ channel, roomCode }) {
  const [bossState, setBossState] = useState('idle')
  const summonedRef = useRef(false) // 連打で同じ瞬間に 2 回送らないため（state の更新を待たずに判定する）
  const { sendEvent, onEvent } = channel

  // 子供からの「届いた」
  useEffect(() => {
    return onEvent('boss-arrived', () => setBossState('arrived'))
  }, [onEvent])

  const send = useCallback(() => sendEvent('boss-summon', { key: roomCode }), [sendEvent, roomCode])

  const summon = useCallback(() => {
    if (summonedRef.current) return
    summonedRef.current = true
    setBossState('summoning')
    send()
  }, [send])

  // 呼び出し中は、届くまで送り直す
  useHoldCondition(bossState === 'summoning', BOSS_RESEND_MS, send, { repeatMs: BOSS_RESEND_MS })

  return { bossState, summon }
}

/**
 * 子供側。親からのラスボスの呼び出しを受け取る hook。
 * 'boss-summon' の鍵が roomCode と一致したら summoned を true にし、親へ 'boss-arrived' を返す。
 * 送り直しで何度届いても summoned が true になるのは 1 回だけ（応答は毎回返し、親の送り直しを止める）。
 *
 * 引数: { channel, roomCode }
 * 返り値: { summoned }
 */
export function useBossSummonReceiver({ channel, roomCode }) {
  const [summoned, setSummoned] = useState(false)
  const summonedRef = useRef(false)
  const { sendEvent, onEvent } = channel

  useEffect(() => {
    return onEvent('boss-summon', (payload) => {
      if (payload?.key !== roomCode) return
      sendEvent('boss-arrived') // 最初の応答が親に届かなかった場合に備えて、毎回返す
      if (summonedRef.current) return
      summonedRef.current = true
      setSummoned(true)
      navigator.vibrate?.([300, 100, 300])
    })
  }, [onEvent, sendEvent, roomCode])

  return { summoned }
}
