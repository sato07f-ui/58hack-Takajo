/**
 * 映像上の座標（px, videoWidth 基準）を、画面上の座標（CSS px）に変換する。
 * .ar-video の object-fit: cover を前提にする。
 * 画面外（切れて見えない部分）に出た場合は画面の端に寄せる。
 */
export const videoToScreen = (video, videoX, videoY) => {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const sw = video.clientWidth
  const sh = video.clientHeight
  const scale = Math.max(sw / vw, sh / vh) // cover: 大きい方の倍率で拡大
  const x = (videoX - vw / 2) * scale + sw / 2
  const y = (videoY - vh / 2) * scale + sh / 2
  return {
    x: Math.min(Math.max(x, 0), sw),
    y: Math.min(Math.max(y, 0), sh),
  }
}
