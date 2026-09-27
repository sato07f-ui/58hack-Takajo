/**
 * 敵がカメラに追従するときの調整値。
 * 敵の中心は「カメラから伸びる 1 本の線」の上に置かれ、スマホの向きを変えても画面の同じ位置についてくる。
 *
 * `npm run dev` 中はこのファイルを保存すると、ページをリロードせずに値だけ反映される（出ている敵もそのまま）。
 * 毎フレーム読むので、どの値もすぐに見た目に出る。
 */
const values = {
  distance: 0.7, // カメラから敵の中心までの距離 [m]。大きいほど奥に小さく見える
  offsetX: 0, // 画面の右方向へのずらし [m]（マイナスで左）
  offsetY: 0.01, // 画面の上方向へのずらし [m]（マイナスで下）
  smooth: 0.15, // 1 フレームで目標位置へ寄る割合（0〜1）。1 でぴったり張り付き、小さいほどふわっと遅れてついてくる
  keepSpawnDirection: true, // true: 認識した画面位置の方向に出し続ける / false: 画面中央に出す
  showLine: import.meta.env.DEV, // 手元から敵の中心までの線を表示する（本番ビルドでは表示しない）
}

// 保存し直しても createScene が持っている同じオブジェクトを書き換えるので、リロードせずに反映される
const live = import.meta.hot?.data.live ?? {}
Object.assign(live, values)
if (import.meta.hot) {
  import.meta.hot.data.live = live
  import.meta.hot.accept()
}

export const ENEMY_FOLLOW = live
