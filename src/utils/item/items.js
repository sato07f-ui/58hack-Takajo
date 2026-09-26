import bananaBoomerangUrl from '../../assets/banana_boomerang.glb?url'
import carrotSwordUrl from '../../assets/carrot_sword.glb?url'
import potionUrl from '../../assets/potion.glb?url'

/**
 * ドロップアイテムの定義。敵を倒したときに AR 空間へ出る。
 * id: ENEMIES の drop フィールドから参照するキー
 * modelUrl: 3D モデル（glb）
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）。
 *         平たいモデルは高さを小さめにしないと幅が大きくなりすぎる
 *         （banana_boomerang.glb は高さ 0.124 : 幅 0.6 なので 0.06 → 幅 0.29 m）
 */
export const ITEMS = [
  { id: 'banana-boomerang', name: 'バナナブーメラン', modelUrl: bananaBoomerangUrl, height: 0.06 },
  { id: 'carrot-sword', name: 'にんじんソード', modelUrl: carrotSwordUrl, height: 0.3 },
  { id: 'potion', name: 'ポーション', modelUrl: potionUrl, height: 0.2 }, // 割り当ては仮
]

/** id でアイテム定義を引く。見つからなければ null */
export const findItem = (id) => ITEMS.find((item) => item.id === id) ?? null
