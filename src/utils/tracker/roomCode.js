const CODE_PATTERN = /^[A-Z0-9]{6,12}$/

/** 入力を正規化する（空白除去・大文字化） */
export const normalizeRoomCode = (input) => (input ?? '').trim().toUpperCase()

/** 親が設定するコードの形式チェック（英数字 6〜12 文字） */
export const isValidRoomCode = (code) => CODE_PATTERN.test(normalizeRoomCode(code))

/** Supabase Realtime のチャンネル名に変換する */
export const toChannelName = (code) => `tracker:${normalizeRoomCode(code)}`
