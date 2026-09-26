import { useState } from 'react'
import { useDeviceOrientation } from './utils/ar/useDeviceOrientation'
import { TrackerMode } from './components/tracker/TrackerMode'
import { StartScreen } from './components/StartScreen/StartScreen'
import './App.css'

/**
 * タイトル画面 → 見守りモード（役割選択 → 親 / 子）を切り替える。
 * ゲーム（AR バトル）は子供の画面（ChildView）で、親とつながってから始まる。
 */
function App() {
  const [screen, setScreen] = useState('title') // 'title' | 'tracker'
  // センサー権限は子供が「ダンジョンへ入る」を押したときに ChildView が要求する
  const { orientationRef, requestPermission } = useDeviceOrientation()

  if (screen === 'tracker') {
    return <TrackerMode onExit={() => setScreen('title')} ar={{ orientationRef, requestPermission }} />
  }

  return <StartScreen onStart={() => setScreen('tracker')} />
}

export default App
