import * as THREE from 'three'
import { Compiler, Controller } from 'mind-ar/dist/mindar-image.prod.js'

const _m = new THREE.Matrix4()
const _p = new THREE.Matrix4()
const _v = new THREE.Vector3()

/**
 * MindAR の worldMatrix から、画像の中心が映像のどこに映っているか（px）を求める。
 * 画像座標系は「単位は画像の px」なので、中心は (幅/2, 高さ/2, 0)。
 */
const projectMarkerCenter = (controller, worldMatrix, [markerW, markerH], video) => {
  _m.fromArray(worldMatrix)
  _p.fromArray(controller.getProjectionMatrix())
  // 画像座標 → MindAR カメラ座標 → 正規化デバイス座標（-1〜1）
  _v.set(markerW / 2, markerH / 2, 0).applyMatrix4(_m).applyMatrix4(_p)
  return {
    videoX: ((_v.x + 1) / 2) * video.videoWidth,
    videoY: ((1 - _v.y) / 2) * video.videoHeight,
  }
}

/**
 * 複数の .mind を読み込み、1 つの .mind データにつなげる。
 * MindAR の認識エンジンは .mind を 1 つしか読めないため、中身（画像データのリスト）を連結する。
 * 戻り値: { buffer, fileIndexOf }
 * fileIndexOf[i]: 連結後の i 番目の画像が、targetUrls の何番目のファイルから来たか
 */
const loadAndMergeTargets = async (targetUrls) => {
  const compiler = new Compiler()
  const data = []
  const fileIndexOf = []
  for (const [fileIndex, url] of targetUrls.entries()) {
    const res = await fetch(url)
    // 存在しないパスでも開発サーバーは index.html を 200 で返すので、HTML も失敗扱いにする
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`${url} が見つかりません（public/ に置いたか確認してください）`)
    }
    let list
    try {
      list = compiler.importData(await res.arrayBuffer())
    } catch {
      throw new Error(`${url} は .mind ファイルとして読み込めませんでした`)
    }
    if (list.length === 0) throw new Error(`${url} は MindAR の現在の形式ではありません。コンパイルし直してください`)
    for (const item of list) {
      data.push(item)
      fileIndexOf.push(fileIndex)
    }
  }
  compiler.data = data
  return { buffer: compiler.exportData(), fileIndexOf }
}

/**
 * <video> を入力に、targetUrls の .mind に登録された画像を探す。
 * 見つかったら onDetect({ targetIndex, videoX, videoY }) を 1 回だけ呼び、認識を止める。
 * targetIndex は「targetUrls の何番目のファイルの画像か」。
 * 戻り値: { start(), stop(), dispose() }
 * video は再生中（videoWidth が確定済み）であること。
 */
export const createImageTracker = async (video, { targetUrls, onDetect }) => {
  // MindAR は video の width / height「属性」を入力サイズとして読むので、実サイズを入れておく
  video.setAttribute('width', video.videoWidth)
  video.setAttribute('height', video.videoHeight)

  let dimensions = []
  let fileIndexOf = []
  let scanning = false

  const controller = new Controller({
    inputWidth: video.videoWidth,
    inputHeight: video.videoHeight,
    maxTrack: 1, // 同時に追う画像は 1 枚で十分
    onUpdate: ({ type, targetIndex, worldMatrix }) => {
      if (!scanning || type !== 'updateMatrix' || worldMatrix === null) return
      scanning = false
      controller.stopProcessVideo() // トリガーとしてだけ使うので、見つけたら止める
      onDetect({
        targetIndex: fileIndexOf[targetIndex],
        ...projectMarkerCenter(controller, worldMatrix, dimensions[targetIndex], video),
      })
    },
  })

  try {
    const merged = await loadAndMergeTargets(targetUrls)
    fileIndexOf = merged.fileIndexOf
    dimensions = controller.addImageTargetsFromBuffer(merged.buffer).dimensions
    controller.dummyRun(video)
  } catch (e) {
    controller.dispose()
    throw e
  }

  return {
    start() {
      if (scanning) return
      scanning = true
      controller.processVideo(video)
    },
    stop() {
      scanning = false
      controller.stopProcessVideo()
    },
    dispose() {
      scanning = false
      controller.dispose()
    },
  }
}
