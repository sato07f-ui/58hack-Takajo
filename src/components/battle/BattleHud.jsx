import { findItem } from '../../utils/item/items'

/**
 * バトル中の操作 UI（手持ち一覧・「〇〇を手に入れた！」・攻撃ボタン）。.ui-layer の中に置く。
 * props.battle: useBattle の返り値
 * props.disabled: true の間は攻撃ボタンを押せない（脱出中など）
 */
export function BattleHud({ battle, disabled = false }) {
  const { enemy, isCooldown, inventory, itemToast, handleAttack } = battle
  return (
    <>
      <div className="inventory">
        <p className="inventory-title">手持ち</p>
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
        className="attack-button"
        onClick={handleAttack}
        disabled={!enemy || isCooldown || disabled}
      >
        {isCooldown ? 'チャージ中...' : '魔法を撃つ'}
      </button>
    </>
  )
}
