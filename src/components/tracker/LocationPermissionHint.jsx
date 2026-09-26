const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

/**
 * 位置情報の権限に関する案内。useGeolocation の permission / error を渡す。
 * 端末（iOS / Android）に合わせて設定手順を出し分ける。
 */
export function LocationPermissionHint({ permission, error }) {
  if (permission === 'denied') {
    return (
      <div className="tracker-error tracker-steps">
        <p>位置情報の使用が拒否されました。次の手順で許可してから、もう一度お試しください。</p>
        {isIOS ? (
          <ol>
            <li>設定 › プライバシーとセキュリティ › 位置情報サービス をオンにする</li>
            <li>同じ画面で Safari（または使用中のブラウザ）を「このApp の使用中」にする</li>
            <li>設定 › Safari › 位置情報 を「確認」または「許可」にする</li>
          </ol>
        ) : (
          <ol>
            <li>Chrome のアドレスバー左のアイコン › 権限 › 位置情報 を「許可」にする</li>
            <li>端末の 設定 › 位置情報 がオンになっているか確認する</li>
          </ol>
        )}
      </div>
    )
  }
  if (permission === 'unsupported') return <p className="tracker-error">この端末は位置情報に対応していません。</p>
  if (error) return <p className="tracker-note">{error}</p>
  return null
}
