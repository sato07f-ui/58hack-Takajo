import { useEffect, useRef, useState } from 'react'
import './BossGate.css'

// 演出の段階と、それぞれに移るまでの時間 [ms]
const TIMELINE = [
  ['appear', 0], // 画面が暗くなりながら門がフェードインする
  ['rumble', 1200], // 門がゴゴゴ…と揺れる
  ['open', 2200], // 扉が奥へ重々しく開く（BossGate.css の --open-ms と合わせる）
  ['reveal', 5000], // 開ききった。暗さが晴れて、奥からラスボスが現れる
  ['done', 6200], // 演出が終わった
]

/**
 * ラスボス出現時の「魔王城の門が開く」演出。カメラ映像の上に重ねて表示する。
 * props.onOpened(): 扉が開ききったときに 1 回呼ばれる（ここでラスボスを出す）
 * props.onDone(): 演出が終わったときに 1 回呼ばれる（ここで BossGate を外す）
 */
export function BossGate({ onOpened, onDone }) {
  const [phase, setPhase] = useState('appear')
  const callbacksRef = useRef({ onOpened, onDone })
  useEffect(() => {
    callbacksRef.current = { onOpened, onDone }
  })

  useEffect(() => {
    const timers = TIMELINE.slice(1).map(([next, at]) =>
      setTimeout(() => {
        setPhase(next)
        if (next === 'rumble') navigator.vibrate?.([80, 60, 80, 60, 80, 60, 400])
        if (next === 'reveal') callbacksRef.current.onOpened?.()
        if (next === 'done') callbacksRef.current.onDone?.()
      }, at),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  if (phase === 'done') return null

  return (
    <div className={`boss-gate boss-gate--${phase}`} role="status" aria-label="魔王城の門が開く">
      <div className="boss-gate__glow" />
      <div className="boss-gate__frame">
        <div className="boss-gate__arch" />
        <div className="boss-gate__doorway">
          <div className="boss-gate__light" />
          <div className="boss-gate__door boss-gate__door--left">
            <span className="boss-gate__ring" />
          </div>
          <div className="boss-gate__door boss-gate__door--right">
            <span className="boss-gate__ring" />
          </div>
        </div>
      </div>
      <p className="boss-gate__caption">ラスボスがあらわれた！</p>
    </div>
  )
}
