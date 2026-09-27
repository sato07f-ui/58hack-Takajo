import { useEffect, useRef, useState } from 'react'

const ATTACK_DAMAGE = 20
export const COOLDOWN_MS = 1000
const ENEMY_MAX_HP = 100
const ITEM_TOAST_MS = 1500 // 「〇〇を手に入れた！」を出しておく時間

/**
 * AR バトルの状態（敵・攻撃のクールダウン・手持ちアイテム）を管理する hook。
 * 引数: { disabled }（true の間は攻撃できない。脱出中など）
 * 返り値: { sceneRef, enemy, isCooldown, inventory, itemToast, handleEnemySpawn, handleItemCollect, handleAttack }
 *   sceneRef / handleEnemySpawn / handleItemCollect は ArScene に渡す
 */
export function useBattle({ disabled = false } = {}) {
  const sceneRef = useRef(null) // Three.js（3D空間）へ命令を送るためのパイプ

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
    if (disabled || !enemy || isCooldown) return // 撃てる回数に制限はなく、クールダウンを待てば何度でも撃てる

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

  return { sceneRef, enemy, isCooldown, inventory, itemToast, handleEnemySpawn, handleItemCollect, handleAttack }
}
