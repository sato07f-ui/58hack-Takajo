import { useEffect, useState } from 'react'
import { TUTORIAL_CLEAR_MS, isScanHeld, tutorialCaption, tutorialPhase } from './tutorialRule'

/**
 * 読み込み中に遊ぶチュートリアルの状態を持つ hook。進み具合は tutorialRule.js で決める。
 * 引数: { sceneReady, enemy, bossActive, playerHits }
 *   sceneReady: ArScene の onSceneReady が呼ばれた / enemy: useBattle の enemy
 *   bossActive: ラスボスが呼ばれた（bossPhase !== 'none'） / playerHits: useBattle の playerHits
 * 返り値: { running, phase, caption, holdScan, begin, handleEnemySpawn, handleItemCollect, handleDoorDone }
 *   running: 今回の入場でチュートリアルを出すか（ArScene の tutorial に渡す）
 *   phase: tutorialPhase の戻り値。'door' の間は切り替えの扉を出す
 *   caption: TutorialHud に出す文（出さないときは null）
 *   holdScan: ArScene の holdScan に渡す
 *   begin(): ダンジョンに入るタップの中で呼ぶ。今回チュートリアルを出すかを返す
 *   handleEnemySpawn(enemy, playerHits) / handleItemCollect(): ArScene の onEnemySpawn / onItemCollect から呼ぶ
 *   handleDoorDone(): 切り替えの扉が開き終わったときに呼ぶ
 * チュートリアルのアイテムを拾ったら、この画面を開いている間はもう出さない。
 */
export function useTutorial({ sceneReady, enemy, bossActive, playerHits }) {
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [collected, setCollected] = useState(false)
  const [doorShown, setDoorShown] = useState(false)
  const [doorDone, setDoorDone] = useState(false)
  const [hitsAtStart, setHitsAtStart] = useState(0)

  const phase = tutorialPhase({ running, sceneReady, started, collected, doorShown, doorDone, enemy, bossActive })

  // 「やったね！」を見せてから扉を出す
  useEffect(() => {
    if (phase !== 'cleared') return
    const timer = setTimeout(() => setDoorShown(true), TUTORIAL_CLEAR_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const begin = () => {
    const next = !collected
    setRunning(next)
    setStarted(false)
    setDoorShown(false)
    setDoorDone(false)
    return next
  }

  const handleEnemySpawn = (spawned, hits) => {
    if (!spawned.tutorial) return
    setStarted(true)
    setHitsAtStart(hits)
  }

  // チュートリアルのアイテムを拾ったときだけ。普通のアイテムでは何もしない
  const handleItemCollect = () => {
    if (running && started && !collected) setCollected(true)
  }

  const handleDoorDone = () => setDoorDone(true)

  return {
    running,
    phase,
    caption: tutorialCaption(phase, { hitDuringTutorial: playerHits > hitsAtStart }),
    holdScan: isScanHeld(phase),
    begin,
    handleEnemySpawn,
    handleItemCollect,
    handleDoorDone,
  }
}
