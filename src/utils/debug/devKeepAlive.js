/**
 * 開発サーバー（cloudflared トンネル経由）の HMR 用 WebSocket にキープアライブを送る。
 * Cloudflare は無通信の接続を約 100 秒で切り、切れると Vite が再接続時にページをリロードするため、
 * それより短い間隔で小さなメッセージを流してアイドル扱いされないようにする。
 * `npm run dev`（`npm run tunnel` 含む）のときだけ動き、本番ビルドでは何もしない。
 *
 * 消すとき:
 *   1. `grep -rn "\[keepalive\]" src` で出てきた行を削除する
 *   2. このファイルを削除する
 */

const INTERVAL_MS = 30000

export const startDevKeepAlive = () => {
  if (!import.meta.env.DEV || !import.meta.hot) return

  // カスタムイベントとして送る。サーバー側に受け手はいないので、何も起きずに捨てられる
  setInterval(() => import.meta.hot.send('app:keepalive'), INTERVAL_MS)
}
