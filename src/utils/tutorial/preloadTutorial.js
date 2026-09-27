import { ENEMIES } from '../enemy/enemies'
import { findItem } from '../item/items'
import { loadModel } from '../item/loadModel'

const TUTORIAL = ENEMIES.find((enemy) => enemy.tutorial)

/**
 * ダンジョンに入るタップの時点で呼ぶ。カメラの許可を待つ間に、チュートリアルの敵とドロップの glb を読み込んでおく
 * （preloadNextScreen と同じ考え方）。loadModel は url ごとにキャッシュするので、
 * 後の spawnEnemy / spawnDrop はダウンロード済みのものを使う。
 */
export const preloadTutorial = () => {
  for (const url of [TUTORIAL.modelUrl, findItem(TUTORIAL.drop)?.modelUrl]) {
    // 失敗は loadModel にキャッシュされ、出すときの spawnEnemy も失敗する。そのときは ArScene が普通の敵探しに切り替える
    loadModel(url).catch(() => {})
  }
}
