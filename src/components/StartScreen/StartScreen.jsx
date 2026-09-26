import styles from "./StartScreen.module.css";

/**
 * タイトル画面。画面のどこかをタップすると、すぐにゲーム（AR バトル）を始める。
 * 背景の画像（start-screen.png）にタイトルロゴやイラストが全て描かれているので、
 * ここでは TAP TO START などの操作部分だけを画像の空いている所に重ねる。
 * props.onStart: 画面をタップしたときに呼ばれる（センサー権限の要求はこのタップの中で行う）
 * props.onOpenTracker: 「見守りモード」を押したときに呼ばれる（任意。無ければボタンを出さない）
 * props.notice: 開始できなかった理由など、TAP TO START の下に出すメッセージ（任意）
 */
export const StartScreen = ({ onStart, onOpenTracker, notice }) => {
  return (
    <div className={styles.container} onClick={onStart}>
      {/* 画像と同じ縦横比の枠。中の要素の位置は画像に対する割合で決める */}
      <div className={styles.artboard} role="img" aria-label="マーケットダンジョン">
        {/* 画像の中ほどの空いている所：TAP TO START */}
        <div className={styles.tapToStartArea}>
          <p className={styles.tapText}>- TAP TO START -</p>
          {notice && <p className={styles.notice}>{notice}</p>}
          {onOpenTracker && (
            <button
              type="button"
              className={styles.trackerButton}
              onClick={(e) => {
                e.stopPropagation(); // 画面タップ扱いにして、ゲームを始めないようにする
                onOpenTracker();
              }}
            >
              見守りモード
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
