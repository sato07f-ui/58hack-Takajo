/** 距離（m）に応じた表示レベル。CSS の .distance-{level} と対応する */
export const distanceLevel = (meters) => {
  if (meters == null) return 'unknown'
  if (meters < 5) return 'near'
  if (meters < 10) return 'mid'
  return 'far'
}

/** 「約 12 m」のように丸めた表示用文字列 */
export const formatDistance = (meters) => {
  if (meters == null) return '--'
  return meters < 1000 ? `約 ${Math.round(meters)} m` : `約 ${(meters / 1000).toFixed(1)} km`
}
