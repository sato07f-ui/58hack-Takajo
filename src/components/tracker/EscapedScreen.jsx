import { formatDistance } from '../../utils/tracker/distanceLevel'
import { REVIVE_DISTANCE_M } from '../../utils/tracker/escapeRules'

/** 距離に応じて演出の強さを決める。近いほど強い */
const intensity = (distance) => {
  if (distance == null) return 'lost'
  if (distance < REVIVE_DISTANCE_M) return 'imminent'
  if (distance < 25) return 'close'
  return 'far'
}

/**
 * 脱出中の子供に重ねる全画面オーバーレイ。下のゲームへのタップを塞ぐ。
 * props.distance: 親までの距離 [m] | null
 */
export function EscapedScreen({ distance }) {
  const level = intensity(distance)
  return (
    <div className={`escaped-screen escaped-${level}`} role="alert">
      <p className="escaped-title">ダンジョンから脱出してしまった！</p>
      <p className="escaped-lead">親に近づいて復活の鍵を手に入れよう</p>
      <p className="escaped-distance">{formatDistance(distance)}</p>
      <p className="escaped-hint">
        {level === 'imminent' && '鍵がもうすぐ届く…！'}
        {level === 'close' && 'もう少し！'}
        {level === 'far' && '親のいる方へ戻ろう'}
        {level === 'lost' && '親の位置を探しています…'}
      </p>
    </div>
  )
}

/** 復活した直後に短く出すバナー */
export function RevivedBanner() {
  return (
    <div className="revived-banner" role="status">
      復活！
    </div>
  )
}
