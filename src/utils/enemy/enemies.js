import carrotUrl from '../../assets/carrot.glb?url'
import greenpepperUrl from '../../assets/greenpepper.glb?url'
import spinachUrl from '../../assets/spinach.glb?url'

/**
 * 敵の定義。
 * modelUrl: 3D モデル（glb）
 * targetUrl: この敵を出現させる画像の .mind（public/targets/ に 1 画像 1 ファイルで置く）。
 *            null の敵は画像認識では出現しない
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 */
export const ENEMIES = [
  { id: 'carrot', name: 'にんじん', modelUrl: carrotUrl, targetUrl: '/targets/carrot.mind', height: 0.3 },
  { id: 'greenpepper', name: 'ピーマン', modelUrl: greenpepperUrl, targetUrl: '/targets/greenpepper.mind', height: 0.25 },
  { id: 'spinach', name: 'ほうれん草', modelUrl: spinachUrl, targetUrl: null, height: 0.35 }, // .mind 未作成
]
