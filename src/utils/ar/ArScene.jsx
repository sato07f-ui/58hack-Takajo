import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { createScene, applyDeviceOrientation } from './createScene'

/**
 * props.orientationRef: useDeviceOrientation() の orientationRef
 * （権限要求は親の「開始」ボタンで済ませてから ArScene をマウントする）
 * props.sceneRef: createScene() の戻り値を親に渡すための ref（任意）
 */
export function ArScene({ orientationRef, sceneRef }) {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)

  useEffect(() => {
    const scene = createScene(canvasRef.current, {
      onFrame(camera) {
        const angle = screen.orientation?.angle ?? window.orientation ?? 0
        applyDeviceOrientation(camera, orientationRef.current, angle)
      },
    })
    if (sceneRef) sceneRef.current = scene
    return () => {
      scene.dispose()
      if (sceneRef) sceneRef.current = null
    }
  }, [orientationRef, sceneRef])

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </>
  )
}
