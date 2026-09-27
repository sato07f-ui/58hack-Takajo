import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error(
    'Supabase の環境変数が未設定です。.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY を書いてください（.env.example 参照）',
  )
}

/** アプリ全体で共有する Supabase クライアント（Realtime 用） */
export const supabase = createClient(url ?? '', key ?? '')
