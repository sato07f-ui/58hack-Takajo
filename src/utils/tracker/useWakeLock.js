import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Screen Wake Lock API で画面のスリープを防ぐ hook。
 * 子供側で位置の送信が止まらないようにするために使う。
 * request() はユーザー操作の中で呼ぶこと。タブが裏に回ると解放されるので、
 * 表に戻ったときに自動で取り直す。
 * 返り値: { supported, active, request, release }
 */
export function useWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [active, setActive] = useState(false)
  const lockRef = useRef(null)
  const wantedRef = useRef(false) // 取り直しの要否

  const request = useCallback(async () => {
    wantedRef.current = true
    if (!supported || lockRef.current) return
    try {
      const lock = await navigator.wakeLock.request('screen')
      lockRef.current = lock
      setActive(true)
      lock.addEventListener('release', () => {
        lockRef.current = null
        setActive(false)
      })
    } catch {
      // 省電力モードなどで拒否されることがある。注意書きで補う
      setActive(false)
    }
  }, [supported])

  const release = useCallback(() => {
    wantedRef.current = false
    lockRef.current?.release()
    lockRef.current = null
  }, [])

  // タブが表に戻ったら取り直す
  useEffect(() => {
    if (!supported) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wantedRef.current) request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [supported, request])

  useEffect(() => release, [release])

  return { supported, active, request, release }
}
