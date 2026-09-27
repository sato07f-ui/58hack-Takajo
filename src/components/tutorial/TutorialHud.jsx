import styles from './TutorialHud.module.css'

/**
 * チュートリアルの案内（「にんじんが あらわれた！」など）。.ui-layer の中に置く。
 * props.caption: 出す文（useTutorial の caption）。null なら何も出さない
 */
export function TutorialHud({ caption }) {
  if (!caption) return null
  const waiting = caption.endsWith('…') // 準備中は「…」を点のアニメーションにする
  return (
    // key を文にして、文が変わるたびにアニメーションを最初から流す
    <p key={caption} className={styles.caption} role="status" aria-live="polite">
      {waiting ? caption.slice(0, -1) : caption}
      {waiting && <span className={styles.dots} aria-hidden="true" />}
    </p>
  )
}
