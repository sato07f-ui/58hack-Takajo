/**
 * 位置情報の権限に関する案内。useGeolocation の permission / error を渡す。
 */
export function LocationPermissionHint({ permission, error }) {
  if (permission === 'denied') {
    return (
      <p className="tracker-error">
        位置情報の使用が拒否されました。設定 › Safari › 位置情報（iPhone）または サイトの設定 › 位置情報（Android）を確認してください。
      </p>
    )
  }
  if (permission === 'unsupported') return <p className="tracker-error">この端末は位置情報に対応していません。</p>
  if (error) return <p className="tracker-note">{error}</p>
  return null
}
