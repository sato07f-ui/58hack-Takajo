import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_DROP_STATE, decideDrop } from '../item/dropRule'
import { canTakeHit, nextAttackDelay } from './enemyAttackRule'

const ATTACK_DAMAGE = 20
export const COOLDOWN_MS = 1000
const ENEMY_MAX_HP = 100
const ITEM_TOAST_MS = 1500 // 「〇〇を手に入れた！」を出しておく時間

/**
 * AR バトルの状態（敵・攻撃のクールダウン・手持ちアイテム・敵の攻撃の予約とプレイヤーの被弾回数）を管理する hook。
 * 引数: { disabled }（true の間は攻撃できず、敵からも攻撃されない。脱出中など）
 * 返り値: { sceneRef, enemy, isCooldown, inventory, itemToast, playerHits, handleEnemySpawn, handleItemCollect, handleAttack }
 *   playerHits: 敵の弾に当たった回数（被弾演出のきっかけ。残機を付けるときはここを残機に置き換える）
 *   sceneRef / handleEnemySpawn / handleItemCollect は ArScene に渡す
 */
export function useBattle({ disabled = false } = {}) {
  const sceneRef = useRef(null) // Three.js（3D空間）へ命令を送るためのパイプ

  const [enemy, setEnemy] = useState(null) // いま出ている敵（ENEMIES の要素）。いなければ null
  // 敵の残り HP。表示は頭上の HP ゲージ（createScene）が担うので state ではなく ref で持ち、着弾コールバックから直接読み書きする
  const enemyHpRef = useRef(ENEMY_MAX_HP)
  const [isCooldown, setIsCooldown] = useState(false)
  const dropStateRef = useRef(INITIAL_DROP_STATE) // 同じ敵を続けて倒した回数（ボーナスドロップ用）

  // 手持ちのアイテム: { [アイテムの id]: 個数 }
  const [inventory, setInventory] = useState({})
  const [itemToast, setItemToast] = useState(null) // 直前に拾ったアイテム（お知らせ表示用）

  const [attackSeq, setAttackSeq] = useState(0) // 敵の攻撃が終わるたびに +1（次の攻撃を予約し直すきっかけ）
  const [playerHits, setPlayerHits] = useState(0) // 敵の弾に当たった回数
  const lastHitAtRef = useRef(null) // 最後に被弾した時刻（無敵時間の判定用）
  const attackCountRef = useRef(0) // 今の敵が攻撃した回数（0 なら次が最初の攻撃）

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

  // 敵の弾が手元に届いた。無敵時間中でなければ被弾にする
  const handlePlayerHit = useCallback(() => {
    const now = performance.now()
    if (!canTakeHit(lastHitAtRef.current, now)) return
    lastHitAtRef.current = now
    setPlayerHits((n) => n + 1)
    navigator.vibrate?.([80, 40, 80]) // 魔法の着弾（100ms）と区別できるよう 2 回震わせる
  }, [])

  // 敵の攻撃を予約する。攻撃が終わる（attackSeq が増える）たびに次を予約し直す。
  // 敵がいない（撃破後を含む）・脱出中は攻撃しない。止まるときは溜めも飛んでいる弾も消す
  useEffect(() => {
    const scene = sceneRef.current // 敵が出ている時点で作られている（ArScene がマウント中）
    if (!enemy || disabled || !scene) return
    const timer = setTimeout(() => {
      attackCountRef.current += 1
      const started = scene.enemyAttack({
        onHit: handlePlayerHit,
        onEnd: () => setAttackSeq((n) => n + 1),
      })
      if (!started) setAttackSeq((n) => n + 1) // 撃破演出中などで始められなければ予約し直す
    }, nextAttackDelay(attackCountRef.current === 0))
    return () => {
      clearTimeout(timer)
      scene.cancelEnemyAttack()
    }
  }, [enemy, disabled, attackSeq, handlePlayerHit])

  // 敵が出現したら、その敵と戦う（HP を満タンにする）
  const handleEnemySpawn = (spawned) => {
    setEnemy(spawned)
    enemyHpRef.current = ENEMY_MAX_HP
    attackCountRef.current = 0 // 敵ごとに、最初の攻撃までの猶予を与える
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
        // 落とすアイテムを決める（同じ敵を 2 回続けて倒すとポーション）
        const { itemId, state } = decideDrop(dropStateRef.current, enemy)
        dropStateRef.current = state
        sceneRef.current?.playDefeatEffect(itemId)
        setEnemy(null) // 撃破演出中は攻撃できないようにする
      }
      navigator.vibrate?.(100) // PC や一部 iOS では動かないがエラーにはならない
    })
    if (!fired) return // 敵がいない、または撃破演出中はクールダウンに入らない

    setIsCooldown(true)
  }

  return {
    sceneRef,
    enemy,
    isCooldown,
    inventory,
    itemToast,
    playerHits,
    handleEnemySpawn,
    handleItemCollect,
    handleAttack,
  }
}
