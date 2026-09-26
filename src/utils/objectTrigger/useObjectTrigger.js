import { useCallback, useEffect, useRef, useState } from 'react'
import { createObjectTracker, loadObjectModel } from './createObjectTracker'

/**
 * enabled が true になったら、COCO-SSD で targetClass（例: 'banana'）を探し始める hook。
 * 見つかったら onDetect({ className, score, videoX, videoY }) を呼んで止まる。
 * 戻り値: { status, error, stop, rescan }
 * status: 'idle' | 'loading' | 'scanning' | 'detected' | 'stopped' | 'error'
 * stop(): 探すのをやめる（他の方法で敵が見つかったときなど）。モデル読み込み中に呼んでも、読み込み後に探し始めない
 * rescan(): 敵を倒した後などに、もう一度探し始める
 */
export const useObjectTrigger = (
  videoRef,
  { enabled, targetClass, minScore = 0.6, intervalMs = 500, onDetect },
) => {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const trackerRef = useRef(null)
  const onDetectRef = useRef(onDetect)
  const stoppedRef = useRef(false) // stop() されたら、rescan() まで探さない

  // 毎レンダーで最新のコールバックを参照する（effect を張り直さないため）
  useEffect(() => {
    onDetectRef.current = onDetect
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const start = async () => {
      try {
        setStatus('loading')
        const model = await loadObjectModel()
        if (cancelled) return
        const tracker = createObjectTracker(videoRef.current, {
          model,
          targetClass,
          minScore,
          intervalMs,
          onDetect: (result) => {
            setStatus('detected')
            onDetectRef.current?.(result)
          },
        })
        trackerRef.current = tracker
        if (stoppedRef.current) {
          setStatus('stopped') // 読み込み中に stop() された
          return
        }
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
      trackerRef.current?.stop() // setInterval を確実に止める
      trackerRef.current = null
    }
  }, [enabled, targetClass, minScore, intervalMs, videoRef])

  const stop = useCallback(() => {
    stoppedRef.current = true
    trackerRef.current?.stop()
    setStatus((s) => (s === 'scanning' || s === 'loading' ? 'stopped' : s))
  }, [])

  const rescan = useCallback(() => {
    stoppedRef.current = false
    if (!trackerRef.current) return
    trackerRef.current.start()
    setStatus('scanning')
  }, [])

  return { status, error, stop, rescan }
}
