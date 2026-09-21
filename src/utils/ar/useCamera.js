import { useEffect, useRef, useState } from 'react'

/**
 * 背面カメラのストリームを videoRef に流し込む hook。
 * 戻り値: { videoRef, status, error }
 * status: 'idle' | 'ready' | 'error'
 */


const describeCameraError = (e) =>  {
  switch (e.name) {
    case 'NotAllowedError':
      return 'カメラの使用が許可されませんでした。ブラウザの設定から許可してください。'
    case 'NotFoundError':
      return 'カメラが見つかりません。'
    case 'NotReadableError':
      return 'カメラが他のアプリで使用中です。'
    default:
      return e.message
  }
}

export const useCamera = (enabled) => {
  const videoRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let cancelled = false

    const start = async () =>  {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('cannot use getUserMedia API (open the app by https)')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // 背面カメラ優先
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStatus('ready')
      } catch (e) {
        setStatus('error')
        setError(describeCameraError(e))
      }
    }
    start()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled])

  return { videoRef, status, error }
}

