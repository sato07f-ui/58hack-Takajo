import { useEffect, useRef, useState } from 'react'
import { ArScene } from './utils/ar/ArScene'
//import { DebugRemote } from './utils/ar/DebugRemote'
import { useDeviceOrientation } from './utils/ar/useDeviceOrientation'
import { TrackerMode } from './components/tracker/TrackerMode'
import { StartScreen } from './components/StartScreen/StartScreen'
import { findItem } from './utils/item/items'
import './App.css'

const ATTACK_DAMAGE = 20
const COOLDOWN_MS = 1000
const ENEMY_MAX_HP = 100
const ITEM_TOAST_MS = 1500 // 「〇〇を手に入れた！」を出しておく時間

function App() {
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState('game') // 'game' | 'tracker'
  const { orientationRef, permission, requestPermission } = useDeviceOrientation()
  const sceneRef = useRef(null) // Three.js（3D空間）へ命令を送るためのパイプ

  // バトル用の状態
  const [enemy, setEnemy] = useState(null) // いま出ている敵（ENEMIES の要素）。いなければ null
  // 敵の残り HP。表示は頭上の HP ゲージ（createScene）が担うので state ではなく ref で持ち、着弾コールバックから直接読み書きする
  const enemyHpRef = useRef(ENEMY_MAX_HP)
  const [isCooldown, setIsCooldown] = useState(false)

  // 手持ちのアイテム: { [アイテムの id]: 個数 }
  const [inventory, setInventory] = useState({})
  const [itemToast, setItemToast] = useState(null) // 直前に拾ったアイテム（お知らせ表示用）

  // クールダウンのタイマー
  useEffect(() => {
    if (!isCooldown) return
    const timer = setTimeout(() => setIsCooldown(false), COOLDOWN_MS)
    return () => clearTimeout(timer)
  }, [isCooldown])

  // お知らせを一定時間で消す
  useEffect(() => {
    if (!itemToast) return
    const timer = setTimeout(() => setItemToast(null), ITEM_TOAST_MS)
    return () => clearTimeout(timer)
  }, [itemToast])

  // 敵が出現したら、その敵と戦う（HP を満タンにする）
  const handleEnemySpawn = (spawned) => {
    setEnemy(spawned)
    enemyHpRef.current = ENEMY_MAX_HP
  }

  // 敵が落としたアイテムが手元に届いたら手持ちに入れる
  const handleItemCollect = (item) => {
    setInventory((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))
    setItemToast(item)
    navigator.vibrate?.(50) // 着弾時（100ms）より短くする
  }

  // 魔法を撃つ。HP 減算と演出は魔法弾が着弾した瞬間に行う
  const handleAttack = () => {
    if (!enemy || isCooldown) return // 撃てる回数に制限はなく、クールダウンを待てば何度でも撃てる

    const fired = sceneRef.current?.shootMagic(() => {
      const nextHp = Math.max(enemyHpRef.current - ATTACK_DAMAGE, 0)
      enemyHpRef.current = nextHp
      sceneRef.current?.setEnemyHpRatio(nextHp / ENEMY_MAX_HP) // 敵の頭上の HP ゲージに反映する
      // HP が 0 なら撃破（消滅＋アイテムドロップ）。ダメージ演出（発光・変形・エフェクト）は着弾時に createScene 側で出る
      if (nextHp === 0) {
        sceneRef.current?.playDefeatEffect()
        setEnemy(null) // 撃破演出中は攻撃できないようにする
      }
      navigator.vibrate?.(100) // PC や一部 iOS では動かないがエラーにはならない
    })
    if (!fired) return // 敵がいない、または撃破演出中はクールダウンに入らない

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
        sceneRef={sceneRef}
        onEnemySpawn={handleEnemySpawn}
        onItemCollect={handleItemCollect}
      />
      <div className="ui-layer">
        {/* 実機検証用リモコン。本番では外す */}
        {/* <DebugRemote sceneRef={sceneRef} orientationRef={orientationRef} permission={permission} /> */}

        <div className="inventory">
          <p className="inventory-title">手持ち</p>
          {Object.keys(inventory).length === 0 ? (
            <p>なし</p>
          ) : (
            Object.entries(inventory).map(([id, count]) => (
              <p key={id}>
                {findItem(id)?.name ?? id} ×{count}
              </p>
            ))
          )}
        </div>

        {itemToast && (
          <p key={itemToast.id + inventory[itemToast.id]} className="item-toast">
            {itemToast.name}を手に入れた！
          </p>
        )}

        <button
          type="button"
          className="attack-button"
          onClick={handleAttack}
          disabled={!enemy || isCooldown}
        >
          {isCooldown ? 'チャージ中...' : '魔法を撃つ'}
        </button>
      </div>
    </>
  )
}

export default App
