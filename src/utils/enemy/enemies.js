import carrotUrl from '../../assets/carrot.glb?url'
import greenpepperUrl from '../../assets/greenpepper.glb?url'
import spinachUrl from '../../assets/spinach.glb?url'

/**
 * targetIndex（.mind に登録した画像の順番）→ 敵の定義。
 * 並び順は .mind へのアップロード順と同じにする。
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 */
export const ENEMIES = [
  { id: 'carrot', name: 'にんじん', modelUrl: carrotUrl, height: 0.6 }, // 画像 0
  { id: 'greenpepper', name: 'ピーマン', modelUrl: greenpepperUrl, height: 0.5 }, // 画像 1
  { id: 'spinach', name: 'ほうれん草', modelUrl: spinachUrl, height: 0.7 }, // 画像 2
]
