/**
 * プレイヤーのライフ（残機）のルール（純関数）。
 * ライフは MAX_LIVES から始まり、敵の弾に当たるたびに 1 減る。0 になったらゲームオーバー。
 * ポーションを飲むと 1 回復する（最大 MAX_LIVES まで。ゲームオーバー中は飲めない）。
 * ゲームオーバーからは親に近づいて復活し、ライフは MAX_LIVES に戻る（ChildView.jsx）。
 */

export const MAX_LIVES = 3
export const POTION_ITEM_ID = 'potion' // src/utils/item/items.js の id

/** 被弾した後のライフ */
export const loseLife = (lives) => Math.max(lives - 1, 0)

/** ポーションで回復した後のライフ */
export const gainLife = (lives) => Math.min(lives + 1, MAX_LIVES)

/** いまポーションを飲めるか（持っている・ゲームオーバーでない・満タンでない） */
export const canDrinkPotion = (lives, potionCount) => potionCount > 0 && lives > 0 && lives < MAX_LIVES
