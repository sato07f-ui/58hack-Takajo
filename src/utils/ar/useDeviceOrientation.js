import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 端末の向きを ref で返す hook（re-render を起こさないため state にしない）。
 * requestPermission() はユーザー操作の中で呼ぶこと。
 */
export function useDeviceOrientation() {
  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0, absolute: false })
  const [permission, setPermission] = useState('unknown') // 'unknown' | 'granted' | 'denied' | 'unsupported'

  const requestPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermission('unsupported')
      return 'unsupported'
    }
    // iOS 13+
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission()
        setPermission(result) // 'granted' | 'denied'
        return result
      } catch {
        setPermission('denied')
        return 'denied'
      }
    }
    // Android / 権限不要な環境
    setPermission('granted')
    return 'granted'
  }, [])

  useEffect(() => {
    if (permission !== 'granted') return
    function onOrientation(e) {
      if (e.alpha == null) return
      orientationRef.current = {
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        absolute: e.absolute,
      }
    }
    window.addEventListener('deviceorientation', onOrientation, true)
    return () => window.removeEventListener('deviceorientation', onOrientation, true)
  }, [permission])

  return { orientationRef, permission, requestPermission }
}
