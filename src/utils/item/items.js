import bananaBoomerangUrl from '../../assets/banana_boomerang.glb?url'

/**
 * ドロップアイテムの定義。敵を倒したときに AR 空間へ出る。
 * id: ENEMIES の drop フィールドから参照するキー
 * modelUrl: 3D モデル（glb）
 * height: AR 空間で表示する高さ [m]（モデルの実寸に関係なくこの高さに揃える）
 */
export const ITEMS = [
  { id: 'banana-boomerang', name: 'バナナブーメラン', modelUrl: bananaBoomerangUrl, height: 0.2 },
]

/** id でアイテム定義を引く。見つからなければ null */
export const findItem = (id) => ITEMS.find((item) => item.id === id) ?? null
