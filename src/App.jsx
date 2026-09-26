import { useState } from 'react'
import { ArScene } from './utils/ar/ArScene'
import { useDeviceOrientation } from './utils/ar/useDeviceOrientation'

function App() {
  const [started, setStarted] = useState(false)
  const { orientationRef, permission, requestPermission } = useDeviceOrientation()

  // タップハンドラ内でセンサー権限を要求する（iOS の制約）
  async function handleStart() {
    const result = await requestPermission()
    if (result === 'denied') return
    // 'unsupported'（PC ブラウザ等）はカメラ確認のため進める
    setStarted(true) // ArScene のマウント時にカメラ権限が要求される
  }

  if (!started) {
    return (
      <div className="start-screen">
        <h1>スーパーダンジョン</h1>
        <button type="button" onClick={handleStart}>
          冒険をはじめる
        </button>
        {permission === 'denied' && (
          <p>センサーの使用が拒否されました。設定 › Safari › モーションと画面の向きのアクセス を確認してください。</p>
        )}
        {permission === 'unsupported' && <p>この端末は向きセンサーに対応していません。</p>}
      </div>
    )
  }

  return (
    <>
      <ArScene orientationRef={orientationRef} />
      <div className="ui-layer">{/* 後でここに魔法ボタンを置く */}</div>
    </>
  )
}

export default App
