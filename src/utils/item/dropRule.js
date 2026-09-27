/**
 * 敵を倒したときに何を落とすかのルール（純関数）。
 * 基本は敵ごとの drop（src/utils/enemy/enemies.js）。
 * 同じ種類の敵を STREAK_FOR_BONUS 回続けて倒すと、その回だけ BONUS_ITEM_ID に置き換える。
 * 置き換えたら数え直すので、同じ敵を倒し続けると 2, 4, 6 体目でボーナスになる。
 */

export const STREAK_FOR_BONUS = 2
export const BONUS_ITEM_ID = 'potion'

/** state: 直前に倒した敵の id と、同じ敵を続けて倒した回数 */
export const INITIAL_DROP_STATE = { lastEnemyId: null, streak: 0 }

/**
 * 倒した敵 enemy（ENEMIES の要素）から落とすアイテムを決める。
 * 戻り値: { itemId: アイテムの id | null, state: 次に渡す state }
 */
export const decideDrop = (state, enemy) => {
  const streak = enemy.id === state.lastEnemyId ? state.streak + 1 : 1
  if (streak >= STREAK_FOR_BONUS) {
    return { itemId: BONUS_ITEM_ID, state: { lastEnemyId: enemy.id, streak: 0 } }
  }
  return { itemId: enemy.drop ?? null, state: { lastEnemyId: enemy.id, streak } }
}
