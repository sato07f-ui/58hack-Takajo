/**
 * 【一時的な調査用】開発サーバー（cloudflared トンネル経由）との通信をコンソールに出す。
 * 「アイドル扱いで WebSocket が切られ、Vite がリロードしている」かを確かめるためのもの。
 * `npm run dev`（`npm run tunnel` 含む）のときだけ動き、本番ビルドでは何もしない。
 *
 * 出すもの:
 *   - HMR の WebSocket の接続 / 切断（切断時は「最後の通信から何秒後か」も出す）
 *   - WebSocket の送受信、トンネル経由の HTTP リクエスト（＝通信が流れた記録）
 *   - 無通信が続いている秒数（15 秒ごと）
 *   - タブの表示 / 非表示（スマホのスリープやアプリ切り替えとの切り分け用）
 *
 * 消すとき:
 *   1. `grep -rn "\[tunnel\]" src` で出てきた行を削除する
 *   2. このファイルを削除する
 */

const ENABLED = import.meta.env.DEV
const TICK_MS = 15000

const log = (message) => console.log(`[tunnel] ${new Date().toLocaleTimeString()} ${message}`)

export const startTunnelLog = () => {
  if (!ENABLED || !import.meta.hot) return

  const start = performance.now()
  let lastTraffic = start
  let connected = true
  const idleSec = () => Math.round((performance.now() - lastTraffic) / 1000)
  const mark = (message) => {
    log(`${message}（前回の通信から ${idleSec()} 秒）`)
    lastTraffic = performance.now()
  }

  // 送信: Vite クライアントのソケットは先に作られているので、prototype を差し替えて拾う
  const send = WebSocket.prototype.send
  WebSocket.prototype.send = function (data) {
    if (this.url.includes(location.host)) mark(`WS 送信: ${String(data).slice(0, 80)}`)
    return send.call(this, data)
  }

  // 受信: 接続時に渡されるソケットに listener を付ける（リロード直後の接続は拾えないことがある）
  import.meta.hot.on('vite:ws:connect', ({ webSocket }) => {
    connected = true
    mark('WS 接続')
    webSocket.addEventListener('message', (e) => mark(`WS 受信: ${String(e.data).slice(0, 80)}`))
  })
  import.meta.hot.on('vite:ws:disconnect', () => {
    connected = false
    log(`WS 切断 — 最後の通信から ${idleSec()} 秒、ページを開いてから ${Math.round((performance.now() - start) / 1000)} 秒`)
  })
  import.meta.hot.on('vite:beforeFullReload', () => log('Vite がフルリロードします'))

  // トンネル経由の HTTP（モジュールの取得、再接続時の ping など）
  new PerformanceObserver((list) => {
    list
      .getEntries()
      .filter((entry) => entry.name.includes(location.host))
      .forEach((entry) => mark(`HTTP: ${new URL(entry.name).pathname}`))
  }).observe({ type: 'resource' })

  document.addEventListener('visibilitychange', () => log(`タブ: ${document.visibilityState}`))

  setInterval(() => {
    if (connected) log(`無通信 ${idleSec()} 秒`)
  }, TICK_MS)

  log('通信ログ開始')
}
