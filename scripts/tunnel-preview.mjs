/**
 * 本番ビルドをスマホで確認するためのスクリプト（npm run tunnel:preview）。
 * 1. vite build で dist/ を作る
 * 2. vite preview で dist/ を配信する（http://localhost:4173）
 * 3. cloudflared のクイックトンネルで HTTPS 公開し、URL を表示する
 *
 * 本番ビルドには Vite の開発用クライアント（HMR）が入らないので、
 * `npm run dev` + `npm run tunnel` のように接続が切れたときに勝手にリロードされない。
 * 開発用コード（VITE_DEV_ROOM_CODE）と計測ログ（[perf]）も本番と同じく無効になる。
 * Ctrl+C で preview とトンネルの両方を止める。
 */
import { build, preview } from 'vite'
import { Tunnel } from 'cloudflared'

const PORT = 4173

await build()

const server = await preview({ preview: { port: PORT, strictPort: true } })
const localUrl = `http://localhost:${PORT}`
console.log(`\npreview: ${localUrl}`)

// --protocol http2 は npm run tunnel と同じ（QUIC が通らないネットワーク対策）
const tunnel = Tunnel.quick(localUrl, { '--protocol': 'http2' })

tunnel.once('url', (url) => {
  console.log(`\nスマホでこの URL を開いてください: ${url}`)
  // クイックトンネルの URL は、発行されてから実際につながるまで数十秒かかることがある
  console.log('（開けないときは 30 秒〜1 分ほど待ってから再読み込み。止めるときは Ctrl+C）\n')
})
tunnel.on('error', (e) => console.error('cloudflared のエラー:', e))

let stopping = false
const stop = async (code = 0) => {
  if (stopping) return
  stopping = true
  tunnel.stop()
  await server.close()
  process.exit(code)
}

tunnel.on('exit', (code) => {
  if (!stopping) console.error(`cloudflared が終了しました（code: ${code}）`)
  stop(code ?? 1)
})
process.on('SIGINT', () => stop(0))
// どんな終わり方でも cloudflared を取り残さない
process.on('exit', () => tunnel.stop())
process.on('SIGTERM', () => stop(0))
