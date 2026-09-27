import { useEffect, useRef, useState } from 'react'
import './BossGate.css'

// 演出の段階と、それぞれに移るまでの時間 [ms]
const TIMELINE = [
  ['appear', 0], // 画面いっぱいに大きな扉がフェードインする
  ['rumble', 900], // 扉がゴゴゴ…と揺れる
  ['open', 1900], // 扉が奥へ重々しく開く。その先は闇（BossGate.css の --open-ms と合わせる）
  ['fade', 4500], // 開ききった。扉と闇がフェードアウトし、闇に包まれたダンジョン（カメラ映像）が見えてくる
  ['light', 5500], // スポットライトが点き、ラスボスが闇から浮かび上がる
  ['caption', 6700], // 「ラスボスがあらわれた！」
  ['done', 8500], // 演出が終わった。戦闘開始
]
const STEPS = TIMELINE.map(([step]) => step)

/**
 * ラスボス出現時の「大きな扉が開く」演出。AR ではなく、画面いっぱいに重ねて表示する。
 * props.onStep(step): 段階が変わるたびに呼ばれる（TIMELINE の名前。'done' で演出が終わる）
 *   ラスボスを出す・照らす・戦闘を始めるタイミングは、呼び出し側がこの段階に合わせる
 */
export function BossGate({ onStep }) {
  const [step, setStep] = useState('appear')
  const onStepRef = useRef(onStep)
  useEffect(() => {
    onStepRef.current = onStep
  })

  useEffect(() => {
    const timers = TIMELINE.slice(1).map(([next, at]) =>
      setTimeout(() => {
        setStep(next)
        if (next === 'rumble') navigator.vibrate?.([80, 60, 80, 60, 80, 60, 400])
        onStepRef.current?.(next)
      }, at),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  if (step === 'done') return null

  // ある段階以降ずっと付くクラス（例: 開いた扉は、その後の段階でも開いたまま）
  const index = STEPS.indexOf(step)
  const since = (name) => (index >= STEPS.indexOf(name) ? ` is-${name}` : '')

  return (
    <div
      className={`boss-gate boss-gate--${step}${since('open')}${since('fade')}${since('caption')}`}
      role="status"
      aria-label="ラスボスの扉が開く"
    >
      <div className="boss-gate__stage">
        <div className="boss-gate__door boss-gate__door--left">
          <span className="boss-gate__ring" />
        </div>
        <div className="boss-gate__door boss-gate__door--right">
          <span className="boss-gate__ring" />
        </div>
        <div className="boss-gate__frame" />
      </div>
      <p className="boss-gate__caption">ラスボスがあらわれた！</p>
    </div>
  )
}
