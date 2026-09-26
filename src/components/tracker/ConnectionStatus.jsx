const STATUS_TEXT = { idle: '未接続', connecting: '接続中…', connected: '接続済み', error: 'エラー' }

/**
 * 接続状態・相手の在席・最終更新時刻をまとめて表示する。
 * props: useLocationChannel の返り値のうち status / error / peerOnline / lastSeenAt / isStale と peerLabel
 */
export function ConnectionStatus({ status, error, peerOnline, lastSeenAt, isStale, peerLabel }) {
  return (
    <div className="tracker-status">
      <p>
        通信: {STATUS_TEXT[status]}
        {status === 'connected' && ` / ${peerLabel}: ${peerOnline ? 'オンライン' : 'オフライン'}`}
      </p>
      {lastSeenAt !== null && (
        <p className={isStale ? 'tracker-stale' : undefined}>
          最終更新: {new Date(lastSeenAt).toLocaleTimeString()}
          {isStale && '（通信が途切れています）'}
        </p>
      )}
      {error && <p className="tracker-error">{error}</p>}
    </div>
  )
}
