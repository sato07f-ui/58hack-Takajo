import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // cloudflared のクイックトンネルは起動ごとに URL が変わるため、
    // ドメイン単位で許可する（先頭の "." でサブドメイン全体を許可）
    allowedHosts: ['.trycloudflare.com'],
  },
})
