import '@tensorflow/tfjs' // WebGL / CPU バックエンドを登録する（coco-ssd より先に読み込む）
import * as cocoSsd from '@tensorflow-models/coco-ssd'

let modelPromise = null

/**
 * COCO-SSD のモデルを読み込む（アプリ全体で 1 回だけ。2 回目以降は同じものを返す）。
 * 重みは初回にネットから数 MB ダウンロードされる。
 */
export const loadObjectModel = () => {
  // lite_mobilenet_v2: 軽量で速い。精度重視なら 'mobilenet_v2'
  modelPromise ??= cocoSsd.load({ base: 'lite_mobilenet_v2' })
  return modelPromise
}

/**
 * <video> を一定間隔で物体検出し、targetClass が minScore を超えて映ったら
 * onDetect({ className, score, videoX, videoY }) を 1 回だけ呼んで止まる。
 * videoX / videoY は検出枠の中心（映像の px）。
 * 戻り値: { start(), stop() }
 *
 * requestAnimationFrame ではなく setInterval で間引くのは、MindAR の画像認識と
 * 同時に動かしても端末が重くならないようにするため。
 */
export const createObjectTracker = (video, { model, targetClass, minScore, intervalMs, onDetect }) => {
  let timer = null
  let busy = false // 前回の detect がまだ終わっていなければ、その回は飛ばす

  const tick = async () => {
    if (busy || video.readyState < 2) return
    busy = true
    try {
      const predictions = await model.detect(video)
      if (timer === null) return // 検出中に stop() された
      const hit = predictions.find((p) => p.class === targetClass && p.score > minScore)
      if (!hit) return
      stop()
      const [x, y, w, h] = hit.bbox
      onDetect({ className: hit.class, score: hit.score, videoX: x + w / 2, videoY: y + h / 2 })
    } finally {
      busy = false
    }
  }

  const start = () => {
    if (timer !== null) return
    timer = setInterval(tick, intervalMs)
  }

  const stop = () => {
    clearInterval(timer)
    timer = null
  }

  return { start, stop }
}
