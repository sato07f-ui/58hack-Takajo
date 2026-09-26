import { useEffect, useRef, useState } from 'react'
import styles from './DungeonEntrance.module.css'

const MIN_CLOSED_MS = 1200 // 準備がすぐ終わっても、扉を見せておく最低時間
const OPEN_MS = 1300 // 扉が開き始めてから、この画面が消えるまで（CSS のアニメーション時間と揃える）
const SLOW_HINT_MS = 5000 // これ以上待たせたら「はじめては時間がかかる」と出す

/**
 * ダンジョンに入るときの演出。ローディング画面の代わりに、閉じた扉を AR 画面の上に重ねる。
 * ready（カメラ・認識モデルの準備完了）と最低表示時間の両方がそろったら扉が開き、開き終わったら onDone() を呼ぶ。
 * props.ready: 準備が終わったら true
 * props.onDone(): 演出が終わって、この画面を外してよいときに呼ばれる
 */
export function DungeonEntrance({ ready, onDone }) {
  const [minElapsed, setMinElapsed] = useState(false)
  const [slow, setSlow] = useState(false)
  const onDoneRef = useRef(onDone)
  const opening = ready && minElapsed

  // 毎レンダーで最新のコールバックを参照する（effect を張り直さないため）
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_CLOSED_MS)
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS)
    return () => {
      clearTimeout(minTimer)
      clearTimeout(slowTimer)
    }
  }, [])

  useEffect(() => {
    if (!opening) return
    const timer = setTimeout(() => onDoneRef.current?.(), OPEN_MS)
    return () => clearTimeout(timer)
  }, [opening])

  return (
    <div className={`${styles.overlay} ${opening ? styles.opening : ''}`} role="status" aria-live="polite">
      <div className={styles.light} />
      <div className={styles.doorway}>
        <div className={`${styles.door} ${styles.left}`} />
        <div className={`${styles.door} ${styles.right}`} />
      </div>
      <div className={`${styles.torch} ${styles.torchLeft}`} />
      <div className={`${styles.torch} ${styles.torchRight}`} />
      <div className={styles.caption}>
        <p className={styles.title}>ダンジョンの入口</p>
        <p className={styles.status}>
          {opening ? '扉がひらいた！' : '扉をひらいています'}
          {!opening && <span className={styles.dots} aria-hidden="true" />}
        </p>
        {slow && !opening && <p className={styles.hint}>はじめて入るときは、少し時間がかかります</p>}
      </div>
    </div>
  )
}
