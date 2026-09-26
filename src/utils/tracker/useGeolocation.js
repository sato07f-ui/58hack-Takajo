import { useCallback, useEffect, useRef, useState } from 'react'

/** これより誤差（m）が大きい測位結果は捨てる */
export const MAX_ACCURACY_M = 100

const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }

/**
 * 端末の現在位置を watchPosition で追い続ける hook。
 * start() はユーザー操作（ボタンタップ）の中で呼ぶこと（iOS の制約）。
 * 返り値:
 *   position: { lat, lng, accuracy, ts } | null（誤差 MAX_ACCURACY_M 超は反映しない）
 *   accuracy: 最後に採用した測位の誤差 [m] | null
 *   permission: 'unknown' | 'granted' | 'denied' | 'unsupported'
 *   error: エラーメッセージ | null
 *   start(), stop()
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null)
  const [permission, setPermission] = useState('unknown')
  const [error, setError] = useState(null)
  const watchIdRef = useRef(null)

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setPermission('unsupported')
      setError('この端末は位置情報に対応していません')
      return
    }
    if (watchIdRef.current !== null) return
    setError(null)
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        setPermission('granted')
        if (coords.accuracy > MAX_ACCURACY_M) return // 誤差が大きすぎる（屋内など）
        setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, ts: timestamp })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied')
          setError('位置情報の使用が拒否されました')
          stop()
          return
        }
        // POSITION_UNAVAILABLE / TIMEOUT は一時的なことが多いので watch は続ける
        setError(err.code === err.TIMEOUT ? '位置情報の取得に時間がかかっています' : '位置情報を取得できません')
      },
      WATCH_OPTIONS,
    )
  }, [stop])

  useEffect(() => stop, [stop])

  return { position, accuracy: position?.accuracy ?? null, permission, error, start, stop }
}
