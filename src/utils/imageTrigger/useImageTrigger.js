import { useCallback, useEffect, useRef, useState } from 'react'
import { createImageTracker } from './createImageTracker'

/**
 * enabled が true になったら .mind の画像を探し始める hook。
 * 見つかったら onDetect({ targetIndex, videoX, videoY }) を呼んで止まる。
 * 戻り値: { status, error, rescan }
 * status: 'idle' | 'scanning' | 'detected' | 'error'
 * rescan(): 敵を倒した後などに、もう一度探し始める
 */
export const useImageTrigger = (videoRef, { enabled, targetsUrl, onDetect }) => {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const trackerRef = useRef(null)
  const onDetectRef = useRef(onDetect)

  // 毎レンダーで最新のコールバックを参照する（effect を張り直さないため）
  useEffect(() => {
    onDetectRef.current = onDetect
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const start = async () => {
      try {
        const tracker = await createImageTracker(videoRef.current, {
          targetsUrl,
          onDetect: (result) => {
            setStatus('detected')
            onDetectRef.current?.(result)
          },
        })
        if (cancelled) {
          tracker.dispose()
          return
        }
        trackerRef.current = tracker
        tracker.start()
        setStatus('scanning')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError(e.message)
      }
    }
    start()

    return () => {
      cancelled = true
      trackerRef.current?.dispose()
      trackerRef.current = null
    }
  }, [enabled, targetsUrl, videoRef])

  const rescan = useCallback(() => {
    if (!trackerRef.current) return
    trackerRef.current.start()
    setStatus('scanning')
  }, [])

  return { status, error, rescan }
}
