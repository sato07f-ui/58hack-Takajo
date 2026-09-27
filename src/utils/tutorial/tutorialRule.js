/**
 * 読み込み中に遊ぶチュートリアルの進み具合と表示する文（純関数）。
 * カメラが映ったらチュートリアルの敵と戦い（その間に認識の準備を裏で進める）、
 * 倒してアイテムを拾ったら TUTORIAL_CLEAR_MS 後に扉の演出を挟んで本番の敵探しに入る。
 * 流れの図は docs/OFFLINE_TUTORIAL_PLAN.md。
 */

export const TUTORIAL_SPAWN_SCREEN_Y = 0.45 // 攻撃ボタンと距離表示の間に出す（0: 上端〜1: 下端）
export const TUTORIAL_CLEAR_MS = 1500 // 「〇〇を手に入れた！」（useBattle の ITEM_TOAST_MS）が消えてから扉を出す

/**
 * チュートリアルの段階を求める。
 * 戻り値: 'none' | 'preparing' | 'fight' | 'collect' | 'cleared' | 'door' | 'done'
 *   running: 今回の入場でチュートリアルを出すか / sceneReady: カメラが映り、チュートリアルの敵を出し終わった
 *   started: チュートリアルの敵が出た / collected: そのアイテムを拾った
 *   doorShown: 扉を出した / doorDone: 扉が開き終わった
 *   enemy: いま出ている敵（useBattle の enemy） / bossActive: ラスボスが呼ばれた
 */
export const tutorialPhase = ({ running, sceneReady, started, collected, doorShown, doorDone, enemy, bossActive }) => {
  if (!running) return 'none'
  if (bossActive || doorDone) return 'done'
  // カメラが使えなかった・チュートリアルの敵を出せなかったときは、普通の流れに任せる
  if (!started) return sceneReady ? 'none' : 'preparing'
  if (collected) return doorShown ? 'door' : 'cleared'
  if (enemy?.tutorial) return 'fight'
  return 'collect' // 撃破して、ドロップが手元へ飛んでいる途中
}

/** この段階の間は、アイテムを拾っても次の敵を探し始めない（扉が開くまで待たせる） */
export const isScanHeld = (phase) => phase !== 'none' && phase !== 'done'

/**
 * 画面に出す文。出さないときは null。
 * hitDuringTutorial: チュートリアルの敵の弾に当たったことがあるか
 */
export const tutorialCaption = (phase, { hitDuringTutorial = false } = {}) => {
  switch (phase) {
    case 'preparing':
      return 'カメラを じゅんびちゅう…'
    case 'fight':
      return hitDuringTutorial ? 'あかく ひかったら まほうで とめられるよ！' : 'にんじんが あらわれた！「まほう」で たおそう！'
    case 'cleared':
      return 'やったね！ ダンジョンに はいるよ！'
    default:
      return null // collect は「〇〇を手に入れた！」と、door は扉の文と重ねない
  }
}
