import carrotUrl from '../../assets/carrot.glb?url'
import greenpepperUrl from '../../assets/greenpepper.glb?url'
import spinachUrl from '../../assets/spinach.glb?url'
import bananaUrl from '../../assets/banana.glb?url'

/**
 * 敵の定義。
 * modelUrl: 3D モデル（glb）。
 *           null の敵は仮モデル（黄色いカプセル）で出る
 * targetUrl: この敵を出現させる画像の .mind（public/targets/ に 1 画像 1 ファイルで置く）。
 *            null の敵は画像認識では出現しない
 * detectClass: COCO-SSD の物体認識で出現させるときのクラス名（本物の物をカメラに映して出す特別な敵）
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 * drop: 倒したときに出るアイテムの id（src/utils/item/items.js）。null なら何も落とさない
 */
export const ENEMIES = [
  { id: 'carrot', name: 'にんじん', modelUrl: carrotUrl, targetUrl: '/targets/carrot.mind', height: 0.3, drop: 'carrot-sword' },
  { id: 'greenpepper', name: 'ピーマン', modelUrl: greenpepperUrl, targetUrl: '/targets/greenpepper.mind', height: 0.25, drop: null },
  { id: 'spinach', name: 'ほうれん草', modelUrl: spinachUrl, targetUrl: '/targets/spinach.mind', height: 0.35, drop: null }, // .mind 未作成
  // 特別な敵: 本物のバナナを COCO-SSD で検出して出す
  { id: 'banana', name: 'バナナ', modelUrl: bananaUrl, targetUrl: null, detectClass: 'banana', height: 0.3, drop: 'banana-boomerang' },
]
