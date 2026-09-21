import { useCamera } from './utils/ar/useCamera'

function App() {
  const { videoRef, status, error } = useCamera(true)

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted className="ar-video" />
      {status === 'error' && <p className="ar-message">{error}</p>}
    </>
  )
}

export default App
