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
 * props.reason: 'distance' | 'stale'（通信途絶） | 'defeated'（バトルでライフが 0 になった）
 */
export function EscapedScreen({ distance, reason }) {
  const level = intensity(distance)
  return (
    <div className={`escaped-screen escaped-${level}`} role="alert">
      <p className="escaped-title">{reason === 'defeated' ? 'やられてしまった…' : 'ダンジョンから脱出してしまった！'}</p>
      <p className="escaped-lead">
        {reason === 'defeated' ? '親のところに戻って、復活の鍵をもらおう' : '親に近づいて復活の鍵を手に入れよう'}
      </p>
      {reason === 'stale' && <p className="escaped-note">親との通信が途切れています。電波のよい場所で画面を開いたまま待ってね</p>}
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

/**
 * 開発用コード（親なし）でライフが 0 になったときのオーバーレイ。親がいないので、ボタンで復活する。
 * props.onRetry(): 「もういちど」を押したとき
 */
export function GameOverScreen({ onRetry }) {
  return (
    <div className="escaped-screen escaped-far" role="alert">
      <p className="escaped-title">やられてしまった…</p>
      <p className="escaped-note">開発用コードでは親がいないので、ボタンで復活します</p>
      <button type="button" className="game-over-retry" onClick={onRetry}>
        もういちど
      </button>
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
