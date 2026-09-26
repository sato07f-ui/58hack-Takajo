import * as ort from 'onnxruntime-web/webgpu' // WebGPU と WASM の両方に対応したビルド

// ORT の WASM 本体は CDN から読む（Vite で配信設定をしなくて済む）。バージョンはパッケージと揃える
ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`
ort.env.wasm.numThreads = 1 // マルチスレッドは COOP/COEP ヘッダーが必要なので使わない

const INPUT_SIZE = 320 // yolov8n.onnx を書き出したときの imgsz
const PAD_VALUE = 114 // レターボックスの余白の色（YOLO の学習時と同じ灰色）

// YOLO（COCO 学習済み）の 80 クラス。出力のクラス番号の並び順
export const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
  'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
  'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
  'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
  'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
  'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
  'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]

/** 2 つの枠 [x, y, w, h] の重なり具合（IoU） */
const iou = (a, b) => {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[0] + a[2], b[0] + b[2])
  const y2 = Math.min(a[1] + a[3], b[1] + b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  return inter / (a[2] * a[3] + b[2] * b[3] - inter)
}

/** スコアの高い順に、同じクラスで大きく重なる枠を取り除く（NMS） */
const nonMaxSuppression = (boxes, iouThreshold) => {
  const sorted = [...boxes].sort((a, b) => b.score - a.score)
  const kept = []
  for (const box of sorted) {
    if (kept.every((k) => k.classId !== box.classId || iou(k.bbox, box.bbox) < iouThreshold)) kept.push(box)
  }
  return kept
}

/**
 * YOLO（ONNX）の物体検出器を作る。
 * 戻り値の detect(input) は COCO-SSD と同じ形 [{ class, score, bbox: [x, y, w, h] }] を返す
 * （bbox は入力映像の px）。input は <video> / <canvas> / <img>。
 */
export const createYoloDetector = async (modelUrl, { scoreThreshold = 0.25, iouThreshold = 0.45, maxDetections = 20 } = {}) => {
  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['webgpu', 'wasm'], // WebGPU が使えない端末は WASM で動く
  })
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]

  const canvas = document.createElement('canvas')
  canvas.width = INPUT_SIZE
  canvas.height = INPUT_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const input = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)

  const detect = async (source) => {
    const srcW = source.videoWidth ?? source.naturalWidth ?? source.width
    const srcH = source.videoHeight ?? source.naturalHeight ?? source.height
    if (!srcW || !srcH) return []

    // 前処理: 縦横比を保って 320×320 に収め、余白を灰色で埋める（レターボックス）
    const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH)
    const drawW = srcW * scale
    const drawH = srcH * scale
    const padX = (INPUT_SIZE - drawW) / 2
    const padY = (INPUT_SIZE - drawH) / 2
    ctx.fillStyle = `rgb(${PAD_VALUE}, ${PAD_VALUE}, ${PAD_VALUE})`
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
    ctx.drawImage(source, padX, padY, drawW, drawH)

    // RGBA (HWC, 0〜255) → RGB (CHW, 0〜1)
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE)
    const plane = INPUT_SIZE * INPUT_SIZE
    for (let i = 0; i < plane; i++) {
      input[i] = data[i * 4] / 255
      input[plane + i] = data[i * 4 + 1] / 255
      input[2 * plane + i] = data[i * 4 + 2] / 255
    }

    const results = await session.run({ [inputName]: new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]) })
    const output = results[outputName] // [1, 84, N]: 0〜3 行目が cx, cy, w, h、4〜83 行目がクラスごとのスコア
    const out = output.data
    const n = output.dims[2]
    const classCount = output.dims[1] - 4

    // 後処理: 各候補の一番高いクラスを取り、閾値以上を残す
    const boxes = []
    for (let j = 0; j < n; j++) {
      let best = 0
      let classId = -1
      for (let c = 0; c < classCount; c++) {
        const s = out[(4 + c) * n + j]
        if (s > best) {
          best = s
          classId = c
        }
      }
      if (best < scoreThreshold) continue
      const cx = out[j]
      const cy = out[n + j]
      const w = out[2 * n + j]
      const h = out[3 * n + j]
      // 320×320 の座標 → レターボックス前の映像の px に戻す
      boxes.push({
        classId,
        score: best,
        bbox: [(cx - w / 2 - padX) / scale, (cy - h / 2 - padY) / scale, w / scale, h / scale],
      })
    }

    return nonMaxSuppression(boxes, iouThreshold)
      .slice(0, maxDetections)
      .map(({ classId, score, bbox }) => ({ class: COCO_CLASSES[classId], score, bbox }))
  }

  return { detect }
}
