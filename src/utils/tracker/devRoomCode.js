import { isValidRoomCode, normalizeRoomCode } from './roomCode'

/**
 * 開発用コード。.env.local の VITE_DEV_ROOM_CODE（例: TAKAJO1）を子供の画面で入力すると、親とつながずにプレイできる。
 * `npm run dev` のときだけ効く。本番ビルドでは変数が残っていても空文字になる。
 */
const readDevRoomCode = () => {
  if (!import.meta.env.DEV) return ''
  const code = normalizeRoomCode(import.meta.env.VITE_DEV_ROOM_CODE)
  if (code === '') return ''
  if (!isValidRoomCode(code)) {
    console.warn(`VITE_DEV_ROOM_CODE「${code}」は 6〜12 文字の英数字ではないので無視します`)
    return ''
  }
  return code
}

export const DEV_ROOM_CODE = readDevRoomCode()

/** 入力されたコードが開発用コードか */
export const isDevRoomCode = (code) => DEV_ROOM_CODE !== '' && normalizeRoomCode(code) === DEV_ROOM_CODE
