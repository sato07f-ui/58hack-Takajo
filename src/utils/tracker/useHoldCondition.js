import { useEffect, useRef } from 'react'

/**
 * condition が holdMs の間ずっと true だったら onHeld を呼ぶ hook。
 * 途中で false になれば計測をやり直す。
 * repeatMs を渡すと、発火後も condition が true の間は repeatMs ごとに onHeld を呼び続ける。
 * onHeld は毎レンダーで最新のものを使う（effect を張り直さない）。
 */
export function useHoldCondition(condition, holdMs, onHeld, { repeatMs = null } = {}) {
  const onHeldRef = useRef(onHeld)
  useEffect(() => {
    onHeldRef.current = onHeld
  })

  useEffect(() => {
    if (!condition) return
    let repeatId = null
    const holdId = setTimeout(() => {
      onHeldRef.current?.()
      if (repeatMs) repeatId = setInterval(() => onHeldRef.current?.(), repeatMs)
    }, holdMs)
    return () => {
      clearTimeout(holdId)
      if (repeatId) clearInterval(repeatId)
    }
  }, [condition, holdMs, repeatMs])
}
