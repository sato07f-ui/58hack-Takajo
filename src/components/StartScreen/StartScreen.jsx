import styles from "./StartScreen.module.css";
import logoImg from "../../assets/logo.png";

/**
 * タイトル画面。画面のどこかをタップすると、すぐにゲーム（AR バトル）を始める。
 * props.onStart: 画面をタップしたときに呼ばれる（センサー権限の要求はこのタップの中で行う）
 * props.onOpenTracker: 「見守りモード」を押したときに呼ばれる（任意。無ければボタンを出さない）
 * props.notice: 開始できなかった理由など、TAP TO START の下に出すメッセージ（任意）
 */
export const StartScreen = ({ onStart, onOpenTracker, notice }) => {
  return (
    <div className={styles.container} onClick={onStart}>
      {/* 上部余白 */}
      <div className={styles.spacer} />

      {/* 中央：ロゴエリア */}
      <div className={styles.logoArea}>
        <div className={styles.logoBox}>
          {/* 2. テキストから画像タグに差し替え */}
          <img src={logoImg} alt="Mart Quest" className={styles.logoImage} />
        </div>
      </div>

      {/* 下部：TAP TO START テキスト */}
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
  );
};
