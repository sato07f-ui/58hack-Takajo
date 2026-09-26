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
  const [currentEnemy, setCurrentEnemy] = useState(null) // 出ている敵（ENEMIES の要素）
  const [droppedItem, setDroppedItem] = useState(null) // 手に入れたアイテム（ITEMS の要素）
  const defeatedRef = useRef(false) // playDefeatEffect を 1 回だけ呼ぶため

  // ドロップが手元に届いて消えた瞬間に呼ばれる。ここで「手に入れた」表示と短い振動を出す
  const handleCollect = (item) => {
    setDroppedItem(item)
    navigator.vibrate?.(50) // 着弾時（100ms）より短くする
  }

  // クールダウンのタイマー
  useEffect(() => {
    if (!isCooldown) return
    const timer = setTimeout(() => setIsCooldown(false), COOLDOWN_MS)
    return () => clearTimeout(timer)
  }, [isCooldown])

  // HP が 0 になったら撃破演出を 1 回だけ始める（ドロップは createScene 側が演出後に出す）
  useEffect(() => {
    if (enemyHp > 0 || defeatedRef.current) return
    defeatedRef.current = true
    sceneRef.current?.playDefeatEffect()
  }, [enemyHp])

  // 魔法を撃つ。HP 減算と光る演出は魔法弾が着弾した瞬間に行う
  const handleAttack = () => {
    if (isCooldown || mp < ATTACK_MP_COST) return

    const fired = sceneRef.current?.shootMagic(() => {
      setEnemyHp((prev) => Math.max(prev - ATTACK_DAMAGE, 0))
      navigator.vibrate?.(100) // PC や一部 iOS では動かないがエラーにはならない
    })
    if (!fired) return // 敵がいない、または撃破演出中は MP を消費しない

    setMp((prev) => prev - ATTACK_MP_COST)
    setIsCooldown(true)
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
      <ArScene
        orientationRef={orientationRef}
        sceneRef={sceneRef}
        onEnemySpawn={setCurrentEnemy}
        onCollect={handleCollect}
      />
      <div className="ui-layer">
        {/* 実機検証用リモコン。本番では外す */}
        {/* <DebugRemote sceneRef={sceneRef} orientationRef={orientationRef} permission={permission} /> */}

        <div className="battle-status">
          {currentEnemy && <p>敵: {currentEnemy.name}</p>}
          <p>敵のHP: {enemyHp}</p>
          <p>MP: {mp}</p>
          {droppedItem && <p>{droppedItem.name} を手に入れた！</p>}
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
