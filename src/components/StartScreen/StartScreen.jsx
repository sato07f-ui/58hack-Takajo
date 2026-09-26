import styles from "./StartScreen.module.css";

/**
 * タイトル画面。画面のどこかをタップすると、見守りモード（親 / 子の役割選択）へ進む。
 * ゲームは見守りモードで親子がつながってからでないと始められない。
 * 背景の画像（start-screen.png）にタイトルロゴやイラストが全て描かれているので、
 * ここでは TAP TO START などの操作部分だけを画像の空いている所に重ねる。
 * props.onStart: 画面をタップしたときに呼ばれる
 */
export const StartScreen = ({ onStart }) => {
  return (
    <div className={styles.container} onClick={onStart}>
      {/* 画像と同じ縦横比の枠。中の要素の位置は画像に対する割合で決める */}
      <div className={styles.artboard} role="img" aria-label="マーケットダンジョン">
        {/* 画像の中ほどの空いている所：TAP TO START */}
        <div className={styles.tapToStartArea}>
          <p className={styles.tapText}>- TAP TO START -</p>
        </div>
      </div>
    </div>
  );
};
