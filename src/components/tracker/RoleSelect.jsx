/**
 * 見守りモードの役割選択。
 * props.onSelect('parent' | 'child'), props.onBack()
 */
export function RoleSelect({ onSelect, onBack }) {
  return (
    <div className="tracker-screen">
      <h1>見守りモード</h1>
      <p>どちらの端末として使いますか？</p>
      <div className="tracker-actions">
        <button type="button" onClick={() => onSelect('parent')}>
          親として使う
        </button>
        <button type="button" onClick={() => onSelect('child')}>
          子供として使う
        </button>
      </div>
      <button type="button" className="tracker-link" onClick={onBack}>
        もどる
      </button>
    </div>
  )
}
