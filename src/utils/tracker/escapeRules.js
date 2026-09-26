/**
 * 脱出・復活のしきい値。実機で歩いて調整する前提の仮の値。
 * 脱出と復活で距離を分ける（ヒステリシス）ことで、GPS の揺れによる状態のバタつきを防ぐ。
 */
export const ESCAPE_DISTANCE_M = 50 // これより離れた状態が
export const ESCAPE_HOLD_MS = 5000 // この時間続いたら脱出
export const REVIVE_DISTANCE_M = 10 // これより近い状態が
export const REVIVE_HOLD_MS = 3000 // この時間続いたら鍵を渡す
export const REVIVE_RESEND_MS = 3000 // 子供から応答が無い間、鍵を送り直す間隔
export const MAX_JUDGE_ACCURACY_M = 50 // 親子の誤差の合計がこれを超える間は判定を保留

/** 距離判定に使ってよい精度か（親子の accuracy の合計で見る） */
export const isAccurateEnough = (me, peer) =>
  !!me && !!peer && (me.accuracy ?? 0) + (peer.accuracy ?? 0) <= MAX_JUDGE_ACCURACY_M
