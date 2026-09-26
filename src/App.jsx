import { useEffect, useRef, useState } from 'react'
import { ArScene } from './utils/ar/ArScene'
//import { DebugRemote } from './utils/ar/DebugRemote'
import { useDeviceOrientation } from './utils/ar/useDeviceOrientation'
import { TrackerMode } from './components/tracker/TrackerMode'
import './App.css'

const ATTACK_MP_COST = 10
const ATTACK_DAMAGE = 20
const COOLDOWN_MS = 1000

function App() {
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState('game') // 'game' | 'tracker'
  const { orientationRef, permission, requestPermission } = useDeviceOrientation()
  const sceneRef = useRef(null) // Three.js（3D空間）へ命令を送るためのパイプ

  // バトル用の状態
  const [enemyHp, setEnemyHp] = useState(100)
  const [mp, setMp] = useState(50)
  const [isCooldown, setIsCooldown] = useState(false)

  // クールダウンのタイマー
  useEffect(() => {
    if (!isCooldown) return
    const timer = setTimeout(() => setIsCooldown(false), COOLDOWN_MS)
    return () => clearTimeout(timer)
  }, [isCooldown])

  // 魔法を撃つ
  const handleAttack = () => {
    if (isCooldown || mp < ATTACK_MP_COST) return

    setMp((prev) => prev - ATTACK_MP_COST)
    const nextHp = Math.max(enemyHp - ATTACK_DAMAGE, 0)
    setEnemyHp(nextHp)
    setIsCooldown(true)

    // フィードバック演出：HP が 0 なら撃破（消滅＋アイテムドロップ）、残っていればダメージ（発光・変形・エフェクト）
    if (nextHp === 0) sceneRef.current?.playDefeatEffect()
    else sceneRef.current?.playDamageEffect()
    navigator.vibrate?.(100) // PC や一部 iOS では動かないがエラーにはならない
  }

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
      <div className="start-screen">
        <h1>スーパーダンジョン</h1>
        <button type="button" onClick={handleStart}>
          冒険をはじめる
        </button>
        <button type="button" onClick={() => setMode('tracker')}>
          見守りモード
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
      <ArScene orientationRef={orientationRef} sceneRef={sceneRef} />
      <div className="ui-layer">
        {/* 実機検証用リモコン。本番では外す */}
        {/* <DebugRemote sceneRef={sceneRef} orientationRef={orientationRef} permission={permission} /> */}

        <div className="battle-status">
          <p>敵のHP: {enemyHp}</p>
          <p>MP: {mp}</p>
        </div>

        <button
          type="button"
          className="attack-button"
          onClick={handleAttack}
          disabled={isCooldown || mp < ATTACK_MP_COST}
        >
          {isCooldown ? 'チャージ中...' : `魔法を撃つ (MP-${ATTACK_MP_COST})`}
        </button>
      </div>
    </>
  )
}

export default App
