import { distanceMeters } from '../../utils/tracker/haversine'
import { distanceLevel, formatDistance } from '../../utils/tracker/distanceLevel'

/**
 * 自分と相手の位置から距離を計算して大きく表示する。親子どちらの画面でも使う。
 * props.me, props.peer: { lat, lng, accuracy } | null
 */
export function DistanceDisplay({ me, peer }) {
  const meters = distanceMeters(me, peer)
  const level = distanceLevel(meters)
  const errorRange = me && peer ? Math.round((me.accuracy ?? 0) + (peer.accuracy ?? 0)) : null
  return (
    <div className={`distance-display distance-${level}`}>
      <p className="distance-value">{formatDistance(meters)}</p>
      {errorRange !== null && <p className="distance-error">誤差 ±{errorRange} m</p>}
      {!me && <p className="distance-note">自分の位置を取得しています…</p>}
      {me && !peer && <p className="distance-note">相手の位置を待っています…</p>}
    </div>
  )
}
