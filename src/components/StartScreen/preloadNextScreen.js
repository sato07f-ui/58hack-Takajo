import backgroundUrl from '../../assets/background_pic.png'

// 見守りモードの画面で使う丸ゴシック（index.html で読み込む Google Fonts）と太さ
const FONT_FAMILY = "'M PLUS Rounded 1c'"
const FONT_WEIGHTS = [500, 700, 800]

// 見守りモードの画面に出てくる文字。日本語のフォントは文字ごとに分かれて配信されるので、
// 使う文字を渡して、その文字を含むファイルだけ先に読み込む
const HIRAGANA = Array.from({ length: 0x3096 - 0x3041 + 1 }, (_, i) => String.fromCharCode(0x3041 + i)).join('')
const KATAKANA = Array.from({ length: 0x30fa - 0x30a1 + 1 }, (_, i) => String.fromCharCode(0x30a1 + i)).join('')
const KANJI =
  '一中了以位使例供信入内冒出分切力取可同向否報場子字守定対少届左度待得復応情戻所手拒探接教数文方未末権次決波活消済渡用画発相確端終続置脱自英見親設許試認距近送途通鍵閉開限険離電面順'
const SYMBOLS = 'ー・、。「」（）！？〜：ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 m'
const TEXT = HIRAGANA + KATAKANA + KANJI + SYMBOLS

/**
 * タイトル画面の間に、次の見守りモードの画面で使う背景画像とフォントを先に読み込んでおく。
 * CSS の背景画像やフォントは、その画面が表示されてから読み込まれるため、何もしないと
 * 「TAP TO START」の後に遅れて表示される。一度読み込めばブラウザのキャッシュから即座に出る。
 */
export const preloadNextScreen = () => {
  const img = new Image()
  img.src = backgroundUrl

  if (!document.fonts?.load) return
  for (const weight of FONT_WEIGHTS) {
    // 失敗しても（オフラインなど）画面は通常のフォントで表示されるので無視する
    document.fonts.load(`${weight} 20px ${FONT_FAMILY}`, TEXT).catch(() => {})
  }
}
