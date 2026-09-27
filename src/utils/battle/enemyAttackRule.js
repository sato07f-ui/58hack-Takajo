/**
 * 敵の攻撃タイミングと被弾判定のルール（純関数）。
 * 敵は出現から FIRST_ATTACK_DELAY_MS 後に最初の攻撃をし、以降は MIN_INTERVAL_MS〜MAX_INTERVAL_MS おきに攻撃する。
 * 攻撃は ATTACK_WINDUP_MS 溜めてから弾を撃つ（溜めの演出は createScene.js）。
 * 被弾した後 PLAYER_INVINCIBLE_MS の間は、次の弾が当たっても被弾にしない。
 */

export const FIRST_ATTACK_DELAY_MS = 3000 // 出現直後は撃たず、魔法を 2〜3 発撃てる時間を先に与える
export const MIN_INTERVAL_MS = 3000
export const MAX_INTERVAL_MS = 5000
export const ATTACK_WINDUP_MS = 800 // 溜めを見てから魔法を当てれば、攻撃をキャンセルできる長さ
export const PLAYER_INVINCIBLE_MS = 1500

/**
 * 次の攻撃までの待ち時間 [ms] を決める。
 * isFirst: 今の敵の最初の攻撃なら true
 * random: 0 以上 1 未満を返す関数（テスト・デバッグで固定値を渡せる）
 */
export const nextAttackDelay = (isFirst, random = Math.random) => {
  if (isFirst) return FIRST_ATTACK_DELAY_MS
  return MIN_INTERVAL_MS + Math.floor(random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1))
}

/**
 * いま弾が当たったら被弾にするか（無敵時間が過ぎているか）。
 * lastHitAt: 最後に被弾した時刻 [ms]（performance.now()）。まだ被弾していなければ null
 */
export const canTakeHit = (lastHitAt, now) => lastHitAt === null || now - lastHitAt >= PLAYER_INVINCIBLE_MS
