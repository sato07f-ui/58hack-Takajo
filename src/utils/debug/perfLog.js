/**
 * 【一時的な計測用】バナナ検出 → 敵の表示までの時間をコンソールに出す。
 * `npm run dev`（`npm run tunnel` 含む）のときだけ出し、本番ビルドでは何もしない。
 *
 * 呼び出し側は「1 行で完結する呼び出し」だけにして、行末に `// [perf]` を付ける。
 * 消すとき:
 *   1. `grep -rn "\[perf\]" src` で出てきた行を削除する
 *   2. このファイルを削除する
 */

const ENABLED = import.meta.env.DEV
const noop = () => {}

const log = (message) => console.log(`[perf] ${message}`)
const since = (t) => Math.round(performance.now() - t)

/**
 * 計測を始める。戻り値の関数を呼ぶと、開始からの時間を label 付きで出す。
 *   const end = perfStart('session 作成') // [perf]
 *   end() // [perf]
 */
export const perfStart = (label) => {
  if (!ENABLED) return noop
  const t = performance.now()
  return (extra = '') => log(`${label} ${since(t)}ms${extra && ` ${extra}`}`)
}

/** WebGPU が使える端末か（使えなければ ORT は WASM = CPU で推論する）を出す */
export const logWebGpuSupport = async () => {
  if (!ENABLED) return
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null)
  log(`WebGPU: ${adapter ? '使える' : '使えない（WASM で推論）'}`)
}

/** ORT の session.run を差し替えて、呼ばれるたびに推論時間を出す */
export const instrumentSessionRun = (session) => {
  if (!ENABLED) return
  const run = session.run.bind(session)
  let count = 0
  session.run = async (...args) => {
    const t = performance.now()
    const result = await run(...args)
    log(`session.run #${++count} ${since(t)}ms`)
    return result
  }
}

/** 検出結果の上位 3 件（クラスとスコア）を出す。minScore の調整用 */
export const logDetections = (predictions) => {
  if (!ENABLED) return
  const top = predictions
    .slice(0, 3)
    .map((p) => `${p.class} ${p.score.toFixed(2)}`)
    .join(', ')
  log(`検出: ${top || 'なし'}`)
}
