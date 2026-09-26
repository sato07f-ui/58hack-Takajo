import { useState } from 'react'
import { ArScene } from './utils/ar/ArScene'
//import { DebugRemote } from './utils/ar/DebugRemote'
import { useDeviceOrientation } from './utils/ar/useDeviceOrientation'
import { useBattle } from './utils/battle/useBattle'
import { BattleHud } from './components/battle/BattleHud'
import { TrackerMode } from './components/tracker/TrackerMode'
import { StartScreen } from './components/StartScreen/StartScreen'
import './App.css'

function App() {
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState('game') // 'game' | 'tracker'
  const { orientationRef, permission, requestPermission } = useDeviceOrientation()
  const battle = useBattle()

  // タップハンドラ内でセンサー権限を要求する（iOS の制約）
  async function handleStart() {
    const result = await requestPermission()
    if (result === 'denied') return
    // 'unsupported'（PC ブラウザ等）はカメラ確認のため進める
    setStarted(true) // ArScene のマウント時にカメラ権限が要求される
  }

  if (mode === 'tracker') {
    return <TrackerMode onExit={() => setMode('game')} ar={{ orientationRef, requestPermission }} />
  }

  if (!started) {
    return (
      <StartScreen
        onStart={handleStart}
        onOpenTracker={() => setMode('tracker')}
        notice={
          permission === 'denied'
            ? 'センサーの使用が拒否されました。設定 › Safari › モーションと画面の向きのアクセス を確認してください。'
            : null
        }
      />
    )
  }

  return (
    <>
      <ArScene
        orientationRef={orientationRef}
        sceneRef={battle.sceneRef}
        onEnemySpawn={battle.handleEnemySpawn}
        onItemCollect={battle.handleItemCollect}
      />
      <div className="ui-layer">
        {/* 実機検証用リモコン。本番では外す */}
        {/* <DebugRemote sceneRef={battle.sceneRef} orientationRef={orientationRef} permission={permission} /> */}

        <BattleHud battle={battle} />
      </div>
    </>
  )
}

export default App
