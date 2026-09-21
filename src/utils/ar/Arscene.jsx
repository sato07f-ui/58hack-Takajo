import { useEffect, useRef } from 'react'
import { useCamera } from './useCamera'
import { createScene } from './createScene'

export function ArScene() {
  const { videoRef, status, error } = useCamera(true)
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)

  useEffect(() => {
    sceneRef.current = createScene(canvasRef.current)
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      <canvas ref={canvasRef} className="ar-canvas" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </div>
  )
}
