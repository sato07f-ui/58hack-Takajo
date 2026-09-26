const EARTH_RADIUS_M = 6371000

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * 2点 { lat, lng }（度）間の地表距離をメートルで返す（Haversine 公式）。
 * どちらかが null / undefined なら null を返す。
 */
export const distanceMeters = (a, b) => {
  if (!a || !b) return null
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}
