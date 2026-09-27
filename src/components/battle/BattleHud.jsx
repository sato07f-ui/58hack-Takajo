import { useState } from 'react'
import { findItem } from '../../utils/item/items'
import { COOLDOWN_MS } from '../../utils/battle/useBattle'

// 攻撃ボタンの文字。子どもが読めるようにひらがなで、撃てないときは次にすることを伝える
const ATTACK_LABELS = {
  ready: 'まほう',
  charging: 'チャージちゅう…',
  idle: 'てきをさがせ！',
}

/**
 * バトル中の操作 UI（手持ち一覧・「〇〇を手に入れた！」・攻撃ボタン）。.ui-layer の中に置く。
 * props.battle: useBattle の返り値
 * props.disabled: true の間は攻撃ボタンを押せない（脱出中など）
 */
export function BattleHud({ battle, disabled = false }) {
  const { enemy, isCooldown, inventory, itemToast, handleAttack } = battle
  // ready: 撃てる / charging: 撃った直後で魔力をためている / idle: 敵がいない・脱出中で撃てない
  const state = !enemy || disabled ? 'idle' : isCooldown ? 'charging' : 'ready'
  // チャージが満タンになった（charging → ready になった）ときだけキラッと光らせる。
  // 敵が出てきて押せるようになったとき（idle → ready）は光らせない
  const [prevState, setPrevState] = useState(state)
  const [justCharged, setJustCharged] = useState(false)
  if (prevState !== state) {
    setPrevState(state)
    setJustCharged(prevState === 'charging' && state === 'ready')
  }
  return (
    <>
      <div className="inventory">
        <p className="inventory-title">もちもの</p>
        {Object.keys(inventory).length === 0 ? (
          <p>なし</p>
        ) : (
          Object.entries(inventory).map(([id, count]) => (
            <p key={id}>
              {findItem(id)?.name ?? id} ×{count}
            </p>
          ))
        )}
      </div>

      {itemToast && (
        <p key={itemToast.id + inventory[itemToast.id]} className="item-toast">
          {itemToast.name}を手に入れた！
        </p>
      )}

      <button
        type="button"
        className={`attack-button attack-button--${state}${justCharged ? ' attack-button--charged' : ''}`}
        style={{ '--charge-ms': `${COOLDOWN_MS}ms` }} // チャージ中のゲージが溜まりきる時間
        onClick={handleAttack}
        disabled={state !== 'ready'}
      >
        {ATTACK_LABELS[state]}
      </button>
    </>
  )
}
